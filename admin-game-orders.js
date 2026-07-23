import { adminClient, env } from "./_lib.js";

async function verifyAdmin(req){
  const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim();
  if(!token) throw Object.assign(new Error("Sesi admin diperlukan."),{status:401});
  const db=adminClient();
  const {data,error}=await db.auth.getUser(token);
  if(error||!data?.user) throw Object.assign(new Error("Sesi admin tidak valid."),{status:401});
  if(data.user.id!==env("KIVOPAY_ADMIN_UUID","8ea33b7c-1b1f-4fe6-a157-ae38595eef42")) throw Object.assign(new Error("Akses ditolak."),{status:403});
  return db;
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  try{
    const db=await verifyAdmin(req);
    if(req.method==="GET"){
      const limit=Math.min(Math.max(Number(req.query?.limit||100),1),200);
      const {data,error}=await db.from("game_orders").select("*").order("created_at",{ascending:false}).limit(limit);
      if(error) throw error;
      return res.status(200).json({orders:data||[]});
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
