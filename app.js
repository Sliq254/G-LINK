(() => {
  'use strict';

  // 1. Dynamic Footer Year
  const yearEl = document.getElementById('currentYear');
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  // 2. Mobile Navigation Drawer
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const mobileNavDrawer = document.getElementById('mobileNavDrawer');
  const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

  function setMobileMenuOpen(isOpen) {
    if (!mobileMenuBtn || !mobileNavDrawer) return;
    mobileMenuBtn.setAttribute('aria-expanded', String(isOpen));
    mobileMenuBtn.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
    mobileNavDrawer.hidden = !isOpen;
  }

  if (mobileMenuBtn && mobileNavDrawer) {
    mobileMenuBtn.addEventListener('click', () => {
      const expanded = mobileMenuBtn.getAttribute('aria-expanded') === 'true';
      setMobileMenuOpen(!expanded);
    });

    mobileNavLinks.forEach((link) => {
      link.addEventListener('click', () => setMobileMenuOpen(false));
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && mobileMenuBtn.getAttribute('aria-expanded') === 'true') {
        setMobileMenuOpen(false);
        mobileMenuBtn.focus();
      }
    });
  }

  // 3. Active Nav Link Tracking
  const navLinks = document.querySelectorAll('.nav-link');
  const observedSections = document.querySelectorAll('main section[id]');

  if ('IntersectionObserver' in window && navLinks.length && observedSections.length) {
    const navObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.getAttribute('id');
          navLinks.forEach((link) => {
            const matches = link.getAttribute('href') === `#${id}`;
            link.classList.toggle('is-active', matches);
          });
        });
      },
      { rootMargin: '-35% 0px -55% 0px' }
    );

    observedSections.forEach((section) => navObserver.observe(section));
  }

  // 4. Subtle Scroll Reveal
  const revealItems = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    revealItems.forEach((item) => item.classList.add('is-pending'));

    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.remove('is-pending');
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.1 }
    );

    revealItems.forEach((item) => revealObserver.observe(item));
  }

  // 5. YouTube Nocookie Video Embed On Demand
  const videoFrame = document.getElementById('videoFrame');
  const playVideoBtn = document.getElementById('playVideoBtn');

  if (videoFrame && playVideoBtn) {
    playVideoBtn.addEventListener('click', () => {
      const videoId = videoFrame.getAttribute('data-video-id');
      if (!videoId) return;

      const iframe = document.createElement('iframe');
      iframe.className = 'video-iframe';
      iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0&autoplay=1&mute=1&loop=1&playlist=${encodeURIComponent(videoId)}`;
      iframe.title = 'G-LINK Overview Video';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      iframe.allowFullscreen = true;

      videoFrame.innerHTML = '';
      videoFrame.appendChild(iframe);
    });
  }

  // 6. Plan Filter Tabs
  const filterButtons = document.querySelectorAll('[data-plan-filter]');
  const planCards = document.querySelectorAll('.plan-card[data-category]');

  filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const filter = btn.getAttribute('data-plan-filter');
      filterButtons.forEach((b) => b.classList.toggle('is-active', b === btn));

      planCards.forEach((card) => {
        const category = card.getAttribute('data-category');
        const show = filter === 'all' || category === filter;
        card.hidden = !show;
      });
    });
  });

  // 7. Plan Selection Modal
  const planModal = document.getElementById('planModal');
  const planModalTitle = document.getElementById('planModalTitle');
  const planModalPrice = document.getElementById('planModalPrice');
  const closePlanModalBtn = document.getElementById('closePlanModal');
  const modalAskSupportBtn = document.getElementById('modalAskSupport');
  const planSelectButtons = document.querySelectorAll('.plan-select-btn');
  let lastFocusedElement = null;

  function openPlanModal(name, price) {
    if (!planModal || !planModalTitle || !planModalPrice) return;
    lastFocusedElement = document.activeElement;
    planModalTitle.textContent = name;
    planModalPrice.textContent = price;
    planModal.hidden = false;
    closePlanModalBtn?.focus();
  }

  function closePlanModal() {
    if (!planModal) return;
    planModal.hidden = true;
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  }

  planSelectButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const name = button.getAttribute('data-plan-name') || 'G-LINK Plan';
      const price = button.getAttribute('data-plan-price') || '';
      openPlanModal(name, price);
    });
  });

  closePlanModalBtn?.addEventListener('click', closePlanModal);

  planModal?.addEventListener('click', (event) => {
    if (event.target === planModal) {
      closePlanModal();
    }
  });

  modalAskSupportBtn?.addEventListener('click', () => {
    const selectedPlanName = planModalTitle?.textContent || '';
    closePlanModal();
    const supportSection = document.getElementById('support');
    const messageInput = document.getElementById('supportMessage');
    if (supportSection) {
      supportSection.scrollIntoView({ behavior: 'smooth' });
    }
    if (messageInput && selectedPlanName) {
      messageInput.value = `I would like assistance with the ${selectedPlanName} package.`;
      messageInput.focus();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && planModal && !planModal.hidden) {
      closePlanModal();
    }
  });

  // 8. Showcase Gallery Carousel
  const carousel = document.getElementById('showcaseCarousel');
  const slides = document.querySelectorAll('.carousel-slide');
  const indicators = document.querySelectorAll('.indicator-bar');
  const prevBtn = document.getElementById('carouselPrev');
  const nextBtn = document.getElementById('carouselNext');

  if (carousel && slides.length > 0) {
    let activeIndex = 0;
    let autoPlayTimer = null;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function showSlide(index) {
      activeIndex = (index + slides.length) % slides.length;

      slides.forEach((slide, idx) => {
        slide.classList.toggle('is-active', idx === activeIndex);
      });

      indicators.forEach((bar, idx) => {
        const isCurrent = idx === activeIndex;
        bar.classList.toggle('is-active', isCurrent);
        bar.setAttribute('aria-selected', String(isCurrent));
      });
    }

    function startAutoPlay() {
      if (prefersReducedMotion) return;
      stopAutoPlay();
      autoPlayTimer = window.setInterval(() => {
        showSlide(activeIndex + 1);
      }, 3000);
    }

    function stopAutoPlay() {
      if (autoPlayTimer !== null) {
        window.clearInterval(autoPlayTimer);
        autoPlayTimer = null;
      }
    }

    prevBtn?.addEventListener('click', () => {
      showSlide(activeIndex - 1);
      startAutoPlay();
    });

    nextBtn?.addEventListener('click', () => {
      showSlide(activeIndex + 1);
      startAutoPlay();
    });

    indicators.forEach((bar) => {
      bar.addEventListener('click', () => {
        const target = Number(bar.getAttribute('data-slide-to') || 0);
        showSlide(target);
        startAutoPlay();
      });
    });

    carousel.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        showSlide(activeIndex - 1);
        startAutoPlay();
      } else if (event.key === 'ArrowRight') {
        showSlide(activeIndex + 1);
        startAutoPlay();
      }
    });

    carousel.addEventListener('mouseenter', stopAutoPlay);
    carousel.addEventListener('mouseleave', startAutoPlay);
    carousel.addEventListener('focusin', stopAutoPlay);
    carousel.addEventListener('focusout', startAutoPlay);

    startAutoPlay();
  }

  // 9. Support Form Validation & Feedback
  const supportForm = document.getElementById('supportForm');
  const supportName = document.getElementById('supportName');
  const supportContact = document.getElementById('supportContact');
  const supportTopic = document.getElementById('supportTopic');
  const supportMessage = document.getElementById('supportMessage');
  const errorName = document.getElementById('errorName');
  const errorContact = document.getElementById('errorContact');
  const errorMessage = document.getElementById('errorMessage');
  const formFeedback = document.getElementById('formFeedback');

  if (supportForm && supportName && supportContact && supportTopic && supportMessage) {
    const submitBtn = supportForm.querySelector('button[type="submit"]');

    supportForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      let hasError = false;
      const nameVal = supportName.value.trim();
      const contactVal = supportContact.value.trim();
      const topicVal = supportTopic.value;
      const messageVal = supportMessage.value.trim();

      if (errorName) errorName.textContent = '';
      if (errorContact) errorContact.textContent = '';
      if (errorMessage) errorMessage.textContent = '';
      if (formFeedback) {
        formFeedback.hidden = true;
        formFeedback.classList.remove('is-error');
      }

      if (nameVal.length < 2) {
        if (errorName) errorName.textContent = 'Please enter your name (at least 2 characters).';
        hasError = true;
      }

      const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactVal);
      const looksLikePhone = /^[+\d][\d\s-]{6,20}$/.test(contactVal);
      if (!looksLikeEmail && !looksLikePhone) {
        if (errorContact) errorContact.textContent = 'Enter a valid phone number or email address.';
        hasError = true;
      }

      if (messageVal.length < 6) {
        if (errorMessage) errorMessage.textContent = 'Please include a short message so our team can assist.';
        hasError = true;
      }

      if (hasError) return;

      const selectedTopicLabel = supportTopic.options[supportTopic.selectedIndex]?.text || 'Support';

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
      }

      try {
        const response = await fetch('/api/inquiries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: nameVal,
            contact: contactVal,
            topic: topicVal,
            message: messageVal
          })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Could not submit your inquiry. Please try again.');
        }

        const shortRef = payload?.inquiry?.id ? ` (Ref: ${payload.inquiry.id.slice(0, 8).toUpperCase()})` : '';
        if (formFeedback) {
          formFeedback.textContent = `Thank you, ${nameVal}. Your ${selectedTopicLabel.toLowerCase()} inquiry has been saved${shortRef}—our Maraba support team will reach out via ${contactVal}.`;
          formFeedback.hidden = false;
        }

        supportForm.reset();
      } catch (err) {
        if (formFeedback) {
          formFeedback.textContent = err instanceof Error ? err.message : 'Unable to send request right now.';
          formFeedback.classList.add('is-error');
          formFeedback.hidden = false;
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Request';
        }
      }
    });
  }
})();
