import { optionalAuthUser } from './_auth-user.js';
import { adminClient, invoiceId } from './_lib.js';
const sumStock=variants=>(variants||[]).reduce((n,v)=>n+Math.max(Number(v.stock||0),0),0);
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Method tidak diizinkan.'});
  const user=await optionalAuthUser(req);if(!user)return res.status(401).json({error:'Silakan masuk terlebih dahulu.'});
  let debited=false,amount=0,invoice='';
  try{
    const db=adminClient(),productId=String(req.body?.product_id||''),variantIndex=Number(req.body?.variant_index||0),customerName=String(req.body?.customer_name||'').trim(),customerContact=String(req.body?.customer_contact||'').trim(),customerEmail=String(req.body?.customer_email||'').trim().toLowerCase();
    if(!productId||!customerName||!customerContact)return res.status(400).json({error:'Data order belum lengkap.'});
    const {data:m}=await db.from('reseller_memberships').select('*').eq('user_id',user.id).eq('status','active').maybeSingle();if(!m)return res.status(403).json({error:'Akses reseller tidak aktif.'});
    const {data:p,error:pe}=await db.from('reseller_catalog_products').select('*').eq('id',productId).eq('is_active',true).maybeSingle();if(pe)throw pe;if(!p)return res.status(404).json({error:'Produk reseller tidak tersedia.'});
    const rawVariants=Array.isArray(p.variants)&&p.variants.length?p.variants:[{name:'Paket utama',normal_price:p.normal_price??p.price,reseller_price:p.price,delivery_mode:p.delivery_mode,requires_email:p.requires_email,stock:p.stock}];
    const variants=rawVariants.map((v,i)=>({...v,stock:v.stock!=null?Number(v.stock):(i===0?Number(p.stock||0):0)})),variant=variants[variantIndex]||variants[0];
    amount=Number(variant.reseller_price??p.price);const mode=variant.delivery_mode==='automatic'?'automatic':'manual',requiresEmail=variant.manual_type==='invite'||variant.requires_email===true;
    if(!Number.isFinite(amount)||amount<0)return res.status(400).json({error:'Harga reseller tidak valid.'});
    if(requiresEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))return res.status(400).json({error:'Masukkan email aktif terlebih dahulu.'});
    if(Number(variant.stock||0)<=0)return res.status(409).json({error:'Stok atau slot varian ini habis.'});
    invoice=invoiceId();
    const debit=await db.rpc('wallet_debit',{p_user_id:user.id,p_amount:amount,p_reference:`RESELLER-ORDER:${invoice}`,p_description:`Order reseller ${p.name}`,p_metadata:{reseller_product_id:p.id,invoice,variant:variant.name}});
    if(debit.error){if(String(debit.error.message||'').includes('INSUFFICIENT_BALANCE'))return res.status(402).json({error:'Saldo KivoPay tidak cukup.',need_deposit:true});throw debit.error}debited=true;
    let deliveryContent=null,status='pending';
    if(mode==='automatic'){
      const {data:stock,error:se}=await db.from('reseller_stock_items').select('*').eq('product_id',p.id).eq('status','available').eq('variant_name',String(variant.name||'Paket utama')).limit(1).maybeSingle();if(se)throw se;if(!stock)throw new Error('Stok otomatis untuk varian ini habis.');
      deliveryContent=stock.content;status='completed';await db.from('reseller_stock_items').update({status:'sold',sold_at:new Date().toISOString()}).eq('id',stock.id);
    }
    const {data:o,error:oe}=await db.from('reseller_orders').insert({invoice,user_id:user.id,reseller_code:m.reseller_code,product_id:p.id,product_name:p.name,variant_name:String(variant.name||'Paket utama'),amount,customer_name:customerName,customer_contact:customerContact,customer_email:requiresEmail?customerEmail:null,delivery_mode:mode,requires_email:requiresEmail,payment_method:'balance',status,delivery_content:deliveryContent,paid_at:new Date().toISOString(),completed_at:status==='completed'?new Date().toISOString():null}).select().single();if(oe)throw oe;
    const nextVariants=variants.map((v,i)=>i===variantIndex?{...v,stock:Math.max(Number(v.stock||0)-1,0)}:v);
    await db.from('reseller_catalog_products').update({variants:nextVariants,stock:sumStock(nextVariants),updated_at:new Date().toISOString()}).eq('id',p.id);
    return res.json({order:o,payment_method:'balance',balance_after:debit.data?.balance});
  }catch(e){if(debited&&user)try{await adminClient().rpc('wallet_refund',{p_user_id:user.id,p_amount:amount,p_reference:`REFUND:RESELLER:${invoice}`,p_description:`Refund ${invoice}`,p_metadata:{reason:e.message}})}catch{}return res.status(500).json({error:e.message||'Gagal membuat order reseller.'});}
}
