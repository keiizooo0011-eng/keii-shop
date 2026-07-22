import { adminClient,getSanpayMutasi,normalizeAmount,mutasiKey } from "./_lib.js";
import { vipRequest } from "./_vipayment.js";
const pub=o=>({invoice:o.invoice,game_name:o.game_name,service_name:o.service_name,target:o.target,zone:o.zone,payment_amount:o.payment_amount,status:o.status,vip_status:o.vip_status,note:o.note,expires_at:o.expires_at,qr_content:o.qr_content,qr_image:o.qr_image,created_at:o.created_at});
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  const invoice=String(req.query?.invoice||req.body?.invoice||"").trim();
  if(!invoice)return res.status(400).json({error:"Invoice wajib diisi."});
  try{
    const db=adminClient(); let {data:o,error}=await db.from("game_orders").select("*").eq("invoice",invoice).maybeSingle(); if(error)throw error;if(!o)return res.status(404).json({error:"Pesanan tidak ditemukan."});
    if(o.status==="pending"&&new Date(o.expires_at).getTime()<=Date.now()){await db.from("game_orders").update({status:"expired",updated_at:new Date().toISOString()}).eq("id",o.id);o.status="expired";}
    if(o.status==="pending"){
      const mutations=await getSanpayMutasi(); const m=mutations.find(x=>normalizeAmount(x.amount)===Number(o.payment_amount));
      if(m){
        await db.from("game_orders").update({status:"paid",paid_at:new Date().toISOString(),mutation_key:mutasiKey(m),mutation_data:m,updated_at:new Date().toISOString()}).eq("id",o.id);
        try{
          const vr=await vipRequest({type:"order",service:o.service_code,data_no:o.target,data_zone:o.zone||""});
          const d=vr.data||{};
          await db.from("game_orders").update({status:"processing",vip_trxid:String(d.trxid||invoice),vip_status:String(d.status||"waiting"),note:String(d.note||""),vip_raw:vr,updated_at:new Date().toISOString()}).eq("id",o.id);
        }catch(err){await db.from("game_orders").update({status:"failed",vip_status:"error",note:err.message,updated_at:new Date().toISOString()}).eq("id",o.id);}
      }
    }
    ({data:o,error}=await db.from("game_orders").select("*").eq("id",o.id).single());if(error)throw error;
    if(o.status==="processing"&&o.vip_trxid){
      try{const sr=await vipRequest({type:"status",trxid:o.vip_trxid});const row=Array.isArray(sr.data)?sr.data[0]:sr.data||{};const vs=String(row.status||o.vip_status||"processing").toLowerCase();const status=vs==="success"?"completed":vs==="error"?"failed":"processing";await db.from("game_orders").update({status,vip_status:vs,note:String(row.note||o.note||""),vip_raw:sr,completed_at:status==="completed"?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq("id",o.id);o={...o,status,vip_status:vs,note:String(row.note||o.note||"")};}catch{}
    }
    return res.status(200).json({order:pub(o)});
  }catch(e){console.error("CHECK GAME PAYMENT",e);return res.status(500).json({error:e.message||"Gagal mengecek transaksi."});}
}
