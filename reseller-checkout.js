(()=>{
  const $=s=>document.querySelector(s);
  const fmt=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let state={item:null,balance:0};
  async function waitAuth(timeout=12000){const start=Date.now();while(Date.now()-start<timeout){if(window.KivoAuth?.db){const s=await KivoAuth.session().catch(()=>null);if(s)return s}await sleep(180)}return null}
  async function api(url,opt={}){const h=await KivoAuth.authHeaders({'Content-Type':'application/json',...(opt.headers||{})});const r=await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`,{...opt,headers:h,cache:'no-store'});const j=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(j.error||'Terjadi kesalahan.'),{status:r.status,data:j});return j}
  function show(mode,msg=''){['checkoutLoading','checkoutError','checkoutView'].forEach(id=>$('#'+id).hidden=id!==mode);if(mode==='checkoutError')$('#checkoutErrorText').textContent=msg}
  async function boot(){
    const session=await waitAuth();if(!session){location.replace('login.html?next='+encodeURIComponent(location.pathname+location.search));return}
    try{
      const id=new URLSearchParams(location.search).get('product');if(!id)throw new Error('Produk reseller belum dipilih.');
      const [status,catalog]=await Promise.all([api('/api/reseller-status'),api('/api/reseller-catalog')]);
      if(status.membership?.status!=='active'){location.replace('reseller.html');return}
      state.balance=Number(status.balance||0);state.item=(catalog.items||[]).find(x=>String(x.product_id)===String(id));if(!state.item)throw new Error('Produk reseller tidak ditemukan atau sudah tidak aktif.');
      render();show('checkoutView');
    }catch(e){if(e.status===401){location.replace('login.html?next='+encodeURIComponent(location.pathname+location.search));return}show('checkoutError',e.message)}
  }
  function variants(){const p=state.item.product;return Array.isArray(p.variants)&&p.variants.length?p.variants:[{name:'Paket utama',normal_price:p.normal_price??p.price,reseller_price:p.price}]}
  function selected(){return variants()[Number($('#variantSelect').value)||0]||variants()[0]}
  function prices(v){const mapped=state.item.variant_prices?.[v.name]||{};const reseller=Number(mapped.reseller_price??v.reseller_price??v.price??state.item.reseller_price??0);const normal=Number(mapped.normal_price??v.normal_price??state.item.normal_price??state.item.product.normal_price??reseller);return{normal,reseller}}
  function render(){const p=state.item.product;$('#checkoutImage').src=p.image_url||'icons/icon-512.png';$('#checkoutTitle').textContent=p.name;$('#checkoutDescription').textContent=state.item.promo_text||p.description||'Produk digital pilihan KivoPay.';$('#checkoutStock').textContent=Number(p.stock||0);$('#checkoutBalance').textContent=fmt(state.balance);$('#emailField').hidden=!p.requires_email;$('#buyerEmail').required=!!p.requires_email;$('#variantSelect').innerHTML=variants().map((v,i)=>`<option value="${i}">${escapeHtml(v.name||'Paket utama')}</option>`).join('');$('#variantSelect').onchange=updatePrice;updatePrice();$('#checkoutForm').onsubmit=submit}
  function updatePrice(){const {normal,reseller}=prices(selected());$('#normalPrice').textContent=fmt(normal);$('#normalPrice').hidden=normal<=reseller;$('#resellerPrice').textContent=fmt(reseller);$('#checkoutTotal').textContent=fmt(reseller);$('#submitOrder').disabled=Number(state.item.product.stock||0)<=0;$('#submitOrder').textContent=Number(state.item.product.stock||0)<=0?'Stok Habis':'Bayar dengan Saldo'}
  async function submit(e){e.preventDefault();const btn=$('#submitOrder'),msg=$('#orderMessage');msg.textContent='';const body={product_id:state.item.product_id,variant_index:Number($('#variantSelect').value),customer_name:$('#buyerName').value.trim(),customer_contact:$('#buyerWhatsapp').value.trim(),customer_email:$('#buyerEmail').value.trim()};try{btn.disabled=true;btn.textContent='Memproses pembayaran...';const r=await api('/api/create-reseller-order',{method:'POST',body:JSON.stringify(body)});const invoice=r.order?.invoice||'';$('#successInvoice').textContent=invoice?`Invoice ${invoice} berhasil disimpan.`:'Pesanan berhasil disimpan.';$('#viewHistory').href=`reseller-dashboard.html?tab=orders&invoice=${encodeURIComponent(invoice)}`;$('#successView').hidden=false}catch(err){msg.textContent=err.message;if(err.data?.need_deposit)msg.innerHTML+=` <a href="deposit.html">Deposit saldo</a>`;btn.disabled=false;btn.textContent='Bayar dengan Saldo'}}
  function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();
