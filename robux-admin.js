(() => {
  const cfg=window.KIVOPAY_CONFIG||{}; if(!window.supabase||!cfg.supabaseUrl)return;
  const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey), $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const rp=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
  let methods=[],packages=[];
  const msg=(el,t,type='')=>{if(el){el.textContent=t;el.className='admin-message '+type}};
  async function load(){
    const session=(await sb.auth.getSession()).data.session; if(!session)return;
    const [{data:m,error:me},{data:p,error:pe}]=await Promise.all([sb.from('robux_methods').select('*').order('sort_order'),sb.from('robux_packages').select('*').order('sort_order')]);
    if(me||pe){msg($('#robuxMethodMessage'),(me||pe).message,'error');return}
    methods=m||[];packages=p||[]; render();
  }
  function render(){
    $('#robuxAdminPackageMethod').innerHTML=methods.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('');
    $('#robuxAdminMethodList').innerHTML=methods.length?methods.map(m=>`<article class="admin-product-item"><div><strong>${esc(m.name)}</strong><span>${esc(m.slug)} • ${m.form_type}</span><small>${m.is_active?'Dibuka':'Ditutup'}</small></div><div class="item-actions"><button data-rm-edit="${m.id}">Edit</button><button data-rm-toggle="${m.id}">${m.is_active?'Tutup':'Buka'}</button><button class="danger" data-rm-delete="${m.id}">Hapus</button></div></article>`).join(''):'<p class="muted">Belum ada metode.</p>';
    $('#robuxAdminPackageList').innerHTML=packages.length?packages.map(p=>{const m=methods.find(x=>x.id===p.method_id);return `<article class="admin-product-item"><div><strong>${esc(p.label)}</strong><span>${esc(m?.name||'-')} • ${rp(p.price)}</span><small>${p.robux_amount} Robux • ${p.is_active?'Dibuka':'Ditutup'} • ${esc(p.eta||'-')}</small></div><div class="item-actions"><button data-rp-edit="${p.id}">Edit</button><button data-rp-toggle="${p.id}">${p.is_active?'Tutup':'Buka'}</button><button class="danger" data-rp-delete="${p.id}">Hapus</button></div></article>`}).join(''):'<p class="muted">Belum ada paket.</p>';
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
  $('#robuxMethodForm')?.addEventListener('submit',async e=>{e.preventDefault();const id=$('#robuxAdminMethodId').value,payload={name:$('#robuxAdminMethodName').value.trim(),slug:$('#robuxAdminMethodSlug').value.trim().toLowerCase().replace(/\s+/g,'-'),description:$('#robuxAdminMethodDescription').value.trim(),form_type:$('#robuxAdminMethodFormType').value,sort_order:Number($('#robuxAdminMethodSort').value||0),is_active:$('#robuxAdminMethodActive').checked,updated_at:new Date().toISOString()};const q=id?sb.from('robux_methods').update(payload).eq('id',id):sb.from('robux_methods').insert(payload);const{error}=await q;if(error)msg($('#robuxMethodMessage'),error.message,'error');else{msg($('#robuxMethodMessage'),'Metode tersimpan.','success');e.target.reset();$('#robuxAdminMethodId').value='';$('#cancelRobuxMethodEdit').hidden=true;load()}});
  $('#robuxPackageForm')?.addEventListener('submit',async e=>{e.preventDefault();const id=$('#robuxAdminPackageId').value,payload={method_id:$('#robuxAdminPackageMethod').value,robux_amount:Number($('#robuxAdminAmount').value),price:Number($('#robuxAdminPrice').value),label:$('#robuxAdminLabel').value.trim(),eta:$('#robuxAdminEta').value.trim(),sort_order:Number($('#robuxAdminPackageSort').value||0),is_active:$('#robuxAdminPackageActive').checked,updated_at:new Date().toISOString()};const q=id?sb.from('robux_packages').update(payload).eq('id',id):sb.from('robux_packages').insert(payload);const{error}=await q;if(error)msg($('#robuxPackageMessage'),error.message,'error');else{msg($('#robuxPackageMessage'),'Paket tersimpan.','success');e.target.reset();$('#robuxAdminPackageId').value='';$('#cancelRobuxPackageEdit').hidden=true;load()}});
  $('#cancelRobuxMethodEdit')?.addEventListener('click',()=>{$('#robuxMethodForm').reset();$('#robuxAdminMethodId').value='';$('#cancelRobuxMethodEdit').hidden=true});
  $('#cancelRobuxPackageEdit')?.addEventListener('click',()=>{$('#robuxPackageForm').reset();$('#robuxAdminPackageId').value='';$('#cancelRobuxPackageEdit').hidden=true});
  $('#refreshRobuxAdmin')?.addEventListener('click',load);
  setTimeout(load,1200);
})();
