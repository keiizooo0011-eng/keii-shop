import { optionalAuthUser } from './_auth-user.js';
import { adminClient } from './_lib.js';
import { rumahOtp, safeSupplierError } from './_rumahotp.js';

const pub=o=>({invoice:o.invoice,service_name:o.service_name,service_img:o.service_img,country_name:o.country_name,country_prefix:o.country_prefix,operator_name:o.operator_name,phone_number:o.phone_number,sell_price:o.sell_price,status:o.status,supplier_status:o.supplier_status,otp_code:o.otp_code,otp_message:o.otp_message,note:o.note,expires_at:o.expires_at,created_at:o.created_at,updated_at:o.updated_at});
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store'); const user=await optionalAuthUser(req); if(!user)return res.status(401).json({error:'Silakan login terlebih dahulu.'}); const db=adminClient();
 try{
  if(req.method==='GET'){
   const invoice=String(req.query.invoice||'');
   let q=db.from('nokos_orders').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100); if(invoice)q=q.eq('invoice',invoice);
   const {data,error}=await q;if(error)throw error;
   const rows=data||[];
   await Promise.all(rows.filter(o=>o.supplier_order_id&&['received','waiting','expiring','creating'].includes(String(o.status||'').toLowerCase())).map(async o=>{try{const r=await rumahOtp('/v1/orders/get_status',{order_id:o.supplier_order_id});const d=r.data||{};const patch={supplier_status:d.status||o.supplier_status,status:normalize(d.status),phone_number:d.phone_number||o.phone_number,otp_code:d.otp_code||null,otp_message:d.otp_msg||null,expires_at:d.expired_at?new Date(Number(d.expired_at)).toISOString():o.expires_at,supplier_raw:r,updated_at:new Date().toISOString()};await db.from('nokos_orders').update(patch).eq('id',o.id);Object.assign(o,patch);}catch{}}));
   return res.status(200).json({orders:rows.map(pub)});
  }
  if(req.method==='POST'){
   const invoice=String(req.body?.invoice||''),action=String(req.body?.action||''); if(!['cancel','done','resend'].includes(action))return res.status(400).json({error:'Aksi tidak valid.'});
   const {data:o,error}=await db.from('nokos_orders').select('*').eq('invoice',invoice).eq('user_id',user.id).single();if(error||!o)return res.status(404).json({error:'Pesanan tidak ditemukan.'});if(!o.supplier_order_id)return res.status(409).json({error:'ID supplier belum tersedia.'});
   if(action==='cancel'){
    const age=Date.now()-new Date(o.created_at).getTime();
    const wait=2*60*1000;
    if(!Number.isFinite(age)||age<wait){
     const left=Math.max(1,Math.ceil((wait-age)/1000));
     return res.status(409).json({error:`Pesanan baru bisa dibatalkan dalam ${left} detik.`});
    }
   }
   const r=await rumahOtp('/v1/orders/set_status',{order_id:o.supplier_order_id,status:action}); const next=action==='cancel'?'canceled':action==='done'?'completed':o.status; await db.from('nokos_orders').update({status:next,supplier_status:r.data?.status||action,supplier_raw:r,updated_at:new Date().toISOString()}).eq('id',o.id); return res.status(200).json({success:true,status:next});
  }
  return res.status(405).json({error:'Method tidak diizinkan.'});
 }catch(e){return res.status(500).json({error:safeSupplierError(e)});}
}
function normalize(s){s=String(s||'').toLowerCase();return ({waiting:'received',received:'received',completed:'completed',canceled:'canceled',cancel:'canceled',expiring:'expiring'})[s]||s||'received';}
