(()=>{
  if(document.querySelector('.kivo-bottom-nav')) return;
  const file=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  const products=['all-products.html','topup-game.html','robux.html','apk-premium.html','sewa-bot.html','game-detail.html','panel-pterodactyl.html'];
  const histories=['history.html','riwayat-order.html','riwayat-game.html','riwayat-robux.html','riwayat-apk-premium.html','riwayat-panel.html','detail-apk-premium.html'];
  const nav=document.createElement('nav');
  nav.className='kivo-bottom-nav';
  nav.setAttribute('aria-label','Navigasi utama');
  nav.innerHTML=`
    <a href="index.html" class="${file==='index.html'||file===''?'active':''}"><i>⌂</i><span>Beranda</span></a>
    <a href="all-products.html" class="${products.includes(file)?'active':''}"><i>▦</i><span>Produk</span></a>
    <a href="history.html" class="${histories.includes(file)?'active':''}"><i>◷</i><span>Riwayat</span></a>
    <a href="account.html" class="${file==='account.html'?'active':''}"><i>♙</i><span>Akun</span></a>`;
  document.body.appendChild(nav);
})();
