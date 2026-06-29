'use strict';

/* ── Typing effect ───────────────────────────────────────────── */
(function () {
  const lines = [
    'MaterialTheme.colorScheme enjoyer',
    'Dynamic Color, always on',
    'Compose Preview != Real Device',
    'Currently building Rouxen',
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

/* ── Fade-in on scroll ───────────────────────────────────────── */
(function () {
  const sections = document.querySelectorAll('.fade-in-section');
  if (!('IntersectionObserver' in window)) {
    sections.forEach(s => s.classList.add('visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  sections.forEach(s => observer.observe(s));
})();
