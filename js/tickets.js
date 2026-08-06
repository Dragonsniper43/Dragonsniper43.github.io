(function () {
  // TODO: once the ticket Worker is deployed, set this to its base URL,
  // e.g. 'https://mod-dashboard-tickets.<account>.workers.dev'
  var WORKER_BASE = 'https://mod-dashboard-tickets.dragonsniper43.workers.dev';

  var formLoadedAt = Date.now();

  var TYPE_LABELS = { bug: 'Bug', 'change-request': 'Change Request' };
  var APP_LABELS = { streammod: 'StreamMod', cuelist: 'Cuelist', other: 'Other' };
  var STATUS_LABELS = {
    triage: 'Triage',
    'in-progress': 'In Progress',
    released: 'Released',
    closed: 'Closed'
  };

  function isConfigured() {
    return !!WORKER_BASE;
  }

  // ---------- Submission form ----------
  var form = document.getElementById('ticket-form');
  var submitBtn = document.getElementById('ticket-submit-btn');
  var resultEl = document.getElementById('ticket-form-result');
  var imageInput = document.getElementById('ticket-image');
  var imageHint = document.getElementById('ticket-image-hint');

  var MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  var ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

  function setResult(state, message) {
    resultEl.textContent = message;
    if (state) {
      resultEl.setAttribute('data-state', state);
    } else {
      resultEl.removeAttribute('data-state');
    }
  }

  function setImageHint(state, message) {
    if (!imageHint) return;
    imageHint.textContent = message || '';
    if (state) {
      imageHint.setAttribute('data-state', state);
    } else {
      imageHint.removeAttribute('data-state');
    }
  }

  if (imageInput) {
    imageInput.addEventListener('change', function () {
      var file = imageInput.files[0];
      if (!file) {
        setImageHint(null, '');
        return;
      }
      if (ALLOWED_IMAGE_TYPES.indexOf(file.type) === -1) {
        setImageHint('error', 'Unsupported file type — use PNG, JPEG, WEBP or GIF.');
        imageInput.value = '';
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setImageHint('error', 'That file is too large — max 5MB.');
        imageInput.value = '';
        return;
      }
      setImageHint(null, file.name + ' (' + Math.round(file.size / 1024) + ' KB)');
    });
  }

  // Resolves to a data: URL for the selected screenshot, or null if none was
  // chosen. The Worker expects the image inline as base64 JSON rather than a
  // separate upload step.
  function readSelectedImage() {
    var file = imageInput && imageInput.files[0];
    if (!file) return Promise.resolve(null);
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('image read failed')); };
      reader.readAsDataURL(file);
    });
  }

  if (form) {
    if (!isConfigured()) {
      submitBtn.disabled = true;
      setResult('error', 'Ticket submission isn’t connected yet — check back soon, or file directly on GitHub.');
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!isConfigured()) return;

      var data = new FormData(form);
      var payload = {
        type: data.get('type'),
        app: data.get('app'),
        title: (data.get('title') || '').trim(),
        description: (data.get('description') || '').trim(),
        version: (data.get('version') || '').trim(),
        honeypot: data.get('website') || '',
        turnstileToken: data.get('cf-turnstile-response') || '',
        formLoadedAt: formLoadedAt
      };

      if (!payload.title || !payload.description) {
        setResult('error', 'Please fill in a title and description.');
        return;
      }

      submitBtn.disabled = true;
      setResult(null, 'Submitting…');

      readSelectedImage()
        .then(function (imageDataUrl) {
          if (imageDataUrl) payload.image = imageDataUrl;
          return fetch(WORKER_BASE + '/api/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        })
        .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
        .then(function (result) {
          if (!result.ok || !result.body || !result.body.ok) {
            throw new Error((result.body && result.body.error) || 'submit failed');
          }
          form.reset();
          setImageHint(null, '');
          setResult('success', 'Thanks — ticket #' + result.body.issueNumber + ' filed. It’ll show up in the list below shortly.');
          loadTickets();
        })
        .catch(function () {
          setResult('error', 'Something went wrong submitting that. Please try again in a moment.');
        })
        .finally(function () {
          submitBtn.disabled = false;
          if (window.turnstile) window.turnstile.reset();
        });
    });
  }

  // ---------- Ticket list ----------
  var listEl = document.getElementById('ticket-list');
  var filterButtons = document.querySelectorAll('.ticket-filter');
  var allTickets = [];
  var activeFilter = 'all';

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  function renderTickets() {
    if (!listEl) return;

    var tickets = activeFilter === 'all'
      ? allTickets
      : allTickets.filter(function (t) { return t.type === activeFilter; });

    if (tickets.length === 0) {
      listEl.innerHTML = '<p class="ticket-list__state">No tickets here yet.</p>';
      return;
    }

    listEl.innerHTML = tickets.map(function (t) {
      var typeBadge = '<span class="ticket-badge ticket-badge--' + t.type + '">' + (TYPE_LABELS[t.type] || t.type) + '</span>';
      var statusBadge = '<span class="ticket-badge ticket-badge--status-' + t.status + '">' + (STATUS_LABELS[t.status] || t.status) + '</span>';
      var appLabel = APP_LABELS[t.app] || t.app;
      var note = t.releaseNote
        ? '<div class="ticket-card__note"><strong>Release note:</strong> ' + escapeHtml(t.releaseNote) + '</div>'
        : '';

      return '<a class="ticket-card" href="' + t.url + '" target="_blank" rel="noopener">' +
        '<div class="ticket-card__header">' +
        '<span class="ticket-card__title">' + escapeHtml(t.title) + '</span>' +
        typeBadge + statusBadge +
        '</div>' +
        '<div class="ticket-card__meta">' + appLabel + ' · opened ' + formatDate(t.createdAt) + '</div>' +
        note +
        '</a>';
    }).join('');
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function loadTickets() {
    if (!listEl) return;

    if (!isConfigured()) {
      listEl.innerHTML = '<p class="ticket-list__state">Live ticket list isn’t connected yet — see the ' +
        '<a href="https://github.com/Dragonsniper43/Mod-Dashboard-Releases/issues" target="_blank" rel="noopener">GitHub tracker</a> directly.</p>';
      return;
    }

    listEl.innerHTML = '<p class="ticket-list__state">Loading tickets…</p>';

    fetch(WORKER_BASE + '/api/tickets', { cache: 'no-store' })
      .then(function (res) { if (!res.ok) throw new Error('bad status'); return res.json(); })
      .then(function (body) {
        if (!body.ok) throw new Error('bad response');
        allTickets = body.tickets || [];
        renderTickets();
      })
      .catch(function () {
        listEl.innerHTML = '<p class="ticket-list__state">Couldn’t load tickets right now — see the ' +
          '<a href="https://github.com/Dragonsniper43/Mod-Dashboard-Releases/issues" target="_blank" rel="noopener">GitHub tracker</a> directly.</p>';
      });
  }

  filterButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      activeFilter = btn.getAttribute('data-filter');
      filterButtons.forEach(function (b) {
        b.classList.toggle('is-active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
      renderTickets();
    });
  });

  // Poll for new/updated tickets so the list updates on its own for anyone
  // with the page open, not just the person who just submitted. Paused while
  // the tab isn't visible so idle background tabs don't keep polling.
  var POLL_INTERVAL_MS = 45000;
  var pollTimer = null;

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(loadTickets, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stopPolling();
    } else {
      loadTickets();
      startPolling();
    }
  });

  loadTickets();
  if (!document.hidden) startPolling();
})();
