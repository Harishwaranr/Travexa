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

  document.getElementById('heroBookBtn').addEventListener('click', () => {
    setNavActive('onboard');
    showScreen('book1');
  });

  var headerBookBtn = document.getElementById('headerBookBtn');
  if (headerBookBtn) {
    headerBookBtn.addEventListener('click', () => {
      setNavActive('onboard');
      showScreen('book1');
    });
  }

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

  function renderGrid(gridId, items) {
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
      card.addEventListener('click', () => selectDestination(item.name));
      grid.appendChild(card);
    });
  }

  renderGrid('localGrid', localSpots);
  renderGrid('intlGrid', intlSpots);

  function selectDestination(name) {
    if (blobLoader) {
      blobLoader.classList.add('active');
      if (blobLoadingTitle) blobLoadingTitle.textContent = 'Building ' + name + ' Itinerary…';
      if (blobLoadingSub) blobLoadingSub.textContent = 'Optimizing routes, restaurant reservations, and live alerts';

      setTimeout(() => {
        blobLoader.classList.remove('active');
        setNavActive('itinerary');
        showScreen('itinerary');
        showToast('✈', 'Personalized itinerary ready for ' + name);
      }, 1600);
    } else {
      setNavActive('itinerary');
      showScreen('itinerary');
      showToast('✈', 'Building your ' + name + ' itinerary…');
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

  Scroll.init();

  // ===========================================
  // Story Progress Indicator
  // ===========================================

  const storyDots  = Array.prototype.slice.call(document.querySelectorAll('.sp-dot'));
  const storyNav   = document.getElementById('storyProgress');
  let currentStory = -1;

  function updateStoryProgress() {
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
  // Guide "Add to day" feedback
  // ===========================================

  document.querySelectorAll('.guide-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.guide-card');
      const name = card ? card.querySelector('.guide-name').textContent : 'Guide';
      showToast('◈', name + ' added to Day 1.');
    });
  });

})();
