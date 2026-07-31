import { optionalAuthUser } from './_auth-user.js';
import { adminClient } from './_lib.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method tidak diizinkan.'});
  const user=await optionalAuthUser(req);if(!user)return res.status(401).json({error:'Silakan masuk terlebih dahulu.'});
  try{
    const db=adminClient();
    const {data:m}=await db.from('reseller_memberships').select('*').eq('user_id',user.id).eq('status','active').maybeSingle();if(!m)return res.status(403).json({error:'Akses reseller belum aktif.'});
    const {data,error}=await db.from('reseller_catalog_products').select('*').eq('is_active',true).order('sort_order');if(error)throw error;
    return res.json({membership:m,items:(data||[]).map(p=>{
      const raw=Array.isArray(p.variants)&&p.variants.length?p.variants:[{name:'Paket utama',normal_price:p.normal_price??p.price,reseller_price:p.price,delivery_mode:p.delivery_mode,requires_email:p.requires_email,stock:p.stock}];
      const variants=raw.map((v,i)=>({...v,stock:v.stock!=null?Number(v.stock):(i===0?Number(p.stock||0):0)}));
      return {id:p.id,product_id:p.id,normal_price:Math.min(...variants.map(v=>Number(v.normal_price??p.normal_price??p.price))),reseller_price:Math.min(...variants.map(v=>Number(v.reseller_price??p.price))),variant_prices:Object.fromEntries(variants.map(v=>[v.name,{normal_price:Number(v.normal_price??p.normal_price??p.price),reseller_price:Number(v.reseller_price??p.price),stock:Number(v.stock||0),delivery_mode:v.delivery_mode||p.delivery_mode,requires_email:v.requires_email===true||v.manual_type==='invite'}])),is_exclusive:true,promo_text:p.promo_text,product:{...p,variants,stock:variants.reduce((n,v)=>n+Number(v.stock||0),0)}};
    })});
  }catch(e){return res.status(500).json({error:e.message||'Gagal memuat katalog reseller.'});}
}
