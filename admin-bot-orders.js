import { createClient } from '@supabase/supabase-js';
import { adminClient, env } from './_lib.js';
import { botController } from './_bot-controller.js';
async function adminUser(req){
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/,''); if(!token)return null;
  const auth=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{auth:{persistSession:false}});
  const {data}=await auth.auth.getUser(token); const user=data?.user; if(!user)return null;
  const db=adminClient(); const {data:row}=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle(); return row?user:null;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store'); if(!await adminUser(req))return res.status(403).json({error:'Akses admin ditolak.'});
  const db=adminClient();
  try{
    if(req.method==='GET'){
      const {data,error}=await db.from('bot_orders').select('*').order('created_at',{ascending:false}).limit(250); if(error)throw error;
      let stats={}; try{stats=await botController('/api/stats')}catch{}
      return res.status(200).json({ok:true,orders:data||[],stats});
    }
    if(req.method==='POST'){
      const invoice=String(req.body?.invoice||''); const action=String(req.body?.action||'');
      const {data:order,error}=await db.from('bot_orders').select('*').eq('invoice',invoice).maybeSingle(); if(error)throw error; if(!order)return res.status(404).json({error:'Order tidak ditemukan.'});
      if(!['restart','stop','suspend','resume','pairing','extend','delete'].includes(action))return res.status(400).json({error:'Aksi tidak valid.'});
      let session;
      if(action==='delete') session=await botController(`/api/sessions/${encodeURIComponent(order.session_id)}`,{method:'DELETE'});
      else session=await botController(`/api/sessions/${encodeURIComponent(order.session_id)}/${action}`,{method:'POST',body:action==='extend'?{days:Number(req.body?.days||30)}:action==='pairing'?{phone:order.phone}:{}});
      const status=action==='delete'?'deleted':(session.status||order.status);
      const update={status,pairing_code:session?.pairingCode||null,expires_at:session?.expiresAt||order.expires_at,controller_data:session||{},updated_at:new Date().toISOString()};
      const {data:fresh}=await db.from('bot_orders').update(update).eq('id',order.id).select('*').single();
      if(action==='delete'){
        const {data:p}=await db.from('products').select('stock').eq('id',order.product_id).maybeSingle();
        if(p) await db.from('products').update({stock:Number(p.stock||0)+1,updated_at:new Date().toISOString()}).eq('id',order.product_id);
      }
      return res.status(200).json({ok:true,order:fresh||order});
    }
    return res.status(405).json({error:'Method tidak diizinkan.'});
  }catch(error){return res.status(500).json({error:error.message});}
}
