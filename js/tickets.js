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

  var MAX_IMAGES = 4;
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

  // ---------- "Find my tickets" (browser-local memory of past submissions) ----------
  var MINE_STORAGE_KEY = 'ticket_mine';
  var MAX_MINE_ENTRIES = 20;
  var findMineBtn = document.getElementById('ticket-find-mine');

  function loadMineEntries() {
    try {
      var raw = window.localStorage.getItem(MINE_STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function rememberMine(number, name) {
    try {
      var entries = loadMineEntries();
      entries.unshift({ number: number, name: name });
      window.localStorage.setItem(MINE_STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_MINE_ENTRIES)));
    } catch (e) {
      // localStorage unavailable (private mode, disabled, quota) — skip silently
    }
    updateFindMineButton();
  }

  function updateFindMineButton() {
    if (!findMineBtn) return;
    findMineBtn.hidden = loadMineEntries().length === 0;
  }

  if (findMineBtn) {
    findMineBtn.addEventListener('click', function () {
      var entries = loadMineEntries();
      if (!entries.length) return;
      searchTerm = (entries[0].name || '').toLowerCase();
      if (searchInput) searchInput.value = entries[0].name || '';
      renderTickets();
    });
    updateFindMineButton();
  }

  if (imageInput) {
    imageInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(imageInput.files);
      if (files.length === 0) {
        setImageHint(null, '');
        return;
      }
      if (files.length > MAX_IMAGES) {
        setImageHint('error', 'Too many files — max ' + MAX_IMAGES + '.');
        imageInput.value = '';
        return;
      }
      for (var i = 0; i < files.length; i++) {
        if (ALLOWED_IMAGE_TYPES.indexOf(files[i].type) === -1) {
          setImageHint('error', 'Unsupported file type — use PNG, JPEG, WEBP or GIF.');
          imageInput.value = '';
          return;
        }
        if (files[i].size > MAX_IMAGE_BYTES) {
          setImageHint('error', files[i].name + ' is too large — max 5MB each.');
          imageInput.value = '';
          return;
        }
      }
      var totalKb = Math.round(files.reduce(function (sum, f) { return sum + f.size; }, 0) / 1024);
      setImageHint(null, files.length + (files.length === 1 ? ' file' : ' files') + ' selected (' + totalKb + ' KB)');
    });
  }

  // Resolves to an array of data: URLs for the selected screenshots (empty
  // if none chosen). The Worker expects images inline as base64 JSON rather
  // than a separate upload step.
  function readSelectedImages() {
    var files = imageInput ? Array.prototype.slice.call(imageInput.files) : [];
    return Promise.all(files.map(function (file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { reject(new Error('image read failed')); };
        reader.readAsDataURL(file);
      });
    }));
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
        submittedBy: (data.get('submittedBy') || '').trim(),
        type: data.get('type'),
        app: data.get('app'),
        title: (data.get('title') || '').trim(),
        description: (data.get('description') || '').trim(),
        version: (data.get('version') || '').trim(),
        honeypot: data.get('website') || '',
        turnstileToken: data.get('cf-turnstile-response') || '',
        formLoadedAt: formLoadedAt
      };

      if (!payload.submittedBy || !payload.title || !payload.description) {
        setResult('error', 'Please fill in your name, a title, and description.');
        return;
      }

      submitBtn.disabled = true;
      setResult(null, 'Submitting…');

      readSelectedImages()
        .then(function (imageDataUrls) {
          if (imageDataUrls.length) payload.images = imageDataUrls;
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
          rememberMine(result.body.issueNumber, payload.submittedBy);
          form.reset();
          setImageHint(null, '');
          setResult('success', 'Thanks — ticket #' + result.body.issueNumber + ' filed. Save that number to find it again — it’ll show up in the list below shortly.');
          loadTickets();
        })
        .catch(function (err) {
          var message = err && err.message;
          setResult('error', message || 'Something went wrong submitting that. Please try again in a moment.');
        })
        .finally(function () {
          submitBtn.disabled = false;
          if (window.turnstile) window.turnstile.reset();
        });
    });
  }

  // ---------- Ticket list ----------
  var listOpenEl = document.getElementById('ticket-list-open');
  var listClosedEl = document.getElementById('ticket-list-closed');
  var closedGroupEl = document.getElementById('ticket-closed-group');
  var closedCountEl = document.getElementById('ticket-closed-count');
  var searchInput = document.getElementById('ticket-search');
  var updatedEl = document.getElementById('ticket-updated');
  var filterButtons = document.querySelectorAll('.ticket-filter');
  var OPEN_STATUSES = ['triage', 'in-progress'];
  var allTickets = [];
  var activeFilter = 'all';
  var searchTerm = '';
  var lastUpdatedAt = null;

  function renderUpdatedCaption() {
    if (!updatedEl) return;
    if (!lastUpdatedAt) {
      updatedEl.textContent = '';
      return;
    }
    var seconds = Math.round((Date.now() - lastUpdatedAt.getTime()) / 1000);
    if (seconds < 45) {
      updatedEl.textContent = 'Updated just now';
    } else if (seconds < 3600) {
      updatedEl.textContent = 'Updated ' + Math.round(seconds / 60) + 'm ago';
    } else {
      updatedEl.textContent = 'Updated ' + Math.round(seconds / 3600) + 'h ago';
    }
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  function matchesSearch(t) {
    if (!searchTerm) return true;
    if ((t.submittedBy || '').toLowerCase().indexOf(searchTerm) !== -1) return true;
    var term = searchTerm.charAt(0) === '#' ? searchTerm.slice(1) : searchTerm;
    return String(t.number) === term;
  }

  function renderCard(t) {
    var typeBadge = '<span class="ticket-badge ticket-badge--' + t.type + '">' + (TYPE_LABELS[t.type] || t.type) + '</span>';
    var statusBadge = '<span class="ticket-badge ticket-badge--status-' + t.status + '">' + (STATUS_LABELS[t.status] || t.status) + '</span>';
    var appLabel = APP_LABELS[t.app] || t.app;
    var byLabel = t.submittedBy ? ' · by ' + escapeHtml(t.submittedBy) : '';
    var imagesLabel = t.imageCount ? ' · 🖼 ' + t.imageCount : '';
    var note = t.releaseNote
      ? '<div class="ticket-card__note"><strong>Release note:</strong> ' + escapeHtml(t.releaseNote) + '</div>'
      : '';

    return '<a class="ticket-card" href="' + t.url + '" target="_blank" rel="noopener">' +
      '<div class="ticket-card__header">' +
      '<span class="ticket-card__number">#' + t.number + '</span>' +
      '<span class="ticket-card__title">' + escapeHtml(t.title) + '</span>' +
      typeBadge + statusBadge +
      '</div>' +
      '<div class="ticket-card__meta">' + appLabel + ' · opened ' + formatDate(t.createdAt) + byLabel + imagesLabel + '</div>' +
      note +
      '</a>';
  }

  function renderTickets() {
    if (!listOpenEl) return;

    var filtered = allTickets.filter(function (t) {
      if (activeFilter !== 'all' && t.type !== activeFilter) return false;
      return matchesSearch(t);
    });

    var open = filtered.filter(function (t) { return OPEN_STATUSES.indexOf(t.status) !== -1; });
    var closed = filtered.filter(function (t) { return OPEN_STATUSES.indexOf(t.status) === -1; });

    listOpenEl.innerHTML = open.length
      ? open.map(renderCard).join('')
      : '<p class="ticket-list__state">' + (searchTerm || activeFilter !== 'all' ? 'No matching open tickets.' : 'No open tickets right now.') + '</p>';

    if (closedGroupEl) {
      closedCountEl.textContent = closed.length;
      listClosedEl.innerHTML = closed.length
        ? closed.map(renderCard).join('')
        : '<p class="ticket-list__state">No matching closed tickets.</p>';
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function loadTickets() {
    if (!listOpenEl) return;

    if (!isConfigured()) {
      listOpenEl.innerHTML = '<p class="ticket-list__state">Live ticket list isn’t connected yet — see the ' +
        '<a href="https://github.com/Dragonsniper43/Mod-Dashboard-Releases/issues" target="_blank" rel="noopener">GitHub tracker</a> directly.</p>';
      return;
    }

    listOpenEl.innerHTML = '<p class="ticket-list__state">Loading tickets…</p>';

    fetch(WORKER_BASE + '/api/tickets', { cache: 'no-store' })
      .then(function (res) { if (!res.ok) throw new Error('bad status'); return res.json(); })
      .then(function (body) {
        if (!body.ok) throw new Error('bad response');
        allTickets = body.tickets || [];
        lastUpdatedAt = body.cachedAt ? new Date(body.cachedAt) : new Date();
        renderUpdatedCaption();
        renderTickets();
      })
      .catch(function () {
        listOpenEl.innerHTML = '<p class="ticket-list__state">Couldn’t load tickets right now — see the ' +
          '<a href="https://github.com/Dragonsniper43/Mod-Dashboard-Releases/issues" target="_blank" rel="noopener">GitHub tracker</a> directly.</p>';
      });
  }

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      searchTerm = searchInput.value.trim().toLowerCase();
      renderTickets();
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

  // Keeps the "Updated Xm ago" caption ticking over between polls, not just
  // right after a fetch.
  setInterval(renderUpdatedCaption, 20000);

  loadTickets();
  if (!document.hidden) startPolling();
})();
