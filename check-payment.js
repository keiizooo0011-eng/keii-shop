
import { adminClient, getSanpayMutasi, normalizeAmount, mutasiKey, publicOrder } from "./_lib.js";

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  const invoice=String(req.query?.invoice || req.body?.invoice || "").trim();
  if(!invoice) return res.status(400).json({error:"Invoice wajib diisi."});

  try{
    const db=adminClient();
    let {data:order,error}=await db.from("orders").select("*").eq("invoice",invoice).maybeSingle();
    if(error) throw error;
    if(!order) return res.status(404).json({error:"Pesanan tidak ditemukan."});

    if(order.status==="pending" && new Date(order.expires_at).getTime()<=Date.now()){
      const expired=await db.rpc("expire_pending_order",{p_order_id:order.id});
      if(expired.error) throw expired.error;
      const freshExpired=await db.from("orders").select("*").eq("id",order.id).single();
      if(freshExpired.error) throw freshExpired.error;
      order=freshExpired.data;
    }

    if(order.status==="pending"){
      const mutations=await getSanpayMutasi();
      const match=mutations.find(m=>normalizeAmount(m.amount)===Number(order.payment_amount));
      if(match){
        const done=await db.rpc("complete_paid_order",{
          p_order_id:order.id,p_mutation_key:mutasiKey(match),p_mutation_data:match
        });
        if(done.error) throw done.error;
        const fresh=await db.from("orders").select("*").eq("id",order.id).single();
        if(fresh.error) throw fresh.error;
        order=fresh.data;
      }
    }
    return res.status(200).json({order:publicOrder(order)});
  }catch(e){
    console.error("CHECK PAYMENT ERROR",e);
    return res.status(500).json({error:e.message || "Gagal mengecek pembayaran."});
  }
}
