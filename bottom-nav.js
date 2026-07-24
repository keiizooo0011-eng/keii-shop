(async()=>{
  if(document.querySelector('.kivo-bottom-nav')) return;
  document.body.classList.add('has-kivo-bottom-nav');
  const path=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  const isHome=path===''||path==='index.html';
  const isProducts=['topup-game.html','game-detail.html','robux.html','order-robux.html','payment-game.html','payment-robux.html','riwayat-game.html','riwayat-robux.html'].includes(path);
  const isProfile=['account.html','login.html','register.html','forgot-password.html','reset-password.html','support-ticket.html'].includes(path);
  let profileHref='login.html?next=account.html';
  try{
    if(window.KivoAuth){
      const session=await KivoAuth.session();
      if(session) profileHref='account.html';
    }
  }catch{}
  const nav=document.createElement('nav');
  nav.className='kivo-bottom-nav';
  nav.setAttribute('aria-label','Navigasi utama KivoPay');
  nav.innerHTML=`
    <a href="index.html" class="${isHome?'active':''}" ${isHome?'aria-current="page"':''}>
      <span class="nav-icon"><svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/></svg></span><span>Home</span>
    </a>
    <a href="topup-game.html" class="${isProducts?'active':''}" ${isProducts?'aria-current="page"':''}>
      <span class="nav-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/></svg></span><span>All Produk</span>
    </a>
    <a href="${profileHref}" class="${isProfile?'active':''}" ${isProfile?'aria-current="page"':''}>
      <span class="nav-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg></span><span>Profil</span>
    </a>`;
  document.body.appendChild(nav);
})();
