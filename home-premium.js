(() => {
  const icons = {
    'shopping-bag':'<path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
    gamepad:'<path d="M6 10h12a4 4 0 0 1 3.6 5.7l-1.2 2.5a2 2 0 0 1-3.2.6L15 17H9l-2.2 1.8a2 2 0 0 1-3.2-.6l-1.2-2.5A4 4 0 0 1 6 10Z"/><path d="M8 13v4M6 15h4M16 14h.01M18 16h.01"/>',
    zap:'<path d="m13 2-9 12h8l-1 8 9-12h-8l1-8Z"/>', shield:'<path d="M12 3 5 6v5c0 4.5 2.8 8.2 7 10 4.2-1.8 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
    headphones:'<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h3v6H5a1 1 0 0 1-1-1v-5Zm16 0h-3v6h2a1 1 0 0 0 1-1v-5Z"/>',
    'package-check':'<path d="m16.5 9.4-9-5.2"/><path d="M21 8 12 3 3 8v8l9 5 4-2.2"/><path d="M3.3 7.7 12 13l8.7-5.3M12 22v-9"/><path d="m16 18 2 2 4-4"/>',
    bot:'<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M9 3h6M12 3v4M8 12h.01M16 12h.01M9 16h6"/>',
    gem:'<path d="m3 8 4-5h10l4 5-9 13L3 8Z"/><path d="m3 8 9 4 9-4M7 3l5 9 5-9"/>',
    receipt:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 7h6M9 11h6M9 15h3"/>',
    'arrow-right':'<path d="M5 12h14M13 6l6 6-6 6"/>', wand:'<path d="m15 4 5 5L8 21H3v-5L15 4Z"/><path d="m13 6 5 5M6 3v3M4.5 4.5h3M19 15v3M17.5 16.5h3"/>',
    'message-circle':'<path d="M21 12a8 8 0 0 1-8 8H5l-3 2 1-5a8 8 0 1 1 18-5Z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>'
  };
  document.querySelectorAll('[data-kivo-icon]').forEach(el => {
    const body=icons[el.dataset.kivoIcon]; if(!body) return;
    el.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  });

  const slides=[...document.querySelectorAll('.promo-slide')], dots=document.getElementById('promoDots'); let index=0, timer;
  if(slides.length && dots){
    slides.forEach((_,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',`Promo ${i+1}`);b.onclick=()=>show(i);dots.appendChild(b)});
    const btns=[...dots.children];
    function show(i){index=i;slides.forEach((s,n)=>s.classList.toggle('active',n===i));btns.forEach((b,n)=>b.classList.toggle('active',n===i));clearInterval(timer);timer=setInterval(()=>show((index+1)%slides.length),5000)}
    show(0);
  }
  document.querySelectorAll('[data-quick-filter]').forEach(link=>link.addEventListener('click',()=>{
    const key=link.dataset.quickFilter; setTimeout(()=>document.querySelector(`[data-store-filter="${key}"]`)?.click(),250);
  }));
  const reveal=()=>document.querySelectorAll('.quick-card,.promo-showcase,.store-grid>*').forEach((el,i)=>{el.style.setProperty('--delay',`${Math.min(i,8)*55}ms`)}); reveal();
})();
