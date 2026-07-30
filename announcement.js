(() => {
  const root = document.querySelector('#kivoAnnouncement');
  if (!root) return;

  const cfg = window.KIVOPAY_CONFIG || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;

  const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const labels = { info:'INFORMASI', promo:'PROMO', maintenance:'MAINTENANCE', restock:'RESTOCK' };
  const icons = { info:'i', promo:'%', maintenance:'!', restock:'↻' };
  const safeUrl = url => {
    if (!url) return '';
    try {
      const parsed = new URL(url, location.href);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch {
      return '';
    }
  };

  let slides = [];
  let current = 0;
  let timer = null;
  let touchStartX = 0;

  function activeSlides(rows) {
    const now = Date.now();
    return (rows || [])
      .filter(item => item.is_active && (!item.expires_at || new Date(item.expires_at).getTime() > now))
      .sort((a, b) => new Date(a.updated_at || 0) - new Date(b.updated_at || 0));
  }

  function slideMarkup(item, index) {
    const url = safeUrl(item.button_url);
    return `<article class="kivo-announcement-slide type-${esc(item.type || 'info')}" data-slide="${index}" aria-hidden="${index === 0 ? 'false' : 'true'}">
      <div class="kivo-announcement-icon">${icons[item.type] || 'i'}</div>
      <div class="kivo-announcement-copy">
        <small>${labels[item.type] || 'INFORMASI'} KIVOPAY</small>
        <h2>${esc(item.title)}</h2>
        <p>${esc(item.body)}</p>
        ${item.button_text && url ? `<a href="${esc(url)}">${esc(item.button_text)} <span>→</span></a>` : ''}
      </div>
    </article>`;
  }

  function show(index, restart = true) {
    if (!slides.length) return;
    current = (index + slides.length) % slides.length;
    root.querySelectorAll('.kivo-announcement-slide').forEach((el, i) => {
      el.classList.toggle('is-active', i === current);
      el.setAttribute('aria-hidden', i === current ? 'false' : 'true');
    });
    root.querySelectorAll('.kivo-announcement-dot').forEach((el, i) => {
      el.classList.toggle('is-active', i === current);
      el.setAttribute('aria-label', `Buka pengumuman ${i + 1}${i === current ? ' (aktif)' : ''}`);
    });
    const count = root.querySelector('.kivo-announcement-counter');
    if (count) count.textContent = `${current + 1}/${slides.length}`;
    if (restart) startTimer();
  }

  function startTimer() {
    clearInterval(timer);
    if (slides.length > 1 && !document.hidden) {
      timer = setInterval(() => show(current + 1, false), 5500);
    }
  }

  function render() {
    root.className = 'kivo-announcement kivo-announcement-slider';
    root.innerHTML = `<div class="kivo-announcement-track">${slides.map(slideMarkup).join('')}</div>
      <button class="kivo-announcement-close" type="button" aria-label="Tutup pengumuman">×</button>
      ${slides.length > 1 ? `<div class="kivo-announcement-controls">
        <button class="kivo-announcement-arrow prev" type="button" aria-label="Pengumuman sebelumnya">‹</button>
        <div class="kivo-announcement-dots">${slides.map((_, i) => `<button class="kivo-announcement-dot${i === 0 ? ' is-active' : ''}" type="button" data-index="${i}" aria-label="Buka pengumuman ${i + 1}"></button>`).join('')}</div>
        <span class="kivo-announcement-counter">1/${slides.length}</span>
        <button class="kivo-announcement-arrow next" type="button" aria-label="Pengumuman berikutnya">›</button>
      </div>` : ''}`;
    root.hidden = false;
    root.querySelector('.kivo-announcement-slide')?.classList.add('is-active');
    root.querySelector('.kivo-announcement-close')?.addEventListener('click', () => {
      root.hidden = true;
      clearInterval(timer);
    });
    root.querySelector('.prev')?.addEventListener('click', () => show(current - 1));
    root.querySelector('.next')?.addEventListener('click', () => show(current + 1));
    root.querySelectorAll('.kivo-announcement-dot').forEach(dot => dot.addEventListener('click', () => show(Number(dot.dataset.index))));
    root.addEventListener('mouseenter', () => clearInterval(timer));
    root.addEventListener('mouseleave', startTimer);
    root.addEventListener('touchstart', event => { touchStartX = event.changedTouches[0]?.clientX || 0; }, { passive:true });
    root.addEventListener('touchend', event => {
      const distance = (event.changedTouches[0]?.clientX || 0) - touchStartX;
      if (Math.abs(distance) > 45) show(distance > 0 ? current - 1 : current + 1);
    }, { passive:true });
    document.addEventListener('visibilitychange', startTimer);
    startTimer();
  }

  async function load() {
    const { data, error } = await db.from('site_announcements').select('*');
    if (error || !data) return;
    slides = activeSlides(data);
    if (!slides.length) return;
    render();
  }

  load();
})();
