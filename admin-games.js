(()=>{
const cfg=window.KIVOPAY_CONFIG||{};
const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
const ADMIN='8ea33b7c-1b1f-4fe6-a157-ae38595eef42';
const fallback='https://img2.pixhost.to/images/9481/751089580_papaqueen.jpg';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let rows=[],selectedVip=null,currentImage='',searchTimer=null,activeController=null,gameOrders=[],formSchema=[];
const searchCache=new Map();
const FIELD_TYPES=[['text','Teks'],['email','Email'],['tel','Nomor HP'],['password','Password'],['textarea','Textarea'],['select','Dropdown']];
const MAP_OPTIONS=[['target','data_no (data utama)'],['zone','data_zone (zone/server/password)'],['additional','post_additional_data'],['ignore','Hanya disimpan']];
function fieldId(){return 'field_'+Math.random().toString(36).slice(2,9)}
function defaultField(){return {id:fieldId(),key:'target',label:'User ID',type:'text',required:true,placeholder:'Masukkan User ID',options:[],mapTo:'target',sensitive:false,help:''}}
function normalizeSchema(value){
  let arr=Array.isArray(value)?value:[];
  return arr.map((f,i)=>({id:String(f.id||fieldId()),key:String(f.key||`field_${i+1}`).replace(/[^a-zA-Z0-9_]/g,'_'),label:String(f.label||`Field ${i+1}`),type:FIELD_TYPES.some(x=>x[0]===f.type)?f.type:'text',required:Boolean(f.required),placeholder:String(f.placeholder||''),options:Array.isArray(f.options)?f.options.map(String):[],mapTo:MAP_OPTIONS.some(x=>x[0]===f.mapTo)?f.mapTo:'ignore',sensitive:Boolean(f.sensitive||f.type==='password'),help:String(f.help||'')}));
}
function schemaFromEditor(){
  return [...document.querySelectorAll('.form-field-editor')].map(card=>({
    id:card.dataset.id,key:card.querySelector('[data-k="key"]').value.trim().replace(/[^a-zA-Z0-9_]/g,'_'),label:card.querySelector('[data-k="label"]').value.trim(),type:card.querySelector('[data-k="type"]').value,required:card.querySelector('[data-k="required"]').checked,placeholder:card.querySelector('[data-k="placeholder"]').value.trim(),options:card.querySelector('[data-k="options"]').value.split(/\n|,/).map(x=>x.trim()).filter(Boolean),mapTo:card.querySelector('[data-k="mapTo"]').value,sensitive:card.querySelector('[data-k="sensitive"]').checked,help:card.querySelector('[data-k="help"]').value.trim()
  })).filter(f=>f.key&&f.label);
}
function renderFormBuilder(){
  const box=$('#formBuilderList'); if(!box)return;
  box.innerHTML=formSchema.length?formSchema.map((f,i)=>`<article class="form-field-editor" data-id="${esc(f.id)}"><div class="form-field-editor-top"><strong>Field ${i+1}</strong><button type="button" class="remove-form-field" data-remove-field="${esc(f.id)}">Hapus</button></div><div class="form-field-editor-grid"><label>Label<input data-k="label" value="${esc(f.label)}" placeholder="Contoh: User ID"></label><label>Key<input data-k="key" value="${esc(f.key)}" placeholder="target"></label><label>Jenis<select data-k="type">${FIELD_TYPES.map(x=>`<option value="${x[0]}" ${x[0]===f.type?'selected':''}>${x[1]}</option>`).join('')}</select></label><label>Kirim sebagai<select data-k="mapTo">${MAP_OPTIONS.map(x=>`<option value="${x[0]}" ${x[0]===f.mapTo?'selected':''}>${x[1]}</option>`).join('')}</select></label><label>Placeholder<input data-k="placeholder" value="${esc(f.placeholder)}"></label><label>Petunjuk<input data-k="help" value="${esc(f.help)}"></label><label style="grid-column:1/-1">Opsi dropdown (satu per baris)<textarea data-k="options" ${f.type==='select'?'':'disabled'}>${esc((f.options||[]).join('\n'))}</textarea></label></div><div class="field-checks"><label><input type="checkbox" data-k="required" ${f.required?'checked':''}> Wajib</label><label><input type="checkbox" data-k="sensitive" ${f.sensitive?'checked':''}> Data sensitif</label></div></article>`).join(''):'<div class="form-preview-empty">Belum ada field. Klik “Tambah Field”.</div>';
  box.querySelectorAll('input,select,textarea').forEach(el=>el.addEventListener('input',()=>{formSchema=schemaFromEditor();const card=el.closest('.form-field-editor');if(el.dataset.k==='type'){card.querySelector('[data-k="options"]').disabled=el.value!=='select';}renderFormPreview()}));
  box.querySelectorAll('[data-remove-field]').forEach(b=>b.onclick=()=>{formSchema=schemaFromEditor().filter(x=>x.id!==b.dataset.removeField);renderFormBuilder();renderFormPreview()});
  renderFormPreview();
}
function renderFormPreview(){
  const box=$('#formBuilderPreview');if(!box)return;const schema=document.querySelector('.form-field-editor')?schemaFromEditor():formSchema;
  box.innerHTML=schema.length?schema.map(f=>`<label class="form-preview-field"><span>${esc(f.label)}${f.required?' *':''}</span>${f.type==='select'?`<select disabled><option>${esc(f.placeholder||'Pilih opsi')}</option>${f.options.map(o=>`<option>${esc(o)}</option>`).join('')}</select>`:f.type==='textarea'?`<textarea disabled placeholder="${esc(f.placeholder)}"></textarea>`:`<input disabled type="${f.type==='password'?'password':'text'}" placeholder="${esc(f.placeholder)}">`}</label>`).join(''):'<div class="form-preview-empty">Preview akan tampil di sini.</div>';
}
function suggestSchemaForBrand(brand){
  const n=String(brand||'').toLowerCase();
  if(n.includes('mobile legends')) return [{...defaultField(),key:'target',label:'User ID',mapTo:'target',placeholder:'Masukkan User ID'},{...defaultField(),id:fieldId(),key:'zone',label:'Zone ID',mapTo:'zone',placeholder:'Masukkan Zone ID'}];
  if(n.includes('genshin')) return [{...defaultField(),key:'target',label:'UID',mapTo:'target',placeholder:'Masukkan UID'},{...defaultField(),id:fieldId(),key:'server',label:'Server',type:'select',mapTo:'zone',placeholder:'Pilih server',options:['America','Asia','Europe','TW_HK_MO']}];
  if(n.includes('via login')) return [{...defaultField(),key:'account',label:'Email / Username',mapTo:'target',placeholder:'Masukkan email atau username'},{...defaultField(),id:fieldId(),key:'password',label:'Password',type:'password',mapTo:'zone',sensitive:true,placeholder:'Masukkan password'},{...defaultField(),id:fieldId(),key:'additional',label:'Kode keamanan / Catatan',type:'textarea',mapTo:'additional',required:false,sensitive:true,placeholder:'Masukkan backup code, PIN, nickname, atau catatan'}];
  if(/netflix|spotify|viu|vidio|iqiyi|alight|canva|capcut|stream/.test(n)) return [{...defaultField(),key:'email',label:'Email / Nomor Tujuan',type:'email',mapTo:'target',placeholder:'Masukkan email aktif'}];
  return [defaultField()];
}

async function jsonFetch(url,opts={}){
  const r=await fetch(url,opts);const text=await r.text();let data={};
  try{data=text?JSON.parse(text):{};}catch{throw new Error('Respons VIPayment tidak valid.');}
  if(!r.ok)throw new Error(data.error||'Gagal mengambil katalog VIPayment.');
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
function setPickerStatus(text,kind=''){$('#vipPickerStatus').className=`vip-picker-status ${kind}`;$('#vipPickerStatus').textContent=text;}
function showPickerMessage(text,kind='empty'){$('#vipPickerList').innerHTML=`<div class="vip-${kind}">${esc(text)}</div>`;}

async function auth(){
  const {data:{user}}=await sb.auth.getUser();
  if(!user||user.id!==ADMIN){$('#gameAdminAuth').innerHTML='<p>Akses ditolak. Login melalui dashboard admin terlebih dahulu.</p>';return;}
  $('#gameAdminAuth').hidden=true;$('#gameAdminPanel').hidden=false;await Promise.all([load(),loadProvider(),loadGameOrders()]);
}

async function loadProvider(){
  const box=$('#providerProfile');if(!box)return;box.innerHTML='<p>Memeriksa koneksi VIPayment...</p>';
  try{const data=await jsonFetch('/api/game-services?limit=1');const count=Number(data.total||data.services?.length||0);box.innerHTML=`<div class="provider-stat"><small>Status</small><strong class="provider-online">● Terhubung</strong></div><div class="provider-stat"><small>Gateway</small><strong>VIPayment VPS</strong></div><div class="provider-stat"><small>Layanan terbaca</small><strong>${count||'Aktif'}</strong></div><div class="provider-stat"><small>Mode</small><strong>Otomatis</strong></div>`;}catch(err){box.innerHTML=`<div class="provider-stat"><small>Status</small><strong class="provider-offline">● Terputus</strong></div><div class="provider-stat" style="grid-column:span 3"><small>Pesan</small><strong>${esc(err.message)}</strong></div>`;}
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
}
function renderResults(products){
  const configured=configuredSet();
  $('#vipPickerList').innerHTML=products.length?products.map(x=>{
    const isConfigured=configured.has(x.brand.toLowerCase());
    return `<button type="button" class="vip-option ${isConfigured?'configured':''} ${selectedVip?.brand===x.brand?'active':''}" data-vip-brand="${esc(x.brand)}"><div><strong>${esc(x.brand)}</strong><span>${x.count} paket${x.minPrice?` • mulai ${formatPrice(x.minPrice)}`:''}${isConfigured?' • Sudah ditambahkan':''}</span></div><em>${isConfigured?'✓':'›'}</em></button>`;
  }).join(''):'<div class="vip-empty">Produk tidak ditemukan.</div>';
  document.querySelectorAll('[data-vip-brand]').forEach(btn=>btn.onclick=()=>chooseVip(btn.dataset.vipBrand,products));
}
async function searchVipProducts(query){
  const q=normalizeName(query);
  if(q.length<2){
    if(activeController){activeController.abort();activeController=null;}
    setPickerStatus('Ketik minimal 2 huruf untuk mencari produk.');
    showPickerMessage('Contoh: ML, VIU, iQIYI, Canva, Alight Motion.');
    return;
  }
  const key=q.toLowerCase();
  if(searchCache.has(key)){
    const cached=searchCache.get(key);setPickerStatus(`${cached.length} produk ditemukan dari cache.`);renderResults(cached);return;
  }
  if(activeController)activeController.abort();
  activeController=new AbortController();
  setPickerStatus('Mencari produk...','loading');
  $('#vipPickerList').innerHTML='<div class="vip-loading"><span></span><p>Mengambil hasil yang cocok...</p></div>';
  try{
    const data=await jsonFetch(`/api/game-services?search=${encodeURIComponent(q)}&limit=80`,{signal:activeController.signal});
    const products=groupServices(data.services||[]).slice(0,20);
    searchCache.set(key,products);
    setPickerStatus(products.length?`${products.length} produk ditemukan.`:'Tidak ada hasil.');
    renderResults(products);
  }catch(err){
    if(err.name==='AbortError')return;
    setPickerStatus(err.message,'error');
    showPickerMessage('Pencarian gagal. Coba lagi atau cek koneksi gateway VIPayment.','error');
  }finally{activeController=null;}
}
function chooseVip(brand,products=[]){
  selectedVip=products.find(x=>x.brand===brand)||{brand,count:0,minPrice:0,maxPrice:0};
  $('#vipBrand').value=selectedVip.brand;$('#vipPickerLabel').textContent=selectedVip.brand;
  if(!$('#gameCatalogId').value||!$('#displayName').value.trim())$('#displayName').value=friendlyName(selectedVip.brand);
  if(!$('#gameCatalogId').value&&!formSchema.length){formSchema=suggestSchemaForBrand(selectedVip.brand);renderFormBuilder();}
  $('#vipPickerMeta').hidden=false;
  $('#vipPickerMeta').innerHTML=`<span class="vip-chip">${selectedVip.count||0} paket</span>${selectedVip.minPrice?`<span class="vip-chip">Mulai ${formatPrice(selectedVip.minPrice)}</span>`:''}`;
  closePicker();
}
function openPicker(){
  $('#vipPickerModal').hidden=false;document.body.style.overflow='hidden';
  $('#vipPickerSearch').value='';
  setPickerStatus('Ketik minimal 2 huruf untuk mencari produk.');
  showPickerMessage('Pencarian dibuat ringan supaya admin tidak loading lama.');
  setTimeout(()=>$('#vipPickerSearch').focus(),80);
}
function closePicker(){
  if(activeController){activeController.abort();activeController=null;}
  $('#vipPickerModal').hidden=true;document.body.style.overflow='';
}
function edit(id){
  const x=rows.find(r=>r.id===id);if(!x)return;
  $('#gameCatalogId').value=x.id;$('#vipBrand').value=x.vip_brand;$('#vipPickerLabel').textContent=x.vip_brand;
  $('#displayName').value=x.display_name;$('#gameSort').value=x.sort_order;$('#gameActive').checked=x.is_active;
  currentImage=x.image_url||'';$('#gameImagePreview').src=currentImage||fallback;$('#cancelGameEdit').hidden=false;
  selectedVip={brand:x.vip_brand,count:0};formSchema=normalizeSchema(x.form_schema);renderFormBuilder();
  $('#vipPickerMeta').hidden=false;$('#vipPickerMeta').innerHTML='<span class="vip-chip">Mode edit</span>';
  scrollTo({top:0,behavior:'smooth'});
}
function reset(){
  $('#gameCatalogForm').reset();$('#gameCatalogId').value='';$('#vipBrand').value='';$('#vipPickerLabel').textContent='Pilih produk VIPayment';
  $('#vipPickerMeta').hidden=true;$('#gameActive').checked=true;$('#gameImagePreview').src=fallback;currentImage='';selectedVip=null;formSchema=[];renderFormBuilder();$('#cancelGameEdit').hidden=true;
}
async function del(id){if(!confirm('Hapus pengaturan produk ini?'))return;const {error}=await sb.from('game_catalog').delete().eq('id',id);if(error)return alert(error.message);await load();}

$('#openVipPicker').onclick=openPicker;$('#closeVipPicker').onclick=closePicker;
$('#vipPickerModal').onclick=e=>{if(e.target===$('#vipPickerModal'))closePicker();};
$('#vipPickerSearch').oninput=e=>{
  clearTimeout(searchTimer);const q=e.target.value;
  searchTimer=setTimeout(()=>searchVipProducts(q),350);
};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#vipPickerModal').hidden)closePicker();});
$('#gameImage').onchange=e=>{const f=e.target.files[0];if(f)$('#gameImagePreview').src=URL.createObjectURL(f);};
$('#cancelGameEdit').onclick=reset;$('#refreshGames').onclick=async()=>{searchCache.clear();await load();};$('#refreshProvider').onclick=loadProvider;
$('#gameCatalogForm').onsubmit=async e=>{
  e.preventDefault();const msg=$('#gameAdminMessage');
  if(!$('#vipBrand').value.trim()){msg.textContent='Pilih produk VIPayment terlebih dahulu.';openPicker();return;}
  msg.textContent='Menyimpan...';
  try{
    const image_url=await upload($('#gameImage').files[0]);
    formSchema=schemaFromEditor();
    if(!formSchema.length)throw new Error('Tambahkan minimal satu field data tujuan.');
    const mapped=formSchema.filter(f=>['target','zone','additional'].includes(f.mapTo));
    if(!mapped.some(f=>f.mapTo==='target'))throw new Error('Minimal satu field harus dikirim sebagai data_no.');
    const payload={vip_brand:$('#vipBrand').value.trim(),display_name:$('#displayName').value.trim(),image_url,is_active:$('#gameActive').checked,sort_order:Number($('#gameSort').value||0),form_schema:formSchema,updated_at:new Date().toISOString()};
    const id=$('#gameCatalogId').value;
    const q=id?sb.from('game_catalog').update(payload).eq('id',id):sb.from('game_catalog').insert(payload);
    const {error}=await q;if(error)throw error;
    msg.textContent='Tersimpan ✓';reset();await load();
  }catch(err){msg.textContent=err.message;}
};
function adminStatusLabel(s){return({pending:'Menunggu Bayar',paid:'Sudah Bayar',processing:'Diproses',completed:'Berhasil',failed:'Gagal',expired:'Kedaluwarsa'})[s]||s;}
function adminMask(k,v){return /password|pass|pin|backup|security|kode/i.test(String(k))?(v?'••••••••':'-'):String(v||'-');}
function adminFormData(o){const e=Object.entries(o.form_data||{});return e.length?`<div class="admin-order-formdata">${e.map(([k,v])=>`<div><small>${esc(k.replace(/_/g,' '))}</small><strong>${esc(adminMask(k,v))}</strong></div>`).join('')}</div>`:'';}
function adminDate(v){return v?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(v)):'-';}
function renderGameOrders(){
  const q=($('#adminGameOrderSearch')?.value||'').toLowerCase(),st=$('#adminGameOrderStatus')?.value||'all';
  const visible=gameOrders.filter(o=>(st==='all'||o.status===st)&&[o.invoice,o.game_name,o.service_name,o.target,o.zone,o.vip_trxid,o.customer_contact].join(' ').toLowerCase().includes(q));
  const completed=gameOrders.filter(o=>o.status==='completed').length,processing=gameOrders.filter(o=>o.status==='processing').length,pending=gameOrders.filter(o=>o.status==='pending').length;
  $('#adminGameOrderStats').innerHTML=`<span>Total <b>${gameOrders.length}</b></span><span>Pending <b>${pending}</b></span><span>Proses <b>${processing}</b></span><span>Berhasil <b>${completed}</b></span>`;
  $('#adminGameOrderList').innerHTML=visible.length?visible.map(o=>`<article class="admin-game-order-card"><div class="game-order-head"><div><small>${esc(o.invoice)}</small><h3>${esc(o.game_name)} — ${esc(o.service_name)}</h3><p>${esc(o.customer_name||'-')} • ${esc(o.customer_contact||'-')}</p></div><span class="history-status ${esc(o.status)}">${esc(adminStatusLabel(o.status))}</span></div><div class="game-order-info"><div><small>Tujuan</small><strong>${esc(o.target||'-')}${o.zone?` (${esc(o.zone)})`:''}</strong></div><div><small>ID Trx VIPayment</small><strong>${esc(o.vip_trxid||'Belum tersedia')}</strong></div><div><small>Total Bayar</small><strong>${formatPrice(o.payment_amount)}</strong></div><div><small>Dibuat</small><strong>${esc(adminDate(o.created_at))}</strong></div></div>${adminFormData(o)}<details><summary>Lihat log proses</summary><div class="admin-order-log"><p><b>QRIS dibuat:</b> ${esc(adminDate(o.created_at))}</p><p><b>Pembayaran:</b> ${esc(o.paid_at?adminDate(o.paid_at):'Belum diterima')}</p><p><b>Status provider:</b> ${esc(o.vip_status||'-')}</p><p><b>Catatan:</b> ${esc(o.note||'-')}</p><p><b>Selesai:</b> ${esc(o.completed_at?adminDate(o.completed_at):'-')}</p></div></details><div class="admin-order-note"><textarea data-game-note="${esc(o.id)}" placeholder="Catatan admin...">${esc(o.note||'')}</textarea><button type="button" data-save-game-note="${esc(o.id)}">Simpan Catatan</button></div></article>`).join(''):'<p>Tidak ada order yang cocok.</p>';
  document.querySelectorAll('[data-save-game-note]').forEach(b=>b.onclick=()=>saveGameOrderNote(b.dataset.saveGameNote));
}
async function loadGameOrders(){
  const box=$('#adminGameOrderList');if(!box)return;box.innerHTML='<p>Memuat order game...</p>';
  try{const {data:{session}}=await sb.auth.getSession();const data=await jsonFetch('/api/admin-game-orders?limit=150',{headers:{Authorization:`Bearer ${session?.access_token||''}`}});gameOrders=data.orders||[];renderGameOrders();}catch(err){box.innerHTML=`<p>${esc(err.message)}</p>`;}
}
async function saveGameOrderNote(id){const el=document.querySelector(`[data-game-note="${CSS.escape(id)}"]`);try{const {data:{session}}=await sb.auth.getSession();await jsonFetch('/api/admin-game-orders',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token||''}`},body:JSON.stringify({id,note:el?.value||''})});await loadGameOrders();}catch(err){alert(err.message);}}

$('#addFormField').onclick=()=>{formSchema=schemaFromEditor();formSchema.push(defaultField());renderFormBuilder();};renderFormBuilder();
$('#refreshGameOrders').onclick=loadGameOrders;$('#adminGameOrderSearch').oninput=renderGameOrders;$('#adminGameOrderStatus').onchange=renderGameOrders;
auth();
})();
