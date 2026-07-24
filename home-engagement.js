(()=>{
  const icons={
    game:'<svg viewBox="0 0 24 24"><path d="M8.5 7h7a5.5 5.5 0 0 1 5.2 7.3l-1.1 3.1a2.5 2.5 0 0 1-4.1 1l-1.4-1.4H9.9l-1.4 1.4a2.5 2.5 0 0 1-4.1-1l-1.1-3.1A5.5 5.5 0 0 1 8.5 7Z"/><path d="M7 11v4M5 13h4M16.5 11.8h.01M18.5 14h.01"/></svg>',
    robux:'<svg viewBox="0 0 24 24"><path d="m7.2 3 13.8 4.2L16.8 21 3 16.8 7.2 3Z"/><path d="m10 9 5 1.5-1.5 5-5-1.5L10 9Z"/></svg>',
    gem:'<svg viewBox="0 0 24 24"><path d="M3 9 7 4h10l4 5-9 11L3 9Z"/><path d="m3 9 9 3 9-3M7 4l5 8 5-8M12 12v8"/></svg>',
    bot:'<svg viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M9 12h.01M15 12h.01M8 16h8M12 7V4M10 4h4M2 11v4M22 11v4"/></svg>'
  };
  const catalog=[
    {title:'Top Up Mobile Legends',desc:'Diamond dan produk game',href:'topup-game.html',keys:'mobile legends ml diamond game',icon:'game'},
    {title:'Top Up Free Fire',desc:'Diamond dan voucher game',href:'topup-game.html',keys:'free fire ff diamond game',icon:'game'},
    {title:'Top Up Game & Digital',desc:'Semua game, voucher, streaming',href:'topup-game.html',keys:'game voucher streaming top up digital',icon:'game'},
    {title:'Top Up Robux',desc:'Katalog khusus Roblox',href:'robux.html',keys:'robux roblox top up',icon:'robux'},
    {title:'APK Premium',desc:'Aplikasi premium pilihan',href:'apk-premium.html',keys:'apk premium netflix spotify aplikasi',icon:'gem'},
    {title:'Sewa Bot',desc:'Bot untuk grup dan komunitas',href:'sewa-bot.html',keys:'sewa bot whatsapp komunitas toko',icon:'bot'}
  ];
  const input=document.querySelector('#kivoGlobalSearch'),results=document.querySelector('#kivoSearchResults');
  function render(q=''){
    if(!results)return;
    const term=q.trim().toLowerCase();
    if(!term){results.innerHTML='';results.hidden=true;return}
    const found=catalog.filter(x=>(x.title+' '+x.desc+' '+x.keys).toLowerCase().includes(term)).slice(0,6);
    results.hidden=false;
    results.innerHTML=found.length?found.map(x=>`<a class="search-result" href="${x.href}"><span class="search-result-icon">${icons[x.icon]}</span><div><strong>${x.title}</strong><small>${x.desc}</small></div></a>`).join(''):'<div class="search-empty">Produk belum ditemukan. Coba kata lain.</div>';
  }
  input?.addEventListener('input',()=>render(input.value));
  document.querySelector('#kivoSearchForm')?.addEventListener('submit',e=>{e.preventDefault();render(input?.value||'');results?.querySelector('a')?.click()});
  document.querySelectorAll('[data-search-term]').forEach(b=>b.addEventListener('click',()=>{if(input){input.value=b.dataset.searchTerm||'';render(input.value);input.focus()}}));
  const target=Date.now()+6*60*60*1000;
  function tick(){const left=Math.max(0,target-Date.now()),h=Math.floor(left/3600000),m=Math.floor(left%3600000/60000),s=Math.floor(left%60000/1000);document.querySelector('#dealHours')?.replaceChildren(String(h).padStart(2,'0'));document.querySelector('#dealMinutes')?.replaceChildren(String(m).padStart(2,'0'));document.querySelector('#dealSeconds')?.replaceChildren(String(s).padStart(2,'0'))}
  tick();setInterval(tick,1000);
})();
