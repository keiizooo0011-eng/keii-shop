import { optionalAuthUser } from './_auth-user.js';
import { adminClient, invoiceId } from './_lib.js';
import { rumahOtp, safeSupplierError } from './_rumahotp.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({error:'Method tidak diizinkan.'});
  let debited=false, order=null, user=null, amount=0, invoice='';
  try{
    user=await optionalAuthUser(req);
    if(!user) return res.status(401).json({error:'Silakan login terlebih dahulu.'});
    const serviceId=Number(req.body?.service_id), numberId=Number(req.body?.number_id), operatorId=Number(req.body?.operator_id);
    const providerId=String(req.body?.provider_id||'').trim();
    if(!serviceId||!numberId||!providerId||!operatorId) return res.status(400).json({error:'Data aplikasi, negara, provider, atau operator belum lengkap.'});
    const db=adminClient();
    const {data:settings,error:settingsError}=await db.from('nokos_settings').select('*').eq('id',1).single();
    if(settingsError) throw settingsError;
    if(settings.enabled===false) return res.status(503).json({error:'Katalog Nokos sedang ditutup sementara.'});
    const [services,countries]=await Promise.all([rumahOtp('/v2/services'),rumahOtp('/v2/countries',{service_id:serviceId})]);
    const service=(services.data||[]).find(x=>Number(x.service_code)===serviceId);
    const country=(countries.data||[]).find(x=>Number(x.number_id)===numberId);
    const priceItem=(country?.pricelist||[]).find(x=>String(x.provider_id)===providerId && x.available!==false && Number(x.stock||0)>0);
    if(!service||!country||!priceItem) return res.status(409).json({error:'Layanan sudah berubah atau stok sedang habis. Silakan pilih ulang.'});
    const supplierPrice=Number(priceItem.price||0), margin=Math.max(0,Number(settings.global_margin||0));
    amount=supplierPrice+margin; invoice=invoiceId().replace('KIVO-','NOKOS-');
    const expiresAt=new Date(Date.now()+20*60*1000).toISOString();
    const insert=await db.from('nokos_orders').insert({invoice,user_id:user.id,service_id:serviceId,service_name:service.service_name,service_img:service.service_img,country_name:country.name,country_iso:country.iso_code,country_prefix:country.prefix,number_id:numberId,provider_id:providerId,operator_id:operatorId,supplier_price:supplierPrice,sell_price:amount,status:'creating',expires_at:expiresAt}).select('*').single();
    if(insert.error) throw insert.error; order=insert.data;
    const debit=await db.rpc('wallet_debit',{p_user_id:user.id,p_amount:amount,p_reference:`NOKOS:${invoice}`,p_description:`Nokos ${service.service_name} - ${country.name}`,p_metadata:{order_id:order.id,invoice}});
    if(debit.error){await db.from('nokos_orders').update({status:'failed',note:debit.error.message}).eq('id',order.id);if(String(debit.error.message).includes('INSUFFICIENT_BALANCE'))return res.status(402).json({error:'Saldo KivoPay tidak cukup.',need_deposit:true});throw debit.error;}
    debited=true;
    const supplier=await rumahOtp('/v2/orders',{number_id:numberId,provider_id:providerId,operator_id:operatorId});
    const d=supplier.data||{};
    const update={supplier_order_id:String(d.order_id||''),phone_number:String(d.phone_number||''),operator_name:String(d.operator||''),supplier_price:Number(d.price||supplierPrice),status:'received',supplier_status:'received',created_supplier_at:d.created_at?new Date(Number(d.created_at)).toISOString():null,expires_at:d.expired_at?new Date(Number(d.expired_at)).toISOString():expiresAt,supplier_raw:supplier,updated_at:new Date().toISOString()};
    const saved=await db.from('nokos_orders').update(update).eq('id',order.id).select('*').single();
    if(saved.error) throw saved.error;
    return res.status(200).json({success:true,order:publicOrder(saved.data)});
  }catch(e){
    console.error('CREATE NOKOS',e);
    if(debited&&user&&invoice){try{const db=adminClient();await db.rpc('wallet_refund',{p_user_id:user.id,p_amount:amount,p_reference:`REFUND:NOKOS:${invoice}`,p_description:`Pengembalian ${invoice}`,p_metadata:{reason:String(e.message||'supplier error')}});if(order)await db.from('nokos_orders').update({status:'failed',note:safeSupplierError(e),updated_at:new Date().toISOString()}).eq('id',order.id);}catch(refundError){console.error('NOKOS REFUND',refundError);}}
    return res.status(500).json({error:debited?'Pesanan gagal dibuat. Saldo sudah dikembalikan.':safeSupplierError(e)});
  }
}

function publicOrder(o){return {invoice:o.invoice,service_name:o.service_name,service_img:o.service_img,country_name:o.country_name,operator_name:o.operator_name,phone_number:o.phone_number,sell_price:o.sell_price,status:o.status,otp_code:o.otp_code,otp_message:o.otp_message,expires_at:o.expires_at,created_at:o.created_at};}
