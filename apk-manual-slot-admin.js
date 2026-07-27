(()=>{
  const cfg=window.KIVOPAY_CONFIG||{};
  const db=window.supabase?.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

  async function loadApkManualSlots(){
    const select=$('#apkManualSlotProduct'),list=$('#apkManualSlotList'),message=$('#apkManualSlotMessage');
    if(!select||!list||!db)return;
    const {data,error}=await db.from('products').select('id,name,stock,is_active,delivery_mode').eq('category','apk-premium').eq('delivery_mode','manual').order('created_at',{ascending:false});
    if(error){if(message)message.textContent=error.message;return;}
    const products=data||[];
    select.innerHTML=products.length?products.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} — ${Number(p.stock||0)} slot</option>`).join(''):'<option value="">Belum ada produk APK manual</option>';
    select.disabled=!products.length;
    list.innerHTML=products.length?products.map(p=>`<article class="panel-stock-row"><div><small>SLOT PESANAN MANUAL</small><strong>${esc(p.name)}</strong><span>${p.is_active?'Aktif dijual':'Nonaktif'}</span></div><b>${Number(p.stock||0)}</b></article>`).join(''):'<div class="admin-users-empty">Buat produk APK Premium dengan mode pengiriman manual terlebih dahulu.</div>';
  }

  async function changeApkManualSlot(action){
    const productId=$('#apkManualSlotProduct')?.value;
    const amount=Math.floor(Number($('#apkManualSlotAmount')?.value||0));
    const message=$('#apkManualSlotMessage');
    if(!productId||amount<1){if(message)message.textContent='Pilih produk dan masukkan jumlah minimal 1.';return;}
    const {data:product,error:readError}=await db.from('products').select('id,name,stock').eq('id',productId).eq('category','apk-premium').eq('delivery_mode','manual').maybeSingle();
    if(readError||!product){if(message)message.textContent=readError?.message||'Produk APK manual tidak ditemukan.';return;}
    const current=Number(product.stock||0);
    const next=action==='set'?amount:action==='subtract'?Math.max(current-amount,0):current+amount;
    if(message)message.textContent='Memperbarui slot APK manual...';
    const {error}=await db.from('products').update({stock:next,updated_at:new Date().toISOString()}).eq('id',productId).eq('category','apk-premium').eq('delivery_mode','manual');
    if(error){if(message)message.textContent=error.message;return;}
    if(message)message.textContent=`Slot ${product.name} berhasil diperbarui: ${current} → ${next}.`;
    await loadApkManualSlots();
  }

  $('#apkManualSlotForm')?.addEventListener('submit',e=>{e.preventDefault();changeApkManualSlot('add')});
  document.querySelector('[data-apk-slot-action="set"]')?.addEventListener('click',()=>changeApkManualSlot('set'));
  document.querySelector('[data-apk-slot-action="subtract"]')?.addEventListener('click',()=>changeApkManualSlot('subtract'));
  document.querySelector('[data-admin-page-btn="apk-manual-slot"]')?.addEventListener('click',loadApkManualSlots);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.querySelector('[data-admin-page="apk-manual-slot"]')?.classList.contains('active'))loadApkManualSlots()});
})();
