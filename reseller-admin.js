(()=>{
  const $=s=>document.querySelector(s);
  let data={products:[],members:[],orders:[]},currentImage='',bound=false;
  const fmt=n=>'Rp'+Number(n||0).toLocaleString('id-ID');
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  async function waitAuth(timeout=12000){
    const start=Date.now();
    while(Date.now()-start<timeout){
      if(window.KivoAuth?.db){
        let s=await KivoAuth.session().catch(()=>null);
        if(!s){const refreshed=await KivoAuth.db.auth.refreshSession().catch(()=>null);s=refreshed?.data?.session||null;}
        if(s)return s;
      }
      await sleep(180);
    }
    return null;
  }
  async function api(url,opt={},retry=true){
    const request=async()=>{
      const session=await KivoAuth.session();
      if(!session?.access_token)throw Object.assign(new Error('Sesi admin tidak ditemukan.'),{status:401});
      const headers={'Content-Type':'application/json',...(opt.headers||{}),Authorization:`Bearer ${session.access_token}`};
      const r=await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`,{...opt,headers,cache:'no-store'});
      const j=await r.json().catch(()=>({}));
      return {r,j};
    };
    let {r,j}=await request();
    if(r.status===401&&retry){
      const refreshed=await KivoAuth.db.auth.refreshSession().catch(()=>null);
      if(refreshed?.data?.session)({r,j}=await request());
    }
    if(!r.ok)throw Object.assign(new Error(j.error||'Gagal memuat data.'),{status:r.status,data:j});
    return j;
  }
  function setStatus(mode,title,detail=''){const box=$('#adminStatus');box.className=`system-state ${mode}`;box.querySelector('strong').textContent=title;$('#adminStatusText').textContent=detail;$('#retryAdmin').hidden=mode!=='error';$('#adminContent').hidden=mode!=='success'}
  function setupMessage(error){const msg=String(error?.message||'');if(/relation .*reseller_|does not exist|schema cache/i.test(msg))return'Tabel reseller belum terpasang. Jalankan SQL reseller terbaru di Supabase.';return msg||'Gagal memuat Reseller Center.'}
  async function upload(file){if(!file)return currentImage;const sb=KivoAuth.db,cfg=window.KIVOPAY_CONFIG||{},ext=(file.name.split('.').pop()||'jpg').toLowerCase(),path=`reseller-products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;const {error}=await sb.storage.from(cfg.storageBucket||'keiishop').upload(path,file,{cacheControl:'3600',upsert:false});if(error)throw new Error(`Upload foto gagal: ${error.message}`);return sb.storage.from(cfg.storageBucket||'keiishop').getPublicUrl(path).data.publicUrl}

  function variantTemplate(v={}){
    const mode=v.delivery_mode||'manual', email=v.requires_email===true||mode==='invite';
    return `<article class="variant-row">
      <div class="variant-row-head"><strong>Varian Produk</strong><button type="button" class="danger remove-variant">Hapus</button></div>
      <div class="variant-grid">
        <label>Nama paket<input class="v-name" value="${esc(v.name||'Paket utama')}" placeholder="Contoh: 1 Bulan"></label>
        <label>Harga normal<input class="v-normal" type="number" min="0" value="${Number(v.normal_price??v.price??0)}" placeholder="500"></label>
        <label>Harga reseller<input class="v-reseller" type="number" min="0" value="${Number(v.reseller_price??v.price??0)}" placeholder="300"></label>
        <label>Mode pengiriman<select class="v-mode"><option value="manual" ${mode==='manual'?'selected':''}>Manual</option><option value="automatic" ${mode==='automatic'?'selected':''}>Otomatis</option><option value="invite" ${mode==='invite'?'selected':''}>Invite Email</option></select></label>
        <label class="v-stock-label">Stok / slot<input class="v-stock" type="number" min="0" value="${Number(v.stock||0)}" placeholder="10"></label>
        <label class="toggle v-email-toggle"><input class="v-email" type="checkbox" ${email?'checked':''}><span>Wajib email aktif</span></label>
        <label class="wide v-auto-wrap" ${mode==='automatic'?'':'hidden'}>Tambah stok otomatis <small>(email|password|catatan, satu akun per baris)</small><textarea class="v-auto-stock" rows="4" placeholder="email@gmail.com|password|catatan"></textarea></label>
      </div>
    </article>`;
  }
  function addVariant(v={}){$('#variantRows').insertAdjacentHTML('beforeend',variantTemplate(v));syncVariantModes()}
  function syncVariantModes(){document.querySelectorAll('.variant-row').forEach(row=>{const mode=row.querySelector('.v-mode').value,isAuto=mode==='automatic',isInvite=mode==='invite';row.querySelector('.v-auto-wrap').hidden=!isAuto;row.querySelector('.v-email').checked=isInvite||row.querySelector('.v-email').checked;row.querySelector('.v-email').disabled=isInvite;row.querySelector('.v-stock-label').firstChild.textContent=isAuto?'Stok tersedia':'Slot tersedia';})}
  function collectVariants(){return [...document.querySelectorAll('.variant-row')].map((row,index)=>{const mode=row.querySelector('.v-mode').value,name=row.querySelector('.v-name').value.trim()||`Paket ${index+1}`,normal=Number(row.querySelector('.v-normal').value||0),reseller=Number(row.querySelector('.v-reseller').value||0),stock=Number(row.querySelector('.v-stock').value||0),requiresEmail=mode==='invite'||row.querySelector('.v-email').checked;return{name,normal_price:normal,reseller_price:reseller,delivery_mode:mode==='invite'?'manual':mode,manual_type:mode==='invite'?'invite':'standard',requires_email:requiresEmail,stock,stock_lines:row.querySelector('.v-auto-stock').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)}})}

  async function boot(){setStatus('loading','Memuat Reseller Center...','Memeriksa akun admin dan database.');const s=await waitAuth();if(!s){location.replace('login.html?next=reseller-admin.html');return}if(!await KivoAuth.isAdmin(s.user.id)){location.replace('index.html');return}if(!bound){bind();bound=true}await load()}
  function bind(){
    $('#productImage').onchange=e=>{const f=e.target.files?.[0];if(f)$('#imagePreview').src=URL.createObjectURL(f)};
    $('#addVariant').onclick=()=>addVariant({});
    $('#variantRows').addEventListener('click',e=>{const del=e.target.closest('.remove-variant');if(del){if(document.querySelectorAll('.variant-row').length<=1)return alert('Minimal harus ada satu varian.');del.closest('.variant-row').remove()}});
    $('#variantRows').addEventListener('change',e=>{if(e.target.matches('.v-mode'))syncVariantModes()});
    $('#resetProduct').onclick=reset;$('#saveSettings').onclick=saveSettings;$('#saveProduct').onclick=saveProduct;$('#refreshOrders').onclick=load;$('#retryAdmin').onclick=boot;document.addEventListener('click',handleClick)
  }
  async function load(){try{setStatus('loading','Mengambil data reseller...','Mohon tunggu sebentar.');data=await api('/api/admin-reseller');const s=data.settings||{};$('#joinPrice').value=Number(s.join_price??50000);$('#settingTitle').value=s.title||'Jual lebih mudah. Harga lebih rendah.';$('#settingSubtitle').value=s.subtitle||'Akses katalog khusus reseller dari satu dashboard.';$('#registrationOpen').checked=s.is_open!==false;renderProducts();renderOrders();renderMembers();renderStats();setStatus('success','Reseller Center siap','Pengaturan, produk, order, dan member berhasil dimuat.')}catch(e){setStatus('error','Reseller Center gagal dimuat',setupMessage(e))}}
  function renderStats(){$('#statProducts').textContent=(data.products||[]).length;$('#statMembers').textContent=(data.members||[]).filter(x=>x.status==='active').length;$('#statOrders').textContent=(data.orders||[]).length;$('#productListCount').textContent=(data.products||[]).length}
  async function saveSettings(){const b=$('#saveSettings');try{b.disabled=true;b.textContent='Menyimpan...';await api('/api/admin-reseller',{method:'POST',body:JSON.stringify({action:'settings',join_price:+$('#joinPrice').value,title:$('#settingTitle').value.trim(),subtitle:$('#settingSubtitle').value.trim(),is_open:$('#registrationOpen').checked})});alert('Pengaturan reseller disimpan.');await load()}catch(e){alert(setupMessage(e))}finally{b.disabled=false;b.textContent='Simpan'}}
  async function saveProduct(){const b=$('#saveProduct');try{const name=$('#productName').value.trim();if(!name)throw new Error('Nama produk wajib diisi.');const variants=collectVariants();if(!variants.length)throw new Error('Tambahkan minimal satu varian.');if(variants.some(v=>!v.name||v.reseller_price<0))throw new Error('Data varian belum lengkap.');b.disabled=true;b.textContent='Menyimpan produk...';const image_url=await upload($('#productImage').files?.[0]);const first=variants[0],stock=variants.reduce((a,v)=>a+Number(v.stock||0),0),normal=Math.min(...variants.map(v=>Number(v.normal_price||0))),price=Math.min(...variants.map(v=>Number(v.reseller_price||0)));await api('/api/admin-reseller',{method:'POST',body:JSON.stringify({action:'product',id:$('#editingId').value||null,name,category:$('#productCategory').value,description:$('#productDescription').value.trim(),image_url,normal_price:normal,price,stock,delivery_mode:first.delivery_mode,requires_email:first.requires_email,sort_order:+$('#sortOrder').value,is_active:$('#activeProduct').checked,promo_text:$('#promoText').value.trim(),variants})});reset(false);await load();alert('Produk reseller berhasil disimpan.')}catch(e){alert(setupMessage(e))}finally{b.disabled=false;b.textContent='Simpan Produk Reseller'}}
  function reset(scroll=true){['editingId','productName','productDescription','promoText'].forEach(id=>$('#'+id).value='');$('#sortOrder').value=0;$('#activeProduct').checked=true;$('#imagePreview').src='icons/icon-512.png';$('#productImage').value='';currentImage='';$('#variantRows').innerHTML='';addVariant({name:'Paket utama',delivery_mode:'manual'});$('#productFormTitle').textContent='Tambah Produk Reseller';if(scroll)window.scrollTo({top:250,behavior:'smooth'})}
  function renderProducts(){$('#productList').innerHTML=(data.products||[]).map(p=>{const variants=Array.isArray(p.variants)&&p.variants.length?p.variants:[{name:'Paket utama',reseller_price:p.price,normal_price:p.normal_price,delivery_mode:p.delivery_mode,stock:p.stock}];const modes=[...new Set(variants.map(v=>v.manual_type==='invite'?'Invite':v.delivery_mode==='automatic'?'Otomatis':'Manual'))].join(', ');return `<div class="row"><div class="product-meta"><img src="${esc(p.image_url||'icons/icon-512.png')}" onerror="this.src='icons/icon-512.png'"><div><strong>${esc(p.name)}</strong><small>${variants.length} varian · ${modes} · Total stok/slot ${Number(p.stock||0)} · ${p.is_active?'Aktif':'Nonaktif'}</small></div></div><div class="actions"><button data-edit="${p.id}">Edit</button><button class="danger" data-delete="${p.id}">Hapus</button></div></div>`}).join('')||'<div class="empty-state">Belum ada produk reseller. Tambahkan produk pertama di formulir atas.</div>'}
  function renderOrders(){$('#orderList').innerHTML=(data.orders||[]).map(o=>`<div class="row"><div><strong>${esc(o.product_name)}</strong><small>${esc(o.invoice)} · ${esc(o.customer_name)} · ${esc(o.customer_contact)}${o.customer_email?' · '+esc(o.customer_email):''}</small><small>${fmt(o.amount)} · ${esc(o.status)}</small></div><div class="actions"><button data-order="${o.id}" data-status="processing">Proses</button><button data-order="${o.id}" data-status="completed">Selesai</button><button class="danger" data-order="${o.id}" data-status="cancelled">Batal</button></div></div>`).join('')||'<div class="empty-state">Belum ada pesanan reseller.</div>'}
  function renderMembers(){$('#memberList').innerHTML=(data.members||[]).map(m=>`<div class="row"><div><strong>${esc(m.reseller_code||'Reseller')}</strong><small>${esc(m.user_id)} · ${m.joined_at?new Date(m.joined_at).toLocaleDateString('id-ID'):'-'}</small></div><div class="actions"><span class="badge">${esc(m.status)}</span><button data-member="${m.id}" data-member-status="active">Aktifkan</button><button data-member="${m.id}" data-member-status="suspended">Suspend</button></div></div>`).join('')||'<div class="empty-state">Belum ada reseller terdaftar.</div>'}
  async function handleClick(e){try{const edit=e.target.closest('[data-edit]');if(edit){const p=data.products.find(x=>String(x.id)===String(edit.dataset.edit));if(!p)return;$('#editingId').value=p.id;$('#productName').value=p.name;$('#productCategory').value=p.category;$('#productDescription').value=p.description||'';$('#sortOrder').value=p.sort_order||0;$('#activeProduct').checked=!!p.is_active;$('#promoText').value=p.promo_text||'';currentImage=p.image_url||'';$('#imagePreview').src=currentImage||'icons/icon-512.png';$('#variantRows').innerHTML='';const raw=Array.isArray(p.variants)&&p.variants.length?p.variants:[{name:'Paket utama',normal_price:p.normal_price??p.price,reseller_price:p.price,delivery_mode:p.delivery_mode,requires_email:p.requires_email,stock:p.stock}];const variants=raw.map((v,i)=>({...v,stock:v.stock!=null?Number(v.stock):(i===0?Number(p.stock||0):0)}));variants.forEach(addVariant);$('#productFormTitle').textContent='Edit Produk Reseller';window.scrollTo({top:280,behavior:'smooth'});return}const del=e.target.closest('[data-delete]');if(del&&confirm('Hapus produk reseller ini?')){await api('/api/admin-reseller?id='+encodeURIComponent(del.dataset.delete),{method:'DELETE'});await load();return}const mb=e.target.closest('[data-member]');if(mb){await api('/api/admin-reseller',{method:'POST',body:JSON.stringify({action:'member',id:mb.dataset.member,status:mb.dataset.memberStatus})});await load();return}const ob=e.target.closest('[data-order]');if(ob){const note=prompt('Catatan untuk pembeli (boleh kosong):','')??'';await api('/api/admin-reseller',{method:'POST',body:JSON.stringify({action:'order',id:ob.dataset.order,status:ob.dataset.status,admin_note:note})});await load()}}catch(err){alert(setupMessage(err))}}
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',()=>{reset(false);boot()}):(()=>{reset(false);boot()})();
})();
