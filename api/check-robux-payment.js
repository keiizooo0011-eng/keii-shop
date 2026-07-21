import { adminClient, getSanpayMutasi, normalizeAmount, mutasiKey } from './_lib.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const invoice=String(req.query?.invoice||req.body?.invoice||'').trim();
  if(!invoice) return res.status(400).json({error:'Invoice wajib diisi.'});
  try{
    const db=adminClient();
    let {data:order,error}=await db.from('robux_orders').select('*').eq('invoice',invoice).maybeSingle();
    if(error) throw error; if(!order) return res.status(404).json({error:'Pesanan Robux tidak ditemukan.'});
    if(order.status==='pending' && new Date(order.expires_at).getTime()<=Date.now()){
      const changed=await db.from('robux_orders').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',order.id).eq('status','pending').select('*').maybeSingle();
      order=changed.data||{...order,status:'cancelled'};
    }
    if(order.status==='pending'){
      const mutations=await getSanpayMutasi();
      const match=mutations.find(m=>normalizeAmount(m.amount)===Number(order.payment_amount));
      if(match){
        const key=mutasiKey(match);
        const [{data:usedRobux},{data:usedStore}]=await Promise.all([
          db.from('robux_orders').select('id').eq('payment_reference',key).neq('id',order.id).maybeSingle(),
          db.from('orders').select('id').eq('payment_reference',key).maybeSingle()
        ]);
        if(!usedRobux && !usedStore){
          const {data:fresh,error:ue}=await db.from('robux_orders').update({status:'paid',paid_at:new Date().toISOString(),payment_reference:key,payment_raw:match,updated_at:new Date().toISOString()}).eq('id',order.id).eq('status','pending').select('*').single();
          if(ue) throw ue; order=fresh;
        }
      }
    }
    return res.status(200).json({order:publicRobux(order)});
  }catch(e){console.error('CHECK ROBUX PAYMENT ERROR',e);return res.status(500).json({error:e.message||'Gagal mengecek pembayaran.'});}
}
function publicRobux(o){return {invoice:o.invoice,method_name:o.method_name,package_label:o.package_label,robux_amount:o.robux_amount,amount:o.amount,payment_amount:o.payment_amount,unique_fee:o.unique_fee,username:o.username,whatsapp:o.whatsapp,status:o.status,expires_at:o.expires_at,paid_at:o.paid_at,created_at:o.created_at,updated_at:o.updated_at,admin_note:o.admin_note||'',qr_content:o.qr_content||'',qr_image:o.qr_image||''};}
