(()=>{
  const $=s=>document.querySelector(s);
  const fmt=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
  const date=v=>v?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'-';
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let state={items:[],membership:null,balance:0,orders:[]};

  async function waitAuth(timeout=12000){
    const started=Date.now();
    while(Date.now()-started<timeout){
      if(window.KivoAuth?.db){
        const session=await KivoAuth.session().catch(()=>null);
        if(session)return session;
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
        if(!r.ok)throw Object.assign(new Error(j.error||'Terjadi kesalahan.'),{status:r.status,data:j});
        return j;
      }catch(e){last=e;if(i<tries)await sleep(650*(i+1));}
    }
    throw last;
  }
  function setView(mode,message=''){
    $('#dashboardLoading')?.toggleAttribute('hidden',mode!=='loading');
    $('#dashboardView')?.toggleAttribute('hidden',mode!=='ready');
    $('#dashboardError')?.toggleAttribute('hidden',mode!=='error');
    if(mode==='error'&&$('#dashboardErrorText'))$('#dashboardErrorText').textContent=message||'Gagal memuat dashboard reseller.';
  }
  function petals(){const host=$('.rs-petal-field');if(!host||host.children.length)return;for(let i=0;i<16;i++){const p=document.createElement('i');p.style.setProperty('--x',`${Math.random()*100}vw`);p.style.setProperty('--d',`${9+Math.random()*13}s`);p.style.setProperty('--delay',`${-Math.random()*18}s`);p.style.setProperty('--size',`${5+Math.random()*8}px`);host.appendChild(p)}}
  function animateCharacter(){const c=$('#dashboardCharacter');if(!c)return;window.addEventListener('pointermove',e=>{if(innerWidth<760)return;const x=(e.clientX/innerWidth-.5)*5,y=(e.clientY/innerHeight-.5)*4;c.style.setProperty('--rx',`${-y}deg`);c.style.setProperty('--ry',`${x}deg`)},{passive:true})}
  function rotateTips(){const tips=['Harga reseller aktif untuk produk pilihan.','Seluruh order reseller wajib memakai saldo utama.','Cek materi promosi sebelum mulai jualan.'];let i=0;setInterval(()=>{const b=$('#assistantBubble');if(!b)return;b.classList.remove('show');setTimeout(()=>{i=(i+1)%tips.length;b.textContent=tips[i];b.classList.add('show')},250)},5500);$('#assistantBubble')?.classList.add('show')}

  async function boot(){
    setView('loading');
    const session=await waitAuth();
    if(!session){location.replace('login.html?next=reseller-dashboard.html');return;}
    try{
      const s=await api('/api/reseller-status');
      if(s.membership?.status!=='active'){location.replace('reseller.html');return;}
      state.membership=s.membership; state.balance=Number(s.balance||0);
      $('#mainBalance').textContent=fmt(state.balance);
      $('#helloReseller').textContent=`Halo, ${session.user.user_metadata?.username||session.user.email?.split('@')[0]||'Reseller'}`;
      $('#resellerCode').textContent=state.membership.reseller_code||'Reseller KivoPay';
      const [catalog]=await Promise.all([api('/api/reseller-catalog'),loadOrders()]);
      state.items=catalog.items||[];
      $('#productCount').textContent=state.items.length;
      renderCatalog();
      setView('ready');
      petals(); animateCharacter(); rotateTips(); bindUI();
      openRequestedTab();
    }catch(e){
      if(e.status===401){location.replace('login.html?next=reseller-dashboard.html');return;}
      setView('error',e.message);
    }
  }

  function renderCatalog(q=''){
    const list=state.items.filter(x=>(x.product?.name||'').toLowerCase().includes(q.toLowerCase()));
    $('#catalogGrid').innerHTML=list.length?list.map((x,i)=>{
      const normal=Number(x.normal_price??x.product.normal_price??x.reseller_price),reseller=Number(x.reseller_price||0),showNormal=normal>reseller;
      return `<article class="rs-product" style="animation-delay:${i*55}ms"><img src="${escAttr(x.product.image_url||'icons/icon-512.png')}" alt=""><small>${x.is_exclusive?'KHUSUS RESELLER':'HARGA RESELLER'}</small><h3>${esc(x.product.name)}</h3><p>${esc(x.promo_text||x.product.description||'Produk digital pilihan KivoPay.')}</p><div class="price"><div><strong>${fmt(reseller)}</strong>${showNormal?`<del>${fmt(normal)}</del>`:''}</div><span>Stok ${Number(x.product.stock||0)}</span></div><a class="rs-order-link" href="reseller-checkout.html?product=${encodeURIComponent(x.product_id)}">Lihat & Order</a></article>`
    }).join(''):'<div class="rs-empty-state"><strong>Produk reseller belum tersedia</strong><p>Produk yang ditambahkan admin akan muncul di sini.</p></div>';
  }

  function statusMeta(status){
    const s=String(status||'pending').toLowerCase();
    if(s==='completed')return{label:'Selesai',cls:'completed',step:3};
    if(s==='processing')return{label:'Sedang Diproses',cls:'processing',step:2};
    if(['cancelled','canceled','failed'].includes(s))return{label:'Dibatalkan',cls:'cancelled',step:0};
    return{label:'Menunggu Diproses',cls:'pending',step:1};
  }
  function parseDelivery(raw){
    return String(raw||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map((line,i)=>{
      const m=line.match(/^([^:]{2,45}):\s*(.+)$/);
      return m?{key:m[1],value:m[2]}:{key:`Data ${i+1}`,value:line};
    });
  }
  function orderCard(o){
    const meta=statusMeta(o.status),fields=parseDelivery(o.delivery_content),hasData=fields.length>0;
    const note=String(o.admin_note||'').trim();
    return `<article class="rs-history-card ${meta.cls}" id="order-${escAttr(o.invoice)}">
      <div class="rs-history-head"><div><span class="rs-history-label">ORDER RESELLER</span><h3>${esc(o.product_name)}</h3><p>${esc(o.variant_name||'Paket utama')}</p></div><span class="rs-history-status ${meta.cls}">${meta.label}</span></div>
      <div class="rs-history-meta"><div><span>Invoice</span><strong>${esc(o.invoice)}</strong></div><div><span>Total</span><strong>${fmt(o.amount)}</strong></div><div><span>Dibuat</span><strong>${date(o.created_at)}</strong></div><div><span>Pembayaran</span><strong>Saldo KivoPay</strong></div></div>
      <div class="rs-timeline"><i class="done"></i><span class="${meta.step>=1?'done':''}">Pembayaran</span><i class="${meta.step>=2?'done':''}"></i><span class="${meta.step>=2?'done':''}">Diproses</span><i class="${meta.step>=3?'done':''}"></i><span class="${meta.step>=3?'done':''}">Selesai</span></div>
      ${hasData?`<section class="rs-delivery-box"><div class="rs-delivery-title"><div><small>DATA AKUN</small><strong>Produk siap digunakan</strong></div><button type="button" data-copy-all="${escAttr(o.delivery_content)}">Salin Semua</button></div>${fields.map(f=>`<div class="rs-delivery-row"><div><span>${esc(f.key)}</span><strong>${esc(f.value)}</strong></div><button type="button" data-copy="${escAttr(f.value)}">Salin</button></div>`).join('')}</section>`:`<section class="rs-progress-box"><strong>${meta.cls==='cancelled'?'Pesanan dibatalkan':meta.cls==='processing'?'Admin sedang memproses pesananmu':'Pesanan sudah masuk antrean'}</strong><p>${meta.cls==='cancelled'?'Lihat catatan admin atau hubungi Customer Service jika diperlukan.':meta.cls==='processing'?'Muat ulang halaman untuk melihat pembaruan data akun.':'Produk manual akan diproses admin. Produk otomatis langsung menampilkan data akun setelah berhasil.'}</p></section>`}
      ${note?`<section class="rs-admin-note"><small>CATATAN ADMIN</small><p>${esc(note)}</p></section>`:''}
      <div class="rs-history-actions"><button type="button" data-copy="${escAttr(o.invoice)}">Salin Invoice</button><button type="button" data-toggle-detail="${escAttr(o.invoice)}">${hasData?'Tutup Detail':'Lihat Detail'}</button></div>
    </article>`;
  }
  async function loadOrders(){
    const r=await api('/api/reseller-orders');
    state.orders=r.orders||[];
    $('#orderCount').textContent=state.orders.length;
    $('#orderList').innerHTML=state.orders.length?state.orders.map(orderCard).join(''):'<div class="rs-empty-state"><strong>Belum ada order reseller</strong><p>Order yang berhasil dibuat akan tersimpan permanen di sini.</p></div>';
  }
  function openRequestedTab(){
    const p=new URLSearchParams(location.search),tab=p.get('tab'),invoice=p.get('invoice');
    if(tab==='orders'||invoice)activateTab('orders');
    if(invoice)setTimeout(()=>document.getElementById(`order-${invoice}`)?.scrollIntoView({behavior:'smooth',block:'center'}),200);
  }
  function activateTab(name){
    document.querySelectorAll('.rs-tabs button,.rs-tab').forEach(x=>x.classList.remove('active'));
    document.querySelector(`.rs-tabs button[data-tab="${name}"]`)?.classList.add('active');
    $(`#${name}Tab`)?.classList.add('active');
  }
  function bindUI(){
    if(window.__resellerUiBound)return;window.__resellerUiBound=true;
    $('#searchProduct').oninput=e=>renderCatalog(e.target.value);
    document.querySelectorAll('.rs-tabs button').forEach(b=>b.onclick=()=>activateTab(b.dataset.tab));
    $('#copyPromo').onclick=async()=>{await navigator.clipboard.writeText($('#promoText').value);$('#copyPromo').textContent='Tersalin';setTimeout(()=>$('#copyPromo').textContent='Salin Teks',1300)};
    $('#orderList').addEventListener('click',async e=>{
      const copy=e.target.closest('[data-copy],[data-copy-all]');
      if(copy){const value=copy.dataset.copy??copy.dataset.copyAll;await navigator.clipboard.writeText(value);const old=copy.textContent;copy.textContent='Tersalin';setTimeout(()=>copy.textContent=old,1200);return;}
      const toggle=e.target.closest('[data-toggle-detail]');
      if(toggle){const card=toggle.closest('.rs-history-card');card.classList.toggle('detail-hidden');toggle.textContent=card.classList.contains('detail-hidden')?'Lihat Detail':'Tutup Detail';}
    });
  }
  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function escAttr(v){return esc(v).replace(/`/g,'&#96;')}
  $('#retryDashboard')?.addEventListener('click',boot);
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();
