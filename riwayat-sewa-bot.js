(async()=>{
 const list=document.querySelector('#botOrderList'),msg=document.querySelector('#botMessage');
 const progress=document.querySelector('#pairingProgress');
 const progressTitle=document.querySelector('#pairingProgressTitle');
 const progressText=document.querySelector('#pairingProgressText');
 const progressSteps=[...document.querySelectorAll('[data-pair-step]')];
 const progressClose=document.querySelector('#pairingProgressClose');
 let progressTimer=null;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
 const money=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
 const date=v=>v?new Date(v).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'}):'-';
 const labels={creating:'Membuat bot',waiting_pairing:'Menunggu pairing',connecting:'Menghubungkan',connected:'Aktif',reconnecting:'Menyambungkan ulang',stopped:'Dihentikan',suspended:'Ditangguhkan',expired:'Kedaluwarsa',failed:'Gagal',error:'Bermasalah',logged_out:'Logout'};
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 async function headers(){const s=await KivoAuth.session();if(!s){location.href='login.html';throw new Error('Silakan login.')}return{Authorization:`Bearer ${s.access_token}`,'Content-Type':'application/json'}}
 async function api(options={}){const r=await fetch('/api/bot-orders',{...options,headers:{...(await headers()),...(options.headers||{})}});const b=await r.json().catch(()=>({}));if(!r.ok&&!b.pending)throw new Error(b.error||'Gagal memuat data.');return b}
 function processPanel(o){
  const active=['creating','connecting','reconnecting'].includes(o.status);
  if(!active)return'';
  const text=o.status==='creating'?'Menyiapkan session bot dan konfigurasi akun.':o.status==='reconnecting'?'Koneksi terputus. Sistem sedang mencoba menyambungkan ulang.':'Controller sedang menghubungkan bot ke layanan WhatsApp.';
  return `<div class="live-process"><div class="live-process-icon"><i></i><i></i><i></i></div><div><strong>${esc(labels[o.status]||'Sedang diproses')}</strong><span>${esc(text)}</span></div></div>`;
 }
 function render(orders){
  if(!orders.length){list.innerHTML='<div class="empty">Belum ada pesanan sewa bot.<br><br><a href="sewa-bot.html">Buka katalog Sewa Bot</a></div>';return}
  list.innerHTML=orders.map(o=>`<article class="bot-card" data-order="${esc(o.invoice)}"><div class="bot-card-head"><div><small>${esc(o.invoice)}</small><h3>${esc(o.product_name)}</h3><small>${esc(o.variant_name||'Paket utama')}</small></div><span class="status ${esc(o.status)}"><i></i>${esc(labels[o.status]||o.status)}</span></div>${processPanel(o)}<div class="bot-grid"><div><span>Nomor WhatsApp</span><strong>${esc(o.phone)}</strong></div><div><span>Harga</span><strong>${money(o.amount)}</strong></div><div><span>Nama bot / Prefix</span><strong>${esc(o.bot_name||'KEIINEXUS')} / ${esc(o.prefix||'.')}</strong></div><div><span>Masa aktif sampai</span><strong>${date(o.expires_at)}</strong></div></div>${o.status==='waiting_pairing'?`<div class="pairing"><div class="pairing-top"><span>PAIRING CODE</span><b>KODE SIAP DIGUNAKAN</b></div><strong>${esc(o.pairing_code||'Sedang dibuat...')}</strong><small>WhatsApp → Perangkat Tertaut → Tautkan dengan nomor telepon</small></div>`:''}${o.error_message?`<div class="bot-message order-error">${esc(o.error_message)}</div>`:''}<div class="actions">${o.pairing_code?`<button class="primary" data-copy="${esc(o.pairing_code)}">Salin Pairing Code</button>`:''}${!['expired','deleted','failed'].includes(o.status)?`<a class="plugin-link" href="plugin-store.html?invoice=${encodeURIComponent(o.invoice)}">Kelola Plugin</a><button data-act="restart" data-invoice="${esc(o.invoice)}">Restart Bot</button><button data-act="pairing" data-invoice="${esc(o.invoice)}" data-old-code="${esc(o.pairing_code||'')}">Buat Pairing Baru</button>`:''}</div></article>`).join('');bind()
 }
 function resetProgress(){
  clearInterval(progressTimer);progressTimer=null;
  progressSteps.forEach(s=>s.classList.remove('active','done','failed'));
  progressClose.hidden=true;
 }
 function setProgressStep(index,state='active'){
  progressSteps.forEach((s,i)=>{
   s.classList.remove('active','done','failed');
   if(i<index)s.classList.add('done');
   else if(i===index)s.classList.add(state);
  });
 }
 function openProgress(){
  resetProgress();
  progress.hidden=false;document.body.classList.add('pairing-open');
  progressTitle.textContent='Membuat pairing code baru';
  progressText.textContent='Jangan tutup halaman. Proses tetap berjalan meskipun koneksi sedikit lambat.';
  let index=0;setProgressStep(index);
  progressTimer=setInterval(()=>{if(index<3){index++;setProgressStep(index)}},3500);
 }
 function finishProgress(code){
  clearInterval(progressTimer);progressTimer=null;
  progressSteps.forEach(s=>{s.classList.remove('active','failed');s.classList.add('done')});
  progressTitle.textContent='Pairing code berhasil dibuat';
  progressText.textContent=code?`Kode ${code} sudah siap. Masukkan melalui menu Perangkat Tertaut di WhatsApp.`:'Kode pairing sudah tersedia di kartu pesanan.';
  progressClose.hidden=false;
 }
 function pendingProgress(){
  clearInterval(progressTimer);progressTimer=null;setProgressStep(3);
  progressTitle.textContent='Kode sedang disiapkan';
  progressText.textContent='Permintaan sudah diterima WhatsApp. KivoPay sedang menunggu kode tampil secara otomatis.';
 }
 function failProgress(text){
  clearInterval(progressTimer);progressTimer=null;setProgressStep(3,'failed');
  progressTitle.textContent='Kode belum berhasil dibuat';progressText.textContent=text||'Silakan coba kembali beberapa saat lagi.';progressClose.hidden=false;
 }
 function closeProgress(){progress.hidden=true;document.body.classList.remove('pairing-open')}
 progressClose.onclick=closeProgress;
 progress.addEventListener('click',e=>{if(e.target===progress&& !progressClose.hidden)closeProgress()});
 async function fetchInvoice(invoice){const b=await api({method:'GET'});const orders=b.orders||[];render(orders);return orders.find(o=>o.invoice===invoice)}
 async function waitForPairing(invoice,oldCode){
  pendingProgress();
  const started=Date.now();
  while(Date.now()-started<90000){
   await sleep(3000);
   try{
    const order=await fetchInvoice(invoice);
    if(!order)continue;
    if(order.pairing_code&&order.pairing_code!==oldCode){finishProgress(order.pairing_code);return}
    if(order.pairing_code&&['waiting_pairing'].includes(order.status)){finishProgress(order.pairing_code);return}
    if(['failed','error'].includes(order.status)){throw new Error(order.error_message||'Controller gagal membuat pairing code.')}
   }catch(e){if(!/timeout|aborted/i.test(e.message))throw e}
  }
  failProgress('Proses masih berjalan lebih lama dari biasanya. Tekan Muat Ulang beberapa saat lagi; kode akan tetap muncul ketika sudah siap.');
 }
 async function createPairing(button){
  const invoice=button.dataset.invoice,oldCode=button.dataset.oldCode||'';
  openProgress();button.disabled=true;
  try{
   const result=await api({method:'POST',body:JSON.stringify({invoice,action:'pairing'})});
   const code=result?.order?.pairing_code;
   if(code&&code!==oldCode){await load(false);finishProgress(code);return}
   await waitForPairing(invoice,oldCode);
  }catch(e){
   if(/timeout|aborted/i.test(e.message)){await waitForPairing(invoice,oldCode);return}
   failProgress(e.message);
  }finally{button.disabled=false}
 }
 function bind(){
  list.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);const old=b.textContent;b.textContent='Berhasil disalin';setTimeout(()=>b.textContent=old,1800)}catch{alert('Gagal menyalin kode.')}});
  list.querySelectorAll('[data-act]').forEach(b=>b.onclick=async()=>{
   if(b.dataset.act==='pairing'){await createPairing(b);return}
   b.disabled=true;const old=b.textContent;b.textContent='Memproses...';
   try{await api({method:'POST',body:JSON.stringify({invoice:b.dataset.invoice,action:b.dataset.act})});await load(false)}catch(e){alert(e.message)}finally{b.disabled=false;b.textContent=old}
  })
 }
 async function load(showMessage=true){if(showMessage)msg.textContent='Memuat status bot...';try{const b=await api();render(b.orders||[]);msg.textContent=''}catch(e){msg.textContent=e.message}}
 document.querySelector('#refreshBots').onclick=()=>load(true);
 await load();setInterval(()=>{if(progress.hidden)load(false)},8000);
})();
