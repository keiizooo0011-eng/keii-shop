(()=>{
  const $=s=>document.querySelector(s);
  const fmt=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let state={items:[],membership:null,balance:0,current:null};

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
    }catch(e){
      if(e.status===401){location.replace('login.html?next=reseller-dashboard.html');return;}
      setView('error',e.message);
    }
  }

  function renderCatalog(q=''){const list=state.items.filter(x=>(x.product?.name||'').toLowerCase().includes(q.toLowerCase()));$('#catalogGrid').innerHTML=list.length?list.map((x,i)=>{const normal=Number(x.normal_price??x.product.normal_price??x.reseller_price),reseller=Number(x.reseller_price||0),showNormal=normal>reseller;return `<article class="rs-product" style="animation-delay:${i*55}ms"><img src="${x.product.image_url||'icons/icon-512.png'}" alt=""><small>${x.is_exclusive?'KHUSUS RESELLER':'HARGA RESELLER'}</small><h3>${esc(x.product.name)}</h3><p>${esc(x.promo_text||x.product.description||'Produk digital pilihan KivoPay.')}</p><div class="price"><div><strong>${fmt(reseller)}</strong>${showNormal?`<del>${fmt(normal)}</del>`:''}</div><span>Stok ${Number(x.product.stock||0)}</span></div><button data-buy="${x.product_id}">Order Sekarang</button></article>`}).join(''):'<p>Produk reseller belum tersedia.</p>'}
  async function loadOrders(){const r=await api('/api/reseller-orders');const data=r.orders||[];$('#orderCount').textContent=data.length;$('#orderList').innerHTML=data.map(o=>`<article class="rs-order"><div><strong>${esc(o.product_name)}</strong><small>${esc(o.invoice)} · ${esc(o.variant_name||'Paket')}</small>${o.admin_note?`<small>${esc(o.admin_note)}</small>`:''}</div><div><strong>${fmt(o.amount)}</strong><small>${esc(o.status)}</small></div></article>`).join('')||'<p>Belum ada order reseller.</p>'}
  function openOrder(id){state.current=state.items.find(x=>String(x.product_id)===String(id));if(!state.current)return;const p=state.current.product,v=Array.isArray(p.variants)&&p.variants.length?p.variants:[{name:'Paket utama'}];$('#modalTitle').textContent=p.name;$('#variantSelect').innerHTML=v.map((x,i)=>`<option value="${i}">${esc(x.name||'Paket utama')}</option>`).join('');$('#emailField').hidden=!p.requires_email;updatePrice();$('#orderModal').hidden=false}
  function updatePrice(){const p=state.current.product,v=p.variants?.[$('#variantSelect').value]||{name:'Paket utama'};const vp=state.current.variant_prices?.[v.name];$('#modalPrice').textContent=fmt(vp?.reseller_price??state.current.reseller_price)}
  function bindUI(){if(window.__resellerUiBound)return;window.__resellerUiBound=true;document.addEventListener('click',e=>{const b=e.target.closest('[data-buy]');if(b)openOrder(b.dataset.buy)});$('#variantSelect').onchange=updatePrice;$('#closeModal').onclick=()=>$('#orderModal').hidden=true;$('#orderModal').onclick=e=>{if(e.target===$('#orderModal'))$('#orderModal').hidden=true};$('#searchProduct').oninput=e=>renderCatalog(e.target.value);document.querySelectorAll('.rs-tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.rs-tabs button,.rs-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#'+b.dataset.tab+'Tab').classList.add('active')});$('#copyPromo').onclick=async()=>{await navigator.clipboard.writeText($('#promoText').value);$('#copyPromo').textContent='Tersalin';setTimeout(()=>$('#copyPromo').textContent='Salin Teks',1300)};$('#submitOrder').onclick=submitOrder}
  async function submitOrder(){const msg=$('#orderMessage');msg.textContent='';const body={product_id:state.current.product_id,variant_index:Number($('#variantSelect').value),customer_name:$('#buyerName').value.trim(),customer_contact:$('#buyerWhatsapp').value.trim(),customer_email:$('#buyerEmail').value.trim()};try{$('#submitOrder').disabled=true;$('#submitOrder').textContent='Memproses...';const r=await api('/api/create-reseller-order',{method:'POST',body:JSON.stringify(body)},0);state.balance=Number(r.balance_after??state.balance);$('#mainBalance').textContent=fmt(state.balance);$('#orderModal').hidden=true;await loadOrders();alert('Order reseller berhasil dibuat.')}catch(e){msg.textContent=e.message;if(e.data?.need_deposit)msg.innerHTML+=` <a href="deposit.html">Deposit saldo</a>`}finally{$('#submitOrder').disabled=false;$('#submitOrder').textContent='Bayar dengan Saldo'}}
  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  $('#retryDashboard')?.addEventListener('click',boot);
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();
