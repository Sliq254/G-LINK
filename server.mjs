import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const DATA_DIR = path.resolve(__dirname, 'data');
const INQUIRIES_FILE = path.join(DATA_DIR, 'inquiries.json');
const ADMIN_AUTH_FILE = path.join(DATA_DIR, 'admin.json');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const MAX_BODY_BYTES = 64 * 1024;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const VALID_TOPICS = new Set(['hotspot', 'pppoe', 'technical', 'coverage', 'other']);
const VALID_STATUSES = new Set(['new', 'in_progress', 'resolved']);
const PUBLIC_ROOT_FILES = new Set([
  'index.html',
  'styles.css',
  'app.js',
  'admin.html',
  'admin.css',
  'admin.js'
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const failedAttempts = new Map();

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonFileAtomic(filePath, value) {
  ensureDataDir();
  const tmpPath = `${filePath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function readInquiries() {
  const data = readJsonFile(INQUIRIES_FILE, []);
  return Array.isArray(data) ? data : [];
}

function writeInquiries(list) {
  writeJsonFileAtomic(INQUIRIES_FILE, list);
}

function getEnvPasscode() {
  const val = process.env.ADMIN_PASSCODE;
  return typeof val === 'string' && val.trim().length > 0 ? val.trim() : null;
}

function readAdminAuthRecord() {
  const record = readJsonFile(ADMIN_AUTH_FILE, null);
  if (record && typeof record.salt === 'string' && typeof record.hash === 'string') {
    return record;
  }
  return null;
}

function isAdminConfigured() {
  return Boolean(getEnvPasscode() || readAdminAuthRecord());
}

function hashPasscodeScrypt(passcode, saltHex) {
  return crypto.scryptSync(passcode, saltHex, 64).toString('hex');
}

function safeEqualStrings(a, b) {
  const digestA = crypto.createHash('sha256').update(String(a)).digest();
  const digestB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

function verifyAdminPasscode(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) return false;
  const envPass = getEnvPasscode();
  if (envPass) {
    return safeEqualStrings(candidate, envPass);
  }
  const record = readAdminAuthRecord();
  if (!record) return false;
  const candidateHash = hashPasscodeScrypt(candidate, record.salt);
  const storedBuf = Buffer.from(record.hash, 'hex');
  const candidateBuf = Buffer.from(candidateHash, 'hex');
  if (storedBuf.length !== candidateBuf.length) return false;
  return crypto.timingSafeEqual(storedBuf, candidateBuf);
}

function createSessionToken() {
  const payload = {
    role: 'admin',
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
    jti: crypto.randomBytes(12).toString('hex')
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifySessionToken(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!payload || payload.role !== 'admin' || typeof payload.exp !== 'number') {
      return null;
    }
    if (Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function getClientKey(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(clientKey) {
  const now = Date.now();
  const entry = failedAttempts.get(clientKey);
  if (!entry) return false;
  if (now - entry.firstAttemptAt > 15 * 60 * 1000) {
    failedAttempts.delete(clientKey);
    return false;
  }
  return entry.count >= 10;
}

function recordFailedAttempt(clientKey) {
  const now = Date.now();
  const entry = failedAttempts.get(clientKey);
  if (!entry || now - entry.firstAttemptAt > 15 * 60 * 1000) {
    failedAttempts.set(clientKey, { count: 1, firstAttemptAt: now });
  } else {
    entry.count += 1;
  }
}

function clearFailedAttempts(clientKey) {
  failedAttempts.delete(clientKey);
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let totalBytes = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new Error('INVALID_JSON'));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });

    req.on('error', () => reject(new Error('READ_ERROR')));
  });
}

function validateInquiryPayload(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const contact = typeof body.contact === 'string' ? body.contact.trim() : '';
  const topic = typeof body.topic === 'string' ? body.topic.trim() : 'other';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (name.length < 2 || name.length > 100) {
    return { error: 'Please enter a valid name between 2 and 100 characters.' };
  }

  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
  const looksLikePhone = /^[+\d][\d\s-]{6,20}$/.test(contact);
  if ((!looksLikeEmail && !looksLikePhone) || contact.length > 120) {
    return { error: 'Please provide a valid phone number or email address.' };
  }

  if (!VALID_TOPICS.has(topic)) {
    return { error: 'Please choose a valid inquiry topic.' };
  }

  if (message.length < 6 || message.length > 2000) {
    return { error: 'Please include a message between 6 and 2000 characters.' };
  }

  return {
    value: {
      id: crypto.randomUUID(),
      name,
      contact,
      topic,
      message,
      status: 'new',
      notes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };
}

async function handleApiRequest(req, res, urlPath) {
  const method = req.method || 'GET';

  if (urlPath === '/api/admin/status' && method === 'GET') {
    const envSet = Boolean(getEnvPasscode());
    const localSet = Boolean(readAdminAuthRecord());
    sendJson(res, 200, {
      configured: envSet || localSet,
      mode: envSet ? 'env' : localSet ? 'local' : 'setup'
    });
    return;
  }

  if (urlPath === '/api/admin/setup' && method === 'POST') {
    if (isAdminConfigured()) {
      sendJson(res, 403, { error: 'Admin passcode is already configured.' });
      return;
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: 'Invalid request body.' });
      return;
    }

    const passcode = typeof body.passcode === 'string' ? body.passcode.trim() : '';
    if (passcode.length < 8 || passcode.length > 128) {
      sendJson(res, 400, { error: 'Passcode must be between 8 and 128 characters.' });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPasscodeScrypt(passcode, salt);
    writeJsonFileAtomic(ADMIN_AUTH_FILE, {
      salt,
      hash,
      createdAt: new Date().toISOString()
    });

    const token = createSessionToken();
    sendJson(res, 201, { token });
    return;
  }

  if (urlPath === '/api/admin/login' && method === 'POST') {
    const clientKey = getClientKey(req);
    if (isRateLimited(clientKey)) {
      sendJson(res, 429, { error: 'Too many failed attempts. Please wait 15 minutes and try again.' });
      return;
    }

    if (!isAdminConfigured()) {
      sendJson(res, 409, { error: 'Admin passcode is not set up yet.' });
      return;
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: 'Invalid request body.' });
      return;
    }

    const passcode = typeof body.passcode === 'string' ? body.passcode.trim() : '';
    if (!verifyAdminPasscode(passcode)) {
      recordFailedAttempt(clientKey);
      sendJson(res, 401, { error: 'Incorrect admin passcode.' });
      return;
    }

    clearFailedAttempts(clientKey);
    const token = createSessionToken();
    sendJson(res, 200, { token });
    return;
  }

  if (urlPath === '/api/inquiries' && method === 'POST') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      const status = err.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
      sendJson(res, status, { error: 'Unable to read inquiry payload.' });
      return;
    }

    const validated = validateInquiryPayload(body);
    if (validated.error) {
      sendJson(res, 400, { error: validated.error });
      return;
    }

    const inquiries = readInquiries();
    inquiries.unshift(validated.value);
    writeInquiries(inquiries);

    sendJson(res, 201, {
      inquiry: {
        id: validated.value.id,
        createdAt: validated.value.createdAt
      }
    });
    return;
  }

  if (urlPath === '/api/inquiries' && method === 'GET') {
    if (!verifySessionToken(req)) {
      sendJson(res, 401, { error: 'Authentication required.' });
      return;
    }

    const inquiries = readInquiries().sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    sendJson(res, 200, { inquiries });
    return;
  }

  if (urlPath.startsWith('/api/inquiries/')) {
    if (!verifySessionToken(req)) {
      sendJson(res, 401, { error: 'Authentication required.' });
      return;
    }

    const inquiryId = decodeURIComponent(urlPath.slice('/api/inquiries/'.length)).trim();
    if (!/^[0-9a-f-]{8,64}$/i.test(inquiryId)) {
      sendJson(res, 400, { error: 'Invalid inquiry ID.' });
      return;
    }

    const inquiries = readInquiries();
    const index = inquiries.findIndex((item) => item.id === inquiryId);
    if (index === -1) {
      sendJson(res, 404, { error: 'Inquiry not found.' });
      return;
    }

    if (method === 'PATCH') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch {
        sendJson(res, 400, { error: 'Invalid request body.' });
        return;
      }

      const current = inquiries[index];
      let nextStatus = current.status;
      let nextNotes = current.notes || '';

      if (body.status !== undefined) {
        if (typeof body.status !== 'string' || !VALID_STATUSES.has(body.status)) {
          sendJson(res, 400, { error: 'Invalid status value.' });
          return;
        }
        nextStatus = body.status;
      }

      if (body.notes !== undefined) {
        if (typeof body.notes !== 'string' || body.notes.length > 1000) {
          sendJson(res, 400, { error: 'Notes must be 1000 characters or fewer.' });
          return;
        }
        nextNotes = body.notes.trim();
      }

      const updated = {
        ...current,
        status: nextStatus,
        notes: nextNotes,
        updatedAt: new Date().toISOString()
      };
      inquiries[index] = updated;
      writeInquiries(inquiries);

      sendJson(res, 200, { inquiry: updated });
      return;
    }

    if (method === 'DELETE') {
      inquiries.splice(index, 1);
      writeInquiries(inquiries);
      sendJson(res, 200, { deleted: true, id: inquiryId });
      return;
    }
  }

  sendJson(res, 404, { error: 'API route not found.' });
}

function resolveStaticFile(urlPath) {
  let cleanPath = decodeURIComponent(urlPath);
  if (cleanPath === '/') cleanPath = '/index.html';
  if (cleanPath === '/admin' || cleanPath === '/admin/') cleanPath = '/admin.html';

  const rel = cleanPath.replace(/^\/+/, '');
  if (!rel || rel.startsWith('data/') || rel.startsWith('.')) {
    return null;
  }

  if (PUBLIC_ROOT_FILES.has(rel)) {
    const rootFile = path.resolve(__dirname, rel);
    if (rootFile.startsWith(__dirname + path.sep) && fs.existsSync(rootFile) && fs.statSync(rootFile).isFile()) {
      return rootFile;
    }
  }

  const publicFile = path.resolve(PUBLIC_DIR, rel);
  if (publicFile.startsWith(PUBLIC_DIR + path.sep) && fs.existsSync(publicFile) && fs.statSync(publicFile).isFile()) {
    return publicFile;
  }

  if (!path.extname(rel)) {
    return path.join(__dirname, 'index.html');
  }

  return null;
}

const server = http.createServer(async (req, res) => {
  const urlPath = (req.url || '/').split('?')[0];

  if (urlPath.startsWith('/api/')) {
    await handleApiRequest(req, res, urlPath);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
    return;
  }

  let targetPath;
  try {
    targetPath = resolveStaticFile(urlPath);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  if (!targetPath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  const ext = path.extname(targetPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(targetPath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    if (req.method === 'HEAD') {
      res.end();
    } else {
      res.end(data);
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`G-LINK server running at http://${HOST}:${PORT}`);
});
