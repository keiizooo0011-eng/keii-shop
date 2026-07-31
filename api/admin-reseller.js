import { optionalAuthUser } from './_auth-user.js';
import { adminClient } from './_lib.js';

async function assertAdmin(db,user){
  let result=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
  if(result.error&&/relation .*admin_users|does not exist|schema cache/i.test(result.error.message||'')){
    result=await db.from('admins').select('user_id').eq('user_id',user.id).maybeSingle();
  }
  if(result.error)throw result.error;
  if(!result.data){const e=new Error('Akses hanya untuk admin.');e.status=403;throw e;}
}
const sumStock=variants=>(variants||[]).reduce((n,v)=>n+Math.max(Number(v.stock||0),0),0);

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const user=await optionalAuthUser(req);
  if(!user)return res.status(401).json({error:'Unauthorized'});
  try{
    const db=adminClient(); await assertAdmin(db,user);
    if(req.method==='GET'){
      const [{data:settings},{data:products},{data:members},{data:orders}]=await Promise.all([
        db.from('reseller_settings').select('*').eq('id','main').maybeSingle(),
        db.from('reseller_catalog_products').select('*').order('sort_order'),
        db.from('reseller_memberships').select('*').order('joined_at',{ascending:false}),
        db.from('reseller_orders').select('*').order('created_at',{ascending:false}).limit(100)
      ]);
      return res.json({settings,products:products||[],members:members||[],orders:orders||[]});
    }
    if(req.method==='POST'){
      const a=String(req.body?.action||'');
      if(a==='settings'){
        const {data,error}=await db.from('reseller_settings').upsert({id:'main',is_open:!!req.body.is_open,join_price:Number(req.body.join_price||0),title:String(req.body.title||''),subtitle:String(req.body.subtitle||''),updated_at:new Date().toISOString()}).select().single();
        if(error)throw error; return res.json({settings:data});
      }
      if(a==='product'){
        const id=req.body.id||undefined;
        let variants=Array.isArray(req.body.variants)?req.body.variants:[];
        variants=variants.map((v,i)=>({
          name:String(v.name||`Paket ${i+1}`).trim(),
          normal_price:Number(v.normal_price||0),
          reseller_price:Number(v.reseller_price||0),
          delivery_mode:v.delivery_mode==='automatic'?'automatic':'manual',
          manual_type:(v.manual_type==='invite'||v.delivery_mode==='invite')?'invite':'standard',
          requires_email:v.manual_type==='invite'||v.delivery_mode==='invite'||v.requires_email===true,
          stock:Math.max(Number(v.stock||0),0)
        }));
        if(!variants.length)throw new Error('Minimal satu varian wajib dibuat.');
        const first=variants[0];
        const payload={
          name:String(req.body.name||'').trim(),category:String(req.body.category||'apk-premium'),description:String(req.body.description||'')||null,image_url:String(req.body.image_url||'')||null,
          normal_price:Math.min(...variants.map(v=>v.normal_price)),price:Math.min(...variants.map(v=>v.reseller_price)),stock:sumStock(variants),
          delivery_mode:first.delivery_mode,requires_email:first.requires_email,variants,promo_text:String(req.body.promo_text||'')||null,is_active:req.body.is_active!==false,sort_order:Number(req.body.sort_order||0),updated_at:new Date().toISOString()
        };
        if(!payload.name)throw new Error('Nama produk wajib diisi.');
        const q=id?db.from('reseller_catalog_products').update(payload).eq('id',id):db.from('reseller_catalog_products').insert(payload);
        const {data,error}=await q.select().single(); if(error)throw error;

        const original=Array.isArray(req.body.variants)?req.body.variants:[];
        const rows=[];
        original.forEach((v,i)=>{
          if(v.delivery_mode!=='automatic'||!Array.isArray(v.stock_lines))return;
          v.stock_lines.forEach(line=>{const content=String(line||'').trim();if(content)rows.push({product_id:data.id,variant_name:variants[i]?.name||'Paket utama',content});});
        });
        if(rows.length){
          const ins=await db.from('reseller_stock_items').insert(rows);if(ins.error)throw ins.error;
          const {data:available,error:ae}=await db.from('reseller_stock_items').select('variant_name').eq('product_id',data.id).eq('status','available');if(ae)throw ae;
          const counts={};(available||[]).forEach(x=>counts[x.variant_name]=(counts[x.variant_name]||0)+1);
          variants=variants.map(v=>v.delivery_mode==='automatic'?{...v,stock:Number(counts[v.name]||0)}:v);
          const upd=await db.from('reseller_catalog_products').update({variants,stock:sumStock(variants),updated_at:new Date().toISOString()}).eq('id',data.id).select().single();if(upd.error)throw upd.error;
          return res.json({product:upd.data});
        }
        return res.json({product:data});
      }
      if(a==='member'){
        const status=['active','suspended','expired'].includes(req.body.status)?req.body.status:'suspended';
        const {data,error}=await db.from('reseller_memberships').update({status,updated_at:new Date().toISOString()}).eq('id',req.body.id).select().single();if(error)throw error;return res.json({member:data});
      }
      if(a==='order'){
        const status=['processing','completed','cancelled'].includes(req.body.status)?req.body.status:'processing';
        const {data:o,error:oe}=await db.from('reseller_orders').select('*').eq('id',req.body.id).single();if(oe)throw oe;
        if(status==='cancelled'&&!o.refunded){
          const rf=await db.rpc('wallet_refund',{p_user_id:o.user_id,p_amount:Number(o.amount),p_reference:`REFUND:RESELLER:${o.invoice}`,p_description:`Refund reseller ${o.invoice}`,p_metadata:{order_id:o.id}});if(rf.error)throw rf.error;
          const {data:p}=await db.from('reseller_catalog_products').select('*').eq('id',o.product_id).single();
          if(p){const variants=(p.variants||[]).map(v=>v.name===o.variant_name?{...v,stock:Number(v.stock||0)+1}:v);await db.from('reseller_catalog_products').update({variants,stock:sumStock(variants)}).eq('id',p.id);}
        }
        const patch={status,admin_note:String(req.body.admin_note||'')||null,refunded:status==='cancelled'?true:o.refunded,completed_at:status==='completed'?new Date().toISOString():o.completed_at,updated_at:new Date().toISOString()};
        const {data,error}=await db.from('reseller_orders').update(patch).eq('id',o.id).select().single();if(error)throw error;return res.json({order:data});
      }
      return res.status(400).json({error:'Aksi tidak dikenal.'});
    }
    if(req.method==='DELETE'){
      const id=String(req.query?.id||'');const {error}=await db.from('reseller_catalog_products').delete().eq('id',id);if(error)throw error;return res.json({ok:true});
    }
    return res.status(405).json({error:'Method tidak diizinkan.'});
  }catch(e){const msg=e.message||'Gagal memproses admin reseller.';const setup=/relation .*reseller_|does not exist|schema cache/i.test(msg);return res.status(e.status||500).json({error:msg,setup_required:setup});}
}
