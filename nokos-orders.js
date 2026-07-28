import { optionalAuthUser } from './_auth-user.js';
import { adminClient } from './_lib.js';
import { rumahOtp, safeSupplierError } from './_rumahotp.js';

const pub=o=>({
 invoice:o.invoice,service_name:o.service_name,service_img:o.service_img,country_name:o.country_name,
 country_prefix:o.country_prefix,operator_name:o.operator_name,phone_number:o.phone_number,
 sell_price:o.sell_price,status:o.status,supplier_status:o.supplier_status,otp_code:o.otp_code,
 otp_message:o.otp_message,note:o.note,expires_at:o.expires_at,created_at:o.created_at,
 updated_at:o.updated_at,refund_status:o.refund_status,refunded_at:o.refunded_at
});

async function ensureCancelRefund(db,o){
 if(String(o.status||'').toLowerCase()!=='canceled') return o;
 if(o.refunded_at||String(o.refund_status||'').toLowerCase()==='refunded') return o;

 const amount=Math.max(0,Number(o.sell_price||0));
 if(!amount) return o;

 await db.from('nokos_orders').update({refund_status:'processing',updated_at:new Date().toISOString()}).eq('id',o.id);
 const {data,error}=await db.rpc('wallet_refund',{
  p_user_id:o.user_id,
  p_amount:amount,
  p_reference:`REFUND:NOKOS:CANCEL:${o.invoice}`,
  p_description:`Refund pembatalan Nokos ${o.invoice}`,
  p_metadata:{invoice:o.invoice,supplier_order_id:o.supplier_order_id,reason:'Pesanan Nokos dibatalkan'}
 });
 if(error){
  await db.from('nokos_orders').update({refund_status:'pending',note:`Pesanan dibatalkan. Refund saldo sedang diproses: ${error.message}`,updated_at:new Date().toISOString()}).eq('id',o.id);
  throw new Error(`Pesanan berhasil dibatalkan, tetapi refund saldo belum berhasil: ${error.message}`);
 }
 const patch={refund_status:'refunded',refunded_at:new Date().toISOString(),note:`Pesanan dibatalkan. Saldo ${amount.toLocaleString('id-ID')} telah dikembalikan.`,updated_at:new Date().toISOString()};
 await db.from('nokos_orders').update(patch).eq('id',o.id);
 return Object.assign(o,patch,{refund_result:data});
}

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const user=await optionalAuthUser(req);
 if(!user)return res.status(401).json({error:'Silakan login terlebih dahulu.'});
 const db=adminClient();
 try{
  if(req.method==='GET'){
   const invoice=String(req.query.invoice||'');
   let q=db.from('nokos_orders').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100);
   if(invoice)q=q.eq('invoice',invoice);
   const {data,error}=await q;
   if(error)throw error;
   const rows=data||[];

   await Promise.all(rows.filter(o=>o.supplier_order_id&&['received','waiting','expiring','creating'].includes(String(o.status||'').toLowerCase())).map(async o=>{
    try{
     const r=await rumahOtp('/v1/orders/get_status',{order_id:o.supplier_order_id});
     const d=r.data||{};
     const patch={supplier_status:d.status||o.supplier_status,status:normalize(d.status),phone_number:d.phone_number||o.phone_number,otp_code:d.otp_code||null,otp_message:d.otp_msg||null,expires_at:d.expired_at?new Date(Number(d.expired_at)).toISOString():o.expires_at,supplier_raw:r,updated_at:new Date().toISOString()};
     await db.from('nokos_orders').update(patch).eq('id',o.id);
     Object.assign(o,patch);
    }catch{}
   }));

   // Refund yang sempat gagal akan dicoba ulang otomatis saat riwayat dibuka/refresh.
   await Promise.all(rows.filter(o=>String(o.status||'').toLowerCase()==='canceled'&&!o.refunded_at).map(async o=>{
    try{await ensureCancelRefund(db,o);}catch{}
   }));
   return res.status(200).json({orders:rows.map(pub)});
  }

  if(req.method==='POST'){
   const invoice=String(req.body?.invoice||''),action=String(req.body?.action||'');
   if(!['cancel','done','resend'].includes(action))return res.status(400).json({error:'Aksi tidak valid.'});
   const {data:o,error}=await db.from('nokos_orders').select('*').eq('invoice',invoice).eq('user_id',user.id).single();
   if(error||!o)return res.status(404).json({error:'Pesanan tidak ditemukan.'});
   if(!o.supplier_order_id)return res.status(409).json({error:'ID supplier belum tersedia.'});

   if(action==='cancel'){
    const age=Date.now()-new Date(o.created_at).getTime();
    const wait=2*60*1000;
    if(!Number.isFinite(age)||age<wait){
     const left=Math.max(1,Math.ceil((wait-age)/1000));
     return res.status(409).json({error:`Pesanan baru bisa dibatalkan dalam ${left} detik.`});
    }

    // Bila supplier sudah pernah dibatalkan tetapi refund tertunda, jangan cancel dua kali.
    if(String(o.status||'').toLowerCase()!=='canceled'){
     const r=await rumahOtp('/v1/orders/set_status',{order_id:o.supplier_order_id,status:'cancel'});
     const supplierStatus=String(r.data?.status||'cancel').toLowerCase();
     if(!['cancel','canceled'].includes(supplierStatus))throw new Error('Supplier belum mengonfirmasi pembatalan pesanan.');
     const patch={status:'canceled',supplier_status:supplierStatus,supplier_raw:r,refund_status:'pending',updated_at:new Date().toISOString()};
     await db.from('nokos_orders').update(patch).eq('id',o.id);
     Object.assign(o,patch);
    }

    await ensureCancelRefund(db,o);
    return res.status(200).json({success:true,status:'canceled',refunded:true,refund_amount:Number(o.sell_price||0)});
   }

   const r=await rumahOtp('/v1/orders/set_status',{order_id:o.supplier_order_id,status:action});
   const next=action==='done'?'completed':o.status;
   await db.from('nokos_orders').update({status:next,supplier_status:r.data?.status||action,supplier_raw:r,updated_at:new Date().toISOString()}).eq('id',o.id);
   return res.status(200).json({success:true,status:next});
  }
  return res.status(405).json({error:'Method tidak diizinkan.'});
 }catch(e){return res.status(500).json({error:safeSupplierError(e)});}
}
function normalize(s){s=String(s||'').toLowerCase();return ({waiting:'received',received:'received',completed:'completed',canceled:'canceled',cancel:'canceled',expiring:'expiring'})[s]||s||'received';}
