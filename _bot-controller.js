import { env } from './_lib.js';

export async function botController(path, options = {}) {
  const base = env('BOT_CONTROLLER_URL').replace(/\/$/, '');
  const secret = env('BOT_CONTROLLER_SECRET');
  if (!base || !secret) throw new Error('Konfigurasi Bot Controller belum lengkap.');
  const response = await fetch(`${base}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
      ...(options.headers || {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(Number(options.timeout || 25000))
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!response.ok || body?.success === false) throw new Error(body?.message || `Bot Controller HTTP ${response.status}`);
  return body?.data ?? body;
}

export function normalizePhone(value) {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.startsWith('0')) phone = `62${phone.slice(1)}`;
  if (!phone.startsWith('62')) phone = `62${phone}`;
  if (phone.length < 10 || phone.length > 15) throw new Error('Nomor WhatsApp tidak valid. Gunakan format 628xxxxxxxxxx.');
  return phone;
}

export function rentalDays(name, fallback = 30) {
  const text = String(name || '');
  const day = text.match(/(\d+)\s*(?:hari|day)/i);
  if (day) return Math.max(1, Number(day[1]));
  const month = text.match(/(\d+)\s*(?:bulan|month)/i);
  if (month) return Math.max(1, Number(month[1]) * 30);
  const year = text.match(/(\d+)\s*(?:tahun|year)/i);
  if (year) return Math.max(1, Number(year[1]) * 365);
  return Math.max(1, Number(fallback || 30));
}
