import { adminClient, env } from "./_lib.js";
import { vipaymentRequest, vipaymentRows } from "./_vipayment.js";

async function verifyAdmin(req){
  const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim();
  if(!token) throw Object.assign(new Error("Sesi admin diperlukan."),{status:401});
  const db=adminClient();
  const {data,error}=await db.auth.getUser(token);
  if(error||!data?.user) throw Object.assign(new Error("Sesi admin tidak valid."),{status:401});
  if(data.user.id!==env("KIVOPAY_ADMIN_UUID","8ea33b7c-1b1f-4fe6-a157-ae38595eef42")) throw Object.assign(new Error("Akses ditolak."),{status:403});
  return db;
}

function normalizedStatus(value, note = "") {
  const text = `${value || ""} ${note || ""}`.toLowerCase();
  if (/\b(success|sukses|successful|completed|complete|done|finished|terkirim|berhasil)\b/.test(text)) return "completed";
  if (/\b(failed|failure|gagal|error|cancelled|canceled|cancel|rejected|ditolak)\b/.test(text)) return "failed";
  return "processing";
}

async function refreshProviderOrders(db, orders) {
  const processing = (orders || []).filter(o => o.status === "processing" && o.vip_trxid).slice(0, 30);
  for (const order of processing) {
    try {
      const provider = await vipaymentRequest("status", { trxid: order.vip_trxid });
      const row = vipaymentRows(provider)[0] || {};
      const providerStatus = String(row.status || row.state || row.transaction_status || provider?.status || order.vip_status || "waiting");
      const note = String(row.note || row.message || provider?.message || provider?.note || order.note || "");
      const status = normalizedStatus(providerStatus, note);
      const patch = { status, vip_status: providerStatus, note, vip_raw: provider, updated_at: new Date().toISOString() };
      if (status === "completed") patch.completed_at = order.completed_at || new Date().toISOString();
      const { data } = await db.from("game_orders").update(patch).eq("id", order.id).select("*").single();
      if (data) Object.assign(order, data);
    } catch (error) {
      console.error("ADMIN REFRESH VIPAYMENT", order.invoice, error.message);
    }
  }
  return orders;
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  try{
    const db=await verifyAdmin(req);
    if(req.method==="GET"){
      const limit=Math.min(Math.max(Number(req.query?.limit||100),1),200);
      const {data,error}=await db.from("game_orders").select("*").order("created_at",{ascending:false}).limit(limit);
      if(error) throw error;
      const orders = await refreshProviderOrders(db, data || []);
      return res.status(200).json({orders});
    }
    if(req.method==="PATCH"){
      const id=String(req.body?.id||"").trim();
      const note=String(req.body?.note||"").trim();
      if(!id) return res.status(400).json({error:"ID order wajib diisi."});
      const {data,error}=await db.from("game_orders").update({note,updated_at:new Date().toISOString()}).eq("id",id).select("*").single();
      if(error) throw error;
      return res.status(200).json({order:data});
    }
    return res.status(405).json({error:"Method tidak diizinkan."});
  }catch(error){
    console.error("ADMIN GAME ORDERS",error);
    return res.status(error.status||500).json({error:error.message||"Gagal memuat order game."});
  }
}
