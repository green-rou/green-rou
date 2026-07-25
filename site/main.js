'use strict';

/* ── Shared helpers ──────────────────────────────────────────── */
function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function pointerIsFine() {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/* ── Particle grid background ────────────────────────────────── */
(function () {
  if (prefersReducedMotion() || !pointerIsFine()) return;

  const canvas = document.querySelector('.particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const SPACING = 130;          // px between grid dots
  const JITTER = SPACING * 0.25; // random offset from the perfect grid position
  const SCATTER_FRACTION = 0.25; // extra fully-random dots, as a fraction of grid dot count
  const CONNECT_DIST = SPACING * 1.6; // candidate connection radius
  const CURSOR_RADIUS = 160;    // px influence radius around the cursor
  const MAX_PULL = 18;          // px a dot can be dragged toward the cursor
  const EASE = 0.12;
  const DRIFT_AMP_MIN = 6;      // px, idle wander amplitude range
  const DRIFT_AMP_RANGE = 6;
  const DRIFT_FREQ_MIN = 0.5;   // rad/s, idle wander speed range
  const DRIFT_FREQ_RANGE = 1.0;
  const DOT_RGB = '76,175,80';  // --secondary

  let width = 0, height = 0, dpr = 1;
  let cols = 0, rows = 0;
  let dots = [];
  let edges = [];
  let mouseX = null, mouseY = null;
  let rafId = null;
  let resizeTimer = null;

  function makeDot(hx, hy) {
    return {
      hx, hy, x: hx, y: hy,
      driftFreqX: DRIFT_FREQ_MIN + Math.random() * DRIFT_FREQ_RANGE,
      driftFreqY: DRIFT_FREQ_MIN + Math.random() * DRIFT_FREQ_RANGE,
      driftPhaseX: Math.random() * Math.PI * 2,
      driftPhaseY: Math.random() * Math.PI * 2,
      driftAmp: DRIFT_AMP_MIN + Math.random() * DRIFT_AMP_RANGE,
      maxConnections: 2 + Math.floor(Math.random() * 3), // 2, 3, or 4
      connections: 0,
    };
  }

  function buildGrid() {
    cols = Math.ceil(width / SPACING) + 1;
    rows = Math.ceil(height / SPACING) + 1;
    dots = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const hx = c * SPACING + (Math.random() - 0.5) * 2 * JITTER;
        const hy = r * SPACING + (Math.random() - 0.5) * 2 * JITTER;
        dots.push(makeDot(hx, hy));
      }
    }

    const extraCount = Math.round(dots.length * SCATTER_FRACTION);
    for (let i = 0; i < extraCount; i++) {
      dots.push(makeDot(Math.random() * width, Math.random() * height));
    }

    buildEdges();
  }

  function buildEdges() {
    const maxDistSq = CONNECT_DIST * CONNECT_DIST;
    const candidates = [];
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        const dx = dots[i].hx - dots[j].hx;
        const dy = dots[i].hy - dots[j].hy;
        const distSq = dx * dx + dy * dy;
        if (distSq < maxDistSq) candidates.push({ i, j, distSq });
      }
    }
    candidates.sort((a, b) => a.distSq - b.distSq);

    edges = [];
    for (const cand of candidates) {
      const a = dots[cand.i];
      const b = dots[cand.j];
      if (a.connections < a.maxConnections && b.connections < b.maxConnections) {
        edges.push([a, b]);
        a.connections++;
        b.connections++;
      }
    }
  }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildGrid();
  }

  function proximity(x, y) {
    if (mouseX === null) return 0;
    const dist = Math.hypot(mouseX - x, mouseY - y);
    return dist < CURSOR_RADIUS ? 1 - dist / CURSOR_RADIUS : 0;
  }

  function drawLine(a, b) {
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const alpha = 0.035 + proximity(midX, midY) * 0.35;
    ctx.strokeStyle = `rgba(${DOT_RGB},${alpha})`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function frame() {
    const t = performance.now() * 0.001;
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;

    for (const d of dots) {
      const restX = d.hx + Math.sin(t * d.driftFreqX + d.driftPhaseX) * d.driftAmp;
      const restY = d.hy + Math.cos(t * d.driftFreqY + d.driftPhaseY) * d.driftAmp;

      let targetX = restX;
      let targetY = restY;
      if (mouseX !== null) {
        const dx = mouseX - restX;
        const dy = mouseY - restY;
        const dist = Math.hypot(dx, dy);
        if (dist < CURSOR_RADIUS && dist > 0.01) {
          const pull = (1 - dist / CURSOR_RADIUS) * MAX_PULL;
          targetX = restX + (dx / dist) * pull;
          targetY = restY + (dy / dist) * pull;
        }
      }
      d.x += (targetX - d.x) * EASE;
      d.y += (targetY - d.y) * EASE;
    }

    // draw the fixed set of nearest-neighbor edges chosen (degree-capped) at build time
    for (const [a, b] of edges) drawLine(a, b);

    for (const d of dots) {
      const p = proximity(d.x, d.y);
      ctx.fillStyle = `rgba(${DOT_RGB},${0.15 + p * 0.6})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, 1.3 + p * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (rafId === null) rafId = requestAnimationFrame(frame);
  }

  function stop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  document.addEventListener('mouseleave', () => {
    mouseX = null;
    mouseY = null;
  });

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop();
    } else {
      start();
    }
  });

  resize();
  start();
})();

/* ── Typing effect ───────────────────────────────────────────── */
(function () {
  const lines = [
    'MaterialTheme.colorScheme enjoyer',
    'Dynamic Color, always on',
    'Compose Preview != Real Device',
    'Coffee-driven development',
  ];

  const el = document.getElementById('typing-text');
  if (!el) return;

  let lineIndex = 0;
  let charIndex = 0;
  let deleting = false;
  const SPEED_TYPE = 60;
  const SPEED_DELETE = 30;
  const PAUSE_END = 1800;
  const PAUSE_START = 300;

  function tick() {
    const current = lines[lineIndex];

    if (!deleting) {
      charIndex++;
      el.textContent = current.slice(0, charIndex);
      if (charIndex === current.length) {
        deleting = true;
        setTimeout(tick, PAUSE_END);
        return;
      }
    } else {
      charIndex--;
      el.textContent = current.slice(0, charIndex);
      if (charIndex === 0) {
        deleting = false;
        lineIndex = (lineIndex + 1) % lines.length;
        setTimeout(tick, PAUSE_START);
        return;
      }
    }

    setTimeout(tick, deleting ? SPEED_DELETE : SPEED_TYPE);
  }

  setTimeout(tick, 600);
})();

/* ── Scroll progress bar ─────────────────────────────────────── */
(function () {
  const bar = document.querySelector('.scroll-progress');
  if (!bar) return;

  let ticking = false;

  function update() {
    const scrollTop = window.scrollY;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = scrollable > 0 ? scrollTop / scrollable : 0;
    bar.style.transform = `scaleX(${Math.min(1, Math.max(0, ratio))})`;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });

  update();
})();

/* ── Project card tilt ───────────────────────────────────────── */
(function () {
  if (prefersReducedMotion() || !pointerIsFine()) return;

  const MAX_TILT = 4; // degrees — kept subtle on purpose

  document.querySelectorAll('.project-card').forEach((card) => {
    let ticking = false;
    let lastEvent = null;

    function apply() {
      const rect = card.getBoundingClientRect();
      const px = (lastEvent.clientX - rect.left) / rect.width;
      const py = (lastEvent.clientY - rect.top) / rect.height;
      const tiltY = (px - 0.5) * 2 * MAX_TILT;
      const tiltX = (0.5 - py) * 2 * MAX_TILT;
      card.style.setProperty('--tilt-x', `${tiltX.toFixed(2)}deg`);
      card.style.setProperty('--tilt-y', `${tiltY.toFixed(2)}deg`);
      ticking = false;
    }

    card.addEventListener('pointermove', (e) => {
      lastEvent = e;
      if (!ticking) {
        requestAnimationFrame(apply);
        ticking = true;
      }
    });

    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
    });
  });
})();

/* ── Copy code blocks ────────────────────────────────────────── */
(function () {
  const buttons = document.querySelectorAll('.copy-btn');
  if (!buttons.length) return;

  if (!navigator.clipboard) {
    buttons.forEach((btn) => { btn.style.display = 'none'; });
    return;
  }

  buttons.forEach((btn) => {
    const block = btn.closest('.code-block');
    const codeBody = block ? block.querySelector('.code-body') : null;
    if (!codeBody) return;

    btn.addEventListener('click', () => {
      const text = Array.from(codeBody.querySelectorAll('.line'))
        .map((line) => line.textContent)
        .join('\n');
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = '[ copied ]';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = '[ copy ]';
          btn.classList.remove('copied');
        }, 1200);
      });
    });
  });
})();

/* ── Code block line numbers ─────────────────────────────────── */
(function () {
  document.querySelectorAll('.code-body').forEach((el) => {
    const lines = el.innerHTML.split('\n');
    el.innerHTML = lines.map((line) => `<span class="line">${line}</span>`).join('');
  });
})();

/* ── Fade-in on scroll ───────────────────────────────────────── */
(function () {
  const sections = document.querySelectorAll('.fade-in-section');

  // Reveals items in `selector` one after another with a small stagger, then
  // clears the inline transition-delay once each item's own entrance
  // animation has finished so later hover transitions aren't delayed too.
  function staggerReveal(section, selector, stepMs, durationMs) {
    const items = section.querySelectorAll(selector);
    items.forEach((el, i) => {
      if (!prefersReducedMotion()) {
        const delay = i * stepMs;
        el.style.transitionDelay = `${delay}ms`;
        setTimeout(() => { el.style.transitionDelay = ''; }, delay + durationMs);
      }
      el.classList.add('visible');
    });
  }

  // One-shot typewriter for a section heading's .type-target, then draws in
  // the accent underline. Unlike the hero's typewriter, this never loops.
  function typeTitle(section) {
    const target = section.querySelector('.type-target');
    if (!target) return;
    const heading = target.closest('.section-title');
    const cursor = section.querySelector('.type-cursor');
    const text = target.dataset.text || '';

    if (prefersReducedMotion()) {
      target.textContent = text;
      if (cursor) cursor.classList.add('hidden');
      if (heading) heading.classList.add('underlined');
      return;
    }

    let i = 0;
    (function tick() {
      target.textContent = text.slice(0, i);
      i++;
      if (i <= text.length) {
        setTimeout(tick, 55);
      } else {
        if (cursor) cursor.classList.add('hidden');
        if (heading) heading.classList.add('underlined');
      }
    })();
  }

  function revealSection(section) {
    section.classList.add('visible');
    staggerReveal(section, '.skill-group', 60, 460);
    staggerReveal(section, '.project-card', 90, 560);
    staggerReveal(section, '.code-block', 120, 560);
    typeTitle(section);
  }

  if (!('IntersectionObserver' in window)) {
    sections.forEach(revealSection);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          revealSection(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  sections.forEach(s => observer.observe(s));
})();

/* ── Interactive mini terminal ───────────────────────────────── */
(function () {
  const output = document.getElementById('terminal-output');
  const input = document.getElementById('terminal-input');
  if (!output || !input) return;

  const SECTIONS = ['hero', 'about', 'projects', 'skills', 'contact'];

  // Every output line is built with createElement/createTextNode only —
  // never innerHTML — so echoing raw visitor input back is always safe,
  // even for the unknown-command case where it's least obviously a risk.
  function appendLine(parts) {
    const p = document.createElement('p');
    p.className = 'terminal-line';
    (Array.isArray(parts) ? parts : [parts]).forEach((part) => {
      if (typeof part === 'string') {
        p.appendChild(document.createTextNode(part));
      } else {
        const span = document.createElement('span');
        span.className = part.cls;
        span.textContent = part.text;
        p.appendChild(span);
      }
    });
    output.appendChild(p);
    output.scrollTop = output.scrollHeight;
  }

  function scrollToSection(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  const COMMANDS = {
    help() {
      appendLine('available commands:');
      appendLine('  help        show this list');
      appendLine('  whoami      who am i');
      appendLine('  about       short bio');
      appendLine('  skills      what i work with');
      appendLine('  projects    what i\'ve built');
      appendLine('  contact     how to reach me');
      appendLine('  ls          list sections');
      appendLine('  cd <name>   scroll to a section');
      appendLine('  git log     recent "commits"');
      appendLine('  clear       clear this terminal');
    },
    whoami() {
      appendLine('denis — android developer. kotlin, jetpack compose, way too much coffee.');
    },
    about() {
      appendLine('building things with kotlin & compose. based in Rybnik, Poland.');
    },
    skills() {
      appendLine('Kotlin · Jetpack Compose · Material3 · Clean Architecture · Koin · Room · OkHttp · BLE');
      appendLine('...and a concerning amount of logcat scrolling.');
    },
    projects() {
      appendLine('Rouxen   — network & traffic toolkit          [paused]');
      appendLine('Kanata   — extension-based manga/anime viewer  [v0.3.2]');
      appendLine('Rovibe   — terminal-style audio synthesizer');
      appendLine(['type ', { cls: 'green', text: 'cd projects' }, ' to see them']);
    },
    contact() {
      appendLine('denis.kramar15@gmail.com');
      appendLine('github.com/green-rou');
    },
    ls() {
      appendLine(SECTIONS.join('  '));
    },
    cd(args) {
      const target = (args[0] || '').toLowerCase();
      if (!target) {
        appendLine('cd: missing argument. try: cd projects');
        return;
      }
      if (SECTIONS.indexOf(target) === -1) {
        appendLine(['cd: no such section: ', target]);
        return;
      }
      scrollToSection(target);
      appendLine(['moved to ./', target]);
    },
    git(args) {
      if ((args[0] || '').toLowerCase() !== 'log') {
        appendLine(['git: unknown subcommand. try ', { cls: 'green', text: 'git log' }]);
        return;
      }
      appendLine('a1b2c3d fix: fixed the fix from yesterday');
      appendLine('9f8e7d6 refactor: renamed variables for the 4th time');
      appendLine('4c3b2a1 feat: it compiles now');
    },
    sudo() {
      appendLine('Permission denied: denis is not in the sudoers file. This incident will be reported.');
    },
    coffee() {
      appendLine('☕ brewing... done. caffeine level: optimal.');
    },
    clear() {
      output.textContent = '';
    },
  };

  const history = [];
  let historyIndex = -1;

  function runCommand(raw) {
    appendLine([{ cls: 'green', text: '$ ' }, raw]);
    const parts = raw.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    // hasOwnProperty guard: COMMANDS is a plain object literal, so a visitor
    // typing "constructor" or "__proto__" would otherwise resolve to an
    // inherited Object.prototype value instead of a clean "not found".
    const handler = Object.prototype.hasOwnProperty.call(COMMANDS, cmd) ? COMMANDS[cmd] : undefined;
    if (handler) {
      handler(args);
    } else {
      appendLine(['command not found: ', parts[0], '. type ', { cls: 'green', text: 'help' }, ' for a list.']);
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = input.value.trim();
      input.value = '';
      if (!val) return;
      history.push(val);
      historyIndex = history.length;
      runCommand(val);
    } else if (e.key === 'ArrowUp') {
      if (history.length === 0) return;
      e.preventDefault();
      historyIndex = Math.max(0, historyIndex - 1);
      input.value = history[historyIndex];
    } else if (e.key === 'ArrowDown') {
      if (history.length === 0) return;
      e.preventDefault();
      if (historyIndex >= history.length - 1) {
        historyIndex = history.length;
        input.value = '';
      } else {
        historyIndex++;
        input.value = history[historyIndex];
      }
    }
  });
})();
