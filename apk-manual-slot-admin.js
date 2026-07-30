(()=>{
  const cfg=window.KIVOPAY_CONFIG||{},db=window.supabase?.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey),$=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  let products=[];
  const modeLabel=p=>p.delivery_mode==='invite'?'Invite Email':'Manual Akun';
  async function loadApkManualSlots(){
    const select=$('#apkManualSlotProduct'),list=$('#apkManualSlotList'),message=$('#apkManualSlotMessage');
    if(!select||!list)return;
    if(message)message.textContent='Memuat slot APK manual dan invite...';
    const {data,error}=await db.from('products').select('id,name,stock,is_active,delivery_mode').eq('category','apk-premium').in('delivery_mode',['manual','invite']).order('created_at',{ascending:false});
    if(error){if(message)message.textContent=error.message;return;}
    products=data||[];
    select.innerHTML=products.length?products.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} — ${modeLabel(p)} — ${Number(p.stock||0)} slot</option>`).join(''):'<option value="">Belum ada produk manual atau invite</option>';
    list.innerHTML=products.length?products.map(p=>`<article class="panel-stock-row"><div><small>${p.delivery_mode==='invite'?'SLOT INVITE EMAIL':'SLOT PESANAN MANUAL'}</small><strong>${esc(p.name)}</strong><span>${modeLabel(p)} • ${p.is_active?'Aktif dijual':'Nonaktif'}</span></div><b>${Number(p.stock||0)}</b></article>`).join(''):'<div class="admin-users-empty">Buat produk APK Premium dengan mode Manual atau Manual Invite terlebih dahulu.</div>';
    if(message)message.textContent=`${products.length} produk manual/invite tersedia.`;
  }
  async function changeApkManualSlot(action){
    const productId=$('#apkManualSlotProduct')?.value,amount=Math.max(1,Number($('#apkManualSlotAmount')?.value||0)),message=$('#apkManualSlotMessage');
    if(!productId){if(message)message.textContent='Pilih produk APK manual atau invite terlebih dahulu.';return;}
    const {data:product,error:readError}=await db.from('products').select('id,name,stock,delivery_mode').eq('id',productId).eq('category','apk-premium').in('delivery_mode',['manual','invite']).maybeSingle();
    if(readError||!product){if(message)message.textContent=readError?.message||'Produk APK manual/invite tidak ditemukan.';return;}
    const current=Number(product.stock||0),next=action==='set'?amount:action==='subtract'?Math.max(0,current-amount):current+amount;
    if(message)message.textContent='Memperbarui slot APK manual/invite...';
    const {error}=await db.from('products').update({stock:next,updated_at:new Date().toISOString()}).eq('id',productId).eq('category','apk-premium').in('delivery_mode',['manual','invite']);
    if(error){if(message)message.textContent=error.message;return;}
    if(message)message.textContent=`Slot ${product.name} berhasil diubah menjadi ${next}.`;
    await loadApkManualSlots();
  }
  $('#apkManualSlotForm')?.addEventListener('submit',e=>{e.preventDefault();changeApkManualSlot('add')});
  document.querySelector('[data-apk-slot-action="set"]')?.addEventListener('click',()=>changeApkManualSlot('set'));
  document.querySelector('[data-apk-slot-action="subtract"]')?.addEventListener('click',()=>changeApkManualSlot('subtract'));
  document.querySelector('[data-admin-page-btn="apk-manual-slot"]')?.addEventListener('click',loadApkManualSlots);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.querySelector('[data-admin-page="apk-manual-slot"]')?.classList.contains('active'))loadApkManualSlots()});
})();
