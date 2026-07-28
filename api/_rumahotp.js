import { env } from './_lib.js';

const BASE = env('RUMAHOTP_BASE_URL', 'https://www.rumahotp.io/api').replace(/\/$/, '');

function extractMessage(value, fallback = 'Layanan supplier sedang bermasalah.') {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Error) return extractMessage(value.message, fallback);
  if (Array.isArray(value)) {
    const messages = value.map(item => extractMessage(item, '')).filter(Boolean);
    return messages.join(' · ') || fallback;
  }
  if (typeof value === 'object') {
    for (const key of ['message','error','detail','description','msg','reason']) {
      if (value[key] != null && value[key] !== value) {
        const message = extractMessage(value[key], '');
        if (message) return message;
      }
    }
    const primitive = Object.values(value).find(item => ['string','number','boolean'].includes(typeof item));
    if (primitive != null) return String(primitive);
    try {
      const json = JSON.stringify(value);
      if (json && json !== '{}') return json;
    } catch {}
  }
  return fallback;
}

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
  if (!response.ok || body?.success === false) {
    const supplierMessage = extractMessage(body, `RumahOTP HTTP ${response.status}`);
    throw new Error(supplierMessage);
  }
  return body;
}

export function safeSupplierError(error) {
  const message = extractMessage(error, 'Layanan supplier sedang bermasalah.');
  return message.replace(/x-apikey|api[_ -]?key/gi, 'kredensial');
}
