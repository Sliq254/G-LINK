(() => {
  'use strict';

  const TOPIC_LABELS = {
    hotspot: 'Hotspot Access & Vouchers',
    pppoe: 'Home PPPoe Installation',
    technical: 'Technical Support',
    coverage: 'Coverage Check',
    other: 'Other'
  };

  const STATUS_LABELS = {
    new: 'New',
    in_progress: 'In Progress',
    resolved: 'Resolved'
  };

  // Session token kept strictly in JS memory (never localStorage/sessionStorage)
  let authToken = null;
  let adminMode = 'setup';
  let allInquiries = [];
  let activeStatusFilter = 'all';
  let selectedId = null;

  // Auth DOM
  const authScreen = document.getElementById('authScreen');
  const adminShell = document.getElementById('adminShell');
  const authHeading = document.getElementById('authHeading');
  const authSubtitle = document.getElementById('authSubtitle');
  const authForm = document.getElementById('authForm');
  const passcodeLabel = document.getElementById('passcodeLabel');
  const passcodeInput = document.getElementById('adminPasscode');
  const confirmGroup = document.getElementById('confirmPasscodeGroup');
  const confirmInput = document.getElementById('adminPasscodeConfirm');
  const authError = document.getElementById('authError');
  const authSubmitBtn = document.getElementById('authSubmitBtn');

  // Workspace DOM
  const sidebar = document.getElementById('adminSidebar');
  const openSidebarBtn = document.getElementById('openSidebarBtn');
  const closeSidebarBtn = document.getElementById('closeSidebarBtn');
  const sidebarFilterButtons = document.querySelectorAll('[data-status-filter]');
  const refreshBtn = document.getElementById('refreshBtn');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const signOutBtn = document.getElementById('signOutBtn');

  const kpiTotal = document.getElementById('kpiTotal');
  const kpiNew = document.getElementById('kpiNew');
  const kpiInProgress = document.getElementById('kpiInProgress');
  const kpiResolved = document.getElementById('kpiResolved');

  const navCountAll = document.getElementById('navCountAll');
  const navCountNew = document.getElementById('navCountNew');
  const navCountInProgress = document.getElementById('navCountInProgress');
  const navCountResolved = document.getElementById('navCountResolved');

  const searchInput = document.getElementById('searchInput');
  const topicFilter = document.getElementById('topicFilter');
  const sortOrder = document.getElementById('sortOrder');

  const loadingState = document.getElementById('loadingState');
  const errorState = document.getElementById('errorState');
  const errorStateText = document.getElementById('errorStateText');
  const retryLoadBtn = document.getElementById('retryLoadBtn');
  const emptyState = document.getElementById('emptyState');
  const emptyTitle = document.getElementById('emptyTitle');
  const emptyDesc = document.getElementById('emptyDesc');
  const clearFiltersBtn = document.getElementById('clearFiltersBtn');
  const tableWrap = document.getElementById('tableWrap');
  const inquiriesTbody = document.getElementById('inquiriesTbody');

  // Detail Inspector DOM
  const detailEmpty = document.getElementById('detailEmpty');
  const detailBody = document.getElementById('detailBody');
  const closeDetailBtn = document.getElementById('closeDetailBtn');
  const detailRef = document.getElementById('detailRef');
  const detailName = document.getElementById('detailName');
  const detailContact = document.getElementById('detailContact');
  const copyContactBtn = document.getElementById('copyContactBtn');
  const detailTopic = document.getElementById('detailTopic');
  const detailCreatedAt = document.getElementById('detailCreatedAt');
  const detailUpdatedAt = document.getElementById('detailUpdatedAt');
  const detailMessage = document.getElementById('detailMessage');
  const detailUpdateForm = document.getElementById('detailUpdateForm');
  const detailStatusSelect = document.getElementById('detailStatusSelect');
  const detailNotesInput = document.getElementById('detailNotesInput');
  const detailFeedback = document.getElementById('detailFeedback');
  const saveDetailBtn = document.getElementById('saveDetailBtn');
  const deleteBtn = document.getElementById('deleteBtn');
  const deleteConfirm = document.getElementById('deleteConfirm');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');

  function formatDateTime(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function showAuthError(msg) {
    if (!authError) return;
    authError.textContent = msg;
    authError.hidden = false;
  }

  function clearAuthError() {
    if (!authError) return;
    authError.textContent = '';
    authError.hidden = true;
  }

  function setAuthModeUI(mode) {
    adminMode = mode;
    if (mode === 'setup') {
      if (authHeading) authHeading.textContent = 'Set Up Admin Passcode';
      if (authSubtitle) {
        authSubtitle.textContent =
          'Create an admin passcode (at least 8 characters) to protect customer messages and inquiries.';
      }
      if (passcodeLabel) passcodeLabel.textContent = 'Create Admin Passcode';
      if (passcodeInput) {
        passcodeInput.setAttribute('autocomplete', 'new-password');
        passcodeInput.placeholder = 'Minimum 8 characters';
      }
      if (confirmGroup) confirmGroup.hidden = false;
      if (confirmInput) confirmInput.required = true;
      if (authSubmitBtn) authSubmitBtn.textContent = 'Create Passcode & Sign In';
    } else {
      if (authHeading) authHeading.textContent = 'Admin Portal Sign In';
      if (authSubtitle) {
        authSubtitle.textContent = 'Enter your admin passcode to review and manage customer inquiries.';
      }
      if (passcodeLabel) passcodeLabel.textContent = 'Admin Passcode';
      if (passcodeInput) {
        passcodeInput.setAttribute('autocomplete', 'current-password');
        passcodeInput.placeholder = 'Enter passcode';
      }
      if (confirmGroup) confirmGroup.hidden = true;
      if (confirmInput) {
        confirmInput.required = false;
        confirmInput.value = '';
      }
      if (authSubmitBtn) authSubmitBtn.textContent = 'Sign In';
    }
  }

  async function initAuthStatus() {
    try {
      const res = await fetch('/api/admin/status');
      const data = await res.json();
      setAuthModeUI(data.configured ? 'login' : 'setup');
    } catch {
      setAuthModeUI('login');
      showAuthError('Unable to reach server. Please refresh.');
    }
  }

  function enterWorkspace() {
    if (authScreen) authScreen.hidden = true;
    if (adminShell) adminShell.hidden = false;
    loadInquiries();
  }

  function exitWorkspace() {
    authToken = null;
    allInquiries = [];
    selectedId = null;
    if (passcodeInput) passcodeInput.value = '';
    if (confirmInput) confirmInput.value = '';
    clearAuthError();
    if (adminShell) adminShell.hidden = true;
    if (authScreen) authScreen.hidden = false;
    initAuthStatus();
  }

  authForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAuthError();

    const passcode = passcodeInput?.value.trim() || '';
    if (!passcode) {
      showAuthError('Please enter an admin passcode.');
      return;
    }

    if (adminMode === 'setup') {
      if (passcode.length < 8) {
        showAuthError('Passcode must be at least 8 characters long.');
        return;
      }
      const confirmVal = confirmInput?.value.trim() || '';
      if (passcode !== confirmVal) {
        showAuthError('Passcodes do not match.');
        return;
      }
    }

    if (authSubmitBtn) authSubmitBtn.disabled = true;

    try {
      const endpoint = adminMode === 'setup' ? '/api/admin/setup' : '/api/admin/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.token) {
        throw new Error(data.error || 'Authentication failed.');
      }

      authToken = data.token;
      enterWorkspace();
    } catch (err) {
      showAuthError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      if (authSubmitBtn) authSubmitBtn.disabled = false;
    }
  });

  async function apiFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (authToken) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      exitWorkspace();
      showAuthError('Your session expired. Please sign in again.');
      throw new Error('Unauthorized');
    }
    return res;
  }

  async function loadInquiries() {
    if (!authToken) return;

    if (loadingState) loadingState.hidden = false;
    if (errorState) errorState.hidden = true;
    if (emptyState) emptyState.hidden = true;
    if (tableWrap) tableWrap.hidden = true;

    try {
      const res = await apiFetch('/api/inquiries');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load inquiries.');
      }

      allInquiries = Array.isArray(data.inquiries) ? data.inquiries : [];
      updateSummaryCounts();
      renderTable();
      renderDetailPanel();
    } catch (err) {
      if (err instanceof Error && err.message === 'Unauthorized') return;
      if (errorStateText) {
        errorStateText.textContent = err instanceof Error ? err.message : 'Unable to load inquiries.';
      }
      if (errorState) errorState.hidden = false;
    } finally {
      if (loadingState) loadingState.hidden = true;
    }
  }

  function updateSummaryCounts() {
    const total = allInquiries.length;
    const countNew = allInquiries.filter((i) => i.status === 'new').length;
    const countProgress = allInquiries.filter((i) => i.status === 'in_progress').length;
    const countResolved = allInquiries.filter((i) => i.status === 'resolved').length;

    if (kpiTotal) kpiTotal.textContent = String(total);
    if (kpiNew) kpiNew.textContent = String(countNew);
    if (kpiInProgress) kpiInProgress.textContent = String(countProgress);
    if (kpiResolved) kpiResolved.textContent = String(countResolved);

    if (navCountAll) navCountAll.textContent = String(total);
    if (navCountNew) navCountNew.textContent = String(countNew);
    if (navCountInProgress) navCountInProgress.textContent = String(countProgress);
    if (navCountResolved) navCountResolved.textContent = String(countResolved);
  }

  function getFilteredInquiries() {
    const query = (searchInput?.value || '').trim().toLowerCase();
    const topicVal = topicFilter?.value || 'all';
    const order = sortOrder?.value || 'newest';

    const filtered = allInquiries.filter((item) => {
      if (activeStatusFilter !== 'all' && item.status !== activeStatusFilter) {
        return false;
      }
      if (topicVal !== 'all' && item.topic !== topicVal) {
        return false;
      }
      if (query) {
        const haystack = `${item.name} ${item.contact} ${item.message} ${item.notes || ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return order === 'oldest' ? timeA - timeB : timeB - timeA;
    });

    return filtered;
  }

  function renderTable() {
    if (!inquiriesTbody || !tableWrap || !emptyState) return;
    const rows = getFilteredInquiries();
    inquiriesTbody.innerHTML = '';

    if (rows.length === 0) {
      tableWrap.hidden = true;
      emptyState.hidden = false;

      const hasFilters =
        activeStatusFilter !== 'all' ||
        (topicFilter?.value || 'all') !== 'all' ||
        (searchInput?.value || '').trim().length > 0;

      if (emptyTitle) {
        emptyTitle.textContent = hasFilters ? 'No matching inquiries' : 'No customer inquiries yet';
      }
      if (emptyDesc) {
        emptyDesc.textContent = hasFilters
          ? 'Try adjusting your search or status/topic filters.'
          : 'Messages submitted from the support form on the public website will appear here.';
      }
      if (clearFiltersBtn) clearFiltersBtn.hidden = !hasFilters;
      return;
    }

    emptyState.hidden = true;
    tableWrap.hidden = false;

    rows.forEach((item) => {
      const tr = document.createElement('tr');
      tr.tabIndex = 0;
      if (item.id === selectedId) {
        tr.classList.add('is-selected');
      }

      // Customer + preview cell (safe textContent only)
      const tdCustomer = document.createElement('td');
      const nameSpan = document.createElement('span');
      nameSpan.className = 'cell-primary';
      nameSpan.textContent = item.name;
      const previewSpan = document.createElement('span');
      previewSpan.className = 'cell-preview';
      previewSpan.textContent = item.message;
      tdCustomer.appendChild(nameSpan);
      tdCustomer.appendChild(previewSpan);

      // Contact cell
      const tdContact = document.createElement('td');
      tdContact.textContent = item.contact;

      // Topic cell
      const tdTopic = document.createElement('td');
      tdTopic.textContent = TOPIC_LABELS[item.topic] || item.topic;

      // Status cell
      const tdStatus = document.createElement('td');
      const statusSpan = document.createElement('span');
      const statusClass = ['new', 'in_progress', 'resolved'].includes(item.status)
        ? `status-${item.status}`
        : 'status-new';
      statusSpan.className = `status-text ${statusClass}`;
      statusSpan.textContent = STATUS_LABELS[item.status] || 'New';
      tdStatus.appendChild(statusSpan);

      // Date cell
      const tdDate = document.createElement('td');
      tdDate.className = 'col-right tabular';
      tdDate.textContent = formatDateTime(item.createdAt);

      tr.appendChild(tdCustomer);
      tr.appendChild(tdContact);
      tr.appendChild(tdTopic);
      tr.appendChild(tdStatus);
      tr.appendChild(tdDate);

      const selectRow = () => {
        selectedId = item.id;
        renderTable();
        renderDetailPanel();
      };

      tr.addEventListener('click', selectRow);
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectRow();
        }
      });

      inquiriesTbody.appendChild(tr);
    });
  }

  function renderDetailPanel() {
    if (!detailEmpty || !detailBody) return;
    const item = allInquiries.find((entry) => entry.id === selectedId);

    if (!item) {
      detailEmpty.hidden = false;
      detailBody.hidden = true;
      return;
    }

    detailEmpty.hidden = true;
    detailBody.hidden = false;

    if (detailRef) detailRef.textContent = `ID: ${item.id.slice(0, 8).toUpperCase()}`;
    if (detailName) detailName.textContent = item.name;
    if (detailContact) detailContact.textContent = item.contact;
    if (detailTopic) detailTopic.textContent = TOPIC_LABELS[item.topic] || item.topic;
    if (detailCreatedAt) detailCreatedAt.textContent = formatDateTime(item.createdAt);
    if (detailUpdatedAt) detailUpdatedAt.textContent = formatDateTime(item.updatedAt || item.createdAt);
    if (detailMessage) detailMessage.textContent = item.message;
    if (detailStatusSelect) detailStatusSelect.value = item.status || 'new';
    if (detailNotesInput) detailNotesInput.value = item.notes || '';
    if (detailFeedback) {
      detailFeedback.hidden = true;
      detailFeedback.classList.remove('is-error');
    }
    if (deleteConfirm) deleteConfirm.hidden = true;
  }

  detailUpdateForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!selectedId) return;

    if (saveDetailBtn) saveDetailBtn.disabled = true;
    if (detailFeedback) {
      detailFeedback.hidden = true;
      detailFeedback.classList.remove('is-error');
    }

    try {
      const res = await apiFetch(`/api/inquiries/${encodeURIComponent(selectedId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: detailStatusSelect?.value || 'new',
          notes: detailNotesInput?.value || ''
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.inquiry) {
        throw new Error(data.error || 'Could not save update.');
      }

      const idx = allInquiries.findIndex((i) => i.id === selectedId);
      if (idx !== -1) {
        allInquiries[idx] = data.inquiry;
      }

      updateSummaryCounts();
      renderTable();
      renderDetailPanel();

      if (detailFeedback) {
        detailFeedback.textContent = 'Inquiry updated.';
        detailFeedback.hidden = false;
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'Unauthorized') return;
      if (detailFeedback) {
        detailFeedback.textContent = err instanceof Error ? err.message : 'Update failed.';
        detailFeedback.classList.add('is-error');
        detailFeedback.hidden = false;
      }
    } finally {
      if (saveDetailBtn) saveDetailBtn.disabled = false;
    }
  });

  deleteBtn?.addEventListener('click', () => {
    if (deleteConfirm) deleteConfirm.hidden = false;
  });

  cancelDeleteBtn?.addEventListener('click', () => {
    if (deleteConfirm) deleteConfirm.hidden = true;
  });

  confirmDeleteBtn?.addEventListener('click', async () => {
    if (!selectedId) return;
    confirmDeleteBtn.disabled = true;

    try {
      const res = await apiFetch(`/api/inquiries/${encodeURIComponent(selectedId)}`, {
        method: 'DELETE'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Could not delete inquiry.');
      }

      allInquiries = allInquiries.filter((i) => i.id !== selectedId);
      selectedId = null;
      updateSummaryCounts();
      renderTable();
      renderDetailPanel();
    } catch (err) {
      if (err instanceof Error && err.message === 'Unauthorized') return;
      if (detailFeedback) {
        detailFeedback.textContent = err instanceof Error ? err.message : 'Delete failed.';
        detailFeedback.classList.add('is-error');
        detailFeedback.hidden = false;
      }
    } finally {
      confirmDeleteBtn.disabled = false;
    }
  });

  copyContactBtn?.addEventListener('click', async () => {
    const text = detailContact?.textContent || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      copyContactBtn.textContent = 'Copied';
      window.setTimeout(() => {
        copyContactBtn.textContent = 'Copy';
      }, 1500);
    } catch {
      copyContactBtn.textContent = 'Copy';
    }
  });

  closeDetailBtn?.addEventListener('click', () => {
    selectedId = null;
    renderTable();
    renderDetailPanel();
  });

  sidebarFilterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      activeStatusFilter = btn.getAttribute('data-status-filter') || 'all';
      sidebarFilterButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
      sidebar?.classList.remove('is-open');
      renderTable();
    });
  });

  searchInput?.addEventListener('input', renderTable);
  topicFilter?.addEventListener('change', renderTable);
  sortOrder?.addEventListener('change', renderTable);

  clearFiltersBtn?.addEventListener('click', () => {
    activeStatusFilter = 'all';
    if (searchInput) searchInput.value = '';
    if (topicFilter) topicFilter.value = 'all';
    sidebarFilterButtons.forEach((b) => {
      b.classList.toggle('is-active', b.getAttribute('data-status-filter') === 'all');
    });
    renderTable();
  });

  refreshBtn?.addEventListener('click', loadInquiries);
  retryLoadBtn?.addEventListener('click', loadInquiries);
  signOutBtn?.addEventListener('click', exitWorkspace);

  openSidebarBtn?.addEventListener('click', () => sidebar?.classList.add('is-open'));
  closeSidebarBtn?.addEventListener('click', () => sidebar?.classList.remove('is-open'));

  function csvSafeCell(value) {
    let str = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    return `"${str.replace(/"/g, '""')}"`;
  }

  exportCsvBtn?.addEventListener('click', () => {
    const rows = getFilteredInquiries();
    const header = ['ID', 'Customer', 'Contact', 'Topic', 'Status', 'Message', 'Notes', 'Created At'];
    const csvLines = [
      header.map(csvSafeCell).join(','),
      ...rows.map((item) =>
        [
          item.id,
          item.name,
          item.contact,
          TOPIC_LABELS[item.topic] || item.topic,
          STATUS_LABELS[item.status] || item.status,
          item.message,
          item.notes || '',
          item.createdAt
        ]
          .map(csvSafeCell)
          .join(',')
      )
    ];

    const blob = new Blob([csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `glink-inquiries-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });

  initAuthStatus();
})();
