import crypto from "node:crypto";
import { env } from "./_lib.js";

const API_URL = "https://vip-reseller.co.id/api/game-feature";
const apiId = () => env("VIPAYMENT_API_ID", env("VIPAY_ID"));
const apiKey = () => env("VIPAYMENT_API_KEY", env("VIPAY_KEY"));

export function vipConfigured(){ return Boolean(apiId() && apiKey()); }
export function vipSignature(){ return crypto.createHash("md5").update(apiId() + apiKey()).digest("hex"); }

export async function vipRequest(payload){
  if(!vipConfigured()) throw new Error("Environment VIPayment belum lengkap.");
  const body = new URLSearchParams({ key: apiKey(), sign: vipSignature(), ...Object.fromEntries(Object.entries(payload).filter(([,v])=>v!==undefined&&v!==null&&v!=="")) });
  const response = await fetch(API_URL, {
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},
    body,
    signal:AbortSignal.timeout(25000)
  });
  const text=await response.text();
  let json;
  try{json=JSON.parse(text);}catch{throw new Error(`Respons VIPayment tidak valid (HTTP ${response.status}).`);}
  if(!response.ok || json?.result===false) throw new Error(json?.message || `VIPayment HTTP ${response.status}`);
  return json;
}
