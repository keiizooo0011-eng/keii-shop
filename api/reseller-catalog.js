import { optionalAuthUser } from './_auth-user.js';
import { adminClient } from './_lib.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method tidak diizinkan.'});
 const user=await optionalAuthUser(req); if(!user)return res.status(401).json({error:'Silakan masuk terlebih dahulu.'});
 try{
  const db=adminClient();
  const {data:m}=await db.from('reseller_memberships').select('*').eq('user_id',user.id).eq('status','active').maybeSingle();
  if(!m)return res.status(403).json({error:'Akses reseller belum aktif.'});
  const {data,error}=await db.from('reseller_products').select('*,products(*)').eq('is_active',true).order('sort_order',{ascending:true}); if(error)throw error;
  const items=(data||[]).filter(x=>x.products?.is_active).map(x=>({id:x.id,product_id:x.product_id,reseller_price:Number(x.reseller_price),variant_prices:x.variant_prices||{},is_exclusive:x.is_exclusive,promo_text:x.promo_text,product:x.products}));
  return res.json({membership:m,items});
 }catch(e){return res.status(500).json({error:e.message||'Gagal memuat katalog reseller.'});}
}
