(()=>{
const cfg=window.KIVOPAY_CONFIG||{};
const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
const ADMIN='8ea33b7c-1b1f-4fe6-a157-ae38595eef42';
const fallback='https://img2.pixhost.to/images/9481/751089580_papaqueen.jpg';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let rows=[],currentImage='',vipProducts=[],selectedVip=null;

async function jsonFetch(url){
  const r=await fetch(url);const text=await r.text();let data={};
  try{data=text?JSON.parse(text):{};}catch{throw new Error('Respons VIPayment tidak valid.');}
  if(!r.ok)throw new Error(data.error||'Gagal mengambil daftar VIPayment.');
  return data;
}
function normalizeName(v){return String(v||'').trim();}
function groupServices(services){
  const map=new Map();
  for(const s of services||[]){
    const brand=normalizeName(s.game);if(!brand)continue;
    if(!map.has(brand))map.set(brand,{brand,count:0,minPrice:Infinity,maxPrice:0});
    const item=map.get(brand),price=Number(s.sell_price??s.price??0);
    item.count++;if(price>0){item.minPrice=Math.min(item.minPrice,price);item.maxPrice=Math.max(item.maxPrice,price);}
  }
  return [...map.values()].map(x=>({...x,minPrice:Number.isFinite(x.minPrice)?x.minPrice:0})).sort((a,b)=>a.brand.localeCompare(b.brand,'id'));
}
function configuredSet(){return new Set(rows.map(x=>String(x.vip_brand).toLowerCase()));}
function formatPrice(n){return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));}
function friendlyName(brand){return normalizeName(brand).replace(/\s*\((global|brazil|indonesia)\)\s*/ig,' $1').replace(/\s+/g,' ').trim();}

async function auth(){
  const {data:{user}}=await sb.auth.getUser();
  if(!user||user.id!==ADMIN){$('#gameAdminAuth').innerHTML='<p>Akses ditolak. Login melalui dashboard admin terlebih dahulu.</p>';return;}
  $('#gameAdminAuth').hidden=true;$('#gameAdminPanel').hidden=false;
  await load();loadVipProducts();
}
async function upload(file){
  if(!file)return currentImage||fallback;
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
  const path=`games/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const {error}=await sb.storage.from(cfg.storageBucket||'keiishop').upload(path,file,{cacheControl:'3600'});
  if(error)throw error;
  return sb.storage.from(cfg.storageBucket||'keiishop').getPublicUrl(path).data.publicUrl;
}
async function load(){
  const {data,error}=await sb.from('game_catalog').select('*').order('sort_order');
  if(error)throw error;rows=data||[];
  $('#gameAdminList').innerHTML=rows.length?rows.map(x=>`<article class="admin-product-item"><img src="${esc(x.image_url||fallback)}"><div><strong>${esc(x.display_name)}</strong><span>${esc(x.vip_brand)} • Urutan ${x.sort_order} • ${x.is_active?'Aktif':'Nonaktif'}</span></div><div class="admin-item-actions"><button data-edit="${x.id}" class="ghost">Edit</button><button data-delete="${x.id}" class="ghost-danger">Hapus</button></div></article>`).join(''):'<p>Belum ada pengaturan foto. Pilih produk VIPayment di formulir atas.</p>';
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>edit(b.dataset.edit));
  document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>del(b.dataset.delete));
  renderVipList();
}
async function loadVipProducts(){
  $('#vipPickerStatus').textContent='Memuat katalog VIPayment...';
  try{
    const data=await jsonFetch('/api/game-services');
    vipProducts=groupServices(data.services||[]);
    $('#vipPickerStatus').textContent=`${vipProducts.length} produk ditemukan. Pilih satu produk.`;
    renderVipList();
  }catch(err){
    $('#vipPickerStatus').textContent=err.message;
    $('#vipPickerList').innerHTML='<div class="vip-empty">Daftar gagal dimuat. Pastikan IP Vercel sedang diizinkan di VIPayment, lalu buka ulang.</div>';
  }
}
function renderVipList(){
  if(!$('#vipPickerList')||!vipProducts.length)return;
  const q=$('#vipPickerSearch').value.trim().toLowerCase(),configured=configuredSet();
  const list=vipProducts.filter(x=>x.brand.toLowerCase().includes(q));
  $('#vipPickerList').innerHTML=list.length?list.map(x=>{
    const isConfigured=configured.has(x.brand.toLowerCase());
    return `<button type="button" class="vip-option ${isConfigured?'configured':''} ${selectedVip?.brand===x.brand?'active':''}" data-vip-brand="${esc(x.brand)}"><div><strong>${esc(x.brand)}</strong><span>${x.count} paket${x.minPrice?` • mulai ${formatPrice(x.minPrice)}`:''}${isConfigured?' • Sudah ditambahkan':''}</span></div><em>${isConfigured?'✓':'○'}</em></button>`;
  }).join(''):'<div class="vip-empty">Produk tidak ditemukan.</div>';
  document.querySelectorAll('[data-vip-brand]').forEach(btn=>btn.onclick=()=>chooseVip(btn.dataset.vipBrand));
}
function chooseVip(brand){
  selectedVip=vipProducts.find(x=>x.brand===brand)||{brand,count:0,minPrice:0,maxPrice:0};
  $('#vipBrand').value=selectedVip.brand;
  $('#vipPickerLabel').textContent=selectedVip.brand;
  if(!$('#gameCatalogId').value||!$('#displayName').value.trim())$('#displayName').value=friendlyName(selectedVip.brand);
  $('#vipPickerMeta').hidden=false;
  $('#vipPickerMeta').innerHTML=`<span class="vip-chip">${selectedVip.count||0} paket</span>${selectedVip.minPrice?`<span class="vip-chip">Mulai ${formatPrice(selectedVip.minPrice)}</span>`:''}`;
  closePicker();renderVipList();
}
function openPicker(){
  $('#vipPickerModal').hidden=false;document.body.style.overflow='hidden';
  $('#vipPickerSearch').value='';renderVipList();setTimeout(()=>$('#vipPickerSearch').focus(),80);
}
function closePicker(){$('#vipPickerModal').hidden=true;document.body.style.overflow='';}
function edit(id){
  const x=rows.find(r=>r.id===id);if(!x)return;
  $('#gameCatalogId').value=x.id;$('#vipBrand').value=x.vip_brand;$('#vipPickerLabel').textContent=x.vip_brand;
  $('#displayName').value=x.display_name;$('#gameSort').value=x.sort_order;$('#gameActive').checked=x.is_active;
  currentImage=x.image_url||'';$('#gameImagePreview').src=currentImage||fallback;$('#cancelGameEdit').hidden=false;
  selectedVip=vipProducts.find(v=>v.brand.toLowerCase()===String(x.vip_brand).toLowerCase())||{brand:x.vip_brand,count:0};
  $('#vipPickerMeta').hidden=false;$('#vipPickerMeta').innerHTML=`<span class="vip-chip">${selectedVip.count||0} paket</span><span class="vip-chip">Mode edit</span>`;
  scrollTo({top:0,behavior:'smooth'});renderVipList();
}
function reset(){
  $('#gameCatalogForm').reset();$('#gameCatalogId').value='';$('#vipBrand').value='';$('#vipPickerLabel').textContent='Pilih produk VIPayment';
  $('#vipPickerMeta').hidden=true;$('#gameActive').checked=true;$('#gameImagePreview').src=fallback;currentImage='';selectedVip=null;$('#cancelGameEdit').hidden=true;renderVipList();
}
async function del(id){if(!confirm('Hapus pengaturan produk ini?'))return;const {error}=await sb.from('game_catalog').delete().eq('id',id);if(error)return alert(error.message);await load();}

$('#openVipPicker').onclick=openPicker;$('#closeVipPicker').onclick=closePicker;
$('#vipPickerModal').onclick=e=>{if(e.target===$('#vipPickerModal'))closePicker();};
$('#vipPickerSearch').oninput=renderVipList;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#vipPickerModal').hidden)closePicker();});
$('#gameImage').onchange=e=>{const f=e.target.files[0];if(f)$('#gameImagePreview').src=URL.createObjectURL(f);};
$('#cancelGameEdit').onclick=reset;$('#refreshGames').onclick=async()=>{await load();await loadVipProducts();};
$('#gameCatalogForm').onsubmit=async e=>{
  e.preventDefault();const msg=$('#gameAdminMessage');
  if(!$('#vipBrand').value.trim()){msg.textContent='Pilih produk VIPayment terlebih dahulu.';openPicker();return;}
  msg.textContent='Menyimpan...';
  try{
    const image_url=await upload($('#gameImage').files[0]);
    const payload={vip_brand:$('#vipBrand').value.trim(),display_name:$('#displayName').value.trim(),image_url,is_active:$('#gameActive').checked,sort_order:Number($('#gameSort').value||0),updated_at:new Date().toISOString()};
    const id=$('#gameCatalogId').value;
    const q=id?sb.from('game_catalog').update(payload).eq('id',id):sb.from('game_catalog').insert(payload);
    const {error}=await q;if(error)throw error;
    msg.textContent='Tersimpan ✓';reset();await load();
  }catch(err){msg.textContent=err.message;}
};
auth();
})();
