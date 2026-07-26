import { adminClient, getSanpayMutasi, mutationMatchesOrder, mutasiKey, env } from "./_lib.js";
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
    const {data:expiredDeposits,error:expiredDepositError}=await db.from('deposits').select('id').eq('status','pending').lt('expires_at',now).limit(250);
    if(expiredDepositError && !/deposits/i.test(expiredDepositError.message||'')) throw expiredDepositError;
    for(const row of expiredDeposits||[]){const result=await db.rpc('expire_pending_deposit',{p_deposit_id:row.id});if(result.error)console.error('EXPIRE DEPOSIT',row.id,result.error.message);}
    const {data:pendingDeposits,error:pendingDepositError}=await db.from('deposits').select('*').eq('status','pending').gte('expires_at',now).order('created_at',{ascending:true}).limit(100);
    if(pendingDepositError && !/deposits/i.test(pendingDepositError.message||'')) throw pendingDepositError;
    if(!pending?.length && !pendingDeposits?.length) return res.status(200).json({checked:0,paid:0,expired:(expired||[]).length,deposit_checked:0,deposit_paid:0,deposit_expired:(expiredDeposits||[]).length});
    const mutasi=await getSanpayMutasi();
    let paid=0, depositPaid=0;
    for(const order of pending){
      const match=mutasi.find(m=>mutationMatchesOrder(m,order));
      if(!match) continue;
      const done=await db.rpc("complete_paid_order",{
        p_order_id:order.id,p_mutation_key:mutasiKey(match),p_mutation_data:match
      });
      if(!done.error) paid++;
    }
    for(const deposit of pendingDeposits||[]){
      const match=mutasi.find(m=>mutationMatchesOrder(m,deposit));
      if(!match)continue;
      const done=await db.rpc('complete_paid_deposit',{p_deposit_id:deposit.id,p_mutation_key:mutasiKey(match),p_mutation_data:match});
      if(!done.error)depositPaid++;
    }
    return res.status(200).json({checked:(pending||[]).length,paid,expired:(expired||[]).length,deposit_checked:(pendingDeposits||[]).length,deposit_paid:depositPaid,deposit_expired:(expiredDeposits||[]).length});
  }catch(e){return res.status(500).json({error:e.message});}
}
