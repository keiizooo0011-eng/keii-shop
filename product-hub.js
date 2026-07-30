(() => {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const cards = [...document.querySelectorAll('.hub-card')];
  const revealItems = [...document.querySelectorAll('.reveal-section, .hub-live-purchases, .hub-card')];

  cards.forEach((card, index) => {
    card.style.setProperty('--card-index', index);
    card.addEventListener('pointerdown', (event) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--tap-x', `${event.clientX - rect.left}px`);
      card.style.setProperty('--tap-y', `${event.clientY - rect.top}px`);
      card.classList.remove('is-tapped');
      void card.offsetWidth;
      card.classList.add('is-tapped');
      window.setTimeout(() => card.classList.remove('is-tapped'), 520);
    }, { passive: true });
  });

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealItems.forEach((item) => item.classList.add('is-revealed'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -32px' });

  revealItems.forEach((item) => observer.observe(item));
})();
