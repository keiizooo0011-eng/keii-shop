import { createClient } from '@supabase/supabase-js';
export async function optionalAuthUser(req){
 const h=String(req.headers.authorization||''); if(!h.startsWith('Bearer '))return null;
 const token=h.slice(7); if(!token)return null;
 const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)return null;
 const client=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
 const {data,error}=await client.auth.getUser(token); return error?null:data.user;
}
