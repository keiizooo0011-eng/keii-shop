import { rumahOtp, safeSupplierError } from './_rumahotp.js';
import { adminClient } from './_lib.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=30, stale-while-revalidate=60');
  if(req.method!=='GET') return res.status(405).json({error:'Method tidak diizinkan.'});
  try{
    const type=String(req.query.type||'services');
    let result;
    if(type==='services') result=await rumahOtp('/v2/services');
    else if(type==='countries') result=await rumahOtp('/v2/countries',{service_id:req.query.service_id});
    else if(type==='operators') result=await rumahOtp('/v2/operators',{country:req.query.country,provider_id:req.query.provider_id});
    else if(type==='balance') result=await rumahOtp('/v1/user/balance');
    else return res.status(400).json({error:'Tipe katalog tidak valid.'});
    const db=adminClient();
    const {data:settings}=await db.from('nokos_settings').select('enabled,global_margin').eq('id',1).maybeSingle();
    if(settings?.enabled===false) return res.status(503).json({error:'Katalog Nokos sedang dinonaktifkan.'});
    const payload = result?.data ?? result;
    return res.status(200).json({success:true,data:payload,margin:Number(settings?.global_margin||1000)});
  }catch(e){return res.status(502).json({error:safeSupplierError(e)});}
}
