/* ============================================
   TRAVEXA — Application Logic
   ============================================ */

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // ===========================================
  // Screen Navigation
  // ===========================================

  function showScreen(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const current = document.querySelector('.screen.active');

    const mount = () => {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active', 'leaving'));
      target.classList.add('active');

      // Re-trigger stagger entrance for dest-cards & stops
      target.querySelectorAll('.dest-card, .stop').forEach(el => {
        el.style.animation = 'none';
        el.offsetHeight; // force reflow
        el.style.animation = '';
      });

      window.scrollTo(0, 0);
      Scroll.refresh();

      // Booking-flow chrome (tracker + per-screen data loading)
      syncFlowChrome(id);

      // A Leaflet map sized while its screen was hidden renders grey tiles.
      if (window.TravexaMapResize) window.TravexaMapResize(id);

      if (id === 'itinerary') startLiveDemo();
    };

    // Smooth cross-fade instead of an instant cut, if a screen is already showing
    if (current && current !== target) {
      current.classList.add('leaving');
      window.setTimeout(mount, 180);
    } else {
      mount();
    }
  }

  function setNavActive(screenId) {
    document.querySelectorAll('.nav-tabs button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.screen === screenId);
    });
  }

  document.querySelectorAll('.nav-tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      setNavActive(btn.dataset.screen);
      showScreen(btn.dataset.screen);
    });
  });

  // ===========================================
  // Chip Selection & Input Focus / Error Clearing
  // ===========================================

  const planError = document.getElementById('planError');
  const planInput = document.getElementById('planInput');

  function clearErrorState() {
    if (planError) planError.style.display = 'none';
    if (planInput) planInput.classList.remove('has-error');
  }

  document.querySelectorAll('.chip-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.classList.contains('chip')) {
        e.target.classList.toggle('selected');
        clearErrorState();
      }
    });
  });

  if (planInput) {
    planInput.addEventListener('input', clearErrorState);
    planInput.addEventListener('focus', clearErrorState);
  }

  // ===========================================
  // Generate Itinerary (Organic Blob Loader)
  // ===========================================

  const genBtn = document.getElementById('genBtn');
  const blobLoader = document.getElementById('blobLoader');
  const blobLoadingTitle = document.getElementById('blobLoadingTitle');
  const blobLoadingSub = document.getElementById('blobLoadingSub');

  genBtn.addEventListener('click', () => {
    const selectedChips = document.querySelectorAll('.chip.selected');
    const inputText = planInput ? planInput.value.trim() : '';

    // Validation: require at least one input
    if (selectedChips.length === 0 && inputText.length === 0) {
      if (planInput) planInput.classList.add('has-error');
      if (planError) planError.style.display = 'flex';
      return;
    }

    clearErrorState();

    // Show blob loader
    if (blobLoader) {
      blobLoader.classList.add('active');
      if (blobLoadingTitle) blobLoadingTitle.textContent = 'Synthesizing Constraints…';
      if (blobLoadingSub) blobLoadingSub.textContent = 'Balancing time windows, dietary filters, and safety data';

      setTimeout(() => {
        if (blobLoadingTitle) blobLoadingTitle.textContent = 'Checking Live Safety Grid…';
        if (blobLoadingSub) blobLoadingSub.textContent = 'Verifying crowd levels and open-data feeds';
      }, 1100);

      setTimeout(() => {
        blobLoader.classList.remove('active');
        setNavActive('itinerary');
        showScreen('itinerary');
        showToast('✨', 'Itinerary optimized around your constraints');
      }, 2200);
    } else {
      setNavActive('itinerary');
      showScreen('itinerary');
    }
  });

  // ===========================================
  // Booking Flow Navigation
  // ===========================================

  document.getElementById('bookBtn').addEventListener('click', () => showScreen('book1'));

  // "Book Trip" starts the booking flow. With a destination already chosen it
  // jumps straight to the Hotel step; otherwise it asks for the destination.
  function startBooking() {
    if (Trip.get('destination')) {
      setNavActive('hotel');
      showScreen('hotel');
    } else {
      setNavActive('onboard');
      showScreen('book1');
    }
  }

  document.getElementById('heroBookBtn').addEventListener('click', startBooking);

  var headerBookBtn = document.getElementById('headerBookBtn');
  if (headerBookBtn) headerBookBtn.addEventListener('click', startBooking);

  document.getElementById('ctaPlanBtn').addEventListener('click', () => {
    setNavActive('onboard');
    showScreen('onboard');
  });

  // Back buttons
  document.getElementById('back1').addEventListener('click', () => {
    setNavActive('home');
    showScreen('home');
  });
  document.getElementById('backLocal').addEventListener('click', () => showScreen('book1'));
  document.getElementById('backIntl').addEventListener('click', () => showScreen('book1'));

  // Local vs International choice
  document.querySelectorAll('#book1 .dest-card').forEach(card => {
    card.addEventListener('click', () => {
      showScreen(card.dataset.next === 'local' ? 'bookLocal' : 'bookIntl');
    });
  });

  // ===========================================
  // Destination Grids (dynamic render)
  // ===========================================

  const localSpots = [
    { name: 'Goa',               tag: 'Beaches, nightlife',      img: 'images/goa.jpg' },
    { name: 'Kerala backwaters', tag: 'Houseboats, calm',        img: 'images/kerala.jpg' },
    { name: 'Jaipur',            tag: 'Forts, heritage',         img: 'images/jaipur.jpg' },
    { name: 'Munnar',            tag: 'Tea hills, cool climate', img: 'images/munnar.jpg' },
    { name: 'Rishikesh',         tag: 'Rivers, yoga',            img: 'images/rishikesh.jpg' },
    { name: 'Andaman Islands',   tag: 'Diving, coastline',       img: 'images/andaman.jpg' }
  ];

  const intlSpots = [
    { name: 'Japan',    tag: 'Kyoto temples, Tokyo pace', img: 'images/japan.jpg' },
    { name: 'Italy',    tag: 'Rome, coastline, food',     img: 'images/italy.jpg' },
    { name: 'Thailand', tag: 'Islands, street food',      img: 'images/thailand.jpg' },
    { name: 'France',   tag: 'Paris, countryside',        img: 'images/france.jpg' },
    { name: 'Iceland',  tag: 'Glaciers, quiet',           img: 'images/iceland.jpg' },
    { name: 'Morocco',  tag: 'Markets, desert',           img: 'images/morocco.jpg' }
  ];

  function renderGrid(gridId, items, scope) {
    const grid = document.getElementById(gridId);
    grid.innerHTML = '';
    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'dest-card';
      card.innerHTML =
        '<div class="dest-card-img" style="background-image:url(\'' + item.img +
          '\'), linear-gradient(155deg, var(--accent-soft), var(--mist));"></div>' +
        '<div class="overlay"></div>' +
        '<div class="label"><b>' + item.name + '</b><span>' + item.tag + '</span></div>';
      card.addEventListener('click', () => selectDestination(item.name, scope));
      grid.appendChild(card);
    });
  }

  renderGrid('localGrid', localSpots, 'local');
  renderGrid('intlGrid', intlSpots, 'intl');

  // Choosing a destination sets the trip and opens the first booking step.
  function selectDestination(name, scope) {
    Trip.set('destination', name);
    Trip.set('destinationQuery', qualifyDestination(name, scope));

    if (blobLoader) {
      blobLoader.classList.add('active');
      if (blobLoadingTitle) blobLoadingTitle.textContent = 'Preparing ' + name + '…';
      if (blobLoadingSub) blobLoadingSub.textContent = 'Finding stays, tables and guides around your destination';

      setTimeout(() => {
        blobLoader.classList.remove('active');
        setNavActive('hotel');
        showScreen('hotel');
        showToast('✈', 'Destination set to ' + name + ' — pick your stay.');
      }, 1600);
    } else {
      setNavActive('hotel');
      showScreen('hotel');
      showToast('✈', 'Destination set to ' + name + ' — pick your stay.');
    }
  }

  // ===========================================
  // Day Tabs
  // ===========================================

  document.querySelectorAll('.day-tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.day-tabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // ===========================================
  // Theme Toggle (light ↔ dark)
  // ===========================================

  const themeToggle = document.getElementById('themeToggle');
  themeToggle.addEventListener('click', () => {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', isDark ? 'light' : 'dark');

    themeToggle.querySelector('.theme-icon').textContent = isDark ? '☾' : '☀';
    themeToggle.setAttribute('aria-label', isDark ? 'Switch to dark mode' : 'Switch to light mode');

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.content = isDark ? '#f2f6fb' : '#0c1421';
  });

  // ===========================================
  // Safety Pill + Breakdown
  // ===========================================

  const safetyPill  = document.getElementById('safetyPill');
  const safetyBreak = document.getElementById('safetyBreak');
  safetyPill.addEventListener('click', () => safetyBreak.classList.toggle('open'));

  const safetyStatuses = [
    { text: 'Alfama — low risk',      dot: 'var(--ok)'  },
    { text: 'Alfama — moderate crowd', dot: 'var(--mid)' },
    { text: 'Alfama — low risk',      dot: 'var(--ok)'  }
  ];
  let safetyIdx = 0;
  let safetyTimer = null;

  function startSafetyCycle() {
    if (safetyTimer) return;
    safetyTimer = setInterval(() => {
      safetyIdx = (safetyIdx + 1) % safetyStatuses.length;
      const textEl = document.getElementById('safetyText');
      const dotEl  = document.getElementById('safetyDot');

      textEl.style.opacity = '0';
      setTimeout(() => {
        textEl.textContent     = safetyStatuses[safetyIdx].text;
        dotEl.style.background = safetyStatuses[safetyIdx].dot;
        textEl.style.opacity   = '1';
      }, 300);
    }, 8000);
  }

  // ===========================================
  // Toast Notification System
  // ===========================================

  let toastTimer = null;

  function showToast(icon, message, duration) {
    duration = duration || 4500;
    const toast  = document.getElementById('toast');
    const iconEl = toast.querySelector('.toast-icon');
    const textEl = document.getElementById('toastText');

    iconEl.textContent = icon;
    textEl.textContent = message;

    if (toastTimer) clearTimeout(toastTimer);

    toast.classList.add('show');
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      toastTimer = null;
    }, duration);
  }

  // ===========================================
  // Live Re-Plan Simulation
  // Runs when the itinerary is actually on screen,
  // so the notification lands in context.
  // ===========================================

  let liveDemoStarted = false;

  function startLiveDemo() {
    startSafetyCycle();
    if (liveDemoStarted) return;
    liveDemoStarted = true;

    setTimeout(() => {
      const nameEl   = document.getElementById('stop3name');
      const reasonEl = document.getElementById('stop3reason');
      const nodeEl   = document.getElementById('node3');

      nameEl.style.transition   = 'opacity 0.35s';
      reasonEl.style.transition = 'opacity 0.35s';
      nameEl.style.opacity   = '0';
      reasonEl.style.opacity = '0';

      setTimeout(() => {
        nameEl.textContent   = 'Tile workshop (indoor)';
        reasonEl.textContent = 'Weather shifted the plan — swapped in an indoor stop matching your craft interest';
        nodeEl.classList.add('done', 'pulse');
        nameEl.style.opacity   = '1';
        reasonEl.style.opacity = '1';

        showToast('☁', 'Rain expected at 2pm — swapped Belém Tower walk for a tile workshop');
      }, 350);
    }, 4200);
  }

  // ===========================================
  // SCROLL ENGINE
  // Every animation below is a pure function of
  // scroll position: scrolling down advances it,
  // scrolling up reverses it, frame for frame.
  // Nothing here fires once and latches.
  // ===========================================

  // The scroll engine's update() calls updateStoryProgress(), and a cached
  // video can make that happen while this IIFE is still being built — before
  // storyNav/storyDots below exist. This flag keeps the early call harmless.
  let storyReady = false;

  const Scroll = (function () {
    let targets = [];
    let ticking = false;
    let vh = window.innerHeight;
    let heroStoryStage = 0;   // current narrative stage (0-4), read by updateStoryProgress

    const header    = document.getElementById('siteHeader');
    const heroStage = document.getElementById('heroStage');
    const heroMedia = document.getElementById('heroMedia');
    const video     = document.getElementById('heroVideo');
    const scenes    = Array.prototype.slice.call(document.querySelectorAll('.scene'));
    const rails     = Array.prototype.slice.call(document.querySelectorAll('.rail-item'));

    // ---- scroll-driven video ----------------------------------------
    // Scroll position is the only source of truth. play() is never called,
    // there is no timer, and nothing advances on its own.
    //
    // SCRUB_EASE is how hard the frame chases the scroll target:
    //   1    = locked frame-for-frame to the scroll position
    //   0.22 = settles in ~80ms, which smooths out the uneven gaps
    //          between scroll events without any perceptible lag.
    // Either way, when scrolling stops the video stops on that exact frame.
    const SCRUB_EASE = 0.07;

    let videoReady = false;
    let videoDur   = 0;
    let targetTime = 0;   // where the scroll says we should be
    let shownTime  = 0;   // where the video actually is
    let scrubRaf   = null;

    function setStageHeight() {
      // 5 narrative stages need enough runway. Minimum 500vh.
      if (!videoDur) return;
      const vhUnits = Math.round(Math.min(700, Math.max(500, 100 + videoDur * 28)));
      heroStage.style.height = vhUnits + 'vh';
    }

    function seekTo(t) {
      if (t < 0) t = 0;
      if (t > videoDur - 0.001) t = videoDur - 0.001;
      // Skip sub-frame writes — they cost a seek and change nothing on screen.
      if (Math.abs(video.currentTime - t) > 0.003) {
        try { video.currentTime = t; } catch (e) { /* not seekable yet */ }
      }
    }

    function scrubLoop() {
      scrubRaf = null;
      if (!videoReady) return;

      const diff = targetTime - shownTime;

      if (Math.abs(diff) < 0.004) {
        shownTime = targetTime;
        seekTo(shownTime);
        return;                       // settled: the frame holds until you scroll again
      }

      shownTime += diff * SCRUB_EASE;
      seekTo(shownTime);
      scrubRaf = requestAnimationFrame(scrubLoop);
    }

    function kickScrub() {
      if (scrubRaf === null) scrubRaf = requestAnimationFrame(scrubLoop);
    }

    if (video) {
      video.pause();                  // guarantee nothing is running
      video.removeAttribute('autoplay');
      video.loop = false;
      video.controls = false;
      video.muted = true;

      var onMeta = function () {
        if (videoDur || !isFinite(video.duration) || video.duration <= 0) return;
        videoDur = video.duration;
        setStageHeight();
        refresh();
      };

      // Wait for a decodable frame before revealing it, so the poster
      // never flicks to black.
      var onData = function () {
        onMeta();
        if (videoReady || !videoDur) return;
        videoReady = true;
        heroMedia.classList.add('video-ready');
        scenes.forEach(function (s) { s.style.opacity = '0'; });
        refresh();
        kickScrub();
      };

      video.addEventListener('loadedmetadata', onMeta);
      video.addEventListener('loadeddata', onData);
      video.addEventListener('canplay', onData);

      // A cached or fast-loading file can finish before this script runs,
      // firing its load events with nobody listening. Catch up by hand.
      if (video.readyState >= 2) { onData(); }
      else if (video.readyState >= 1) { onMeta(); }

      // If the file is missing or the codec is unsupported, the three
      // still scenes carry on exactly as before.
      video.addEventListener('error', function () {
        videoReady = false;
        heroMedia.classList.remove('video-ready');
        update();
      });
    }

    // Split the manifesto into words once, so each can be lit independently
    const manifesto = document.getElementById('manifesto');
    let words = [];
    if (manifesto) {
      const text = manifesto.textContent.trim().split(/\s+/);
      manifesto.textContent = '';
      text.forEach((w, i) => {
        const span = document.createElement('span');
        span.className = 'word';
        span.textContent = w;
        manifesto.appendChild(span);
        if (i < text.length - 1) manifesto.appendChild(document.createTextNode(' '));
        words.push(span);
      });
    }

    function collect() {
      targets = Array.prototype.slice.call(
        document.querySelectorAll('.screen.active [data-scroll]')
      );
    }

    // Triangular fade band: 0 while below the fold, 1 once comfortably in view.
    function enterProgress(rect, startAt, endAt) {
      const start = vh * (startAt || 0.92);
      const end   = vh * (endAt || 0.55);
      return clamp01((start - rect.top) / (start - end));
    }

    function update() {
      ticking = false;
      const y = window.scrollY || window.pageYOffset;

      // --- header ---
      header.classList.toggle('solid', y > 24);

      // --- hero: progress across its full scroll runway ---
      if (heroStage && heroStage.offsetParent !== null) {
        const rect  = heroStage.getBoundingClientRect();
        const range = rect.height - vh;
        const p = range > 0 ? clamp01(-rect.top / range) : 0;

        heroStage.style.setProperty('--p', p.toFixed(4));

        // Scroll position -> video position
        if (videoReady) {
          targetTime = p * videoDur;
          kickScrub();
        }

        // Three-way crossfade through still scenes (video fallback)
        if (!videoReady && scenes.length === 3) {
          scenes[0].style.opacity = clamp01(1 - (p - 0.16) / 0.24).toFixed(3);
          scenes[1].style.opacity = Math.min(
            clamp01((p - 0.16) / 0.24),
            clamp01(1 - (p - 0.58) / 0.24)
          ).toFixed(3);
          scenes[2].style.opacity = clamp01((p - 0.58) / 0.24).toFixed(3);
        }

        // --- Hero slide crossfade (5 stages) ---
        var heroSlides = heroStage.querySelectorAll('.hero-slide');
        var n = heroSlides.length; // 5
        if (n > 0) {
          var seg = 1 / n;       // 0.2
          var fade = 0.04;       // crossfade half-width
          for (var si = 0; si < n; si++) {
            var lo = si * seg;
            var hi = lo + seg;
            var a = 1;
            // Fade in (not for first slide)
            if (si > 0) {
              a = Math.min(a, clamp01((p - lo + fade) / (2 * fade)));
            }
            // Fade out (not for last slide)
            if (si < n - 1) {
              a = Math.min(a, clamp01((hi + fade - p) / (2 * fade)));
            }
            heroSlides[si].style.opacity = a.toFixed(3);
            heroSlides[si].style.transform = 'translate3d(0,' + ((1 - a) * 14).toFixed(1) + 'px,0)';
            heroSlides[si].style.pointerEvents = a > 0.4 ? 'auto' : 'none';
          }
        }

        // Rail marks which of the 5 stages you're in
        var stage5 = Math.min(4, Math.floor(p * 5));
        if (p >= 1) stage5 = 4;
        rails.forEach(function (r, i) { r.classList.toggle('on', i === stage5); });

        // Drive story progress indicator from hero --p
        heroStoryStage = stage5;
      }

      // --- generic reveals ---
      for (let i = 0; i < targets.length; i++) {
        const el   = targets[i];
        const rect = el.getBoundingClientRect();

        // Skip anything far off screen — cheap early out
        if (rect.bottom < -vh || rect.top > vh * 2) continue;

        const kind = el.dataset.scroll;

        if (kind === 'strip') {
          // Track slides horizontally across the whole time the section is in view.
          // Distance is measured from the real track width, so it lands flush on
          // any viewport instead of over- or under-shooting a percentage guess.
          const p = clamp01((vh * 0.7 - rect.top) / (vh * 0.4 + rect.height));
          const track = el.querySelector('.strip-track');
          if (track) {
            const maxShift = Math.max(0, track.scrollWidth - window.innerWidth + 24);
            track.style.transform =
              'translate3d(' + (24 - p * (maxShift + 24)).toFixed(1) + 'px, 0, 0)';
          }

        } else if (kind === 'manifesto') {
          const p = enterProgress(rect, 0.88, 0.34);
          const lit = Math.round(p * words.length);
          for (let w = 0; w < words.length; w++) {
            words[w].classList.toggle('lit', w < lit);
          }

        } else if (kind === 'row') {
          el.style.setProperty('--p', enterProgress(rect, 0.95, 0.68).toFixed(4));

        } else if (kind === 'adapt') {
          // The adapt section drives its --p from scroll position just like everything else.
          // CSS uses calc() on --p to stagger the alert, before, after, and explanation.
          const p = enterProgress(rect, 0.88, 0.28);
          el.style.setProperty('--p', p.toFixed(4));

        } else {
          el.style.setProperty('--p', enterProgress(rect, 0.92, 0.6).toFixed(4));
        }
      }

      // --- story progress indicator ---
      updateStoryProgress();
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }

    function refresh() {
      vh = window.innerHeight;
      setStageHeight();
      collect();
      update();
    }

    function init() {
      collect();

      if (reduceMotion) {
        // Park everything in its finished state; no scroll listeners at all.
        document.querySelectorAll('[data-scroll]').forEach(el => el.style.setProperty('--p', '1'));
        if (heroStage) heroStage.style.setProperty('--p', '0');
        if (scenes[0]) scenes[0].style.opacity = '1';
        if (video) { video.pause(); try { video.currentTime = 0; } catch (e) {} }
        words.forEach(w => w.classList.add('lit'));
        header.classList.add('solid');
        return;
      }

      window.addEventListener('scroll', onScroll, { passive: true });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden && scrubRaf !== null) {
          cancelAnimationFrame(scrubRaf);
          scrubRaf = null;
        } else if (!document.hidden) {
          kickScrub();
        }
      });
      window.addEventListener('resize', refresh, { passive: true });
      window.addEventListener('orientationchange', refresh, { passive: true });

      // Late-loading images change layout — re-measure when they land
      document.querySelectorAll('img').forEach(img => {
        if (!img.complete) img.addEventListener('load', refresh, { once: true });
      });

      update();
    }

    return { init: init, refresh: refresh, update: update, getStage: function () { return heroStoryStage; } };
  })();

  // ===========================================
  // Story Progress Indicator
  // ===========================================

  const storyDots  = Array.prototype.slice.call(document.querySelectorAll('.sp-dot'));
  const storyNav   = document.getElementById('storyProgress');
  let currentStory = -1;
  storyReady = true;

  function updateStoryProgress() {
    if (!storyReady) return;
    if (!storyNav || storyDots.length === 0) return;

    // Show progress only on the home screen
    var homeActive = document.getElementById('home');
    if (!homeActive || !homeActive.classList.contains('active')) {
      storyNav.style.opacity = '0';
      storyNav.style.pointerEvents = 'none';
      return;
    }
    storyNav.style.opacity = '1';
    storyNav.style.pointerEvents = 'auto';

    // heroStoryStage is set inside the scroll engine's hero update
    var best = Scroll.getStage ? Scroll.getStage() : 0;
    if (best !== currentStory) {
      currentStory = best;
      storyDots.forEach(function (dot, idx) {
        dot.classList.toggle('active', idx === best);
      });
    }
  }

  // Click-to-scroll on progress dots — scrolls to the right fraction of the hero stage
  storyDots.forEach(function (dot) {
    dot.addEventListener('click', function (e) {
      e.preventDefault();
      var idx = parseInt(dot.dataset.story, 10);
      var heroStageEl = document.getElementById('heroStage');
      if (!heroStageEl) return;
      var stageRect = heroStageEl.getBoundingClientRect();
      var range = stageRect.height - window.innerHeight;
      var targetP = (idx + 0.1) / 5; // slightly past the start of each stage
      var scrollTarget = (window.scrollY || window.pageYOffset) + stageRect.top + range * targetP;
      window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
    });
  });

  // Started here, not earlier: the scroll engine's first update() calls
  // updateStoryProgress(), which reads storyNav/storyDots above.
  Scroll.init();

  // ===========================================
  // Magnetic tilt on cards
  // ===========================================

  function attachTilt(el, strength) {
    let raf = null;
    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const rx = (0.5 - py) * strength;
      const ry = (px - 0.5) * strength;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--tilt-x', rx.toFixed(2) + 'deg');
        el.style.setProperty('--tilt-y', ry.toFixed(2) + 'deg');
      });
    });
    el.addEventListener('mouseleave', () => {
      el.style.setProperty('--tilt-x', '0deg');
      el.style.setProperty('--tilt-y', '0deg');
    });
  }

  if (!reduceMotion && window.matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.feature-card, .guide-card').forEach(el => {
      el.classList.add('tilt');
      attachTilt(el, 3.5);
    });
  }

  // ===========================================
  // Button ripple
  // ===========================================

  function addRipple(e) {
    if (reduceMotion) return;
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const circle = document.createElement('span');
    const size = Math.max(rect.width, rect.height) * 1.6;
    circle.className = 'btn-ripple';
    circle.style.width = circle.style.height = size + 'px';
    circle.style.left = (e.clientX - rect.left - size / 2) + 'px';
    circle.style.top  = (e.clientY - rect.top  - size / 2) + 'px';
    btn.appendChild(circle);
    circle.addEventListener('animationend', () => circle.remove());
  }

  document.querySelectorAll('.hero-cta, .btn-primary, .btn-secondary, .guide-add')
    .forEach(btn => {
      btn.classList.add('ripple-host');
      btn.addEventListener('click', addRipple);
    });

  // ===========================================
  // Hotel / Restaurant list actions
  // Each button carries its own confirmation copy.
  // ===========================================

  document.querySelectorAll('.guide-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.guide-card');
      const name = card ? card.querySelector('.guide-name').textContent : 'Item';
      showToast('◈', btn.dataset.toast || (name + ' saved to your trip.'));
    });
  });

  // ===========================================
  // TRIP STATE
  // One store for everything the traveller picks.
  // Survives reloads so a half-finished trip is not lost.
  // ===========================================

  const Trip = (function () {
    const KEY = 'travexa.trip';
    const BLANK = {
      destination: null,      // what the traveller sees, e.g. "Goa"
      destinationQuery: null, // what geocoders get, e.g. "Goa, India"
      coords: null,           // set when the destination came from geolocation
      hotel: null,
      restaurant: null,
      guide: null,
      others: []
    };

    let data = read();

    function read() {
      try {
        const raw = window.localStorage.getItem(KEY);
        if (raw) return Object.assign({}, BLANK, JSON.parse(raw));
      } catch (e) { /* storage blocked or corrupt — fall through */ }
      return Object.assign({}, BLANK);
    }

    function write() {
      try { window.localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
    }

    function get(key) { return key ? data[key] : data; }

    function set(key, value) {
      data[key] = value;
      write();
      renderTracker();
    }

    // "Others" is multi-select: the same place toggles off when picked again.
    function toggleOther(place) {
      const at = data.others.findIndex(p => p.id === place.id);
      if (at >= 0) data.others.splice(at, 1);
      else data.others.push(place);
      write();
      renderTracker();
      return at < 0;
    }

    function hasOther(id) {
      return data.others.some(p => p.id === id);
    }

    function reset() {
      data = Object.assign({}, BLANK, { others: [] });
      write();
      renderTracker();
    }

    // What the Foursquare search should be centred on. destinationQuery is the
    // country-qualified form — "Goa" alone geocodes to Genova, Italy.
    function searchArea() {
      return data.coords || data.destinationQuery || data.destination || '';
    }

    return { get, set, toggleOther, hasOther, reset, searchArea };
  })();

  // ===========================================
  // GUIDE — on-demand local guides
  // Frontend prototype: the profiles below are demo
  // data and no request ever leaves the browser.
  // ===========================================

  (function GuideModule() {

    const DEMO_GUIDES = [
      {
        initials: 'RT', name: 'Ramesh Thakur',
        distance: '0.8 km away', eta: '~5 min', arrival: '5–10 min',
        rating: '4.9', reviews: '124 reviews',
        languages: 'English · Hindi · Tamil',
        specialties: 'Local sightseeing · Culture',
        mark: { x: 28, y: 30 }
      },
      {
        initials: 'PN', name: 'Priya N.',
        distance: '1.2 km away', eta: '~8 min', arrival: '8–14 min',
        rating: '4.8', reviews: '98 reviews',
        languages: 'English · Hindi',
        specialties: 'Food · Shopping · Local experiences',
        mark: { x: 71, y: 39 }
      },
      {
        initials: 'TB', name: 'Tenzin Bhutia',
        distance: '1.8 km away', eta: '~12 min', arrival: '12–18 min',
        rating: '4.7', reviews: '76 reviews',
        languages: 'English · Hindi · Tamil',
        specialties: 'History · Nature · Photography',
        mark: { x: 63, y: 78 }
      }
    ];

    const map        = document.getElementById('gxMap');
    const mapEmpty   = document.getElementById('gxMapEmpty');
    const locBar     = document.getElementById('gxLocBar');
    const locValue   = document.getElementById('gxLocValue');
    const locStatus  = document.getElementById('gxLocStatus');
    const findBtn    = document.getElementById('gxFindBtn');
    const enableBtn  = document.getElementById('gxEnableBtn');
    const blockedMsg = document.getElementById('gxBlockedDesc');
    const countEl    = document.getElementById('gxCount');
    const listEl     = document.getElementById('gxList');
    const modal      = document.getElementById('gxModal');
    const modalBody  = document.getElementById('gxModalBody');
    const modalClose = document.getElementById('gxModalClose');

    const states = {
      idle:     document.getElementById('gxIdle'),
      locating: document.getElementById('gxLocating'),
      blocked:  document.getElementById('gxBlocked'),
      results:  document.getElementById('gxResults')
    };

    // The guide screen is optional markup — bail out quietly if it is absent.
    if (!map || !listEl || !modal || !states.idle) return;

    let revealTimer = null;
    let selectedIdx = -1;
    let locationText = 'Current location';

    // --- helpers ------------------------------------------------------

    function esc(s) {
      return String(s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }

    function setState(name) {
      Object.keys(states).forEach(function (key) {
        if (states[key]) states[key].hidden = (key !== name);
      });
    }

    function formatCoords(pos) {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      return Math.abs(lat).toFixed(4) + '° ' + (lat >= 0 ? 'N' : 'S') + ', ' +
             Math.abs(lon).toFixed(4) + '° ' + (lon >= 0 ? 'E' : 'W');
    }

    // --- map markers --------------------------------------------------

    function renderMarkers() {
      map.querySelectorAll('.gx-marker').forEach(function (m) { m.remove(); });

      DEMO_GUIDES.forEach(function (g, i) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'gx-marker';
        el.style.left = g.mark.x + '%';
        el.style.top  = g.mark.y + '%';
        el.dataset.idx = String(i);
        el.setAttribute('aria-label', g.name + ', ' + g.distance);
        el.innerHTML = esc(g.initials) +
          '<span class="gx-marker-eta">' + esc(g.eta) + '</span>';
        el.addEventListener('click', function () { selectGuide(i, true); });
        map.appendChild(el);
        window.setTimeout(function () { el.classList.add('in'); }, 120 + i * 130);
      });
    }

    function selectGuide(idx, scrollToCard) {
      selectedIdx = idx;
      map.querySelectorAll('.gx-marker').forEach(function (m) {
        m.classList.toggle('selected', m.dataset.idx === String(idx));
      });
      listEl.querySelectorAll('.gx-card').forEach(function (c) {
        c.classList.toggle('selected', c.dataset.idx === String(idx));
      });
      if (scrollToCard) {
        const card = listEl.querySelector('.gx-card[data-idx="' + idx + '"]');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    // --- guide cards --------------------------------------------------

    function cardMarkup(g, i) {
      return '' +
        '<article class="gx-card" data-idx="' + i + '" style="animation-delay:' + (i * 90) + 'ms">' +
          '<div class="gx-card-top">' +
            '<div class="gx-avatar">' + esc(g.initials) + '</div>' +
            '<div>' +
              '<div class="gx-card-name">' + esc(g.name) +
                '<span class="gx-badge">Local Guide</span></div>' +
              '<div class="gx-card-rating"><span class="star">★</span> ' + esc(g.rating) +
                ' · ' + esc(g.reviews) + '</div>' +
            '</div>' +
            '<div class="gx-card-eta"><b>' + esc(g.distance.replace(' away', '')) + '</b>' +
              '<span>Arrives in ' + esc(g.eta) + '</span></div>' +
          '</div>' +
          '<dl class="gx-facts">' +
            '<div class="gx-fact"><dt>Languages</dt><dd>' + esc(g.languages) + '</dd></div>' +
            '<div class="gx-fact"><dt>Specialties</dt><dd>' + esc(g.specialties) + '</dd></div>' +
          '</dl>' +
          '<div class="gx-card-actions">' +
            '<button type="button" class="gx-btn ghost" data-act="contact" data-idx="' + i + '">Contact</button>' +
            '<button type="button" class="gx-btn solid" data-act="request" data-idx="' + i + '">Request Guide</button>' +
          '</div>' +
        '</article>';
    }

    function renderList() {
      listEl.innerHTML = DEMO_GUIDES.map(cardMarkup).join('');
      if (countEl) countEl.textContent = DEMO_GUIDES.length + ' guides nearby';
    }

    // One delegated listener for every card action — no per-card bindings.
    listEl.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-act]');
      if (!btn || !listEl.contains(btn)) return;
      const idx = parseInt(btn.dataset.idx, 10);
      if (isNaN(idx) || !DEMO_GUIDES[idx]) return;
      selectGuide(idx, false);
      if (btn.dataset.act === 'contact') openContact(idx);
      else if (btn.dataset.act === 'request') openRequest(idx);
    });

    // --- location -----------------------------------------------------

    function beginSearch() {
      if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
      map.classList.remove('live');

      if (!navigator.geolocation) {
        showBlocked('This browser does not support location sharing, so nearby guides cannot be found.');
        return;
      }

      setState('locating');
      map.classList.add('locating');
      if (mapEmpty) mapEmpty.hidden = true;
      if (locBar) locBar.hidden = false;
      if (locValue) locValue.textContent = 'Locating…';
      if (locStatus) locStatus.textContent = 'Waiting for permission';

      navigator.geolocation.getCurrentPosition(onLocated, onLocationError, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000
      });
    }

    function onLocated(pos) {
      locationText = formatCoords(pos);
      if (locValue) locValue.textContent = locationText;
      if (locStatus) locStatus.textContent = 'Finding guides near you…';

      // Brief discovery beat, then the nearby guides appear.
      revealTimer = window.setTimeout(function () {
        revealTimer = null;
        map.classList.remove('locating');
        map.classList.add('live');
        if (locStatus) locStatus.textContent = DEMO_GUIDES.length + ' guides nearby';
        renderMarkers();
        renderList();
        setState('results');
        // Real, verified Travexa guides for this position (may be none).
        if (window.TravexaGuides && window.TravexaGuides.refresh) {
          window.TravexaGuides.refresh(pos.coords.latitude, pos.coords.longitude);
        }
      }, 1400);
    }

    function onLocationError(err) {
      let msg = 'Allow location for this page in your browser, then try again.';
      if (err && err.code === 2) {
        msg = 'Your location could not be determined right now. Check that location services are on, then try again.';
      } else if (err && err.code === 3) {
        msg = 'Locating took too long. Try again from somewhere with a better signal.';
      }
      showBlocked(msg);
    }

    function showBlocked(message) {
      map.classList.remove('locating', 'live');
      map.querySelectorAll('.gx-marker').forEach(function (m) { m.remove(); });
      if (mapEmpty) mapEmpty.hidden = false;
      if (locBar) locBar.hidden = true;
      if (locValue) locValue.textContent = 'Locating…';
      if (blockedMsg) blockedMsg.textContent = message;
      setState('blocked');
    }

    if (findBtn) findBtn.addEventListener('click', beginSearch);
    if (enableBtn) enableBtn.addEventListener('click', beginSearch);

    // --- modal --------------------------------------------------------

    let lastFocused = null;

    function openModal(html) {
      lastFocused = document.activeElement;
      modalBody.innerHTML = html;
      modal.hidden = false;
      document.body.style.overflow = 'hidden';
      const firstField = modalBody.querySelector('textarea, button');
      if (firstField) firstField.focus();
    }

    function closeModal() {
      if (modal.hidden) return;
      modal.hidden = true;
      modalBody.innerHTML = '';
      document.body.style.overflow = '';
      if (lastFocused && lastFocused.focus) lastFocused.focus();
      lastFocused = null;
    }

    if (modalClose) modalClose.addEventListener('click', closeModal);

    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
    });

    function profileMarkup(g) {
      return '' +
        '<div class="gx-modal-profile">' +
          '<div class="gx-avatar">' + esc(g.initials) + '</div>' +
          '<div>' +
            '<div class="gx-card-name">' + esc(g.name) +
              '<span class="gx-badge">Local Guide</span></div>' +
            '<div class="gx-card-rating"><span class="star">★</span> ' + esc(g.rating) +
              ' · ' + esc(g.distance) + ' · ' + esc(g.languages) + '</div>' +
          '</div>' +
        '</div>';
    }

    // --- contact ------------------------------------------------------

    function openContact(idx) {
      const g = DEMO_GUIDES[idx];
      openModal('' +
        '<h3 class="gx-modal-title" id="gxModalTitle">Contact ' + esc(g.name) + '</h3>' +
        '<p class="gx-modal-desc">Send a note before you request them.</p>' +
        profileMarkup(g) +
        '<label class="gx-msg-label" for="gxMessage">Message</label>' +
        '<textarea class="gx-msg-input" id="gxMessage">Hi! I&#39;m interested in exploring this area.</textarea>' +
        '<div class="gx-modal-actions">' +
          '<button type="button" class="gx-btn solid" data-modal-act="send" data-idx="' + idx + '">Send</button>' +
        '</div>' +
        '<span class="gx-demo-tag">Demo message</span>');
    }

    function showMessageSent(idx) {
      const g = DEMO_GUIDES[idx];
      openModal('' +
        '<div class="gx-status-mark">✓</div>' +
        '<h3 class="gx-modal-title" id="gxModalTitle">Message sent</h3>' +
        '<p class="gx-modal-desc">Saved to this prototype only — no message was delivered to ' +
          esc(g.name) + ' or any real guide.</p>' +
        profileMarkup(g) +
        '<div class="gx-modal-actions two">' +
          '<button type="button" class="gx-btn ghost" data-modal-act="close">Close</button>' +
          '<button type="button" class="gx-btn solid" data-modal-act="request" data-idx="' + idx + '">Request Guide</button>' +
        '</div>' +
        '<span class="gx-demo-tag">Demo message</span>');
      showToast('◈', 'Message sent to ' + g.name + ' (demo).');
    }

    // --- request ------------------------------------------------------

    function openRequest(idx) {
      const g = DEMO_GUIDES[idx];
      openModal('' +
        '<h3 class="gx-modal-title" id="gxModalTitle">Request a Guide</h3>' +
        '<p class="gx-modal-desc">Your guide will meet you at your current location.</p>' +
        '<dl class="gx-summary">' +
          '<div class="gx-summary-row"><dt>Your location</dt><dd>' + esc(locationText) + '</dd></div>' +
          '<div class="gx-summary-row"><dt>Selected guide</dt><dd>' + esc(g.name) + '</dd></div>' +
          '<div class="gx-summary-row"><dt>Rating</dt><dd><span class="star">★</span> ' + esc(g.rating) + '</dd></div>' +
          '<div class="gx-summary-row"><dt>Estimated arrival</dt><dd>' + esc(g.eta) + '</dd></div>' +
        '</dl>' +
        '<div class="gx-modal-actions two">' +
          '<button type="button" class="gx-btn ghost" data-modal-act="close">Cancel</button>' +
          '<button type="button" class="gx-btn solid" data-modal-act="confirm" data-idx="' + idx + '">Confirm Request</button>' +
        '</div>' +
        '<span class="gx-demo-tag">Demo request</span>');
    }

    function showRequested(idx) {
      const g = DEMO_GUIDES[idx];

      openModal('' +
        '<div class="gx-status-mark">✓</div>' +
        '<h3 class="gx-modal-title" id="gxModalTitle">Guide Requested ✓</h3>' +
        '<p class="gx-modal-desc">Your guide is on the way.</p>' +
        '<div class="gx-route">' +
          '<div class="gx-route-end">' +
            '<div class="gx-avatar">' + esc(g.initials) + '</div>' +
            '<span class="gx-route-cap">' + esc(g.name) + '</span>' +
          '</div>' +
          '<div class="gx-route-path"></div>' +
          '<div class="gx-route-end">' +
            '<div class="gx-route-pin">◉</div>' +
            '<span class="gx-route-cap">You</span>' +
          '</div>' +
        '</div>' +
        '<dl class="gx-summary">' +
          '<div class="gx-summary-row"><dt>Estimated arrival</dt><dd>' + esc(g.arrival) + '</dd></div>' +
          '<div class="gx-summary-row"><dt>Meeting point</dt><dd>' + esc(locationText) + '</dd></div>' +
        '</dl>' +
        '<p class="demo-note">Prototype only — no guide has been contacted or dispatched.</p>' +
        '<div class="gx-modal-actions">' +
          '<button type="button" class="gx-btn ghost" data-modal-act="close">Close</button>' +
        '</div>' +
        '<span class="gx-demo-tag">Demo request</span>');

      // Mirror the state on the map so the screen behind the modal agrees.
      const marker = map.querySelector('.gx-marker[data-idx="' + idx + '"]');
      if (marker) {
        marker.classList.add('selected');
        const eta = marker.querySelector('.gx-marker-eta');
        if (eta) eta.textContent = 'On the way';
      }
      if (locStatus) locStatus.textContent = g.name + ' is on the way · demo';

      // Record the guide on the trip so the tracker and summary pick it up.
      Trip.set('guide', {
        id: 'guide-' + idx,
        name: g.name,
        meta: g.languages + ' · ' + g.specialties,
        address: g.distance + ' · arrives ' + g.eta
      });

      showToast('◈', g.name + ' requested — demo only, no guide was dispatched.');
    }

    // One delegated listener for every button rendered inside the modal.
    modalBody.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-modal-act]');
      if (!btn || !modalBody.contains(btn)) return;
      const act = btn.dataset.modalAct;
      const idx = parseInt(btn.dataset.idx, 10);

      if (act === 'close') closeModal();
      else if (act === 'send' && DEMO_GUIDES[idx]) showMessageSent(idx);
      else if (act === 'request' && DEMO_GUIDES[idx]) openRequest(idx);
      else if (act === 'confirm' && DEMO_GUIDES[idx]) showRequested(idx);
    });

  })();

  // ===========================================
  // TRIP TRACKER
  // Reflects the real trip state and lets the
  // traveller jump back to any step to edit it.
  // ===========================================

  const FLOW_SCREENS = ['book1', 'bookLocal', 'bookIntl', 'hotel', 'restaurant',
                        'guide', 'others', 'tripSummary'];

  const trackerEl = document.getElementById('tripTracker');

  function stepValue(step) {
    const t = Trip.get();
    if (step === 'destination') return t.destination || null;
    if (step === 'others') {
      return t.others.length ? t.others.map(p => p.name).join(', ') : null;
    }
    return t[step] ? t[step].name : null;
  }

  function renderTracker() {
    if (!trackerEl) return;
    const active = document.querySelector('.screen.active');
    const current = active ? active.id : '';

    trackerEl.querySelectorAll('.tracker-step').forEach(btn => {
      const step = btn.dataset.step;
      const value = stepValue(step);
      const isCurrent = step === current ||
        (step === 'destination' && ['book1', 'bookLocal', 'bookIntl'].indexOf(current) >= 0);

      btn.classList.toggle('done', !!value && !isCurrent);
      btn.classList.toggle('current', isCurrent);

      const mark = btn.querySelector('.tracker-mark');
      if (mark) mark.textContent = isCurrent ? '•' : (value ? '✓' : '○');

      const out = btn.querySelector('.tracker-value');
      if (out) {
        out.textContent = value || (step === 'others' ? 'None' : 'Not chosen');
        out.title = value || '';
      }
    });
  }

  // Clicking a tracker step returns to it without clearing anything else.
  if (trackerEl) {
    trackerEl.addEventListener('click', e => {
      const btn = e.target.closest('.tracker-step');
      if (!btn) return;
      const step = btn.dataset.step;
      if (step === 'destination') {
        setNavActive('onboard');
        showScreen('book1');
      } else {
        setNavActive(step);
        showScreen(step);
      }
    });
  }

  // Called from showScreen: tracker visibility + per-screen data loading.
  function syncFlowChrome(id) {
    if (trackerEl) trackerEl.hidden = FLOW_SCREENS.indexOf(id) < 0;
    renderTracker();
    if (id === 'hotel' || id === 'restaurant' || id === 'others') Places.prime(id);
    if (id === 'tripSummary') { renderSummary(); buildPlan(false); scoreDestination(); }
    if (id === 'guideDashboard') loadGuideDashboard();
    if (id === 'guide') { renderBookingLive(); }
    if (id === 'assistant') {
      renderAssistantTrip();
      const g = document.getElementById('asGreeting');
      const dest = Trip.get('destination');
      if (g) g.textContent = dest ? 'What do you want in ' + dest + '?' : 'Where to next?';
    }
  }

  // ===========================================
  // PLACES — the one Foursquare client
  // Talks to the existing /api/hotels route (also
  // mounted at /api/places). No second integration.
  // ===========================================

  const Places = (function () {

    // Per-screen wiring. `query` is the default Foursquare search term.
    const PANES = {
      hotel:      { query: 'hotel',      multi: false, key: 'hotel' },
      restaurant: { query: 'restaurant', multi: false, key: 'restaurant' },
      others:     { query: 'attractions', multi: true, key: 'others' }
    };

    // Remembers the last successful search per pane so returning to a screen
    // does not silently re-hit the API.
    const cache = {};

    // Rising token per pane: a slow earlier response must not overwrite a
    // newer one when the traveller searches twice in quick succession.
    const token = {};

    // server/index.js serves the API *and* the site, so a relative /api path
    // is right when the page came from it. A plain static dev server (VS Code
    // Live Server, or a file:// open) cannot answer /api at all, so point
    // those at the Travexa server's default port instead. CORS is already
    // enabled server-side, so the cross-origin call is allowed.
    const API_BASE = (function () {
      const port = window.location.port;
      const staticDev = window.location.protocol === 'file:' ||
                        port === '5500' || port === '5501';
      return staticDev ? 'http://localhost:3001' : '';
    })();

    // Turn a failure into something the reader can actually act on.
    function explainFailure(err) {
      const code = err && err.status;
      const detail = (err && err.detail) || '';

      if (/key not configured/i.test(detail)) {
        return 'Foursquare API key not configured. Create a .env file next to ' +
               'package.json containing FOURSQUARE_API_KEY=your-key, then restart ' +
               'the server with npm run dev.';
      }
      if (code === 401 || code === 403) {
        return 'Foursquare rejected the API key. Check FOURSQUARE_API_KEY in your .env file.';
      }
      if (code === 429) {
        return 'Foursquare rate limit reached. Wait a moment and try again.';
      }
      if (code === 404) {
        return 'The Travexa server is not answering /api/places. Start it with ' +
               'npm run dev and open http://localhost:3001.';
      }
      if (code === 0) {
        return 'Cannot reach the Travexa server. Start it with npm run dev, ' +
               'then open http://localhost:3001.';
      }
      return 'Unable to load places. Please try again.';
    }

    function el(pane, suffix) {
      return document.getElementById(pane + suffix);
    }

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    function status(pane, html, isError) {
      const box = el(pane, 'Status');
      if (!box) return;
      if (!html) { box.hidden = true; box.innerHTML = ''; return; }
      box.hidden = false;
      box.classList.toggle('is-error', !!isError);
      box.innerHTML = html;
    }

    function hint(pane, text) {
      const h = el(pane, 'Hint');
      if (h) h.textContent = text || '';
    }

    function hideDemo(pane) {
      const demo = el(pane, 'Demo');
      if (demo) demo.hidden = true;
    }

    function cardMarkup(place, pane, picked) {
      const cfg = PANES[pane];
      const bits = [];
      if (place.category) bits.push(esc(place.category));
      if (place.rating) bits.push('<span class="star">★</span> ' + esc(place.rating));
      if (place.priceLevel) bits.push(esc('$'.repeat(place.priceLevel)));

      const img = window.TravexaVisual
        ? window.TravexaVisual(place)
        : '<div class="hotel-card-noimg">No photo</div>';

      return '' +
        '<article class="hotel-card' + (picked ? ' selected' : '') + '" data-id="' + esc(place.id) + '">' +
          img +
          '<span class="hotel-card-pick">' + (picked ? '✓' : (cfg.multi ? '+' : '○')) + '</span>' +
          '<div class="hotel-card-body">' +
            '<h4 class="hotel-card-name">' + esc(place.name) + '</h4>' +
            '<p class="hotel-card-address">' + esc(place.address || place.city || '') + '</p>' +
            (bits.length ? '<div class="hotel-card-meta">' + bits.join(' · ') + '</div>' : '') +
          '</div>' +
        '</article>';
    }

    function paint(pane, places) {
      const grid = el(pane, 'Results');
      if (!grid) return;
      const cfg = PANES[pane];
      grid.innerHTML = places.map(p => {
        const picked = cfg.multi
          ? Trip.hasOther(p.id)
          : (Trip.get(cfg.key) || {}).id === p.id;
        return cardMarkup(p, pane, picked);
      }).join('');

      // Plot the same results on the area map, where one exists.
      if (window.TravexaAreaMap) window.TravexaAreaMap(pane, places);
    }

    // The single network call. Everything routes through here.
    async function search(pane, opts) {
      opts = opts || {};
      const cfg = PANES[pane];
      const area = opts.area || Trip.searchArea();
      const term = (opts.query || '').trim() || cfg.query;

      if (!area) {
        status(pane, 'Choose a destination first, or search a city by name.', false);
        paint(pane, []);
        return;
      }

      hideDemo(pane);
      // Clear first: results for the previous city must never sit under a
      // search that is already running for a new one.
      paint(pane, []);
      hint(pane, 'Searching “' + term + '” near ' + area);
      status(pane, '<span class="spinner"></span><span>Finding places…</span>', false);

      const mine = (token[pane] = (token[pane] || 0) + 1);

      const url = API_BASE + '/api/places?location=' + encodeURIComponent(area) +
                  '&query=' + encodeURIComponent(term) + '&limit=12';

      try {
        let res;
        try {
          res = await fetch(url);
        } catch (netErr) {
          // Server down / DNS / CORS preflight refused — no HTTP status exists.
          throw Object.assign(new Error('unreachable'), { status: 0 });
        }

        if (!res.ok) {
          let detail = '';
          try { detail = (await res.json()).error || ''; } catch (e) { /* not JSON */ }
          throw Object.assign(new Error(detail || ('HTTP ' + res.status)),
                              { status: res.status, detail: detail });
        }

        const data = await res.json();
        if (mine !== token[pane]) return;   // superseded by a newer search
        const places = (data.places || data.hotels || []).filter(p => p && p.id);

        if (!places.length) {
          paint(pane, []);
          status(pane, 'No places found. Try another search.', false);
          cache[pane] = null;
          return;
        }

        cache[pane] = { area: area, term: term, places: places };
        status(pane, '');
        hint(pane, places.length + ' results for “' + term + '” near ' + area);
        paint(pane, places);

      } catch (err) {
        if (mine !== token[pane]) return;
        console.warn('Places search failed:', err);
        paint(pane, []);
        hint(pane, '');
        status(pane, explainFailure(err), true);
      }
    }

    // Load a screen's results on first arrival, or when the destination moved.
    function prime(pane) {
      if (!PANES[pane]) return;
      const area = Trip.searchArea();
      const seen = cache[pane];
      if (!area) {
        hint(pane, 'Pick a destination to see real places here');
        return;
      }
      if (seen && seen.area === area) {
        paint(pane, seen.places);
        hint(pane, seen.places.length + ' results for “' + seen.term + '” near ' + area);
        status(pane, '');
        hideDemo(pane);
        return;
      }
      search(pane, {});
    }

    return {
      search: search, prime: prime,
      repaint: p => cache[p] && paint(p, cache[p].places),
      // Lets callers recover the full API record for a rendered card.
      find: (p, id) => (cache[p] ? cache[p].places : []).find(x => x.id === id) || null
    };
  })();

  // ===========================================
  // BOOKING FLOW WIRING
  // ===========================================

  /**
   * A typed search can name a place anywhere, not just where you are.
   *   "sushi in Tokyo"      -> term "sushi",  area "Tokyo"
   *   "hotels near Lisbon"  -> term "hotels", area "Lisbon"
   *   "Paris"               -> area "Paris"   (no place-type word present)
   *   "rooftop bar"         -> term, searched in the current destination
   */
  const PLACE_WORDS = /\b(hotel|hotels|stay|stays|resort|hostel|restaurant|restaurants|cafe|caf[eé]s?|bar|bars|pub|food|dining|eat|breakfast|lunch|dinner|museum|museums|park|parks|beach|temple|market|shopping|attraction|attractions|landmark|gallery|spa|club)\b/i;

  function splitSearch(text) {
    // Explicit "<what> in|near|around <where>"
    const m = text.match(/^(.*?)\s+(?:in|near|around|at)\s+(.+)$/i);
    if (m && m[1].trim() && m[2].trim()) {
      return { term: m[1].trim(), area: m[2].trim() };
    }
    // No place-type word at all reads as a destination on its own.
    if (text && !PLACE_WORDS.test(text) && text.split(/\s+/).length <= 4) {
      return { term: '', area: text };
    }
    return { term: text, area: '' };
  }

  function runPaneSearch(pane, raw) {
    const text = (raw || '').trim();
    if (!text) { Places.search(pane, {}); return; }

    const { term, area } = splitSearch(text);

    if (area) {
      // Searching somewhere else becomes the trip destination, so the rest of
      // the flow (plan, maps, safety) follows the traveller there.
      Trip.set('destination', area);
      Trip.set('destinationQuery', area);
      Trip.set('coords', null);
      paintDestCurrent();
      Places.search(pane, { area: area, query: term });
      showToast('✈', 'Searching in ' + area + '.');
      return;
    }

    Places.search(pane, { query: term });
  }

  ['hotel', 'restaurant', 'others'].forEach(pane => {
    const form = document.getElementById(pane + 'Search');
    const input = document.getElementById(pane + 'Query');
    if (form) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        runPaneSearch(pane, input ? input.value : '');
      });
    }

    // One delegated listener per results grid — cards are re-rendered often.
    const grid = document.getElementById(pane + 'Results');
    if (!grid) return;
    grid.addEventListener('click', e => {
      const card = e.target.closest('.hotel-card');
      if (!card || !grid.contains(card)) return;
      pickPlace(pane, card.dataset.id);
    });
  });

  function pickPlace(pane, id) {
    const grid = document.getElementById(pane + 'Results');
    const card = grid && grid.querySelector('.hotel-card[data-id="' + id + '"]');
    if (!card) return;

    // Prefer the cached API object — it carries website/phone, which the
    // rendered card does not, and the plan page needs them for booking links.
    const cached = Places.find(pane, id);
    const place = cached ? tripItem(cached) : {
      id: id,
      name: card.querySelector('.hotel-card-name').textContent,
      address: card.querySelector('.hotel-card-address').textContent,
      photo: (card.querySelector('.hotel-card-img') || {}).src || null
    };

    if (pane === 'others') {
      const added = Trip.toggleOther(place);
      showToast('◈', added ? place.name + ' added to your trip.'
                           : place.name + ' removed.');
    } else {
      Trip.set(pane, place);
      showToast('◈', place.name + ' selected.');
    }
    Places.repaint(pane);
  }

  // Quick category chips on the Others screen
  const othersChips = document.getElementById('othersChips');
  if (othersChips) {
    othersChips.addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      othersChips.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      const input = document.getElementById('othersQuery');
      if (input) input.value = chip.dataset.q;
      Places.search('others', { query: chip.dataset.q });
    });
  }

  // "Use my current location" on the Others screen — reuses the browser
  // geolocation the Guide screen already asks for.
  const othersNearMe = document.getElementById('othersNearMe');
  if (othersNearMe) {
    othersNearMe.addEventListener('click', () => {
      if (!navigator.geolocation) {
        showToast('◎', 'This browser cannot share your location.');
        return;
      }
      othersNearMe.textContent = 'Locating…';
      navigator.geolocation.getCurrentPosition(
        pos => {
          const ll = pos.coords.latitude.toFixed(5) + ',' + pos.coords.longitude.toFixed(5);
          othersNearMe.textContent = 'Use my current location';
          Trip.set('coords', ll);
          Places.search('others', { area: ll });
        },
        () => {
          othersNearMe.textContent = 'Use my current location';
          showToast('◎', 'Location access denied — search by destination instead.');
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    });
  }

  // --- step-to-step navigation -------------------------------------------

  function advance(from, to, requireKey, nudge) {
    const btn = document.getElementById(from + 'Next');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (requireKey && !Trip.get(requireKey)) {
        showToast('◈', nudge);
        return;
      }
      setNavActive(to);
      showScreen(to);
    });
  }

  advance('hotel', 'restaurant', 'hotel', 'Pick a hotel first, or search to see options.');
  advance('restaurant', 'guide', 'restaurant', 'Pick a restaurant first, or search to see options.');
  advance('guide', 'others', null, '');
  advance('others', 'tripSummary', null, '');

  const summaryRestart = document.getElementById('summaryRestart');
  if (summaryRestart) {
    summaryRestart.addEventListener('click', () => {
      Trip.reset();
      setNavActive('onboard');
      showScreen('book1');
      showToast('✦', 'Trip cleared — pick a new destination.');
    });
  }

  // --- trip summary -------------------------------------------------------

  function renderSummary() {
    const list = document.getElementById('summaryList');
    if (!list) return;
    const t = Trip.get();

    const title = document.getElementById('summaryTitle');
    if (title) {
      title.textContent = t.destination ? 'Trip to ' + t.destination + '.' : 'Your trip.';
    }

    const rows = [
      { step: 'destination', key: 'Destination', value: t.destination, sub: '' },
      { step: 'hotel',       key: 'Hotel',       value: t.hotel && t.hotel.name,
        sub: t.hotel ? (t.hotel.address || '') : '' },
      { step: 'restaurant',  key: 'Restaurant',  value: t.restaurant && t.restaurant.name,
        sub: t.restaurant ? (t.restaurant.address || '') : '' },
      { step: 'guide',       key: 'Guide',       value: t.guide && t.guide.name,
        sub: t.guide ? (t.guide.meta || '') : '' },
      { step: 'others',      key: 'Others',      value: t.others.length
        ? t.others.map(p => p.name).join(', ') : null,
        sub: t.others.length ? t.others.length + ' place' + (t.others.length > 1 ? 's' : '') + ' selected' : '' }
    ];

    list.innerHTML = rows.map(r => '' +
      '<button type="button" class="summary-row" data-step="' + r.step + '">' +
        '<span class="summary-key">' + r.key + '</span>' +
        '<span>' +
          '<span class="summary-val' + (r.value ? '' : ' empty') + '">' +
            (r.value ? escapeText(r.value) : 'Not chosen yet') + '</span>' +
          (r.sub ? '<span class="summary-sub">' + escapeText(r.sub) + '</span>' : '') +
        '</span>' +
        '<span class="summary-edit">Edit</span>' +
      '</button>').join('');
  }

  function escapeText(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  const summaryList = document.getElementById('summaryList');
  if (summaryList) {
    summaryList.addEventListener('click', e => {
      const row = e.target.closest('.summary-row');
      if (!row) return;
      const step = row.dataset.step;
      if (step === 'destination') {
        setNavActive('onboard');
        showScreen('book1');
      } else {
        setNavActive(step);
        showScreen(step);
      }
    });
  }

  // ===========================================
  // DESTINATION PICKER — Local / International / Others
  // "Others" is a destination option here, never a nav tab.
  // ===========================================

  const LOCAL_DESTS = ['Goa', 'Jaipur', 'Munnar', 'Rishikesh', 'Kerala', 'Chennai'];
  const INTL_DESTS  = ['Paris', 'Tokyo', 'Rome', 'Bangkok', 'Dubai', 'New York'];

  function destPickerMarkup(scope) {
    const chips = list => list.map(d =>
      '<button type="button" class="chip" data-dest-pick="' + d + '">' + d + '</button>').join('');

    return '' +
      '<div class="dest-picker">' +
        '<span class="dest-picker-label">Choose destination</span>' +
        '<div class="dest-tabs">' +
          '<button type="button" class="dest-tab active" data-scope="local">Local</button>' +
          '<button type="button" class="dest-tab" data-scope="intl">International</button>' +
          '<button type="button" class="dest-tab" data-scope="others">Others</button>' +
        '</div>' +
        '<div class="dest-options" data-panel="local">' + chips(LOCAL_DESTS) + '</div>' +
        '<div class="dest-options" data-panel="intl" hidden>' + chips(INTL_DESTS) + '</div>' +
        '<form class="dest-other" data-panel="others" hidden>' +
          '<input class="place-input" type="text" data-dest-input ' +
                 'placeholder="Where do you want to travel?" aria-label="Enter your preferred destination">' +
          '<button class="place-btn" type="submit">Set</button>' +
        '</form>' +
        '<p class="dest-current">Searching in <b data-dest-current>nowhere yet</b></p>' +
      '</div>';
  }

  function paintDestCurrent() {
    const dest = Trip.get('destination');
    document.querySelectorAll('[data-dest-current]').forEach(el => {
      el.textContent = dest || 'nowhere yet';
    });
    // The assistant greeting names the destination, so it follows along.
    const g = document.getElementById('asGreeting');
    if (g) g.textContent = dest ? 'What do you want in ' + dest + '?' : 'Where to next?';
  }

  // The destination picker now lives on the location screen (#book1) only.
  // This mounts nothing unless a .dest-mount is present, which it no longer is
  // on Hotel/Restaurant — kept so the helper stays safe if one is re-added.
  function mountDestPickers() {
    document.querySelectorAll('.dest-mount').forEach(mount => {
      if (mount.dataset.mounted) return;
      mount.dataset.mounted = '1';
      const pane = mount.dataset.dest;
      mount.innerHTML = destPickerMarkup(pane);

      const picker = mount.querySelector('.dest-picker');

      picker.addEventListener('click', e => {
        const tab = e.target.closest('.dest-tab');
        if (tab) {
          picker.querySelectorAll('.dest-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          picker.querySelectorAll('[data-panel]').forEach(p => {
            p.hidden = p.dataset.panel !== tab.dataset.scope;
          });
          return;
        }
        const chip = e.target.closest('[data-dest-pick]');
        if (chip) {
          setDestination(chip.dataset.destPick, pane);
        }
      });

      picker.querySelector('.dest-other').addEventListener('submit', e => {
        e.preventDefault();
        const input = picker.querySelector('[data-dest-input]');
        const value = input.value.trim();
        if (!value) return;
        setDestination(value, pane);
      });
    });
    paintDestCurrent();
  }

  // Short place names are ambiguous to geocoders — "Goa" resolves to Genova in
  // Italy, "Kochi" to Kōchi in Japan. Qualifying local picks with the country
  // fixes it without changing what the traveller sees.
  const LOCAL_COUNTRY = 'India';

  function qualifyDestination(name, scope) {
    const n = String(name || '').trim();
    if (!n || n.indexOf(',') >= 0) return n;   // already qualified
    return scope === 'local' ? n + ', ' + LOCAL_COUNTRY : n;
  }

  function setDestination(name, scope, pane) {
    Trip.set('destination', name);
    Trip.set('destinationQuery', qualifyDestination(name, scope));
    Trip.set('coords', null);
    paintDestCurrent();
    showToast('✈', 'Destination set to ' + name + '.');
    if (pane === 'hotel' || pane === 'restaurant') Places.search(pane, {});
  }

  // ===========================================
  // TRIP PLAN — orders the real selections and
  // lets a guide be added from inside the plan.
  // ===========================================

  let planLoading = false;

  function planStatus(html, isError) {
    const box = document.getElementById('planStatus');
    if (!box) return;
    if (!html) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.className = 'plan-status' + (isError ? ' is-error' : '');
    box.innerHTML = html;
  }

  /**
   * Booking links for a stop.
   *
   * Website and phone come from Foursquare and are the venue's own — those are
   * real. The rest are pre-filled *searches* on external sites, labelled as
   * searches, because Travexa holds no inventory and cannot confirm a booking.
   */
  function stopLinks(stop) {
    // A search wants "Shiro, Bangalore" — not the whole street address, which
    // buries the venue name. Fall back to the tail of the address (city/state)
    // when Foursquare gave no locality.
    function placeArea(s) {
      if (s.city) return s.city;
      const parts = String(s.address || '').split(',').map(x => x.trim()).filter(Boolean);
      return parts.length > 1 ? parts.slice(-2).join(', ') : (parts[0] || '');
    }

    const area = placeArea(stop);
    const where = [stop.name, area].filter(Boolean).join(', ');
    const q = encodeURIComponent(where);
    const links = [];

    if (stop.website) {
      links.push({ href: stop.website, label: 'Official site', kind: 'solid' });
    }

    if (stop.kind === 'hotel') {
      links.push({
        href: 'https://www.booking.com/searchresults.html?ss=' + q,
        label: stop.website ? 'Compare rooms' : 'Find rooms', kind: 'solid'
      });
    } else if (stop.kind === 'restaurant') {
      links.push({
        href: 'https://www.google.com/search?q=' + encodeURIComponent(where + ' reservation'),
        label: 'Reserve a table', kind: 'ghost'
      });
    } else {
      links.push({
        href: 'https://www.google.com/search?q=' + encodeURIComponent(where + ' tickets'),
        label: 'Book tickets', kind: 'ghost'
      });
    }

    if (stop.phone) {
      links.push({ href: 'tel:' + String(stop.phone).replace(/\s+/g, ''),
                   label: 'Call', kind: 'ghost' });
    }

    links.push({
      href: 'https://www.google.com/maps/search/?api=1&query=' + q,
      label: 'Directions', kind: 'ghost'
    });

    return links;
  }

  function stopLinksMarkup(stop) {
    const links = stopLinks(stop);
    if (!links.length) return '';
    return '<div class="plan-stop-links">' +
      links.map(l =>
        '<a class="plan-link ' + l.kind + '" href="' + escapeText(l.href) + '" ' +
        'target="_blank" rel="noopener noreferrer">' + escapeText(l.label) + '</a>').join('') +
      '</div>';
  }

  function planStopMarkup(stop, index) {
    const kindLabel = stop.kind === 'hotel' ? 'Stay'
                    : stop.kind === 'restaurant' ? 'Table' : 'Place';
    return '' +
      '<div class="plan-stop">' +
        '<div class="plan-stop-rail"><span class="plan-stop-dot"></span></div>' +
        '<div class="plan-stop-body">' +
          '<div class="plan-stop-head">' +
            '<span class="plan-stop-time">' + escapeText(stop.time || String(index + 1)) + '</span>' +
            '<span class="plan-stop-kind">' + kindLabel + '</span>' +
          '</div>' +
          '<div class="plan-stop-name">' + escapeText(stop.name) + '</div>' +
          (stop.address ? '<div class="plan-stop-addr">' + escapeText(stop.address) + '</div>' : '') +
          (stop.reason ? '<div class="plan-stop-why">' + escapeText(stop.reason) + '</div>' : '') +
          stopLinksMarkup(stop) +
        '</div>' +
      '</div>';
  }

  // ===========================================
  // AI ASSISTANT — one renderer, three services.
  // Calls /api/ai/recommend; the keys stay server-side.
  // ===========================================

  // Same rule as the Places module: a static dev server cannot answer /api,
  // so point those at the Travexa server. Never carries a key — the browser
  // only ever talks to Travexa's own backend.
  const API_ORIGIN = (function () {
    const port = window.location.port;
    const staticDev = window.location.protocol === 'file:' ||
                      port === '5500' || port === '5501';
    return staticDev ? 'http://localhost:3001' : '';
  })();

  const AI_PRESETS = {
    hotel: ['Find hotels near me', 'Best budget hotels', 'Luxury hotels nearby',
            'Hotels near the beach', 'Hotels for families'],
    restaurant: ['Best restaurants near me', 'Find vegetarian restaurants',
                 'Good restaurants for families', 'Find local food', 'Best restaurants for dinner'],
    guide: ['Find a guide near me', 'Find a local history guide', 'Find an English-speaking guide',
            'Find a guide for sightseeing', 'Find a guide who can come to me'],
    assistant: ['Plan a relaxed weekend', 'Best places to see here', 'Where should I eat tonight',
                'Somewhere quiet nearby', 'Good for families', 'Things to do when it rains']
  };

  const AI_PLACEHOLDER = {
    hotel: 'e.g. a quiet hotel near the beach in Goa under ₹5000',
    restaurant: 'e.g. a vegetarian family restaurant in Chennai under ₹1500',
    guide: 'e.g. an English and Tamil speaking guide near me for 3 hours',
    assistant: 'e.g. two calm days in Kodaikanal — viewpoints, a vegetarian dinner, no crowds'
  };

  function aiPanelMarkup(kind) {
    return '' +
      '<div class="ai-panel" data-ai-panel="' + kind + '">' +
        '<div class="ai-head">' +
          '<span class="ai-spark" aria-hidden="true">✦</span>' +
          '<span class="ai-title">Travexa Assistant</span>' +
          '<span class="ai-sub">AI</span>' +
        '</div>' +
        '<div class="ai-body">' +
          '<div class="ai-presets">' +
            AI_PRESETS[kind].map(p =>
              '<button type="button" class="ai-preset">' + p + '</button>').join('') +
          '</div>' +
          '<form class="ai-form">' +
            '<input class="ai-input" type="text" placeholder="' + AI_PLACEHOLDER[kind] + '" ' +
                   'aria-label="Ask the Travexa assistant">' +
            '<button class="place-btn" type="submit">Ask</button>' +
          '</form>' +
          '<div class="ai-thread" aria-live="polite"></div>' +
        '</div>' +
      '</div>';
  }

  function mountAiPanels() {
    document.querySelectorAll('.ai-mount').forEach(mount => {
      if (mount.dataset.mounted) return;
      mount.dataset.mounted = '1';
      const kind = mount.dataset.ai;
      mount.innerHTML = aiPanelMarkup(kind);

      const panel = mount.querySelector('.ai-panel');
      const input = panel.querySelector('.ai-input');

      panel.addEventListener('click', e => {
        const preset = e.target.closest('.ai-preset');
        if (preset) { input.value = preset.textContent; askAi(kind, preset.textContent); return; }
        const retry = e.target.closest('.ai-retry');
        if (retry) askAi(kind, retry.dataset.q);
      });

      panel.querySelector('.ai-form').addEventListener('submit', e => {
        e.preventDefault();
        const q = input.value.trim();
        if (q) askAi(kind, q);
      });
    });
  }

  const AI_STAGES = ['Understanding your request…', 'Checking nearby places…',
                     'Finding the best matches…', 'Almost there…'];

  function aiThread(kind) {
    const p = document.querySelector('[data-ai-panel="' + kind + '"]');
    return p && p.querySelector('.ai-thread');
  }

  function aiSay(kind, html, cls) {
    const thread = aiThread(kind);
    if (!thread) return null;
    const div = document.createElement('div');
    div.className = 'ai-msg ' + (cls || 'bot');
    div.innerHTML = html;
    thread.appendChild(div);
    return div;
  }

  // "near me" needs a real fix — never a fabricated one.
  function currentPosition() {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: +pos.coords.latitude.toFixed(5), lng: +pos.coords.longitude.toFixed(5) }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    });
  }

  function aiPlaceCard(p) {
    const facts = [];
    if (p.category) facts.push(escapeText(p.category));
    if (p.rating) facts.push('★ ' + escapeText(p.rating));
    if (p.priceLevel) facts.push(escapeText('$'.repeat(p.priceLevel)));
    if (p.distance != null) facts.push(escapeText((p.distance / 1000).toFixed(1)) + ' km');
    if (p.openNow === true) facts.push('Open now');

    const img = placeVisual(p);

    return '' +
      '<article class="hotel-card" data-id="' + escapeText(p.id) + '">' + img +
        '<span class="hotel-card-pick">○</span>' +
        '<div class="hotel-card-body">' +
          '<h4 class="hotel-card-name">' + escapeText(p.name) + '</h4>' +
          '<p class="hotel-card-address">' + escapeText(p.address || p.city || '') + '</p>' +
          (facts.length ? '<div class="hotel-card-meta">' + facts.join(' · ') + '</div>' : '') +
          (!p.rating ? '<div class="ai-unknown">Rating not provided</div>' : '') +
          (p.why ? '<div class="ai-why"><b>Why this matches</b>' + escapeText(p.why) + '</div>' : '') +
        '</div>' +
      '</article>';
  }

  let aiBusy = {};

  async function askAi(kind, query) {
    if (aiBusy[kind]) return;
    aiBusy[kind] = true;

    aiSay(kind, escapeText(query), 'user');
    const working = aiSay(kind,
      '<div class="ai-steps"><span class="spinner"></span><span>' + AI_STAGES[0] + '</span></div>');

    let stage = 0;
    const ticker = setInterval(() => {
      stage = Math.min(stage + 1, AI_STAGES.length - 1);
      const label = working && working.querySelector('.ai-steps span:last-child');
      if (label) label.textContent = AI_STAGES[stage];
    }, 1400);

    const finish = () => { clearInterval(ticker); aiBusy[kind] = false; };

    try {
      // Only ask for a fix when the request actually implies one.
      let loc = null;
      if (/near me|nearby|around me|close to me|my location/i.test(query)) {
        loc = await currentPosition();
        if (!loc && !Trip.get('destination')) {
          finish();
          working.className = 'ai-msg bot is-error';
          working.innerHTML = 'Location access is needed to find places near you.' +
            '<button class="ai-retry" type="button" data-q="' + escapeText(query) + '">Enable Location</button>';
          return;
        }
      }

      const res = await fetch(API_ORIGIN + '/api/ai/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // The Assistant is an open-ended place search, not a guide lookup.
          type: kind === 'assistant' ? 'place' : kind,
          destination: Trip.get('destination') || '',
          userQuery: query,
          location: loc
        })
      });

      const data = await res.json().catch(() => ({}));
      finish();

      if (!res.ok) {
        working.className = 'ai-msg bot is-error';
        working.innerHTML = escapeText(data.message || 'Something went wrong while finding recommendations.') +
          '<button class="ai-retry" type="button" data-q="' + escapeText(query) + '">Try again</button>';
        return;
      }

      renderAiAnswer(kind, query, data, working);

    } catch (err) {
      finish();
      console.warn('AI request failed:', err);
      working.className = 'ai-msg bot is-error';
      working.innerHTML = 'Recommendations are temporarily unavailable.' +
        '<button class="ai-retry" type="button" data-q="' + escapeText(query) + '">Try again</button>';
    }
  }

  function renderAiAnswer(kind, query, data, node) {
    const prefs = data.preferences || {};
    const chips = [];
    if (data.area) chips.push('Area: ' + data.area);
    if (prefs.searchTerm) chips.push(prefs.searchTerm);
    if (prefs.budget && prefs.budget !== 'unknown') chips.push('Budget: ' + prefs.budget);
    if (prefs.cuisine) chips.push(prefs.cuisine);
    (prefs.attributes || []).slice(0, 4).forEach(a => chips.push(a));
    (prefs.languages || []).forEach(l => chips.push(l));

    let html = '<b>' + escapeText(data.summary || 'Here are the closest matches.') + '</b>';
    if (data.tradeoff) html += '<br>' + escapeText(data.tradeoff);
    if (chips.length) {
      html += '<div class="ai-chips">' +
        chips.map(c => '<span class="ai-chip">' + escapeText(c) + '</span>').join('') + '</div>';
    }
    if (data.webAnswer && data.webAnswer.text) {
      html += '<div class="ai-why"><b>From the web' +
        (data.webAnswer.grounded ? ' · grounded' : '') + '</b>' +
        escapeText(data.webAnswer.text) + '</div>';
    }
    // If the request named somewhere else, follow the traveller there.
    if (data.area && !/^-?\d/.test(data.area) && data.area !== Trip.get('destination')) {
      Trip.set('destination', data.area);
      Trip.set('destinationQuery', data.area);
      Trip.set('coords', null);
      paintDestCurrent();
    }

    if (!data.ranked && (data.places || []).length) {
      html += '<div class="ai-unknown" style="margin-top:8px">Shown in Foursquare order — ranking unavailable.</div>';
    }
    node.className = 'ai-msg bot';
    node.innerHTML = html;

    // The Assistant renders its own cards with "Add to trip" controls.
    if (kind === 'assistant') {
      renderAssistantResults(data);
      return;
    }

    // Guides come from Travexa's own marketplace, never from Foursquare.
    if (kind === 'guide') {
      aiSay(kind, 'Guide matching uses Travexa guide profiles below — these are demo ' +
                  'profiles, not real people currently available.');
      return;
    }

    const places = data.places || [];
    if (!places.length) {
      aiSay(kind, 'No places found. Try another search.');
      return;
    }

    // Real results land in the existing results grid, in the existing card style.
    const grid = document.getElementById(kind + 'Results');
    if (grid) {
      grid.innerHTML = places.map(aiPlaceCard).join('');
      const demo = document.getElementById(kind + 'Demo');
      if (demo) demo.hidden = true;
      const st = document.getElementById(kind + 'Status');
      if (st) { st.hidden = true; st.innerHTML = ''; }
      const hintEl = document.getElementById(kind + 'Hint');
      if (hintEl) hintEl.textContent = places.length + ' results · ' + (data.area || '');
      if (window.TravexaAreaMap) window.TravexaAreaMap(kind, places);
      grid.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  mountDestPickers();
  mountAiPanels();

  function renderPlanGuide() {
    const box = document.getElementById('planGuide');
    if (!box) return;
    const g = Trip.get('guide');

    if (!g) {
      box.innerHTML = '' +
        '<div class="plan-guide-card empty">' +
          '<div class="plan-guide-icon">◈</div>' +
          '<div class="plan-guide-body">' +
            '<div class="plan-guide-title">No guide on this trip yet</div>' +
            '<div class="plan-guide-sub">Add a local guide to walk this plan with you.</div>' +
          '</div>' +
          '<button class="gx-btn solid" type="button" id="planAddGuide">Add a guide →</button>' +
        '</div>';
    } else {
      box.innerHTML = '' +
        '<div class="plan-guide-card">' +
          '<div class="gx-avatar">' + escapeText((g.name || '?').slice(0, 2).toUpperCase()) + '</div>' +
          '<div class="plan-guide-body">' +
            '<div class="plan-guide-title">' + escapeText(g.name) + '</div>' +
            '<div class="plan-guide-sub">' + escapeText(g.meta || g.address || 'Local guide') + '</div>' +
          '</div>' +
          '<button class="gx-btn ghost" type="button" id="planAddGuide">Change</button>' +
        '</div>';
    }

    const btn = document.getElementById('planAddGuide');
    if (btn) btn.addEventListener('click', () => {
      setNavActive('guide');
      showScreen('guide');
    });
  }

  /**
   * Scores the destination the traveller is visiting. Coordinates come from
   * the places they actually chose, so this is the real place, not their
   * current position.
   */
  async function scoreDestination() {
    const box = document.getElementById('destSafety');
    if (!box) return;

    const t = Trip.get();
    const stops = [t.hotel, t.restaurant].concat(t.others || []).filter(Boolean);
    const anchor = stops.find(s => s && s.lat != null && s.lng != null);
    const name = t.destination || (anchor && anchor.city) || '';

    if (!anchor) {
      box.hidden = true;                  // nothing with coordinates yet
      return;
    }

    box.hidden = false;
    document.getElementById('destSafetyLabel').textContent = 'Conditions in ' + (name || 'your destination');
    document.getElementById('destSafetyValue').textContent = 'Checking…';

    const r = await Safety.scorePlace(anchor.lat, anchor.lng, name || anchor.city || 'Destination');
    if (!r) { document.getElementById('destSafetyValue').textContent = 'Unavailable right now'; return; }

    document.getElementById('destSafetyIcon').textContent = describeWeather(r.weather.code)[1];
    document.getElementById('destSafetyValue').textContent = r.score + '/100 · ' + r.band + ' risk';
    box.dataset.band = r.band.toLowerCase();
  }

  const destSafetyBtn = document.getElementById('destSafety');
  if (destSafetyBtn) destSafetyBtn.addEventListener('click', openSafetyModal);

  async function buildPlan(force) {
    const route = document.getElementById('planRoute');
    if (!route || planLoading) return;

    const t = Trip.get();
    const items = [];
    if (t.hotel) items.push(t.hotel);
    if (t.restaurant) items.push(t.restaurant);
    (t.others || []).forEach(o => items.push(o));

    renderPlanGuide();

    if (!items.length) {
      route.innerHTML = '';
      planStatus('Pick a hotel, a restaurant or some places and your plan appears here.');
      return;
    }

    // Reuse the last plan unless the selections changed or a rebuild was asked.
    const signature = items.map(i => i.id).join('|');
    if (!force && route.dataset.signature === signature) return;

    planLoading = true;
    planStatus('<span class="spinner"></span><span>Building your plan…</span>');

    try {
      const res = await fetch(API_ORIGIN + '/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: t.destination || '',
          hotel: t.hotel, restaurant: t.restaurant, others: t.others || []
        })
      });
      const data = await res.json().catch(() => ({}));
      planLoading = false;

      if (!res.ok) {
        planStatus(escapeText(data.message || 'Could not build the plan.') +
          ' <button class="ai-retry" type="button" id="planRetry">Try again</button>', true);
        const r = document.getElementById('planRetry');
        if (r) r.addEventListener('click', () => buildPlan(true));
        return;
      }

      route.dataset.signature = signature;
      route.innerHTML = (data.ordered || []).map(planStopMarkup).join('');

      const title = document.getElementById('summaryTitle');
      if (title && data.title) title.textContent = data.title;

      planStatus(data.note
        ? '<span>' + escapeText(data.note) + '</span>'
        : (data.ranked ? '' : '<span>Shown in the order you picked.</span>'));

    } catch (err) {
      planLoading = false;
      console.warn('Plan build failed:', err);
      planStatus('Could not build the plan right now. ' +
        '<button class="ai-retry" type="button" id="planRetry">Try again</button>', true);
      const r = document.getElementById('planRetry');
      if (r) r.addEventListener('click', () => buildPlan(true));
    }
  }

  const planRebuild = document.getElementById('planRebuild');
  if (planRebuild) planRebuild.addEventListener('click', () => buildPlan(true));

  // ===========================================
  // "OTHERS" DESTINATION — inside Local and International
  // Free text with prefix suggestions, so a destination that
  // is not on the grid can still be chosen.
  // ===========================================

  const SUGGEST = {
    local: ['Agra', 'Alleppey', 'Amritsar', 'Andaman Islands', 'Bengaluru', 'Chennai',
            'Coorg', 'Darjeeling', 'Delhi', 'Gangtok', 'Goa', 'Hampi', 'Hyderabad',
            'Jaipur', 'Jaisalmer', 'Jodhpur', 'Kochi', 'Kodaikanal', 'Kolkata',
            'Leh', 'Lucknow', 'Madurai', 'Manali', 'Mumbai', 'Munnar', 'Mysuru',
            'Ooty', 'Pondicherry', 'Pune', 'Rishikesh', 'Shillong', 'Shimla',
            'Srinagar', 'Udaipur', 'Varanasi', 'Wayanad'],
    intl:  ['Amsterdam', 'Athens', 'Bali', 'Bangkok', 'Barcelona', 'Berlin', 'Cairo',
            'Cape Town', 'Colombo', 'Dubai', 'Dublin', 'Edinburgh', 'Hanoi',
            'Helsinki', 'Hong Kong', 'Istanbul', 'Kathmandu', 'Kuala Lumpur',
            'Kyoto', 'Lisbon', 'London', 'Madrid', 'Maldives', 'Melbourne',
            'Mexico City', 'Milan', 'Munich', 'New York', 'Osaka', 'Oslo', 'Paris',
            'Prague', 'Reykjavik', 'Rome', 'Seoul', 'Singapore', 'Sydney', 'Tokyo',
            'Toronto', 'Venice', 'Vienna', 'Zurich']
  };

  function otherPanelMarkup(scope) {
    const label = scope === 'local'
      ? 'Somewhere else in your country?'
      : 'Somewhere else in the world?';
    return '' +
      '<div class="other-dest">' +
        '<span class="field-label">' + label + '</span>' +
        '<form class="other-dest-row" autocomplete="off">' +
          '<div class="suggest-wrap">' +
            '<input class="place-input" type="text" data-other-input ' +
                   'placeholder="Type a destination…" autocomplete="off" ' +
                   'aria-label="Enter your preferred destination">' +
            '<ul class="suggest-list" data-suggest hidden></ul>' +
          '</div>' +
          '<button class="place-btn" type="submit">Continue</button>' +
        '</form>' +
        '<p class="other-dest-note">Any city or region — we search it for real places.</p>' +
      '</div>';
  }

  function mountOtherPanels() {
    document.querySelectorAll('.other-mount').forEach(mount => {
      if (mount.dataset.mounted) return;
      mount.dataset.mounted = '1';
      const scope = mount.dataset.other;
      mount.innerHTML = otherPanelMarkup(scope);

      const form  = mount.querySelector('form');
      const input = mount.querySelector('[data-other-input]');
      const list  = mount.querySelector('[data-suggest]');
      const pool  = SUGGEST[scope] || [];
      let active  = -1;

      function closeList() { list.hidden = true; list.innerHTML = ''; active = -1; }

      function openList(matches) {
        if (!matches.length) return closeList();
        list.innerHTML = matches.map((m, i) =>
          '<li class="suggest-item' + (i === active ? ' active' : '') +
          '" data-value="' + escapeText(m) + '">' + escapeText(m) + '</li>').join('');
        list.hidden = false;
      }

      function matchesFor(text) {
        const q = text.trim().toLowerCase();
        if (q.length < 1) return [];
        // Prefix matches first, then anything containing the text.
        const starts = pool.filter(p => p.toLowerCase().startsWith(q));
        const holds  = pool.filter(p => !p.toLowerCase().startsWith(q) &&
                                        p.toLowerCase().includes(q));
        return starts.concat(holds).slice(0, 6);
      }

      function choose(value) {
        input.value = value;
        closeList();
        selectDestination(value, scope);
      }

      input.addEventListener('input', () => { active = -1; openList(matchesFor(input.value)); });
      input.addEventListener('focus', () => { if (input.value) openList(matchesFor(input.value)); });
      input.addEventListener('blur', () => setTimeout(closeList, 140));

      input.addEventListener('keydown', e => {
        const items = list.querySelectorAll('.suggest-item');
        if (list.hidden || !items.length) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          active += (e.key === 'ArrowDown' ? 1 : -1);
          if (active < 0) active = items.length - 1;
          if (active >= items.length) active = 0;
          items.forEach((el, i) => el.classList.toggle('active', i === active));
        } else if (e.key === 'Enter' && active >= 0) {
          e.preventDefault();
          choose(items[active].dataset.value);
        } else if (e.key === 'Escape') {
          closeList();
        }
      });

      list.addEventListener('mousedown', e => {
        const item = e.target.closest('.suggest-item');
        if (item) { e.preventDefault(); choose(item.dataset.value); }
      });

      form.addEventListener('submit', e => {
        e.preventDefault();
        const value = (input.value || '').trim();
        if (!value) { input.focus(); return; }
        closeList();
        selectDestination(value, scope);
      });
    });
  }

  mountOtherPanels();

  // ===========================================
  // GUIDE ACCOUNT — signup, login, dashboard.
  // The token is the only thing kept client-side;
  // every rule lives on the server.
  // ===========================================

  const GuideAuth = (function () {
    const KEY = 'travexa.guideToken';
    let token = null;
    try { token = window.localStorage.getItem(KEY); } catch (e) {}

    function set(t) {
      token = t;
      try { t ? window.localStorage.setItem(KEY, t) : window.localStorage.removeItem(KEY); } catch (e) {}
    }
    function get() { return token; }
    function headers(extra) {
      const h = Object.assign({}, extra || {});
      if (token) h['Authorization'] = 'Bearer ' + token;
      return h;
    }
    return { set, get, headers, signedIn: () => !!token };
  })();

  function authMsg(id, text, kind) {
    const box = document.getElementById(id);
    if (!box) return;
    if (!text) { box.hidden = true; box.textContent = ''; return; }
    box.hidden = false;
    box.className = 'auth-msg' + (kind ? ' is-' + kind : '');
    box.textContent = text;
  }

  function rupees(paise) {
    return '₹' + (Number(paise || 0) / 100).toLocaleString('en-IN');
  }

  // --- entry points -------------------------------------------------------

  function openGuideAuth(tab) {
    setNavActive('guide');
    showScreen(GuideAuth.signedIn() ? 'guideDashboard' : 'guideAuth');
    if (!GuideAuth.signedIn()) selectAuthTab(tab || 'login');
  }

  function selectAuthTab(which) {
    document.querySelectorAll('#guideAuthTabs button').forEach(b =>
      b.classList.toggle('active', b.dataset.auth === which));
    const login = document.getElementById('guideLoginCard');
    const signup = document.getElementById('guideSignupCard');
    if (login) login.hidden = which !== 'login';
    if (signup) signup.hidden = which !== 'signup';
  }

  const becomeBtn = document.getElementById('becomeGuideBtn');
  if (becomeBtn) becomeBtn.addEventListener('click', () => openGuideAuth('signup'));
  const signInBtn = document.getElementById('guideSignInBtn');
  if (signInBtn) signInBtn.addEventListener('click', () => openGuideAuth('login'));

  const authTabs = document.getElementById('guideAuthTabs');
  if (authTabs) authTabs.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) selectAuthTab(b.dataset.auth);
  });

  const authBack = document.getElementById('guideAuthBack');
  if (authBack) authBack.addEventListener('click', () => {
    setNavActive('guide');
    showScreen('guide');
  });

  // --- login --------------------------------------------------------------

  const glSubmit = document.getElementById('glSubmit');
  if (glSubmit) glSubmit.addEventListener('click', async () => {
    const email = (document.getElementById('glEmail').value || '').trim();
    const password = document.getElementById('glPassword').value || '';
    if (!email || !password) return authMsg('glMsg', 'Enter your email and password.', 'error');

    authMsg('glMsg', 'Signing in…');
    try {
      const res = await fetch(API_ORIGIN + '/api/guides/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return authMsg('glMsg', data.message || 'Could not sign in.', 'error');

      GuideAuth.set(data.token);
      authMsg('glMsg', '');
      document.getElementById('glPassword').value = '';
      showScreen('guideDashboard');
      showToast('◈', 'Signed in as ' + data.guide.fullName + '.');
    } catch (err) {
      authMsg('glMsg', 'Could not reach the server.', 'error');
    }
  });

  // --- signup -------------------------------------------------------------

  const gsSubmit = document.getElementById('gsSubmit');
  if (gsSubmit) gsSubmit.addEventListener('click', async () => {
    const val = id => (document.getElementById(id).value || '').trim();
    const body = {
      fullName: val('gsName'), email: val('gsEmail'), phone: val('gsPhone'),
      password: document.getElementById('gsPassword').value || '',
      city: val('gsCity'),
      yearsExperience: parseInt(val('gsYears'), 10) || 0,
      languages: val('gsLanguages'), specialties: val('gsSpecialties'),
      areas: val('gsAreas'), bio: val('gsBio'),
      // Rupees in the form, integer paise on the wire.
      hourlyRatePaise: Math.round((parseFloat(val('gsRate')) || 0) * 100)
    };

    if (!body.fullName || !body.email || body.password.length < 8) {
      return authMsg('gsMsg', 'Name, email and an 8+ character password are required.', 'error');
    }

    authMsg('gsMsg', 'Creating your account…');
    try {
      const res = await fetch(API_ORIGIN + '/api/guides/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return authMsg('gsMsg', data.message || 'Could not create the account.', 'error');

      GuideAuth.set(data.token);
      document.getElementById('gsPassword').value = '';
      authMsg('gsMsg', '');
      showScreen('guideDashboard');
      showToast('◈', data.notice || 'Guide account created — pending verification.');
    } catch (err) {
      authMsg('gsMsg', 'Could not reach the server.', 'error');
    }
  });

  // --- dashboard ----------------------------------------------------------

  const STATUS_TONE = {
    REQUESTED: 'live', ACCEPTED: 'live', PAYMENT_AUTHORIZED: 'live',
    IN_PROGRESS: 'live', COMPLETED: 'done', PAYOUT_RELEASED: 'done',
    CANCELLED: 'closed', DECLINED: 'closed', REFUNDED: 'closed', DISPUTED: 'closed'
  };

  async function loadGuideDashboard() {
    if (!GuideAuth.signedIn()) { showScreen('guideAuth'); return; }

    try {
      const res = await fetch(API_ORIGIN + '/api/guides/me', { headers: GuideAuth.headers() });
      if (res.status === 401) { GuideAuth.set(null); showScreen('guideAuth'); return; }
      const data = await res.json();
      const g = data.guide;

      document.getElementById('gdName').textContent = g.fullName + '.';
      const v = document.getElementById('gdVerification');
      v.textContent = g.verification === 'verified' ? 'Verified'
                    : g.verification === 'rejected' ? 'Rejected' : 'Pending';
      v.className = 'gd-stat-value ' + (g.verification === 'verified' ? 'verified' : 'pending');

      document.getElementById('gdRating').textContent =
        g.avgStars != null ? '★ ' + g.avgStars + ' (' + g.reviewCount + ')' : 'No ratings yet';
      document.getElementById('gdTrips').textContent = g.completedTrips || 0;

      document.querySelectorAll('#gdAvailability button').forEach(b =>
        b.classList.toggle('active', b.dataset.av === g.availability));

      const list = document.getElementById('gdDocList');
      list.innerHTML = (data.documents || []).length
        ? data.documents.map(d =>
            '<div class="gd-doc"><b>' + escapeText(d.kind.replace(/_/g, ' ')) + '</b>' +
            '<span class="status-pill">' + escapeText(d.status) + '</span></div>').join('')
        : '<div class="gd-empty">No documents uploaded yet.</div>';

      await loadGuideBookings();
    } catch (err) {
      console.warn('Dashboard load failed:', err);
      showToast('◎', 'Could not load your dashboard.');
    }
  }

  async function loadGuideBookings() {
    const box = document.getElementById('gdBookings');
    if (!box) return;
    try {
      const res = await fetch(API_ORIGIN + '/api/bookings', { headers: GuideAuth.headers() });
      if (!res.ok) { box.innerHTML = '<div class="gd-empty">Could not load bookings.</div>'; return; }
      const data = await res.json();

      document.getElementById('gdEarned').textContent = rupees(data.earnings.releasedPaise);
      document.getElementById('gdPending').textContent = rupees(data.earnings.pendingPaise);

      if (!data.bookings.length) {
        box.innerHTML = '<div class="gd-empty">No booking requests yet. ' +
          'Travellers see you once your verification is approved.</div>';
        return;
      }

      box.innerHTML = data.bookings.map(b => {
        // Only offer transitions the server would actually accept.
        const actions = (b.nextForGuide || []).map(s =>
          '<button class="gx-btn ' + (s === 'DECLINED' || s === 'CANCELLED' ? 'ghost' : 'solid') +
          '" type="button" data-booking="' + b.id + '" data-to="' + s + '">' +
          s.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase()) + '</button>').join('');

        return '<div class="gd-booking">' +
          '<div class="gd-booking-head">' +
            '<span class="gd-booking-amount">' + rupees(b.amountPaise) + '</span>' +
            '<span class="status-pill ' + (STATUS_TONE[b.status] || '') + '">' +
              escapeText(b.statusLabel) + '</span>' +
          '</div>' +
          '<div class="gd-booking-meta">' + b.hours + ' hour' + (b.hours > 1 ? 's' : '') +
            (b.paymentStatus ? ' · payment ' + escapeText(b.paymentStatus) : '') +
            (b.meetingNote ? ' · ' + escapeText(b.meetingNote) : '') + '</div>' +
          (actions ? '<div class="gd-booking-actions">' + actions + '</div>' : '') +
        '</div>';
      }).join('');
    } catch (err) {
      box.innerHTML = '<div class="gd-empty">Could not load bookings.</div>';
    }
  }

  // Booking actions — the server re-checks every transition.
  const gdBookingsBox = document.getElementById('gdBookings');
  if (gdBookingsBox) gdBookingsBox.addEventListener('click', async e => {
    const btn = e.target.closest('[data-booking]');
    if (!btn) return;
    btn.disabled = true;
    try {
      const res = await fetch(API_ORIGIN + '/api/bookings/' + btn.dataset.booking + '/guide-action', {
        method: 'POST',
        headers: GuideAuth.headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ to: btn.dataset.to })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) showToast('◎', data.message || 'That change was not allowed.');
      else showToast('◈', 'Booking updated.');
      await loadGuideBookings();
    } catch (err) {
      showToast('◎', 'Could not reach the server.');
    }
    btn.disabled = false;
  });

  // Availability
  const gdAv = document.getElementById('gdAvailability');
  if (gdAv) gdAv.addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    try {
      const res = await fetch(API_ORIGIN + '/api/guides/me', {
        method: 'PATCH',
        headers: GuideAuth.headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ availability: btn.dataset.av })
      });
      if (res.ok) {
        gdAv.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
        showToast('◈', 'Availability set to ' + btn.dataset.av + '.');
      }
    } catch (err) { showToast('◎', 'Could not update availability.'); }
  });

  // Document upload
  const gdUpload = document.getElementById('gdUpload');
  if (gdUpload) gdUpload.addEventListener('click', async () => {
    const fd = new FormData();
    const pairs = [['docGovId', 'government_id'], ['docPhoto', 'photo'],
                   ['docCert', 'certification'], ['docExp', 'experience_proof']];
    let any = false;
    pairs.forEach(([id, field]) => {
      const el = document.getElementById(id);
      if (el && el.files && el.files[0]) { fd.append(field, el.files[0]); any = true; }
    });
    if (!any) return authMsg('gdDocMsg', 'Choose at least one document.', 'error');

    authMsg('gdDocMsg', 'Uploading…');
    try {
      const res = await fetch(API_ORIGIN + '/api/guides/me/documents', {
        method: 'POST', headers: GuideAuth.headers(), body: fd
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return authMsg('gdDocMsg', data.message || 'Upload failed.', 'error');
      authMsg('gdDocMsg', data.message, 'ok');
      pairs.forEach(([id]) => { const el = document.getElementById(id); if (el) el.value = ''; });
      loadGuideDashboard();
    } catch (err) {
      authMsg('gdDocMsg', 'Could not reach the server.', 'error');
    }
  });

  const gdSignOut = document.getElementById('gdSignOut');
  if (gdSignOut) gdSignOut.addEventListener('click', () => {
    GuideAuth.set(null);
    showScreen('guide');
    showToast('◈', 'Signed out.');
  });

  // ===========================================
  // TOURIST BOOKING — request, pay, track, rate.
  // Demo profiles cannot be booked; only verified
  // Travexa guides from the database can.
  // ===========================================

  // A browser-scoped id so a traveller can return to their own booking
  // without an account. It identifies a booking, it does not authorise money.
  const touristRef = (function () {
    const KEY = 'travexa.touristRef';
    try {
      let v = window.localStorage.getItem(KEY);
      if (!v) {
        v = 't-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        window.localStorage.setItem(KEY, v);
      }
      return v;
    } catch (e) {
      return 't-' + Math.random().toString(36).slice(2, 12);
    }
  })();

  const BOOKING_STEPS = [
    { key: 'REQUESTED',          label: 'Requested' },
    { key: 'ACCEPTED',           label: 'Accepted' },
    { key: 'PAYMENT_AUTHORIZED', label: 'Paid' },
    { key: 'IN_PROGRESS',        label: 'In progress' },
    { key: 'COMPLETED',          label: 'Completed' }
  ];

  const CLOSED_STATES = ['CANCELLED', 'DECLINED', 'REFUNDED'];

  function currentBookingId() { return Trip.get('bookingId') || null; }

  async function realGuides(lat, lng) {
    const qs = (lat != null && lng != null) ? '?lat=' + lat + '&lng=' + lng : '';
    try {
      const res = await fetch(API_ORIGIN + '/api/guides/nearby' + qs);
      if (!res.ok) return [];
      const data = await res.json();
      return data.guides || [];
    } catch (err) {
      return [];
    }
  }

  function realGuideMarkup(g) {
    const facts = [];
    if (g.distanceKm != null) facts.push(g.distanceKm + ' km away');
    if (g.avgStars != null) facts.push('★ ' + g.avgStars + ' · ' + g.reviewCount + ' reviews');
    else facts.push('No ratings yet');
    if (g.completedTrips) facts.push(g.completedTrips + ' trips');

    return '' +
      '<article class="gx-card" data-guide-id="' + escapeText(g.id) + '">' +
        '<div class="gx-card-top">' +
          '<div class="gx-avatar">' + escapeText((g.fullName || '?').slice(0, 2).toUpperCase()) + '</div>' +
          '<div>' +
            '<div class="gx-card-name">' + escapeText(g.fullName) +
              '<span class="gx-badge">Verified guide</span></div>' +
            '<div class="gx-card-rating">' + escapeText(facts.join(' · ')) + '</div>' +
          '</div>' +
          '<div class="gx-card-eta"><b>' + rupees(g.hourlyRatePaise) + '</b><span>per hour</span></div>' +
        '</div>' +
        '<dl class="gx-facts">' +
          (g.languages.length ? '<div class="gx-fact"><dt>Languages</dt><dd>' +
            escapeText(g.languages.join(' · ')) + '</dd></div>' : '') +
          (g.specialties.length ? '<div class="gx-fact"><dt>Specialties</dt><dd>' +
            escapeText(g.specialties.join(' · ')) + '</dd></div>' : '') +
        '</dl>' +
        '<div class="gx-card-actions">' +
          '<input class="place-input hours-input" type="number" min="0.5" max="12" step="0.5" ' +
                 'value="2" aria-label="Hours" data-hours>' +
          '<button class="gx-btn solid" type="button" data-book="' + escapeText(g.id) + '">Request guide</button>' +
        '</div>' +
      '</article>';
  }

  async function renderRealGuides(lat, lng) {
    const box = document.getElementById('gxReal');
    if (!box) return;
    const guides = await realGuides(lat, lng);

    if (!guides.length) {
      box.innerHTML = '<div class="gx-none">No verified Travexa guides are available here yet. ' +
        'The profiles below are demo data — they are not real people you can book.</div>';
      return;
    }

    box.innerHTML =
      '<div class="gx-real-head">' + guides.length + ' verified guide' +
      (guides.length > 1 ? 's' : '') + ' available now</div>' +
      guides.map(realGuideMarkup).join('') +
      '<div class="gx-real-split">Demo profiles below — not bookable</div>';
  }

  // Booking a real guide
  const gxRealBox = document.getElementById('gxReal');
  if (gxRealBox) gxRealBox.addEventListener('click', async e => {
    const btn = e.target.closest('[data-book]');
    if (!btn) return;
    const card = btn.closest('.gx-card');
    const hoursEl = card && card.querySelector('[data-hours]');
    const hours = Math.max(0.5, Math.min(12, parseFloat(hoursEl && hoursEl.value) || 1));

    btn.disabled = true;
    btn.textContent = 'Requesting…';
    try {
      const res = await fetch(API_ORIGIN + '/api/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guideId: btn.dataset.book, touristRef: touristRef, hours: hours,
          meetingNote: Trip.get('destination') ? 'Meeting in ' + Trip.get('destination') : null
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast('◎', data.message || 'Could not request that guide.');
      } else {
        Trip.set('bookingId', data.booking.id);
        showToast('◈', 'Request sent — waiting for the guide to accept.');
        renderBookingLive();
      }
    } catch (err) {
      showToast('◎', 'Could not reach the server.');
    }
    btn.disabled = false;
    btn.textContent = 'Request guide';
  });

  let bookingPoll = null;

  async function fetchBooking(id) {
    const res = await fetch(API_ORIGIN + '/api/bookings/' + id);
    if (!res.ok) return null;
    return (await res.json()).booking;
  }

  function bookingRailMarkup(status) {
    const reached = BOOKING_STEPS.findIndex(s => s.key === status);
    const closed = CLOSED_STATES.indexOf(status) >= 0;
    const paid = status === 'PAYOUT_RELEASED';

    return '<div class="bk-rail">' + BOOKING_STEPS.map((s, i) => {
      const done = paid || (reached >= 0 && i < reached);
      const now  = !closed && i === reached;
      return '<div class="bk-step' + (done ? ' done' : '') + (now ? ' now' : '') + '">' +
               '<span class="bk-dot">' + (done ? '✓' : now ? '•' : '') + '</span>' +
               '<span class="bk-label">' + s.label + '</span>' +
             '</div>';
    }).join('') + '</div>';
  }

  async function renderBookingLive() {
    const box = document.getElementById('bookingLive');
    if (!box) return;
    const id = currentBookingId();

    if (!id) { box.hidden = true; box.innerHTML = ''; stopBookingPoll(); return; }

    const b = await fetchBooking(id);
    if (!b) { box.hidden = true; Trip.set('bookingId', null); stopBookingPoll(); return; }

    box.hidden = false;
    const closed = CLOSED_STATES.indexOf(b.status) >= 0;

    let action = '';
    if (b.status === 'ACCEPTED') {
      action = '<button class="gx-btn solid" type="button" id="bkPay">Pay ' +
               rupees(b.amountPaise) + ' to confirm</button>';
    } else if (b.status === 'IN_PROGRESS') {
      action = '<button class="gx-btn solid" type="button" id="bkComplete">Mark experience complete</button>';
    } else if (b.status === 'COMPLETED' || b.status === 'PAYOUT_RELEASED') {
      action = '<button class="gx-btn solid" type="button" id="bkRate">Rate your guide</button>';
    }
    if (!closed && ['REQUESTED', 'ACCEPTED'].indexOf(b.status) >= 0) {
      action += '<button class="gx-btn ghost" type="button" id="bkCancel">Cancel</button>';
    }
    if (closed) {
      action = '<button class="gx-btn ghost" type="button" id="bkDismiss">Dismiss</button>';
    }

    box.innerHTML =
      '<div class="bk-head">' +
        '<span class="bk-title">Your guide booking</span>' +
        '<span class="status-pill ' + (closed ? 'closed' : 'live') + '">' +
          escapeText(b.statusLabel) + '</span>' +
      '</div>' +
      bookingRailMarkup(b.status) +
      '<div class="bk-meta">' + b.hours + ' hour' + (b.hours > 1 ? 's' : '') +
        ' · ' + rupees(b.amountPaise) + '</div>' +
      (action ? '<div class="bk-actions">' + action + '</div>' : '') +
      (b.status === 'REQUESTED'
        ? '<div class="bk-note">Waiting for the guide to accept. Payment opens after that.</div>' : '') +
      (b.status === 'PAYMENT_AUTHORIZED'
        ? '<div class="bk-note">Paid. Your guide starts the experience when you meet.</div>' : '');

    wireBookingActions(b);
    if (!closed && b.status !== 'COMPLETED' && b.status !== 'PAYOUT_RELEASED') startBookingPoll();
    else stopBookingPoll();
  }

  // The guide acts on their own device, so poll while something is pending.
  function startBookingPoll() {
    if (bookingPoll) return;
    bookingPoll = setInterval(() => {
      const guideScreen = document.getElementById('guide');
      if (guideScreen && guideScreen.classList.contains('active')) renderBookingLive();
    }, 8000);
  }

  function stopBookingPoll() {
    if (bookingPoll) { clearInterval(bookingPoll); bookingPoll = null; }
  }

  // Razorpay's hosted Checkout. Card details are entered in their iframe and
  // never touch Travexa — we only ever see the ids it hands back, and the
  // server re-verifies those against its own signature before believing them.
  function loadCheckout() {
    return new Promise((resolve, reject) => {
      if (window.Razorpay) return resolve(true);
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = () => resolve(true);
      s.onerror = () => reject(new Error('checkout script blocked'));
      document.head.appendChild(s);
    });
  }

  async function payForBooking(booking) {
    try {
      const orderRes = await fetch(API_ORIGIN + '/api/payments/order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, touristRef: touristRef })
      });
      const order = await orderRes.json().catch(() => ({}));
      if (!orderRes.ok) {
        showToast('◎', order.message || 'Payment could not be started.');
        return;
      }

      await loadCheckout();

      const rzp = new window.Razorpay({
        key: order.keyId,                 // publishable id, safe in the browser
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency,
        name: 'Travexa',
        description: 'Local guide booking',
        handler: async function (response) {
          // Nothing is trusted here — the server checks the signature.
          const vr = await fetch(API_ORIGIN + '/api/payments/verify', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response)
          });
          const vd = await vr.json().catch(() => ({}));
          if (!vr.ok) {
            showToast('◎', vd.message || 'Payment could not be verified.');
          } else {
            showToast('◈', vd.note || 'Payment confirmed.');
          }
          renderBookingLive();
        },
        modal: { ondismiss: () => showToast('◎', 'Payment cancelled.') },
        theme: { color: '#1b4877' }
      });

      rzp.on('payment.failed', function (resp) {
        showToast('◎', (resp.error && resp.error.description) || 'Payment failed.');
      });

      rzp.open();

    } catch (err) {
      console.warn('Checkout failed:', err);
      showToast('◎', 'Could not open the payment window.');
    }
  }

  async function touristAction(bookingId, to) {
    const res = await fetch(API_ORIGIN + '/api/bookings/' + bookingId + '/tourist-action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: to, touristRef: touristRef })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) showToast('◎', data.message || 'That change was not allowed.');
    return res.ok;
  }

  function wireBookingActions(b) {
    const pay = document.getElementById('bkPay');
    if (pay) pay.addEventListener('click', () => payForBooking(b));

    const complete = document.getElementById('bkComplete');
    if (complete) complete.addEventListener('click', async () => {
      complete.disabled = true;
      if (await touristAction(b.id, 'COMPLETED')) {
        showToast('◈', 'Experience marked complete.');
        await renderBookingLive();
        openRatingModal(b.id);
      }
      complete.disabled = false;
    });

    const cancel = document.getElementById('bkCancel');
    if (cancel) cancel.addEventListener('click', async () => {
      cancel.disabled = true;
      if (await touristAction(b.id, 'CANCELLED')) {
        showToast('◈', 'Booking cancelled.');
        renderBookingLive();
      }
      cancel.disabled = false;
    });

    const rate = document.getElementById('bkRate');
    if (rate) rate.addEventListener('click', () => openRatingModal(b.id));

    const dismiss = document.getElementById('bkDismiss');
    if (dismiss) dismiss.addEventListener('click', () => {
      Trip.set('bookingId', null);
      renderBookingLive();
    });
  }

  // --- rating -------------------------------------------------------------

  function openRatingModal(bookingId) {
    const modal = document.getElementById('gxModal');
    const body = document.getElementById('gxModalBody');
    if (!modal || !body) return;

    body.innerHTML =
      '<h3 class="gx-modal-title">Rate your guide</h3>' +
      '<p class="gx-modal-desc">How was the experience?</p>' +
      '<div class="rate-stars" id="rateStars">' +
        [1, 2, 3, 4, 5].map(n =>
          '<button type="button" class="rate-star" data-stars="' + n + '" ' +
          'aria-label="' + n + ' star' + (n > 1 ? 's' : '') + '">★</button>').join('') +
      '</div>' +
      '<label class="gx-msg-label" for="rateReview">What was your experience?</label>' +
      '<textarea class="gx-msg-input" id="rateReview" placeholder="Optional"></textarea>' +
      '<div class="gx-modal-actions two">' +
        '<button type="button" class="gx-btn ghost" data-modal-act="close">Not now</button>' +
        '<button type="button" class="gx-btn solid" id="rateSubmit">Submit rating</button>' +
      '</div>';

    modal.hidden = false;
    document.body.style.overflow = 'hidden';

    let chosen = 0;
    const starsBox = document.getElementById('rateStars');
    starsBox.addEventListener('click', e => {
      const s = e.target.closest('.rate-star');
      if (!s) return;
      chosen = parseInt(s.dataset.stars, 10);
      starsBox.querySelectorAll('.rate-star').forEach((el, i) =>
        el.classList.toggle('on', i < chosen));
    });

    document.getElementById('rateSubmit').addEventListener('click', async () => {
      if (!chosen) { showToast('◎', 'Pick a star rating first.'); return; }
      const res = await fetch(API_ORIGIN + '/api/bookings/' + bookingId + '/rating', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stars: chosen, touristRef: touristRef,
          review: document.getElementById('rateReview').value || null
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast('◎', data.message || 'Could not save the rating.'); return; }

      modal.hidden = true;
      document.body.style.overflow = '';
      showToast('◈', 'Thanks — your rating was saved.');
    });
  }

  // ===========================================
  // ASSISTANT PAGE — decide, then keep.
  // Every card can be added to the trip as a stay,
  // a table, or a place to visit.
  // ===========================================

  function assistantCardMarkup(p) {
    const facts = [];
    if (p.category) facts.push(escapeText(p.category));
    if (p.rating) facts.push('★ ' + escapeText(p.rating));
    if (p.priceLevel) facts.push(escapeText('$'.repeat(p.priceLevel)));
    if (p.distance != null) facts.push((p.distance / 1000).toFixed(1) + ' km');

    const img = placeVisual(p);

    const inTrip = assistantAlreadyKept(p.id);

    return '' +
      '<article class="hotel-card' + (inTrip ? ' selected' : '') + '" data-id="' + escapeText(p.id) + '">' +
        img +
        '<div class="hotel-card-body">' +
          '<h4 class="hotel-card-name">' + escapeText(p.name) + '</h4>' +
          '<p class="hotel-card-address">' + escapeText(p.address || p.city || '') + '</p>' +
          (facts.length ? '<div class="hotel-card-meta">' + facts.join(' · ') + '</div>' : '') +
          (!p.rating ? '<div class="ai-unknown">Rating not provided</div>' : '') +
          (p.why ? '<div class="ai-why"><b>Why this matches</b>' + escapeText(p.why) + '</div>' : '') +
          '<div class="as-keep">' +
            (inTrip
              ? '<span class="as-kept">✓ In your trip</span>' +
                '<button class="gx-btn ghost" type="button" data-drop="' + escapeText(p.id) + '">Remove</button>'
              : '<span class="as-keep-label">Keep as</span>' +
                '<button class="as-chip" type="button" data-keep="hotel">Stay</button>' +
                '<button class="as-chip" type="button" data-keep="restaurant">Table</button>' +
                '<button class="as-chip" type="button" data-keep="place">Place</button>') +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function assistantAlreadyKept(id) {
    const t = Trip.get();
    if (t.hotel && t.hotel.id === id) return 'hotel';
    if (t.restaurant && t.restaurant.id === id) return 'restaurant';
    if ((t.others || []).some(o => o.id === id)) return 'place';
    return null;
  }

  let assistantLast = [];

  function renderAssistantResults(data) {
    const grid = document.getElementById('assistantResults');
    const hint = document.getElementById('assistantHint');
    if (!grid) return;
    assistantLast = data.places || [];

    if (!assistantLast.length) {
      grid.innerHTML = '';
      if (hint) hint.textContent = 'No places found. Try another request.';
      return;
    }
    grid.innerHTML = assistantLast.map(assistantCardMarkup).join('');
    if (hint) hint.textContent = assistantLast.length + ' results · ' + (data.area || '');
    setAssistantState('answered');
    renderAssistantTrip();
  }

  /** Empty = centred composer; answered = composer moves up, results below. */
  function setAssistantState(state) {
    const sec = document.getElementById('assistant');
    if (sec) sec.dataset.state = state;
    const actions = document.getElementById('asActions');
    if (actions) actions.hidden = state !== 'answered';
  }

  // ===========================================
  // PLACE IMAGERY
  // Foursquare returns a real photograph only on its premium tier. When there
  // isn't one we draw a designed tile from the venue's own name and category
  // glyph — never a stock photo of some other building passed off as this one.
  // ===========================================

  // Six tints from the Travexa palette, picked deterministically per venue so
  // a place always looks the same between renders.
  const TILE_TINTS = [
    ['#dbe8f6', '#b9d0ea'], ['#dde9e4', '#bcd6cc'], ['#e7e3f3', '#cbc3e6'],
    ['#f3e6dd', '#e6ccb6'], ['#dde7f0', '#bdd0e0'], ['#e9e5da', '#d5cdb8']
  ];

  function tintFor(name) {
    let h = 0;
    const s = String(name || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return TILE_TINTS[h % TILE_TINTS.length];
  }

  function initialsFor(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2)
      .map(w => w[0]).join('').toUpperCase();
  }

  /**
   * The image block for a result card.
   *   venue photo -> shown plainly, it really is this place
   *   stock photo -> shown with a "representative" badge, because it is a
   *                  picture of a similar place, not of this one
   *   neither     -> designed tile from the venue's own name and glyph
   */
  function placeVisual(p) {
    const img = p.image;

    // 'named' is a photo found by the venue's own name — it depicts this place,
    // so it gets the credit line but no "representative" caveat.
    if (img && img.url && img.source === 'named') {
      const credit = [img.creator, img.license].filter(Boolean).join(' · ');
      return '<div class="card-visual">' +
        '<img class="hotel-card-img" src="' + escapeText(img.url) +
        '" alt="' + escapeText(p.name) + '" loading="lazy"' +
        ' onerror="this.closest(\'.card-visual\').classList.add(\'failed\')">' +
        (credit ? '<span class="card-visual-credit">' + escapeText(credit) + '</span>' : '') +
      '</div>';
    }

    if (img && img.url && img.source === 'venue') {
      return '<div class="card-visual">' +
        '<img class="hotel-card-img" src="' + escapeText(img.url) +
        '" alt="' + escapeText(p.name) + '" loading="lazy">' +
      '</div>';
    }

    if (img && img.url && img.source === 'stock') {
      const credit = [img.creator, img.license].filter(Boolean).join(' · ');
      return '<div class="card-visual">' +
        '<img class="hotel-card-img" src="' + escapeText(img.url) +
        '" alt="Representative photo of a ' + escapeText(img.term || 'place') +
        '" loading="lazy" onerror="this.closest(\'.card-visual\').classList.add(\'failed\')">' +
        '<span class="card-visual-tag" title="Not a photo of this venue">Representative</span>' +
        (credit ? '<span class="card-visual-credit">' + escapeText(credit) + '</span>' : '') +
      '</div>';
    }

    const tint = tintFor(p.name);
    return '' +
      '<div class="place-tile" style="--t1:' + tint[0] + ';--t2:' + tint[1] + '">' +
        (p.icon ? '<img class="place-tile-icon" src="' + escapeText(p.icon) +
                  '" alt="" loading="lazy">' : '') +
        '<span class="place-tile-initials">' + escapeText(initialsFor(p.name)) + '</span>' +
        (p.category ? '<span class="place-tile-cat">' + escapeText(p.category) + '</span>' : '') +
      '</div>';
  }

  function renderAssistantTrip() {
    const box = document.getElementById('asTrip');
    if (!box) return;
    const t = Trip.get();

    const rows = [];
    if (t.destination) rows.push({ k: 'Destination', v: t.destination, step: 'destination' });
    if (t.hotel)       rows.push({ k: 'Stay',        v: t.hotel.name, step: 'hotel' });
    if (t.restaurant)  rows.push({ k: 'Table',       v: t.restaurant.name, step: 'restaurant' });
    if (t.guide)       rows.push({ k: 'Guide',       v: t.guide.name, step: 'guide' });
    (t.others || []).forEach(o => rows.push({ k: 'Place', v: o.name, step: 'others', id: o.id }));

    if (!rows.length) {
      box.innerHTML = '<div class="as-trip-empty">Nothing kept yet. Ask below, then add what you like.</div>';
      return;
    }

    box.innerHTML =
      '<div class="as-trip-head">Your trip so far</div>' +
      '<div class="as-trip-rows">' +
        rows.map(r =>
          '<span class="as-trip-chip"><b>' + r.k + '</b> ' + escapeText(r.v) +
          (r.id ? '<button type="button" class="as-trip-x" data-drop="' + escapeText(r.id) +
                  '" aria-label="Remove">×</button>' : '') + '</span>').join('') +
      '</div>';
  }

  // What we persist about a place. Keeps the fields the plan page needs to
  // offer real booking links, and nothing more.
  function tripItem(p) {
    return {
      id: p.id,
      name: p.name,
      address: p.address || '',
      city: p.city || '',
      category: p.category || '',
      website: p.website || null,
      phone: p.phone || null,
      image: p.image || null,
      // Needed to score weather/hazards at the place itself.
      lat: p.lat != null ? p.lat : null,
      lng: p.lng != null ? p.lng : null
    };
  }

  function keepPlace(id, as) {
    const p = assistantLast.find(x => x.id === id);
    if (!p) return;
    const item = tripItem(p);

    if (as === 'hotel')       { Trip.set('hotel', item);      showToast('◈', p.name + ' kept as your stay.'); }
    else if (as === 'restaurant') { Trip.set('restaurant', item); showToast('◈', p.name + ' kept as your table.'); }
    else                      { Trip.toggleOther(item);        showToast('◈', p.name + ' added to your places.'); }

    refreshAssistant();
  }

  function dropPlace(id) {
    const t = Trip.get();
    if (t.hotel && t.hotel.id === id) Trip.set('hotel', null);
    else if (t.restaurant && t.restaurant.id === id) Trip.set('restaurant', null);
    else {
      const found = (t.others || []).find(o => o.id === id);
      if (found) Trip.toggleOther(found);
    }
    showToast('◈', 'Removed from your trip.');
    refreshAssistant();
  }

  function refreshAssistant() {
    const grid = document.getElementById('assistantResults');
    if (grid && assistantLast.length) grid.innerHTML = assistantLast.map(assistantCardMarkup).join('');
    renderAssistantTrip();
  }

  const assistantGrid = document.getElementById('assistantResults');
  if (assistantGrid) assistantGrid.addEventListener('click', e => {
    const keep = e.target.closest('[data-keep]');
    if (keep) {
      const card = keep.closest('.hotel-card');
      if (card) keepPlace(card.dataset.id, keep.dataset.keep);
      return;
    }
    const drop = e.target.closest('[data-drop]');
    if (drop) dropPlace(drop.dataset.drop);
  });

  const asTripBox = document.getElementById('asTrip');
  if (asTripBox) asTripBox.addEventListener('click', e => {
    const drop = e.target.closest('[data-drop]');
    if (drop) dropPlace(drop.dataset.drop);
  });

  const asSeePlan = document.getElementById('asSeePlan');
  if (asSeePlan) asSeePlan.addEventListener('click', () => {
    setNavActive('assistant');
    showScreen('tripSummary');
  });

  // ===========================================
  // AREA MAP — ported from the Travexa reference build.
  // Leaflet + OpenStreetMap tiles, plotting the real
  // Foursquare results for the current search.
  // ===========================================

  const mapInstances = { hotel: null, restaurant: null };
  // Which result set each map is currently showing, so selecting a place does
  // not tear the map down and rebuild it (which closed popups and re-centred).
  const mapSignatures = { hotel: null, restaurant: null };

  /** Great-circle distance in km. */
  function kmBetween(aLat, aLng, bLat, bLng) {
    const R = 6371;
    const dLat = (bLat - aLat) * Math.PI / 180;
    const dLng = (bLng - aLng) * Math.PI / 180;
    const s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  function formatCoord(lat, lng) {
    return Math.abs(lat).toFixed(2) + '°' + (lat >= 0 ? 'N' : 'S') + ', ' +
           Math.abs(lng).toFixed(2) + '°' + (lng >= 0 ? 'E' : 'W');
  }

  /**
   * Draws (or redraws) the area map for a pane.
   * `places` are the real results; anything without coordinates is skipped.
   */
  function updateAreaMap(pane, places) {
    const card = document.getElementById(pane + 'MapCard');
    const host = document.getElementById(pane + 'Map');
    if (!card || !host) return;

    // Leaflet is a CDN script; if it is blocked the rest of the page is fine.
    if (typeof L === 'undefined') { card.hidden = true; return; }

    const located = (places || []).filter(p => p.lat != null && p.lng != null);
    if (!located.length) { card.hidden = true; return; }

    card.hidden = false;

    // Same places as last time? Leave the map alone — rebuilding it would
    // close any open popup and throw away the traveller's pan and zoom.
    const t0 = Trip.get();
    const signature = located.map(p => p.id).join('|') +
                      '::' + (t0.hotel ? t0.hotel.id : '') +
                      '|' + (t0.restaurant ? t0.restaurant.id : '');
    if (mapInstances[pane] && mapSignatures[pane] === signature) {
      setTimeout(() => { if (mapInstances[pane]) mapInstances[pane].invalidateSize(); }, 120);
      return;
    }
    mapSignatures[pane] = signature;

    // A fresh instance per search keeps stale markers from previous cities out.
    if (mapInstances[pane]) { mapInstances[pane].remove(); mapInstances[pane] = null; }

    const centreLat = located.reduce((s, p) => s + p.lat, 0) / located.length;
    const centreLng = located.reduce((s, p) => s + p.lng, 0) / located.length;

    const map = L.map(pane + 'Map', {
      center: [centreLat, centreLng],
      zoom: 13,
      zoomControl: true,
      scrollWheelZoom: false        // so the page still scrolls over the map
    });
    mapInstances[pane] = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const isHotel = pane === 'hotel';
    const bounds = [];

    // Places already on the trip are pinned on every map, so a restaurant can
    // be judged against where you are actually staying.
    const trip = Trip.get();
    const anchors = [];
    if (trip.hotel && trip.hotel.lat != null && trip.hotel.id !== undefined) {
      anchors.push({ item: trip.hotel, kind: 'hotel', symbol: '🏨', label: 'Your stay' });
    }
    if (trip.restaurant && trip.restaurant.lat != null) {
      anchors.push({ item: trip.restaurant, kind: 'restaurant', symbol: '🍽', label: 'Your table' });
    }

    anchors.forEach(a => {
      // Skip if this result set already shows it as an ordinary pin.
      if (located.some(p => p.id === a.item.id)) return;
      // A selection made in another city must not drag the map across the
      // world. Only pin it when it is genuinely in this area.
      if (kmBetween(centreLat, centreLng, a.item.lat, a.item.lng) > 150) return;
      const icon = L.divIcon({
        className: 'custom-place-pin chosen-pin',
        html: '<span class="pin-symbol" aria-hidden="true">' + a.symbol + '</span>',
        iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -20]
      });
      const m = L.marker([a.item.lat, a.item.lng], { icon: icon, zIndexOffset: 1000 }).addTo(map);
      bounds.push([a.item.lat, a.item.lng]);
      m.bindPopup(
        '<div class="map-popup-card">' +
          '<span class="map-popup-badge chosen">' + a.label + '</span>' +
          '<h4 class="map-popup-title">' + escapeText(a.item.name) + '</h4>' +
          (a.item.address ? '<p class="map-popup-meta">' + escapeText(a.item.address) + '</p>' : '') +
        '</div>'
      );
    });

    // Distances are measured from where you are staying, when that is known.
    const stay = trip.hotel && trip.hotel.lat != null ? trip.hotel : null;

    located.forEach(p => {
      const icon = L.divIcon({
        className: 'custom-place-pin ' + (isHotel ? 'hotel-pin' : 'restaurant-pin'),
        html: '<span class="pin-symbol" aria-hidden="true">' + (isHotel ? '🏨' : '🍽') + '</span>',
        iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -18]
      });

      const marker = L.marker([p.lat, p.lng], { icon: icon }).addTo(map);
      bounds.push([p.lat, p.lng]);

      marker.bindPopup(
        '<div class="map-popup-card">' +
          '<span class="map-popup-badge">' + escapeText(p.category || (isHotel ? 'Hotel' : 'Restaurant')) + '</span>' +
          '<h4 class="map-popup-title">' + escapeText(p.name) + '</h4>' +
          (p.rating ? '<p class="map-popup-meta"><span class="star">★</span> ' + escapeText(p.rating) + '</p>' : '') +
          (p.address ? '<p class="map-popup-meta">' + escapeText(p.address) + '</p>' : '') +
          (stay && stay.id !== p.id
            ? '<p class="map-popup-dist">' +
                kmBetween(stay.lat, stay.lng, p.lat, p.lng).toFixed(1) +
                ' km from ' + escapeText(stay.name.slice(0, 22)) + '</p>'
            : (p.distance != null
                ? '<p class="map-popup-dist">' + (p.distance / 1000).toFixed(1) + ' km away</p>'
                : '')) +
        '</div>'
      );

      // Clicking a pin selects that place, same as clicking its card.
      marker.on('click', () => pickPlace(pane, p.id));
    });

    if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });

    const label = document.getElementById(pane + 'MapDestText');
    if (label) label.textContent = Trip.get('destination') || 'your destination';
    const tag = document.getElementById(pane + 'MapCoordsTag');
    if (tag) tag.textContent = formatCoord(centreLat, centreLng);

    // The container is often sized after this runs; Leaflet needs telling.
    setTimeout(() => { if (mapInstances[pane]) mapInstances[pane].invalidateSize(); }, 220);
  }

  window.TravexaAreaMap = updateAreaMap;

  window.TravexaMapResize = function (screenId) {
    const m = mapInstances[screenId];
    if (m) setTimeout(() => m.invalidateSize(), 240);
  };

  // Shared with the Places module, which lives in its own closure.
  window.TravexaVisual = placeVisual;

  // Bridge so the guide-discovery module can refresh real guides on a fix.
  window.TravexaGuides = { refresh: renderRealGuides };

  // ===========================================
  // WEATHER + SAFETY SCORE
  // Ported from the Travexa reference build.
  // Weather and time-of-day are real; area factors
  // are sample data and are labelled as such.
  // ===========================================

  const WEATHER_CODES = {
    0:  ['Clear', '☀'],          1:  ['Mainly clear', '🌤'],
    2:  ['Partly cloudy', '⛅'],  3:  ['Overcast', '☁'],
    45: ['Fog', '🌫'],           48: ['Rime fog', '🌫'],
    51: ['Light drizzle', '🌦'], 53: ['Drizzle', '🌦'],  55: ['Heavy drizzle', '🌦'],
    61: ['Light rain', '🌧'],    63: ['Rain', '🌧'],     65: ['Heavy rain', '🌧'],
    66: ['Freezing rain', '🌨'], 67: ['Freezing rain', '🌨'],
    71: ['Light snow', '🌨'],    73: ['Snow', '🌨'],     75: ['Heavy snow', '❄'],
    77: ['Snow grains', '🌨'],
    80: ['Rain showers', '🌦'],  81: ['Rain showers', '🌧'], 82: ['Violent showers', '⛈'],
    85: ['Snow showers', '🌨'],  86: ['Snow showers', '❄'],
    95: ['Thunderstorm', '⛈'],  96: ['Thunderstorm, hail', '⛈'], 99: ['Severe storm', '⛈']
  };

  function describeWeather(code) {
    return WEATHER_CODES[code] || ['Unsettled', '🌥'];
  }

  /**
   * Deterministic risk from the live forecast. Every deduction traces to a
   * number Open-Meteo actually returned — nothing here is guessed.
   */
  function weatherRisk(raw) {
    if (!raw || !raw.current) {
      return { level: 'UNKNOWN', impact: 0, reasons: [], sub: [] };
    }
    const c = raw.current;
    const code = c.weather_code;
    const gust = c.wind_gusts_10m || 0;
    const rain = c.precipitation || 0;
    const sub = [];
    const reasons = [];
    let impact = 0;

    if ([95, 96, 99].indexOf(code) >= 0) {
      impact -= 20; reasons.push('Thunderstorm reported in the live forecast.');
    } else if ([65, 82, 75, 86].indexOf(code) >= 0) {
      impact -= 15; reasons.push('Heavy precipitation in the live forecast.');
    } else if ([61, 63, 80, 81, 71, 73].indexOf(code) >= 0) {
      impact -= 8;  reasons.push('Rain or snow expected.');
    } else if ([45, 48].indexOf(code) >= 0) {
      impact -= 8;  reasons.push('Fog reducing visibility.');
    }
    sub.push({ label: 'Conditions', value: describeWeather(code)[0] });

    if (gust >= 60)      { impact -= 10; reasons.push('Strong wind gusts (' + gust + ' km/h).'); }
    else if (gust >= 40) { impact -= 5;  reasons.push('Gusty wind (' + gust + ' km/h).'); }
    sub.push({ label: 'Wind gusts', value: gust + ' km/h' });

    if (rain >= 5) { impact -= 5; reasons.push('Active rainfall (' + rain + ' mm).'); }
    sub.push({ label: 'Precipitation', value: rain + ' mm' });

    if (typeof c.temperature_2m === 'number') {
      sub.push({ label: 'Temperature', value: c.temperature_2m + '°C' });
    }

    const level = impact <= -20 ? 'SEVERE' : impact <= -12 ? 'HIGH'
                : impact <= -5  ? 'MODERATE' : 'LOW';

    if (!reasons.length) reasons.push('No adverse conditions in the live forecast.');
    return { level, impact, reasons, sub, code, isDay: c.is_day === 1 };
  }

  /** Real, from the destination's own clock. */
  function timeOfDayFactor(raw) {
    let hour = new Date().getHours();
    if (raw && raw.current && raw.current.time) {
      const m = String(raw.current.time).match(/T(\d{2}):/);
      if (m) hour = parseInt(m[1], 10);   // local time at the destination
    }
    // Open-Meteo's is_day accounts for actual sunrise/sunset at these
    // coordinates, which a clock-hour rule gets wrong near the terminator.
    const isDay = raw && raw.current && raw.current.is_day;
    if (isDay === 1) return { value: 'Daylight', impact: 0, hour };
    if (isDay === 0) {
      return (hour >= 22 || hour < 5)
        ? { value: 'Night', impact: -10, hour }
        : { value: 'Low light', impact: -5, hour };
    }
    if (hour >= 22 || hour < 5)  return { value: 'Night',   impact: -10, hour };
    if (hour >= 18)              return { value: 'Evening', impact: -5,  hour };
    return { value: 'Daytime', impact: 0, hour };
  }

  /**
   * 100-point model. Only factors backed by a real signal move the score;
   * anything without a live source contributes 0 and says so, rather than
   * inventing a penalty.
   */
  function computeSafetyScore(raw, conditions) {
    const factors = [];
    let score = 100;

    const wr = weatherRisk(raw);
    score += wr.impact;
    factors.push({
      id: 'weather', name: 'Weather conditions', icon: describeWeather(wr.code)[1],
      value: wr.level === 'UNKNOWN' ? 'Unavailable' : wr.level.charAt(0) + wr.level.slice(1).toLowerCase() + ' risk',
      impact: wr.impact, live: wr.level !== 'UNKNOWN',
      desc: wr.reasons[0], sub: wr.sub
    });

    const tod = timeOfDayFactor(raw);
    score += tod.impact;
    factors.push({
      id: 'time', name: 'Time of day', icon: '🕐', value: tod.value,
      impact: tod.impact, live: true,
      desc: tod.value === 'Night' ? 'Late hours reduce visibility and footfall.'
          : tod.value === 'Evening' ? 'After dark, but within active hours.'
          : 'Daylight hours.'
    });

    // --- natural hazards: USGS earthquakes + GDACS alerts -----------------
    const hz = conditions && conditions.hazards;
    if (hz) {
      const quakes = (hz.earthquakes && hz.earthquakes.events) || [];
      const alerts = (hz.gdacs && hz.gdacs.events) || [];
      const strongest = quakes.reduce((m, q) => Math.max(m, q.magnitude || 0), 0);
      const red = alerts.some(a => /red/i.test(a.level || ''));

      let impact = 0;
      const bits = [];
      if (strongest >= 6)      { impact -= 20; bits.push('M' + strongest.toFixed(1) + ' earthquake within 400 km in the last week'); }
      else if (strongest >= 5) { impact -= 10; bits.push('M' + strongest.toFixed(1) + ' earthquake within 400 km in the last week'); }
      else if (strongest >= 4) { impact -= 4;  bits.push('M' + strongest.toFixed(1) + ' earthquake recorded nearby'); }
      if (red)                 { impact -= 15; bits.push('GDACS red alert active in the area'); }
      else if (alerts.length)  { impact -= 8;  bits.push(alerts.length + ' GDACS orange alert(s) in the area'); }

      const reachable = (hz.earthquakes && hz.earthquakes.ok) || (hz.gdacs && hz.gdacs.ok);
      score += impact;
      factors.push({
        id: 'hazards', name: 'Natural hazards', icon: '🌐',
        value: !reachable ? 'Sources unreachable'
             : bits.length ? (impact <= -15 ? 'Elevated' : 'Some activity') : 'Nothing active',
        impact, live: !!reachable,
        desc: !reachable
          ? 'USGS and GDACS could not be reached, so this does not affect the score.'
          : (bits[0] || 'No significant earthquakes or disaster alerts near this place.'),
        sub: quakes.slice(0, 3).map(q => ({ label: 'M' + q.magnitude, value: q.place }))
             .concat(alerts.slice(0, 2).map(a => ({ label: a.level || 'Alert',
               value: String(a.type || a.name || '').replace(/<[^>]+>/g, '').slice(0, 40) })))
      });
    }

    // --- crowd pressure from the festival calendar ------------------------
    const fest = conditions && conditions.festivals;
    if (fest) {
      const n = (fest.events || []).length;
      let impact = 0;
      if (n >= 3) impact = -10;
      else if (n === 2) impact = -6;
      else if (n === 1) impact = -3;

      score += impact;
      factors.push({
        id: 'crowd', name: 'Festival crowds', icon: '👥',
        value: fest.available ? (fest.crowdLevel || 'None listed') : 'Unavailable',
        impact, live: !!fest.available,
        desc: !fest.available
          ? (fest.reason || 'Festival listings unavailable, so this does not affect the score.')
          : n
            ? n + ' festival' + (n > 1 ? 's have' : ' has') + ' historically fallen in this ' +
              'window here — expect crowds. Dates are from past years, not confirmed for this year.'
            : 'No listed festivals fall in this window for this destination.',
        sub: (fest.events || []).slice(0, 3).map(e => ({
          label: '~' + e.around, value: e.title.slice(0, 44) }))
      });
    }

    // No public incident dataset is connected.
    factors.push({
      id: 'incidents', name: 'Incident reports', icon: '🛡', value: 'No live source',
      impact: 0, live: false,
      desc: 'No public incident dataset is wired up yet, so this does not affect the score.'
    });

    score = Math.max(0, Math.min(100, score));
    const band = score >= 85 ? 'Low' : score >= 70 ? 'Moderate' : score >= 50 ? 'High' : 'Critical';

    return { score, band, factors, weather: wr };
  }

  const Safety = (function () {
    let watchId = null;
    let lastFix = null;       // {lat, lng, at}
    let lastResult = null;    // computeSafetyScore output
    let lastPlace = null;     // label shown to the traveller
    let pollTimer = null;

    const el = id => document.getElementById(id);

    function setPill(state, text) {
      const w = el('safetyWidget');
      if (!w) return;
      w.dataset.state = state;
      const t = el('safetyPillText');
      if (t) t.textContent = text;
    }

    async function fetchWeather(lat, lng, name) {
      const url = API_ORIGIN + '/api/weather?lat=' + lat + '&lon=' + lng +
                  '&name=' + encodeURIComponent(name || 'Your location');
      const res = await fetch(url);
      if (!res.ok) throw new Error('weather ' + res.status);
      return res.json();
    }

    async function fetchConditions(lat, lng, place) {
      const url = API_ORIGIN + '/api/conditions?lat=' + lat + '&lon=' + lng +
                  '&place=' + encodeURIComponent(place || '');
      const res = await fetch(url);
      if (!res.ok) return null;
      return res.json();
    }

    /**
     * Scores one coordinate. `place` is the destination name used to look up
     * festival crowding; without it that factor simply reports unavailable.
     */
    async function refresh(lat, lng, label, place) {
      try {
        setPill('loading', 'Checking conditions…');
        // Hazards and festivals must not delay the weather-based score.
        const [weather, conditions] = await Promise.all([
          fetchWeather(lat, lng, label),
          fetchConditions(lat, lng, place || label).catch(() => null)
        ]);
        lastResult = computeSafetyScore(weather.raw, conditions);
        lastPlace = label || (weather.location && weather.location.name) || 'Your location';
        paint();
        return lastResult;
      } catch (err) {
        console.warn('Safety refresh failed:', err.message);
        setPill('error', 'Conditions unavailable');
        return null;
      }
    }

    /** Scores a named destination rather than the traveller's own position. */
    async function scorePlace(lat, lng, name) {
      return refresh(lat, lng, name, name);
    }

    function paint() {
      if (!lastResult) return;
      const r = lastResult;
      const w = el('safetyWidget');
      if (!w) return;

      w.dataset.state = 'ready';
      w.dataset.band = r.band.toLowerCase();

      const icon = el('safetyIcon');
      if (icon) icon.textContent = describeWeather(r.weather.code)[1];

      const t = el('safetyPillText');
      if (t) t.textContent = r.score + '/100 · ' + r.band + ' risk';

      const sub = el('safetyPillSub');
      if (sub) sub.textContent = lastPlace;

      // The modal is usually opened before the first fetch resolves, so keep
      // it in step rather than leaving it showing placeholders.
      const modal = el('safetyModal');
      if (modal && !modal.hidden && typeof renderSafetyModal === 'function') {
        renderSafetyModal();
      }
    }

    // --- live tracking ----------------------------------------------------

    function start(onDenied) {
      if (!navigator.geolocation) { setPill('error', 'Location unsupported'); return; }
      setPill('loading', 'Locating…');

      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = navigator.geolocation.watchPosition(
        pos => {
          const lat = +pos.coords.latitude.toFixed(4);
          const lng = +pos.coords.longitude.toFixed(4);
          // Only re-query when the traveller has actually moved ~500m.
          if (lastFix && Math.abs(lastFix.lat - lat) < 0.005 &&
                         Math.abs(lastFix.lng - lng) < 0.005) return;
          lastFix = { lat, lng, at: Date.now() };
          refresh(lat, lng, 'Your location');
        },
        () => { setPill('denied', 'Location needed'); if (onDenied) onDenied(); },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 120000 }
      );

      // Conditions change even when standing still.
      if (!pollTimer) {
        pollTimer = setInterval(() => {
          if (lastFix) refresh(lastFix.lat, lastFix.lng, lastPlace || 'Your location');
        }, 15 * 60 * 1000);
      }
    }

    function stop() {
      if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    return { start, stop, refresh, scorePlace, paint, get result() { return lastResult; },
             get place() { return lastPlace; }, get fix() { return lastFix; } };
  })();

  // --- safety UI wiring ---------------------------------------------------

  function renderSafetyModal() {
    const r = Safety.result;
    const box = document.getElementById('safetyFactors');
    const note = document.getElementById('safetyModalNote');
    if (!box) return;

    if (!r) {
      box.innerHTML = '<div class="gd-empty">Share your location to see live conditions.</div>';
      if (note) note.textContent = '';
      return;
    }

    document.getElementById('safetyModalPlace').textContent = Safety.place || '—';
    document.getElementById('safetyGaugeNum').textContent = r.score;
    document.getElementById('safetyGaugeBand').textContent = r.band + ' risk';
    const fill = document.getElementById('safetyGaugeFill');
    if (fill) { fill.style.width = r.score + '%'; fill.dataset.band = r.band.toLowerCase(); }

    box.innerHTML = r.factors.map(f => {
      const sign = f.impact > 0 ? '+' + f.impact : f.impact === 0 ? '0' : String(f.impact);
      return '<div class="safety-factor' + (f.live ? '' : ' inert') + '">' +
        '<span class="safety-factor-icon" aria-hidden="true">' + f.icon + '</span>' +
        '<div class="safety-factor-body">' +
          '<div class="safety-factor-head">' +
            '<span class="safety-factor-name">' + escapeText(f.name) + '</span>' +
            '<span class="safety-factor-impact' + (f.impact < 0 ? ' neg' : f.impact > 0 ? ' pos' : '') +
              '">' + sign + '</span>' +
          '</div>' +
          '<div class="safety-factor-value">' + escapeText(f.value) + '</div>' +
          '<div class="safety-factor-desc">' + escapeText(f.desc || '') + '</div>' +
          ((f.sub && f.sub.length)
            ? '<div class="safety-sub">' + f.sub.map(s =>
                '<span><b>' + escapeText(s.label) + '</b> ' + escapeText(s.value) + '</span>').join('') + '</div>'
            : '') +
        '</div>' +
      '</div>';
    }).join('');

    if (note) {
      note.textContent = 'Weather and time of day come from live data (Open-Meteo) for your ' +
        'coordinates. Crowd and incident factors have no data source connected, so they ' +
        'score zero rather than a guessed value.';
    }
  }

  function openSafetyModal() {
    const m = document.getElementById('safetyModal');
    if (!m) return;
    renderSafetyModal();
    m.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeSafetyModal() {
    const m = document.getElementById('safetyModal');
    if (!m || m.hidden) return;
    m.hidden = true;
    document.body.style.overflow = '';
  }

  const safetyBtn = document.getElementById('safetyPillBtn');
  if (safetyBtn) safetyBtn.addEventListener('click', () => {
    if (!Safety.result) Safety.start();
    openSafetyModal();
  });

  ['safetyModalClose', 'safetyClose2'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.addEventListener('click', closeSafetyModal);
  });

  const safetyOverlay = document.getElementById('safetyModal');
  if (safetyOverlay) safetyOverlay.addEventListener('click', e => {
    if (e.target === safetyOverlay) closeSafetyModal();
  });

  const safetyRefreshBtn = document.getElementById('safetyRefresh');
  if (safetyRefreshBtn) safetyRefreshBtn.addEventListener('click', async () => {
    const f = Safety.fix;
    if (f) { await Safety.refresh(f.lat, f.lng, Safety.place); renderSafetyModal(); }
    else Safety.start();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSafetyModal();
  });

  // Restore the tracker for whatever screen is showing on load.
  renderTracker();

})();
