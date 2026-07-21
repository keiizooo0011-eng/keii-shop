(() => {
  const cfg=window.KIVOPAY_CONFIG||{}; if(!window.supabase||!cfg.supabaseUrl)return;
  const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey), $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const rp=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
  let methods=[],packages=[],activeFilter='gamepass';
  const methodKind=m=>{
    const value=String(m?.form_type||m?.slug||m?.name||'').toLowerCase();
    if(value.includes('login')) return 'login';
    if(value.includes('username')||value.includes('user-name')||value.includes('usn')) return 'username';
    return 'gamepass';
  };
  const msg=(el,t,type='')=>{if(el){el.textContent=t;el.className='admin-message '+type}};
  async function load(){
    const session=(await sb.auth.getSession()).data.session; if(!session)return;
    const [{data:m,error:me},{data:p,error:pe}]=await Promise.all([sb.from('robux_methods').select('*').order('sort_order'),sb.from('robux_packages').select('*').order('sort_order')]);
    if(me||pe){msg($('#robuxMethodMessage'),(me||pe).message,'error');return}
    methods=m||[];packages=p||[]; render();
  }
  function render(){
    const labelMap={gamepass:'Gamepass',username:'Via Username',login:'Via Login'};
    const filteredMethods=methods.filter(m=>methodKind(m)===activeFilter);
    const filteredIds=new Set(filteredMethods.map(m=>String(m.id)));
    const filteredPackages=packages.filter(p=>filteredIds.has(String(p.method_id)));
    $('#robuxAdminPackageMethod').innerHTML=filteredMethods.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('');
    $('#robuxAdminMethodFormType').value=activeFilter;
    $('#robuxAdminMethodListTitle').textContent=`Metode ${labelMap[activeFilter]}`;
    $('#robuxAdminPackageListTitle').textContent=`Paket ${labelMap[activeFilter]}`;
    $('#robuxAdminMethodList').innerHTML=filteredMethods.length?filteredMethods.map(m=>`<article class="admin-product-item"><div><strong>${esc(m.name)}</strong><span>${esc(m.slug)} • ${labelMap[methodKind(m)]}</span><small>${m.is_active?'Dibuka':'Ditutup'}</small></div><div class="item-actions"><button data-rm-edit="${m.id}">Edit</button><button data-rm-toggle="${m.id}">${m.is_active?'Tutup':'Buka'}</button><button class="danger" data-rm-delete="${m.id}">Hapus</button></div></article>`).join(''):'<p class="muted">Belum ada metode pada kategori ini.</p>';
    $('#robuxAdminPackageList').innerHTML=filteredPackages.length?filteredPackages.map(p=>{const m=methods.find(x=>x.id===p.method_id);return `<article class="admin-product-item"><div><strong>${esc(p.label)}</strong><span>${esc(m?.name||'-')} • ${rp(p.price)}</span><small>${p.robux_amount} Robux • ${p.is_active?'Dibuka':'Ditutup'} • ${esc(p.eta||'-')}</small></div><div class="item-actions"><button data-rp-edit="${p.id}">Edit</button><button data-rp-toggle="${p.id}">${p.is_active?'Tutup':'Buka'}</button><button class="danger" data-rp-delete="${p.id}">Hapus</button></div></article>`}).join(''):'<p class="muted">Belum ada paket pada kategori ini.</p>';
    document.querySelectorAll('[data-rm-edit]').forEach(b=>b.onclick=()=>editMethod(b.dataset.rmEdit));
    document.querySelectorAll('[data-rp-edit]').forEach(b=>b.onclick=()=>editPackage(b.dataset.rpEdit));
    document.querySelectorAll('[data-rm-toggle]').forEach(b=>b.onclick=()=>toggle('robux_methods',b.dataset.rmToggle));
    document.querySelectorAll('[data-rp-toggle]').forEach(b=>b.onclick=()=>toggle('robux_packages',b.dataset.rpToggle));
    document.querySelectorAll('[data-rm-delete]').forEach(b=>b.onclick=()=>del('robux_methods',b.dataset.rmDelete));
    document.querySelectorAll('[data-rp-delete]').forEach(b=>b.onclick=()=>del('robux_packages',b.dataset.rpDelete));
  }
  async function toggle(table,id){const row=(table==='robux_methods'?methods:packages).find(x=>String(x.id)===String(id));const{error}=await sb.from(table).update({is_active:!row.is_active,updated_at:new Date().toISOString()}).eq('id',id);if(error)alert(error.message);else load()}
  async function del(table,id){if(!confirm('Hapus data ini?'))return;const{error}=await sb.from(table).delete().eq('id',id);if(error)alert(error.message);else load()}
  function editMethod(id){const m=methods.find(x=>String(x.id)===String(id));$('#robuxAdminMethodId').value=m.id;$('#robuxAdminMethodName').value=m.name;$('#robuxAdminMethodSlug').value=m.slug;$('#robuxAdminMethodDescription').value=m.description;$('#robuxAdminMethodFormType').value=m.form_type;$('#robuxAdminMethodSort').value=m.sort_order;$('#robuxAdminMethodActive').checked=m.is_active;$('#cancelRobuxMethodEdit').hidden=false}
  function editPackage(id){const p=packages.find(x=>String(x.id)===String(id));$('#robuxAdminPackageId').value=p.id;$('#robuxAdminPackageMethod').value=p.method_id;$('#robuxAdminAmount').value=p.robux_amount;$('#robuxAdminPrice').value=p.price;$('#robuxAdminLabel').value=p.label;$('#robuxAdminEta').value=p.eta||'';$('#robuxAdminPackageSort').value=p.sort_order;$('#robuxAdminPackageActive').checked=p.is_active;$('#cancelRobuxPackageEdit').hidden=false}
  $('#robuxMethodForm')?.addEventListener('submit',async e=>{e.preventDefault();const id=$('#robuxAdminMethodId').value,payload={name:$('#robuxAdminMethodName').value.trim(),slug:($('#robuxAdminMethodSlug').value.trim()||({gamepass:'gamepass',username:'via-username',login:'via-login'}[$('#robuxAdminMethodFormType').value])).toLowerCase().replace(/\s+/g,'-'),description:$('#robuxAdminMethodDescription').value.trim(),form_type:$('#robuxAdminMethodFormType').value,sort_order:Number($('#robuxAdminMethodSort').value||0),is_active:$('#robuxAdminMethodActive').checked,updated_at:new Date().toISOString()};const q=id?sb.from('robux_methods').update(payload).eq('id',id):sb.from('robux_methods').insert(payload);const{error}=await q;if(error)msg($('#robuxMethodMessage'),error.message,'error');else{msg($('#robuxMethodMessage'),'Metode tersimpan.','success');e.target.reset();$('#robuxAdminMethodId').value='';$('#cancelRobuxMethodEdit').hidden=true;load()}});
  $('#robuxPackageForm')?.addEventListener('submit',async e=>{e.preventDefault();const id=$('#robuxAdminPackageId').value,payload={method_id:$('#robuxAdminPackageMethod').value,robux_amount:Number($('#robuxAdminAmount').value),price:Number($('#robuxAdminPrice').value),label:$('#robuxAdminLabel').value.trim(),eta:$('#robuxAdminEta').value.trim(),sort_order:Number($('#robuxAdminPackageSort').value||0),is_active:$('#robuxAdminPackageActive').checked,updated_at:new Date().toISOString()};const q=id?sb.from('robux_packages').update(payload).eq('id',id):sb.from('robux_packages').insert(payload);const{error}=await q;if(error)msg($('#robuxPackageMessage'),error.message,'error');else{msg($('#robuxPackageMessage'),'Paket tersimpan.','success');e.target.reset();$('#robuxAdminPackageId').value='';$('#cancelRobuxPackageEdit').hidden=true;load()}});
  $('#cancelRobuxMethodEdit')?.addEventListener('click',()=>{$('#robuxMethodForm').reset();$('#robuxAdminMethodId').value='';$('#cancelRobuxMethodEdit').hidden=true});
  $('#cancelRobuxPackageEdit')?.addEventListener('click',()=>{$('#robuxPackageForm').reset();$('#robuxAdminPackageId').value='';$('#cancelRobuxPackageEdit').hidden=true});
  document.querySelectorAll('[data-robux-admin-filter]').forEach(btn=>btn.addEventListener('click',()=>{
    activeFilter=btn.dataset.robuxAdminFilter;
    document.querySelectorAll('[data-robux-admin-filter]').forEach(x=>x.classList.toggle('active',x===btn));
    $('#robuxMethodForm').reset(); $('#robuxAdminMethodId').value=''; $('#robuxAdminMethodFormType').value=activeFilter;
    load();
  }));
  $('#robuxAdminMethodFormType')?.addEventListener('change',e=>{activeFilter=e.target.value;document.querySelectorAll('[data-robux-admin-filter]').forEach(x=>x.classList.toggle('active',x.dataset.robuxAdminFilter===activeFilter));load();});
  $('#refreshRobuxAdmin')?.addEventListener('click',load);
  setTimeout(load,1200);
})();

(() => {
  const cfg=window.KIVOPAY_CONFIG||{}; if(!window.supabase||!cfg.supabaseUrl)return;
  const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey),$=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const rp=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
  const labels={pending:'Menunggu Bayar',paid:'Sudah Dibayar',processing:'Diproses',completed:'Selesai',cancelled:'Dibatalkan',failed:'Gagal'};
  async function loadRobuxOrders(){
    if(!$('#robuxAdminOrderList'))return;
    const {data,error}=await sb.from('robux_orders').select('*').order('created_at',{ascending:false});
    if(error){$('#robuxAdminOrderList').innerHTML=`<p class="muted">${esc(error.message)}</p>`;return}
    const rows=data||[];
    const paid=rows.filter(x=>['paid','processing'].includes(x.status)).length;
    $('#robuxOrderStats').innerHTML=`<span>Total <b>${rows.length}</b></span><span>Perlu diproses <b>${paid}</b></span><span>Selesai <b>${rows.filter(x=>x.status==='completed').length}</b></span>`;
    $('#robuxAdminOrderList').innerHTML=rows.length?rows.map(o=>`
      <article class="admin-product-item robux-order-item">
        <div><strong>${esc(o.invoice)} • ${esc(o.username)}</strong><span>${esc(o.method_name)} • ${esc(o.package_label)} • ${rp(o.payment_amount)}</span><small>${esc(o.whatsapp)} • ${new Date(o.created_at).toLocaleString('id-ID')}</small>
        ${o.password?`<details><summary>Data Via Login</summary><p>Password: <code>${esc(o.password)}</code></p><p>Backup: ${(Array.isArray(o.backup_codes)?o.backup_codes:[]).map(esc).join(' • ')}</p></details>`:''}</div>
        <div class="robux-order-controls">
          <select data-robux-order-status="${o.id}">${Object.entries(labels).map(([v,l])=>`<option value="${v}" ${o.status===v?'selected':''}>${l}</option>`).join('')}</select>
          <input data-robux-order-note="${o.id}" value="${esc(o.admin_note||'')}" placeholder="Catatan admin">
          <button data-save-robux-order="${o.id}">Simpan</button>
        </div>
      </article>`).join(''):'<p class="muted">Belum ada pesanan Robux.</p>';
    document.querySelectorAll('[data-save-robux-order]').forEach(btn=>btn.onclick=async()=>{
      const id=btn.dataset.saveRobuxOrder,status=document.querySelector(`[data-robux-order-status="${id}"]`).value,note=document.querySelector(`[data-robux-order-note="${id}"]`).value.trim();
      const patch={status,admin_note:note,updated_at:new Date().toISOString()};
      if(status==='processing')patch.processed_at=new Date().toISOString();
      if(status==='completed')patch.completed_at=new Date().toISOString();
      btn.disabled=true;btn.textContent='Menyimpan...';
      const {error}=await sb.from('robux_orders').update(patch).eq('id',id);
      if(error)alert(error.message);else await loadRobuxOrders();
    });
  }
  $('#refreshRobuxOrders')?.addEventListener('click',loadRobuxOrders);
  setTimeout(loadRobuxOrders,1500);
  setInterval(loadRobuxOrders,30000);
})();
