import { optionalAuthUser } from './_auth-user.js';
import { adminClient, invoiceId, publicOrder } from './_lib.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Method tidak diizinkan.'});
 const user=await optionalAuthUser(req); if(!user)return res.status(401).json({error:'Silakan masuk terlebih dahulu.'});
 let order=null,debited=false,amount=0,invoice='';
 try{
  const db=adminClient();
  const productId=String(req.body?.product_id||''); const variantIndex=Number(req.body?.variant_index||0);
  const customerName=String(req.body?.customer_name||'').trim(); const customerContact=String(req.body?.customer_contact||'').trim(); const customerEmail=String(req.body?.customer_email||'').trim().toLowerCase();
  if(!productId||!customerName||!customerContact)return res.status(400).json({error:'Data order belum lengkap.'});
  const {data:m}=await db.from('reseller_memberships').select('*').eq('user_id',user.id).eq('status','active').maybeSingle(); if(!m)return res.status(403).json({error:'Akses reseller tidak aktif.'});
  const {data:rp,error:rpe}=await db.from('reseller_products').select('*,products(*)').eq('product_id',productId).eq('is_active',true).maybeSingle(); if(rpe)throw rpe; if(!rp?.products?.is_active)return res.status(404).json({error:'Produk reseller tidak tersedia.'});
  const p=rp.products; const variants=Array.isArray(p.variants)&&p.variants.length?p.variants:[{name:'Paket utama',price:p.price}]; const variant=variants[variantIndex]||variants[0]; const variantName=String(variant.name||'Paket utama');
  amount=Number(rp.variant_prices?.[variantName] ?? rp.reseller_price); if(!Number.isFinite(amount)||amount<0)throw new Error('Harga reseller belum valid.');
  const manual=p.category==='panel-pterodactyl'||(p.category==='apk-premium'&&String(p.delivery_mode)==='manual'); const invite=manual&&p.requires_email===true;
  if(invite&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))return res.status(400).json({error:'Email aktif wajib diisi untuk produk invite.'});
  const compatible=variantName.toLowerCase()==='paket utama'?[variantName]:[variantName,'Paket utama'];
  const stockCheck=manual?{count:Number(p.stock||0),error:null}:await db.from('stock_items').select('id',{count:'exact',head:true}).eq('product_id',p.id).eq('status','available').in('variant_name',compatible);
  if(stockCheck.error)throw stockCheck.error; if(!Number(stockCheck.count||0))return res.status(409).json({error:'Stok atau slot produk sedang habis.'});
  invoice=invoiceId();
  const ins=await db.from('orders').insert({invoice,product_id:p.id,product_name:p.name,variant_name:variantName,amount,payment_amount:amount,unique_fee:0,customer_name:customerName,customer_contact:customerContact,customer_email:customerEmail||null,user_id:user.id,status:'pending',order_type:p.category,delivery_mode:manual?'manual':'automatic',requires_email:invite,payment_method:'balance',is_reseller_order:true,reseller_price:amount,reseller_code:m.reseller_code,expires_at:new Date(Date.now()+10*60000).toISOString()}).select('*').single(); if(ins.error)throw ins.error; order=ins.data;
  if(!manual){const reserved=await db.rpc('reserve_order_stock',{p_order_id:order.id});if(reserved.error)throw reserved.error;}
  const debit=await db.rpc('wallet_debit',{p_user_id:user.id,p_amount:amount,p_reference:`RESELLER-ORDER:${invoice}`,p_description:`Order reseller ${p.name}`,p_metadata:{order_id:order.id,invoice,reseller:true}});
  if(debit.error){if(String(debit.error.message||'').includes('INSUFFICIENT_BALANCE'))return res.status(402).json({error:'Saldo KivoPay tidak cukup.',need_deposit:true});throw debit.error;} debited=true;
  if(manual){const done=await db.rpc('complete_manual_balance_order',{p_order_id:order.id});if(done.error)throw done.error;}else{
   const {data:stock}=await db.from('stock_items').select('*').eq('order_id',order.id).eq('status','reserved').maybeSingle();if(!stock)throw new Error('Stok gagal diamankan.');
   await db.from('stock_items').update({status:'sold',sold_at:new Date().toISOString()}).eq('id',stock.id);
   await db.from('orders').update({status:'completed',paid_at:new Date().toISOString(),delivered_at:new Date().toISOString(),delivery_content:stock.content,updated_at:new Date().toISOString()}).eq('id',order.id);
   await db.from('products').update({stock:Math.max(Number(p.stock||0)-1,0),updated_at:new Date().toISOString()}).eq('id',p.id);
  }
  const {data:fresh}=await db.from('orders').select('*').eq('id',order.id).single();return res.json({order:publicOrder(fresh||order),payment_method:'balance',balance_after:debit.data?.balance});
 }catch(e){
  const db=adminClient(); if(debited&&user)try{await db.rpc('wallet_refund',{p_user_id:user.id,p_amount:amount,p_reference:`REFUND:RESELLER:${invoice}`,p_description:`Refund ${invoice}`,p_metadata:{reason:e.message}})}catch{}
  if(order){try{await db.rpc('release_order_stock',{p_order_id:order.id})}catch{};try{await db.from('orders').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',order.id)}catch{}}
  return res.status(500).json({error:e.message||'Gagal membuat order reseller.'});
 }
}
