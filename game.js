(()=>{
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const plainText=v=>{const doc=new DOMParser().parseFromString(String(v??''),'text/html');return (doc.body.textContent||'').replace(/\s+/g,' ').trim();};
const rupiah=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
const fallbackImage='https://img2.pixhost.to/images/9481/751089580_papaqueen.jpg';
let services=[],catalog=[],selectedService=null,currentCategory='games';

async function jsonFetch(url,opt){
  const r=await fetch(url,opt); const t=await r.text(); let d={};
  try{d=t?JSON.parse(t):{};}catch{throw new Error('Respons server tidak valid.');}
  if(!r.ok) throw new Error(d.error||'Terjadi kesalahan.'); return d;
}
function conf(name){return catalog.find(x=>String(x.vip_brand).toLowerCase()===String(name).toLowerCase())||{};}
function gameNames(){return [...new Set(services.map(x=>x.game).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'id'));}
function categoryOf(name){
  const n=String(name).toLowerCase();
  const streaming=['iqiyi','netflix','spotify','youtube','viu','vidio','wetv','disney','prime video','hbo','canva','capcut','alight motion','bstation','vision+','mola','loklok'];
  const voucher=['voucher','gift card','steam wallet','google play','itunes','playstation','xbox','garena shells','razergold','wallet'];
  const games=['mobile legends','free fire','genshin','valorant','pubg','honor of kings','roblox','ace racer','tower of fantasy','zenless','honkai','call of duty','arena breakout','point blank','fc mobile','efootball','clash','minecraft','zepeto','afk journey','age of empires'];
  if(streaming.some(k=>n.includes(k))) return 'streaming';
  if(voucher.some(k=>n.includes(k))) return 'voucher';
  if(games.some(k=>n.includes(k))) return 'games';
  return 'lainnya';
}
function displayPrice(s){return Number(s?.sell_price ?? (Number(s?.price||0)+(Number(s?.price||0)<10000?2000:3000)));}

async function loadData(){
  const [srv,cat]=await Promise.all([jsonFetch('/api/game-services'),jsonFetch('/api/game-catalog').catch(()=>({games:[]}))]);
  services=srv.services||[]; catalog=cat.games||[];
}

function renderCatalog(){
  const grid=$('#gameGrid'); if(!grid) return;
  const q=$('#gameSearch').value.trim().toLowerCase();
  const names=gameNames().filter(n=>categoryOf(n)===currentCategory && n.toLowerCase().includes(q));
  const titles={games:['KATALOG GAME','Game Populer'],streaming:['HIBURAN','Streaming Premium'],voucher:['VOUCHER DIGITAL','Voucher'],lainnya:['PRODUK DIGITAL','Lainnya']};
  $('#categoryEyebrow').textContent=titles[currentCategory][0]; $('#categoryTitle').textContent=titles[currentCategory][1];
  grid.innerHTML=names.length?names.map(n=>{
    const c=conf(n), count=services.filter(s=>s.game===n).length, title=c.display_name||n;
    return `<a class="vip-card" href="game-detail.html?game=${encodeURIComponent(n)}"><img src="${esc(c.image_url||fallbackImage)}" alt="${esc(title)}"><span class="vip-card-title">${esc(title)}</span><small>${count} paket</small></a>`;
  }).join(''):'<div class="empty-catalog">Belum ada produk di kategori ini.</div>';
}

function initCatalog(){
  document.querySelectorAll('.category-tab').forEach(btn=>btn.addEventListener('click',()=>{
    currentCategory=btn.dataset.category; document.querySelectorAll('.category-tab').forEach(x=>x.classList.toggle('active',x===btn)); renderCatalog();
  }));
  $('#gameSearch').addEventListener('input',renderCatalog);
  loadData().then(renderCatalog).catch(e=>$('#gameGrid').innerHTML=`<div class="empty-catalog">${esc(e.message)}</div>`);
}

function selectService(code){
  selectedService=services.find(x=>x.code===code)||null;
  document.querySelectorAll('.service-option').forEach(x=>x.classList.toggle('selected',x.dataset.code===code));
  $('#selectedServiceName').textContent=selectedService?.name||'Pilih produk';
  $('#selectedServiceDescription').textContent=plainText(selectedService?.description)||'Isi data tujuan dengan benar.';
  $('#gameSellPrice').textContent=rupiah(displayPrice(selectedService));
  $('#submitGameOrder').disabled=!selectedService;
  if(selectedService) applyServiceInputRules(selectedService);
}

function applyServiceInputRules(service){
  const game=String(service?.game||'').toLowerCase(), name=String(service?.name||'').toLowerCase(), desc=plainText(service?.description).toLowerCase();
  const category=categoryOf(service?.game||''), target=$('#gameTarget'), zone=$('#gameZone'), zoneLabel=$('#zoneLabel'), nick=$('#checkNicknameBtn');
  let targetLabel='User ID / ID tujuan', targetPlaceholder='Masukkan ID tujuan', zoneText='Zone / Server', zonePlaceholder='Masukkan zone/server', showZone=false, showNick=false;
  if(category==='streaming'){
    showNick=false; showZone=false;
    if(/nomor|phone|whatsapp|wa/.test(name+' '+desc)){targetLabel='Nomor / Email tujuan';targetPlaceholder='Masukkan nomor atau email aktif';}
    else if(/username|user name|akun/.test(name+' '+desc)){targetLabel='Email / Username akun';targetPlaceholder='Masukkan email atau username';}
    else if(/link|invite/.test(name+' '+desc)){targetLabel='Email / Link invite';targetPlaceholder='Masukkan email atau link invite';}
    else{targetLabel='Email tujuan';targetPlaceholder='Masukkan email aktif';}
  }else if(category==='voucher'){targetLabel='Email / Nomor tujuan';targetPlaceholder='Masukkan email atau nomor aktif';}
  else if(category==='games'){
    showNick=true;
    if(game.includes('mobile legends')){targetLabel='User ID';zoneText='Zone ID';showZone=true;}
    else if(game.includes('genshin')){targetLabel='UID';zoneText='Server';showZone=true;}
    else if(game.includes('free fire')){targetLabel='Player ID';}
    else{targetLabel='User ID / Player ID';showZone=/zone|server|data_zone|user id dan server/.test(name+' '+desc);}
  }
  $('#targetLabelText').textContent=targetLabel;target.placeholder=targetPlaceholder;$('#zoneLabelText').textContent=zoneText;zone.placeholder=zonePlaceholder;zoneLabel.hidden=!showZone;nick.hidden=!showNick;
}

function configureTargetFields(game){
  const category=categoryOf(game), name=String(game).toLowerCase();
  const target=$('#gameTarget'), zone=$('#gameZone'), zoneLabel=$('#zoneLabel'), nick=$('#checkNicknameBtn');
  let title='Masukkan Data Tujuan', hint='Pastikan data tujuan sudah benar.', targetLabel='User ID / ID tujuan', targetPlaceholder='Masukkan ID', zoneLabelText='Zone / Server', zonePlaceholder='Kosongkan jika tidak ada', showZone=true, showNick=category==='games';

  if(category==='streaming'){
    title='Masukkan Data Akun'; hint='Akun, link invite, atau kode akan diproses sesuai ketentuan produk.';
    targetLabel=name.includes('iqiyi')||name.includes('alight')||name.includes('spotify')?'Nomor / Email tujuan':'Email tujuan';
    targetPlaceholder=targetLabel.includes('Nomor')?'Masukkan nomor atau email':'Masukkan email aktif'; showZone=false; showNick=false;
  }else if(category==='voucher'){
    title='Masukkan Data Tujuan'; hint='Masukkan email atau nomor tujuan yang aktif.';
    targetLabel='Email / Nomor tujuan'; targetPlaceholder='Masukkan email atau nomor'; showZone=false; showNick=false;
  }else if(category==='lainnya'){
    targetLabel='Data tujuan'; targetPlaceholder='Masukkan data tujuan'; showZone=false; showNick=false;
  }else if(name.includes('mobile legends')){
    targetLabel='User ID'; targetPlaceholder='Contoh: 5363266446'; zoneLabelText='Zone ID'; zonePlaceholder='Contoh: 2685';
  }else if(name.includes('free fire')){
    targetLabel='Player ID'; targetPlaceholder='Masukkan Player ID'; showZone=false;
  }else if(name.includes('genshin')){
    targetLabel='UID'; targetPlaceholder='Masukkan UID'; zoneLabelText='Server'; zonePlaceholder='Pilih/isi server';
  }

  $('#targetSectionTitle').textContent=title; $('#targetSectionHint').textContent=hint;
  $('#targetLabelText').textContent=targetLabel; target.placeholder=targetPlaceholder;
  $('#zoneLabelText').textContent=zoneLabelText; zone.placeholder=zonePlaceholder;
  zoneLabel.hidden=!showZone; zone.required=false; nick.hidden=!showNick;
  $('#detailEyebrow').textContent=category==='streaming'?'PRODUK DIGITAL OTOMATIS':category==='voucher'?'VOUCHER OTOMATIS':'TOP UP OTOMATIS';
}

function initDetail(){
  const game=new URLSearchParams(location.search).get('game')||'';
  if(!game){location.href='topup-game.html';return;}
  configureTargetFields(game);
  loadData().then(()=>{
    const rows=services.filter(x=>x.game===game).sort((a,b)=>displayPrice(a)-displayPrice(b));
    const c=conf(game), title=c.display_name||game;
    document.title=`${title} — KivoPay`; $('#detailGameName').textContent=title; $('#detailGameImage').src=c.image_url||fallbackImage;
    $('#detailGameImage').onerror=()=>{$('#detailGameImage').src=fallbackImage;};
    $('#detailGameSummary').textContent=`${rows.length} produk tersedia. Pilih paket terbaik untuk kebutuhanmu.`;
    $('#serviceGrid').innerHTML=rows.length?rows.map(s=>`<button type="button" class="service-option" data-code="${esc(s.code)}"><span>${esc(s.name)}</span><strong>${rupiah(displayPrice(s))}</strong></button>`).join(''):'<p>Produk sedang tidak tersedia.</p>';
    document.querySelectorAll('.service-option').forEach(b=>b.onclick=()=>selectService(b.dataset.code));
  }).catch(e=>$('#serviceGrid').innerHTML=`<p>${esc(e.message)}</p>`);

  const storageKey='kivopay_target_'+encodeURIComponent(game);
  try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved){$('#gameTarget').value=saved.target||'';$('#gameZone').value=saved.zone||'';}}catch{}
  $('#saveTargetBtn').onclick=()=>{
    localStorage.setItem(storageKey,JSON.stringify({target:$('#gameTarget').value.trim(),zone:$('#gameZone').value.trim()}));
    $('#nicknameResult').textContent='✓ Data tujuan berhasil disimpan di perangkat ini.';
  };

  $('#checkNicknameBtn').onclick=async()=>{
    const target=$('#gameTarget').value.trim(),zone=$('#gameZone').value.trim();
    if(!selectedService)return $('#nicknameResult').textContent='Pilih produk terlebih dahulu.';
    if(!target)return $('#nicknameResult').textContent='Isi ID terlebih dahulu.';
    $('#nicknameResult').textContent='Mengecek nickname...';
    try{const d=await jsonFetch('/api/game-nickname',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:selectedService.code,target,zone})});$('#nicknameResult').textContent='✓ '+(d.nickname||'ID ditemukan');}
    catch(e){$('#nicknameResult').textContent='⚠ '+e.message;}
  };

  $('#gameOrderForm').onsubmit=async e=>{
    e.preventDefault(); if(!selectedService)return;
    const target=$('#gameTarget').value.trim(), customerName=$('#gameCustomerName').value.trim(), contact=$('#gameCustomerContact').value.trim();
    if(!target){$('#gameFormMessage').textContent='Data tujuan wajib diisi.';$('#gameTarget').focus();return;}
    if(!customerName||!contact){$('#gameFormMessage').textContent='Lengkapi nama dan kontak pembeli.';return;}
    const btn=$('#submitGameOrder'); btn.disabled=true; btn.querySelector('span').textContent='Membuat QRIS...'; $('#gameFormMessage').textContent='';
    try{
      const d=await jsonFetch('/api/create-game-order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({service:selectedService.code,target,zone:$('#gameZone').value.trim(),customer_name:customerName,customer_contact:contact})});
      sessionStorage.setItem('kivopay_game_payment_'+d.order.invoice,JSON.stringify(d.order));
      let history=[];try{history=JSON.parse(localStorage.getItem('kivopay_game_invoices')||'[]')}catch{}
      history=[d.order.invoice,...history.filter(x=>x!==d.order.invoice)].slice(0,100);localStorage.setItem('kivopay_game_invoices',JSON.stringify(history));
      location.href='payment-game.html?invoice='+encodeURIComponent(d.order.invoice);
    }catch(err){$('#gameFormMessage').textContent=err.message;btn.disabled=false;btn.querySelector('span').textContent='Lanjut Bayar QRIS';}
  };
}
if($('#gameGrid')) initCatalog();
if($('#gameOrderForm')) initDetail();
})();
