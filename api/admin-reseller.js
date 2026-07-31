import { optionalAuthUser } from './_auth-user.js';
import { adminClient } from './_lib.js';
async function assertAdmin(db,user){const {data}=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();if(!data)throw Object.assign(new Error('Akses admin diperlukan.'),{status:403});}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store'); const user=await optionalAuthUser(req);if(!user)return res.status(401).json({error:'Unauthorized'});
 try{const db=adminClient();await assertAdmin(db,user);
  if(req.method==='GET'){
   const [{data:settings},{data:products},{data:members},{data:allProducts}]=await Promise.all([
    db.from('reseller_settings').select('*').eq('id','main').maybeSingle(),
    db.from('reseller_products').select('*,products(id,name,category,price,stock,variants,is_active)').order('sort_order'),
    db.from('reseller_memberships').select('*').order('joined_at',{ascending:false}),
    db.from('products').select('id,name,category,price,stock,variants,is_active').order('name')
   ]);return res.json({settings,products:products||[],members:members||[],all_products:allProducts||[]});
  }
  if(req.method==='POST'){
   const action=String(req.body?.action||'');
   if(action==='settings'){const {data,error}=await db.from('reseller_settings').upsert({id:'main',is_open:!!req.body.is_open,join_price:Number(req.body.join_price||0),title:String(req.body.title||'KivoPay Reseller'),subtitle:String(req.body.subtitle||''),updated_at:new Date().toISOString()}).select('*').single();if(error)throw error;return res.json({settings:data});}
   if(action==='product'){const payload={product_id:String(req.body.product_id),reseller_price:Number(req.body.reseller_price||0),variant_prices:req.body.variant_prices||{},is_active:req.body.is_active!==false,is_exclusive:!!req.body.is_exclusive,sort_order:Number(req.body.sort_order||0),promo_text:String(req.body.promo_text||'')||null,updated_at:new Date().toISOString()};const {data,error}=await db.from('reseller_products').upsert(payload,{onConflict:'product_id'}).select('*').single();if(error)throw error;return res.json({product:data});}
   if(action==='member'){const status=['active','suspended','expired'].includes(req.body.status)?req.body.status:'suspended';const {data,error}=await db.from('reseller_memberships').update({status,updated_at:new Date().toISOString()}).eq('id',req.body.id).select('*').single();if(error)throw error;return res.json({member:data});}
   return res.status(400).json({error:'Aksi tidak dikenal.'});
  }
  if(req.method==='DELETE'){const id=String(req.query?.id||'');const {error}=await db.from('reseller_products').delete().eq('id',id);if(error)throw error;return res.json({ok:true});}
  return res.status(405).json({error:'Method tidak diizinkan.'});
 }catch(e){return res.status(e.status||500).json({error:e.message||'Gagal memproses reseller admin.'});}
}
