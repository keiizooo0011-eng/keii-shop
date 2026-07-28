import { env } from './_lib.js';

const BASE = env('RUMAHOTP_BASE_URL', 'https://www.rumahotp.io/api').replace(/\/$/, '');

export async function rumahOtp(path, params = {}) {
  const key = env('RUMAHOTP_API_KEY');
  if (!key) throw new Error('RUMAHOTP_API_KEY belum diatur di Vercel.');
  const url = new URL(BASE + path);
  Object.entries(params).forEach(([k,v]) => { if (v !== undefined && v !== null && String(v) !== '') url.searchParams.set(k, String(v)); });
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'x-apikey': key, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(20000),
    cache: 'no-store'
  });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = { success:false, message:text || `HTTP ${response.status}` }; }
  if (!response.ok || body?.success === false) throw new Error(body?.message || body?.error || `RumahOTP HTTP ${response.status}`);
  return body;
}

export function safeSupplierError(error) {
  const message = String(error?.message || 'Layanan supplier sedang bermasalah.');
  return message.replace(/x-apikey|api[_ -]?key/gi, 'kredensial');
}
