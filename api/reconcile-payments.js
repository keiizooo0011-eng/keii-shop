import { adminClient, getSanpayMutasi, normalizeAmount, mutasiKey, env } from "./_lib.js";
export default async function handler(req,res){
  if(env("CRON_SECRET") && (req.headers.authorization||"")!==`Bearer ${env("CRON_SECRET")}`)
    return res.status(401).json({error:"Unauthorized"});
  try{
    const db=adminClient(), now=new Date().toISOString();

    const {data:expired,error:expiredError}=await db.from("orders").select("id")
      .eq("status","pending").lt("expires_at",now).limit(250);
    if(expiredError) throw expiredError;
    for(const row of expired||[]){
      const released=await db.rpc("expire_pending_order",{p_order_id:row.id});
      if(released.error) console.error("EXPIRE ORDER",row.id,released.error.message);
    }

    const {data:pending,error}=await db.from("orders").select("*").eq("status","pending")
      .gte("expires_at",now).order("created_at",{ascending:true}).limit(100);
    if(error) throw error;
    if(!pending?.length) return res.status(200).json({checked:0,paid:0,expired:(expired||[]).length});
    const mutasi=await getSanpayMutasi();
    let paid=0;
    for(const order of pending){
      const match=mutasi.find(m=>normalizeAmount(m.amount)===Number(order.payment_amount));
      if(!match) continue;
      const done=await db.rpc("complete_paid_order",{
        p_order_id:order.id,p_mutation_key:mutasiKey(match),p_mutation_data:match
      });
      if(!done.error) paid++;
    }
    return res.status(200).json({checked:pending.length,paid,expired:(expired||[]).length});
  }catch(e){return res.status(500).json({error:e.message});}
}
