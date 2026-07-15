(function () {
  document.getElementById('year').textContent = new Date().getFullYear();

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!prefersReducedMotion && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    document.querySelectorAll('.reveal').forEach(function (el) {
      io.observe(el);
    });
  } else {
    document.querySelectorAll('.reveal').forEach(function (el) {
      el.classList.add('is-visible');
    });
  }

  var nav = document.querySelector('.nav');
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      nav.classList.toggle('scrolled', window.scrollY > 40);
      ticking = false;
    });
  });

  var lightbox = document.getElementById('lightbox');
  var lightboxImg = document.getElementById('lightbox-img');
  var lastFocused = null;

  function openLightbox(img) {
    lightboxImg.src = img.currentSrc || img.src;
    lightboxImg.alt = img.alt || '';
    lastFocused = document.activeElement;
    lightbox.classList.add('is-open');
    document.body.classList.add('lightbox-locked');
    lightbox.querySelector('.lightbox__close').focus();
  }

  function closeLightbox() {
    lightbox.classList.remove('is-open');
    document.body.classList.remove('lightbox-locked');
    lightboxImg.src = '';
    if (lastFocused) lastFocused.focus();
  }

  document.querySelectorAll('.window-frame img').forEach(function (img) {
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', 'Enlarge screenshot');
    img.addEventListener('click', function () { openLightbox(img); });
    img.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(img); }
    });
  });

  lightbox.addEventListener('click', function (e) {
    if (e.target === lightbox) closeLightbox();
  });
  lightbox.querySelector('.lightbox__close').addEventListener('click', closeLightbox);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && lightbox.classList.contains('is-open')) closeLightbox();
  });

  // StreamMod download button + version badge, sourced live from the public
  // releases repo — asset filenames are versioned, so a static link isn't
  // possible; this stays correct automatically on every future release.
  var downloadBtn = document.getElementById('streammod-download-btn');
  var versionBadge = document.getElementById('streammod-version-badge');
  if (downloadBtn) {
    fetch('https://api.github.com/repos/dragonsniper43/Mod-Dashboard-Releases/releases/latest')
      .then(function (res) { if (!res.ok) throw new Error('bad status'); return res.json(); })
      .then(function (release) {
        var asset = (release.assets || []).find(function (a) { return /\.exe$/i.test(a.name); });
        if (!asset) throw new Error('no exe asset');
        downloadBtn.href = asset.browser_download_url;
        downloadBtn.textContent = 'Download StreamMod';
        downloadBtn.classList.remove('btn--disabled');
        downloadBtn.classList.add('btn--primary');
        downloadBtn.removeAttribute('aria-disabled');
        downloadBtn.removeAttribute('tabindex');
        if (versionBadge && release.tag_name) {
          versionBadge.textContent = /^v/i.test(release.tag_name) ? release.tag_name : 'v' + release.tag_name;
        }
      })
      .catch(function () { /* leave the "coming soon" placeholder as-is */ });
  }
})();
