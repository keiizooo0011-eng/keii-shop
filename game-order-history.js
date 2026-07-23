import { adminClient } from "./_lib.js";

function publicOrder(o) {
  return {
    invoice:o.invoice, service_code:o.service_code, game_name:o.game_name,
    service_name:o.service_name, target:o.target, zone:o.zone, form_data:o.form_data || {},
    payment_amount:o.payment_amount, customer_name:o.customer_name,
    customer_contact:o.customer_contact, status:o.status,
    provider_id:o.vip_trxid || null, provider_status:o.vip_status || null,
    note:o.note || null, created_at:o.created_at, paid_at:o.paid_at,
    completed_at:o.completed_at, updated_at:o.updated_at
  };
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST") return res.status(405).json({error:"Method tidak diizinkan."});
  try{
    const invoices=[...new Set((Array.isArray(req.body?.invoices)?req.body.invoices:[]).map(x=>String(x||"").trim()).filter(Boolean))].slice(0,100);
    if(!invoices.length) return res.status(200).json({orders:[]});
    const db=adminClient();
    const {data,error}=await db.from("game_orders").select("*").in("invoice",invoices).order("created_at",{ascending:false});
    if(error) throw error;
    return res.status(200).json({orders:(data||[]).map(publicOrder)});
  }catch(error){
    console.error("GAME ORDER HISTORY",error);
    return res.status(500).json({error:error.message||"Gagal memuat riwayat."});
  }
}
