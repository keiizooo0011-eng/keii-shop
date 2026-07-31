(()=>{
  const $=s=>document.querySelector(s);
  let data={products:[],members:[],orders:[]},currentImage='',bound=false;
  const fmt=n=>'Rp'+Number(n||0).toLocaleString('id-ID');
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  async function waitAuth(timeout=12000){
    const start=Date.now();
    while(Date.now()-start<timeout){
      if(window.KivoAuth?.db){const s=await KivoAuth.session().catch(()=>null);if(s)return s;}
      await sleep(180);
    }
    return null;
  }
  async function api(url,opt={}){
    const h=await KivoAuth.authHeaders({'Content-Type':'application/json',...(opt.headers||{})});
    const r=await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`,{...opt,headers:h,cache:'no-store'});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw Object.assign(new Error(j.error||'Gagal memuat data.'),{status:r.status,data:j});
    return j;
  }
  function setStatus(mode,title,detail=''){
    const box=$('#adminStatus'); box.className=`system-state ${mode}`;
    box.querySelector('strong').textContent=title;
    $('#adminStatusText').textContent=detail;
    $('#retryAdmin').hidden=mode!=='error';
    $('#adminContent').hidden=mode!=='success';
  }
  function setupMessage(error){
    const msg=String(error?.message||'');
    if(/relation .*reseller_|does not exist|schema cache/i.test(msg)) return 'Tabel reseller belum terpasang. Jalankan file supabase_v38_reseller_center_repair.sql di Supabase SQL Editor.';
    return msg||'Gagal memuat Reseller Center.';
  }
  async function upload(file){
    if(!file)return currentImage;
    const sb=KivoAuth.db,cfg=window.KIVOPAY_CONFIG||{};
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
    const path=`reseller-products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const {error}=await sb.storage.from(cfg.storageBucket||'keiishop').upload(path,file,{cacheControl:'3600',upsert:false});
    if(error)throw new Error(`Upload foto gagal: ${error.message}`);
    return sb.storage.from(cfg.storageBucket||'keiishop').getPublicUrl(path).data.publicUrl;
  }
  async function boot(){
    setStatus('loading','Memuat Reseller Center...','Memeriksa akun admin dan database.');
    const s=await waitAuth();
    if(!s){location.replace('login.html?next=reseller-admin.html');return;}
    if(!await KivoAuth.isAdmin(s.user.id)){location.replace('index.html');return;}
    if(!bound){bind();bound=true;}
    await load();
  }
  function bind(){
    $('#productImage').onchange=e=>{const f=e.target.files?.[0];if(f)$('#imagePreview').src=URL.createObjectURL(f)};
    $('#deliveryMode').onchange=()=>$('#stockDataWrap').hidden=$('#deliveryMode').value!=='automatic';
    $('#resetProduct').onclick=reset;
    $('#saveSettings').onclick=saveSettings;
    $('#saveProduct').onclick=saveProduct;
    $('#refreshOrders').onclick=load;
    $('#retryAdmin').onclick=boot;
    document.addEventListener('click',handleClick);
  }
  async function load(){
    try{
      setStatus('loading','Mengambil data reseller...','Mohon tunggu sebentar.');
      data=await api('/api/admin-reseller');
      const s=data.settings||{};
      $('#joinPrice').value=Number(s.join_price??50000);
      $('#settingTitle').value=s.title||'Jual lebih mudah. Harga lebih rendah.';
      $('#settingSubtitle').value=s.subtitle||'Akses katalog khusus reseller dari satu dashboard.';
      $('#registrationOpen').checked=s.is_open!==false;
      renderProducts();renderOrders();renderMembers();renderStats();
      setStatus('success','Reseller Center siap','Pengaturan, produk, order, dan member berhasil dimuat.');
    }catch(e){setStatus('error','Reseller Center gagal dimuat',setupMessage(e));}
  }
  function renderStats(){
    $('#statProducts').textContent=(data.products||[]).length;
    $('#statMembers').textContent=(data.members||[]).filter(x=>x.status==='active').length;
    $('#statOrders').textContent=(data.orders||[]).length;
    $('#productListCount').textContent=(data.products||[]).length;
  }
  function variantsFromText(){return $('#productVariants').value.split('\n').map(x=>x.trim()).filter(Boolean).map(line=>{const [name,price]=line.split('|');return{name:(name||'Paket utama').trim(),price:Number(price||$('#productPrice').value||0)}})}
  function stockFromText(){return $('#stockData').value.split('\n').map(x=>x.trim()).filter(Boolean)}
  async function saveSettings(){
    const b=$('#saveSettings');try{b.disabled=true;b.textContent='Menyimpan...';await api('/api/admin-reseller',{method:'POST',body:JSON.stringify({action:'settings',join_price:+$('#joinPrice').value,title:$('#settingTitle').value.trim(),subtitle:$('#settingSubtitle').value.trim(),is_open:$('#registrationOpen').checked})});alert('Pengaturan reseller disimpan.');await load();}catch(e){alert(setupMessage(e));}finally{b.disabled=false;b.textContent='Simpan'}
  }
  async function saveProduct(){
    const b=$('#saveProduct');
    try{
      const name=$('#productName').value.trim();if(!name)throw new Error('Nama produk wajib diisi.');
      b.disabled=true;b.textContent='Menyimpan produk...';
      const image_url=await upload($('#productImage').files?.[0]);
      await api('/api/admin-reseller',{method:'POST',body:JSON.stringify({action:'product',id:$('#editingId').value||null,name,category:$('#productCategory').value,description:$('#productDescription').value.trim(),image_url,price:+$('#productPrice').value,stock:+$('#productStock').value,delivery_mode:$('#deliveryMode').value,requires_email:$('#requiresEmail').checked,sort_order:+$('#sortOrder').value,is_active:$('#activeProduct').checked,promo_text:$('#promoText').value.trim(),variants:variantsFromText(),stock_lines:stockFromText()})});
      reset(false);await load();alert('Produk reseller berhasil disimpan.');
    }catch(e){alert(setupMessage(e));}finally{b.disabled=false;b.textContent='Simpan Produk Reseller'}
  }
  function reset(scroll=true){
    ['editingId','productName','productDescription','productPrice','productStock','promoText','productVariants','stockData'].forEach(id=>$('#'+id).value='');
    $('#sortOrder').value=0;$('#deliveryMode').value='manual';$('#requiresEmail').checked=false;$('#activeProduct').checked=true;$('#imagePreview').src='icons/icon-512.png';$('#productImage').value='';currentImage='';$('#stockDataWrap').hidden=true;$('#productFormTitle').textContent='Tambah Produk Reseller';if(scroll)window.scrollTo({top:250,behavior:'smooth'});
  }
  function renderProducts(){
    $('#productList').innerHTML=(data.products||[]).map(p=>`<div class="row"><div class="product-meta"><img src="${esc(p.image_url||'icons/icon-512.png')}" onerror="this.src='icons/icon-512.png'"><div><strong>${esc(p.name)}</strong><small>${fmt(p.price)} · ${p.delivery_mode==='automatic'?'Otomatis':'Manual'} · Stok/slot ${Number(p.stock||0)} · ${p.is_active?'Aktif':'Nonaktif'}</small></div></div><div class="actions"><button data-edit="${p.id}">Edit</button><button class="danger" data-delete="${p.id}">Hapus</button></div></div>`).join('')||'<div class="empty-state">Belum ada produk reseller. Tambahkan produk pertama di formulir atas.</div>';
  }
  function renderOrders(){
    $('#orderList').innerHTML=(data.orders||[]).map(o=>`<div class="row"><div><strong>${esc(o.product_name)}</strong><small>${esc(o.invoice)} · ${esc(o.customer_name)} · ${esc(o.customer_contact)}${o.customer_email?' · '+esc(o.customer_email):''}</small><small>${fmt(o.amount)} · ${esc(o.status)}</small></div><div class="actions"><button data-order="${o.id}" data-status="processing">Proses</button><button data-order="${o.id}" data-status="completed">Selesai</button><button class="danger" data-order="${o.id}" data-status="cancelled">Batal</button></div></div>`).join('')||'<div class="empty-state">Belum ada pesanan reseller.</div>';
  }
  function renderMembers(){
    $('#memberList').innerHTML=(data.members||[]).map(m=>`<div class="row"><div><strong>${esc(m.reseller_code||'Reseller')}</strong><small>${esc(m.user_id)} · ${m.joined_at?new Date(m.joined_at).toLocaleDateString('id-ID'):'-'}</small></div><div class="actions"><span class="badge">${esc(m.status)}</span><button data-member="${m.id}" data-member-status="active">Aktifkan</button><button data-member="${m.id}" data-member-status="suspended">Suspend</button></div></div>`).join('')||'<div class="empty-state">Belum ada reseller terdaftar.</div>';
  }
  async function handleClick(e){
    try{
      const edit=e.target.closest('[data-edit]');if(edit){const p=data.products.find(x=>String(x.id)===String(edit.dataset.edit));if(!p)return;$('#editingId').value=p.id;$('#productName').value=p.name;$('#productCategory').value=p.category;$('#productDescription').value=p.description||'';$('#productPrice').value=p.price;$('#productStock').value=p.stock;$('#deliveryMode').value=p.delivery_mode;$('#requiresEmail').checked=!!p.requires_email;$('#sortOrder').value=p.sort_order||0;$('#activeProduct').checked=!!p.is_active;$('#promoText').value=p.promo_text||'';$('#productVariants').value=(p.variants||[]).map(v=>`${v.name}|${v.price}`).join('\n');currentImage=p.image_url||'';$('#imagePreview').src=currentImage||'icons/icon-512.png';$('#stockDataWrap').hidden=p.delivery_mode!=='automatic';$('#productFormTitle').textContent='Edit Produk Reseller';window.scrollTo({top:280,behavior:'smooth'});return;}
      const del=e.target.closest('[data-delete]');if(del&&confirm('Hapus produk reseller ini?')){await api('/api/admin-reseller?id='+encodeURIComponent(del.dataset.delete),{method:'DELETE'});await load();return;}
      const mb=e.target.closest('[data-member]');if(mb){await api('/api/admin-reseller',{method:'POST',body:JSON.stringify({action:'member',id:mb.dataset.member,status:mb.dataset.memberStatus})});await load();return;}
      const ob=e.target.closest('[data-order]');if(ob){const note=prompt('Catatan untuk pembeli (boleh kosong):','')??'';await api('/api/admin-reseller',{method:'POST',body:JSON.stringify({action:'order',id:ob.dataset.order,status:ob.dataset.status,admin_note:note})});await load();}
    }catch(err){alert(setupMessage(err));}
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();
