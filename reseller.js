(()=>{
  const $=s=>document.querySelector(s);
  const fmt=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  async function waitAuth(timeout=12000){
    const started=Date.now();
    while(Date.now()-started<timeout){
      if(window.KivoAuth?.db){
        const session=await window.KivoAuth.session().catch(()=>null);
        if(session) return session;
      }
      await sleep(180);
    }
    return null;
  }

  async function api(url,opt={},tries=2){
    let last;
    for(let i=0;i<=tries;i++){
      try{
        const h=await KivoAuth.authHeaders({'Content-Type':'application/json',...(opt.headers||{})});
        const r=await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`,{...opt,headers:h,cache:'no-store'});
        const j=await r.json().catch(()=>({}));
        if(!r.ok) throw Object.assign(new Error(j.error||'Terjadi kesalahan.'),{status:r.status,data:j});
        return j;
      }catch(e){ last=e; if(i<tries) await sleep(650*(i+1)); }
    }
    throw last;
  }

  function setState(mode,message=''){
    $('#resellerLoading')?.toggleAttribute('hidden',mode!=='loading');
    $('#joinView')?.toggleAttribute('hidden',mode!=='join');
    $('#resellerError')?.toggleAttribute('hidden',mode!=='error');
    if(mode==='error' && $('#resellerErrorText')) $('#resellerErrorText').textContent=message||'Gagal memuat data reseller.';
  }

  function petals(){
    const host=$('.rs-petal-field'); if(!host||host.children.length)return;
    for(let i=0;i<14;i++){
      const p=document.createElement('i');
      p.style.setProperty('--x',`${Math.random()*100}vw`);
      p.style.setProperty('--d',`${9+Math.random()*12}s`);
      p.style.setProperty('--delay',`${-Math.random()*18}s`);
      p.style.setProperty('--size',`${5+Math.random()*8}px`);
      host.appendChild(p);
    }
  }

  function characterMotion(){
    const stage=$('#joinCharacter'); if(!stage)return;
    window.addEventListener('pointermove',e=>{
      if(innerWidth<760)return;
      stage.style.setProperty('--mx',`${(e.clientX/innerWidth-.5)*12}px`);
      stage.style.setProperty('--my',`${(e.clientY/innerHeight-.5)*8}px`);
    },{passive:true});
  }

  async function boot(){
    setState('loading');
    const session=await waitAuth();
    if(!session){ location.replace('login.html?next=reseller.html'); return; }
    try{
      const s=await api('/api/reseller-status');
      if(s.membership?.status==='active'){
        location.replace('reseller-dashboard.html');
        return;
      }
      $('#joinPrice').textContent=fmt(s.settings?.join_price);
      $('#joinBalance').textContent=fmt(s.balance);
      $('#joinBtn').disabled=!s.settings?.is_open;
      $('#joinNote').textContent=s.settings?.is_open?'Aktif otomatis setelah pembayaran saldo berhasil.':'Pendaftaran sedang ditutup.';
      setState('join');
    }catch(e){
      if(e.status===401){ location.replace('login.html?next=reseller.html'); return; }
      setState('error',e.message);
    }
  }

  $('#retryReseller')?.addEventListener('click',boot);
  $('#joinBtn')?.addEventListener('click',async()=>{
    if(!confirm('Biaya reseller akan dipotong dari Saldo KivoPay. Lanjutkan?'))return;
    const btn=$('#joinBtn');
    try{
      btn.disabled=true; btn.textContent='Memproses...';
      await api('/api/join-reseller',{method:'POST',body:'{}'},0);
      location.replace('reseller-dashboard.html');
    }catch(e){
      if(e.data?.need_deposit&&confirm(`${e.message}\nBuka halaman deposit?`)) location.href='deposit.html';
      else alert(e.message);
      btn.disabled=false; btn.textContent='Gabung Reseller';
    }
  });

  const start=()=>{petals();characterMotion();boot()};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start):start();
})();
