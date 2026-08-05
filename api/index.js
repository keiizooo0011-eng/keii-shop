// KivoPay single Vercel Function bundle. Generated from the original /api handlers.
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { Readable } from 'node:stream';
import { createClient } from '@supabase/supabase-js';

const mod__lib = (() => {
const env = (name, fallback = "") => String(process.env[name] || fallback).trim();

function authClient() {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("Supabase auth environment belum lengkap.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function adminClient() {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase server environment belum lengkap.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function signPayload(payload) {
  return crypto.createHmac("sha256", env("SANPAY_API_KEY"))
    .update(JSON.stringify(payload)).digest("hex");
}

function sanpayUrl(endpoint) {
  return env("SANPAY_BASE_URL", "https://sanpay.site").replace(/\/$/, "") + endpoint;
}

async function createSanpayQris(amount, invoice, description) {
  const payload = {
    amount: Number(amount),
    partnerReferenceNo: String(invoice),
    description: String(description || invoice)
  };
  const response = await fetch(
    sanpayUrl(env("SANPAY_CREATE_QRIS_ENDPOINT", "/api/v1/topup_qris")),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Merchant-Code": env("SANPAY_MERCHANT_CODE"),
        "X-Signature": signPayload(payload)
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    }
  );
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(body?.message || body?.error || `Sanpay HTTP ${response.status}`);
  const d = body?.data?.data || body?.data || body || {};
  return {
    qrContent: d.qrContent || d.qr_content || d.qris || d.qrString || d.qr_string || d.code || d.payment_code || "",
    qrImage: d.qrImage || d.qr_image || d.image || d.image_url || d.qr_url || "",
    transactionId: d.transactionID || d.transactionId || d.transaction_id || d.trx_id || d.id || d.external_id || d.reference || invoice,
    raw: body
  };
}

async function getSanpayMutasi() {
  const url = new URL(sanpayUrl(env("SANPAY_GET_MUTASI_ENDPOINT", "/api/v1/get_mutasi")));
  url.searchParams.set("apikey", env("SANPAY_API_KEY"));
  url.searchParams.set("merchant_code", env("SANPAY_MERCHANT_CODE"));
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(body?.message || body?.error || `Sanpay HTTP ${response.status}`);
  return Array.isArray(body?.data) ? body.data : [];
}



function firstValue(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return null;
}

function mutationTimestamp(mutation) {
  const raw = firstValue(mutation, [
    "transactionDate", "transaction_date", "createdAt", "created_at",
    "paymentDate", "payment_date", "date", "datetime", "time", "timestamp"
  ]);
  if (!raw) return null;

  if (typeof raw === "number") {
    const milliseconds = raw < 1e12 ? raw * 1000 : raw;
    const parsed = new Date(milliseconds);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  const value = String(raw).trim();

  // SanPay mengirim waktu mutasi sebagai waktu Indonesia (WIB), misalnya
  // "2026-07-25 18:51:00" tanpa penanda zona waktu. Jangan langsung memakai
  // new Date(value), karena server Vercel membacanya sebagai UTC dan membuat
  // transaksi terlihat 7 jam lebih lambat dari order.
  const ymd = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (ymd) {
    const [, year, month, day, hour = "0", minute = "0", second = "0"] = ymd;
    const iso = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}T${String(hour).padStart(2,"0")}:${minute}:${second}+07:00`;
    const parsed = new Date(iso);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  // Common Indonesian format: DD/MM/YYYY HH:mm:ss or DD-MM-YYYY HH:mm:ss.
  const dmy = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] = dmy;
    const iso = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}T${String(hour).padStart(2,"0")}:${minute}:${second}+07:00`;
    const parsed = new Date(iso);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  // ISO timestamps that already contain Z / an explicit offset remain valid.
  const direct = new Date(value);
  return Number.isFinite(direct.getTime()) ? direct : null;
}

function mutationReference(mutation) {
  return String(firstValue(mutation, [
    "partnerReferenceNo", "partner_reference_no", "referenceNo", "reference_no",
    "merchantReference", "merchant_reference", "externalId", "external_id",
    "invoice", "description", "note", "remark"
  ]) || "").trim();
}

function mutationIsCredit(mutation) {
  const text = String(firstValue(mutation, [
    "type", "transactionType", "transaction_type", "direction", "flow", "status"
  ]) || "").toLowerCase();
  if (/debit|keluar|withdraw|outgoing|expense|refund/.test(text)) return false;
  return true;
}

function mutationAmount(mutation) {
  return normalizeAmount(firstValue(mutation, [
    "amount", "nominal", "value", "total", "paymentAmount", "payment_amount",
    "credit", "creditAmount", "credit_amount"
  ]));
}

function mutationMatchesOrder(mutation, order) {
  if (!mutation || !order) return false;
  if (mutationAmount(mutation) !== Number(order.payment_amount)) return false;
  if (!mutationIsCredit(mutation)) return false;

  const reference = mutationReference(mutation);
  if (reference && /KIVO-/i.test(reference) && !reference.includes(String(order.invoice))) return false;

  // Never accept an old mutation with the same nominal. This was the cause of
  // unpaid orders being marked completed when another payment had the same amount.
  const paidAt = mutationTimestamp(mutation);
  if (!paidAt) return false; // fail closed: unknown timestamp must not complete an order

  const createdAt = new Date(order.created_at).getTime();
  const expiresAt = new Date(order.expires_at).getTime();
  const mutationTime = paidAt.getTime();
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || !Number.isFinite(mutationTime)) return false;

  const earlyTolerance = 2 * 60 * 1000;
  const lateTolerance = 3 * 60 * 1000;
  return mutationTime >= createdAt - earlyTolerance && mutationTime <= expiresAt + lateTolerance;
}

function normalizeAmount(value) {
  if (typeof value === "number") return Math.round(value);
  return Number(String(value || "0").replace(/[^0-9]/g, ""));
}
function mutasiKey(m) {
  return String(m.transactionID || m.transactionId || m.transaction_id || m.id ||
    `${m.transactionDate || m.date || ""}-${m.amount || ""}-${m.customerName || ""}`);
}
function uniqueFee() {
  const min = Number(env("SANPAY_UNIQUE_FEE_MIN", "100"));
  const max = Number(env("SANPAY_UNIQUE_FEE_MAX", "200"));
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function invoiceId() {
  return `KIVO-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}
function publicOrder(o) {
  return {
    invoice:o.invoice, product_name:o.product_name, variant_name:o.variant_name,
    amount:o.amount, payment_amount:o.payment_amount, status:o.status,
    expires_at:o.expires_at, paid_at:o.paid_at, delivered_at:o.delivered_at,
    qr_content:o.qr_content || null, qr_image:o.qr_image || null,
    delivery_content:o.status === "completed" ? o.delivery_content : null,
    created_at:o.created_at, order_type:o.order_type || null,
    delivery_mode:o.delivery_mode || "automatic",
    requires_email: !!o.requires_email,
    customer_email:o.customer_email || null, admin_note:o.admin_note || null
  };
}
  return {"authClient": authClient, "adminClient": adminClient, "signPayload": signPayload, "sanpayUrl": sanpayUrl, "mutationTimestamp": mutationTimestamp, "mutationReference": mutationReference, "mutationIsCredit": mutationIsCredit, "mutationAmount": mutationAmount, "mutationMatchesOrder": mutationMatchesOrder, "normalizeAmount": normalizeAmount, "mutasiKey": mutasiKey, "uniqueFee": uniqueFee, "invoiceId": invoiceId, "publicOrder": publicOrder, "createSanpayQris": createSanpayQris, "getSanpayMutasi": getSanpayMutasi, "env": env};
})();

const mod__auth_user = (() => {
async function optionalAuthUser(req){
 const h=String(req.headers.authorization||''); if(!h.startsWith('Bearer '))return null;
 const token=h.slice(7); if(!token)return null;
 const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)return null;
 const client=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
 const {data,error}=await client.auth.getUser(token); return error?null:data.user;
}
  return {"optionalAuthUser": optionalAuthUser};
})();

const mod__bot_controller = (() => {
  const { env } = mod__lib;
async function botController(path, options = {}) {
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

function normalizePhone(value) {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.startsWith('0')) phone = `62${phone.slice(1)}`;
  if (!phone.startsWith('62')) phone = `62${phone}`;
  if (phone.length < 10 || phone.length > 15) throw new Error('Nomor WhatsApp tidak valid. Gunakan format 628xxxxxxxxxx.');
  return phone;
}

function rentalDays(name, fallback = 30) {
  const text = String(name || '');
  const day = text.match(/(\d+)\s*(?:hari|day)/i);
  if (day) return Math.max(1, Number(day[1]));
  const month = text.match(/(\d+)\s*(?:bulan|month)/i);
  if (month) return Math.max(1, Number(month[1]) * 30);
  const year = text.match(/(\d+)\s*(?:tahun|year)/i);
  if (year) return Math.max(1, Number(year[1]) * 365);
  return Math.max(1, Number(fallback || 30));
}
  return {"normalizePhone": normalizePhone, "rentalDays": rentalDays, "botController": botController};
})();

const mod__rumahotp = (() => {
  const { env } = mod__lib;
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

async function rumahOtp(path, params = {}) {
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

function safeSupplierError(error) {
  const message = extractMessage(error, 'Layanan supplier sedang bermasalah.');
  return message.replace(/x-apikey|api[_ -]?key/gi, 'kredensial');
}
  return {"safeSupplierError": safeSupplierError, "rumahOtp": rumahOtp};
})();

const mod__vipayment = (() => {
  const { env } = mod__lib;
const API_URL = () => env("VIPAYMENT_API_URL", "https://vip-reseller.co.id/api/game-feature");
const GATEWAY_URL = () => env("VIPAYMENT_GATEWAY_URL", "").replace(/\/$/, "");
const GATEWAY_TOKEN = () => env("KIVOPAY_GATEWAY_TOKEN", "");
const API_ID = () => env("VIPAY_I_ID", env("VIPAYMENT_API_ID", ""));
const API_KEY = () => env("VIPAY_KEY", env("VIPAYMENT_API_KEY", ""));

function vipaymentConfigured() {
  return Boolean((GATEWAY_URL() && GATEWAY_TOKEN()) || (API_ID() && API_KEY()));
}

function vipaymentSign() {
  return crypto.createHash("md5").update(API_ID() + API_KEY()).digest("hex");
}

function cleanPayload(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

async function gatewayRequest(type, payload) {
  if (!GATEWAY_TOKEN()) throw new Error("KIVOPAY_GATEWAY_TOKEN belum diisi di Vercel.");
  const response = await fetch(`${GATEWAY_URL()}/vipayment/${type}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Gateway-Token": GATEWAY_TOKEN(),
    },
    body: JSON.stringify(cleanPayload(payload)),
    signal: AbortSignal.timeout(30000),
  });

  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch {
    throw new Error(`Gateway VIPayment membalas non-JSON (HTTP ${response.status}).`);
  }
  if (!response.ok || json?.ok === false) {
    const error = new Error(json?.error || `Gateway VIPayment HTTP ${response.status}`);
    error.debug = json?.debug;
    throw error;
  }
  return json.data;
}

async function directRequest(type, payload) {
  if (!API_ID() || !API_KEY()) throw new Error("Environment VIPayment belum lengkap.");
  const body = new URLSearchParams({
    key: API_KEY(),
    sign: vipaymentSign(),
    type,
    ...cleanPayload(payload),
  });
  const response = await fetch(API_URL(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch {
    throw new Error(`Respons VIPayment bukan JSON (HTTP ${response.status}).`);
  }
  if (!response.ok || json?.result === false) {
    throw new Error(json?.message || json?.error || `VIPayment HTTP ${response.status}`);
  }
  return json;
}

async function vipaymentRequest(type, payload = {}) {
  return GATEWAY_URL() ? gatewayRequest(type, payload) : directRequest(type, payload);
}

function vipaymentRows(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of ["data", "result", "rows", "items", "transactions", "transaction"]) {
    const nested = value[key];
    if (Array.isArray(nested)) return nested;
    if (nested && typeof nested === "object") {
      const rows = vipaymentRows(nested);
      if (rows.length) return rows;
      if (["status", "trxid", "transaction_id", "note", "message"].some(k => k in nested)) return [nested];
    }
  }
  if (["status", "trxid", "transaction_id", "note", "message"].some(k => k in value)) return [value];
  return [];
}

function vipaymentCost(service) {
  const tier = env("VIPAYMENT_PRICE_TIER", "basic").toLowerCase();
  const prices = service?.price || {};
  const preferred = Number(prices?.[tier]);
  if (Number.isFinite(preferred) && preferred > 0) return preferred;
  for (const key of ["special", "premium", "basic"]) {
    const value = Number(prices?.[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  const direct = Number(service?.price || service?.cost || 0);
  return Number.isFinite(direct) ? direct : 0;
}

function vipaymentStock(service) {
  const candidates = [
    service?.stock,
    service?.stok,
    service?.quantity,
    service?.qty,
    service?.available_stock,
    service?.stock_available,
  ];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === "") continue;
    const value = Number(String(candidate).replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(value)) return Math.max(Math.floor(value), 0);
  }
  return null;
}

function vipaymentService(service) {
  return {
    code: String(service?.code ?? service?.id ?? ""),
    game: String(service?.game ?? service?.brand ?? service?.category ?? "Game"),
    name: String(service?.name ?? service?.service ?? "Paket"),
    price: vipaymentCost(service),
    description: String(service?.description ?? ""),
    server: String(service?.server ?? ""),
    status: String(service?.status ?? "available"),
    stock: vipaymentStock(service),
    raw: service,
  };
}

function vipaymentErrorPayload(error) {
  return {
    message: error?.message || "Terjadi gangguan saat menghubungi VIPayment.",
    debug: error?.debug || null,
  };
}
  return {"vipaymentConfigured": vipaymentConfigured, "vipaymentSign": vipaymentSign, "vipaymentRows": vipaymentRows, "vipaymentCost": vipaymentCost, "vipaymentService": vipaymentService, "vipaymentErrorPayload": vipaymentErrorPayload, "vipaymentRequest": vipaymentRequest};
})();

const mod__panelpedia = (() => {
  const { env } = mod__lib;
  async function panelpediaRequest(action, payload={}) {
    const base = env('PANELPEDIA_BASE_URL');
    const apiKey = env('PANELPEDIA_API_KEY');
    if (!base || !apiKey) throw new Error('Konfigurasi PanelPedia belum lengkap di Vercel Environment Variables.');
    const url = base.replace(/\/$/, '') + '/' + String(action||'').replace(/^\//,'');
    const response = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`,'X-API-Key':apiKey}, body:JSON.stringify(payload||{}), signal:AbortSignal.timeout(20000) });
    const text = await response.text(); let body; try { body=JSON.parse(text); } catch { body={raw:text}; }
    if (!response.ok) { const e=new Error(body?.message||body?.error||`PanelPedia HTTP ${response.status}`); e.status=response.status; e.payload=body; throw e; }
    return body;
  }
  function panelpediaErrorPayload(error){ return { message:error?.message||'PanelPedia error', status:error?.status||null, payload:error?.payload||null }; }
  return { panelpediaRequest, panelpediaErrorPayload };
})();

const mod_admin_bot_backups = (() => {
  const { adminClient, env } = mod__lib;
async function isAdmin(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (!token) return false;
  const auth = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
  const { data } = await auth.auth.getUser(token);
  const user = data?.user;
  if (!user) return false;
  const db = adminClient();
  const { data: row } = await db.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
  return Boolean(row);
}

function controllerUrl(pathname) {
  const base = env('BOT_CONTROLLER_URL').replace(/\/$/, '');
  if (!base) throw new Error('BOT_CONTROLLER_URL belum diatur.');
  return `${base}${pathname}`;
}

async function controller(pathname, options = {}) {
  const secret = env('BOT_CONTROLLER_SECRET');
  if (!secret) throw new Error('BOT_CONTROLLER_SECRET belum diatur.');
  const response = await fetch(controllerUrl(pathname), {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(Number(options.timeout || 120000))
  });
  return response;
}

const config = { api: { responseLimit: false } };

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!await isAdmin(req)) return res.status(403).json({ error: 'Akses admin ditolak.' });

  try {
    const action = String(req.query?.action || 'list');
    const name = String(req.query?.name || '');
    const jobId = String(req.query?.jobId || '');

    if (req.method === 'GET' && action === 'download-ticket') {
      if (!name) return res.status(400).json({ error: 'Nama backup wajib diisi.' });
      const upstream = await controller(`/api/backups/${encodeURIComponent(name)}/download-ticket`, { method: 'POST', timeout: 15000 });
      const body = await upstream.json().catch(() => ({}));
      if (!upstream.ok || body.success === false) {
        return res.status(upstream.status).json({ error: body.message || 'Gagal membuat link download.' });
      }
      // Browser tidak boleh diarahkan ke URL internal/port controller (sering diblokir HTTPS atau firewall).
      // Pakai URL publik bila tersedia. Jika env publik kosong, turunkan otomatis dari hostname
      // BOT_CONTROLLER_URL dengan HTTPS dan tanpa port, misalnya:
      // http://papi.queen-official.com:5029 -> https://papi.queen-official.com
      const configuredPublic = String(
        env('BOT_CONTROLLER_PUBLIC_URL') || env('BOT_CONTROLLER_DOWNLOAD_URL') || ''
      ).trim();
      const internalBase = String(env('BOT_CONTROLLER_URL') || '').trim();
      let publicBase = configuredPublic;
      if (!publicBase && internalBase) {
        try {
          const parsed = new URL(internalBase);
          parsed.protocol = 'https:';
          parsed.port = '';
          parsed.pathname = '';
          parsed.search = '';
          parsed.hash = '';
          publicBase = parsed.toString().replace(/\/$/, '');
        } catch (_) {
          publicBase = internalBase.replace(/\/$/, '');
        }
      }
      if (!publicBase) return res.status(500).json({ error: 'Alamat publik Bot Controller belum tersedia.' });

      const ticketPath = String(body.data?.path || '');
      if (!ticketPath.startsWith('/health?downloadBackup=')) {
        return res.status(502).json({ error: 'Bot Controller mengirim jalur download yang tidak valid.' });
      }
      return res.status(200).json({
        ok: true,
        name,
        expiresAt: body.data?.expires,
        downloadUrl: `${publicBase.replace(/\/$/, '')}${ticketPath}`
      });
    }

    if (req.method === 'GET' && action === 'status') {
      const upstream = await controller(`/api/backups/jobs/${encodeURIComponent(jobId)}`);
      const body = await upstream.json().catch(() => ({}));
      if (!upstream.ok || body.success === false) return res.status(upstream.status).json({ error: body.message || 'Status backup tidak tersedia.' });
      return res.status(200).json({ ok: true, job: body.data });
    }

    if (req.method === 'GET') {
      const upstream = await controller('/api/backups');
      const body = await upstream.json().catch(() => ({}));
      if (!upstream.ok || body.success === false) return res.status(upstream.status).json({ error: body.message || 'Gagal memuat backup.' });
      return res.status(200).json({ ok: true, backups: body.data || [] });
    }

    if (req.method === 'POST') {
      const upstream = await controller('/api/backups', { method: 'POST' });
      const body = await upstream.json().catch(() => ({}));
      if (!upstream.ok || body.success === false) return res.status(upstream.status).json({ error: body.message || 'Gagal memulai backup.' });
      return res.status(202).json({ ok: true, job: body.data });
    }

    if (req.method === 'DELETE') {
      if (!name) return res.status(400).json({ error: 'Nama backup wajib diisi.' });
      const upstream = await controller(`/api/backups/${encodeURIComponent(name)}`, { method: 'DELETE' });
      const body = await upstream.json().catch(() => ({}));
      if (!upstream.ok || body.success === false) return res.status(upstream.status).json({ error: body.message || 'Gagal menghapus backup.' });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Terjadi kesalahan.' });
  }
}
  return {"default": handler, "config": config};
})();

const mod_admin_bot_orders = (() => {
  const { adminClient, env } = mod__lib;
  const { botController } = mod__bot_controller;
async function adminUser(req){
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/,''); if(!token)return null;
  const auth=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{auth:{persistSession:false}});
  const {data}=await auth.auth.getUser(token); const user=data?.user; if(!user)return null;
  const db=adminClient(); const {data:row}=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle(); return row?user:null;
}
async function handler(req,res){
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
  return {"default": handler};
})();

const mod_admin_game_orders = (() => {
  const { adminClient, env } = mod__lib;
  const { vipaymentRequest, vipaymentRows } = mod__vipayment;
async function verifyAdmin(req){
  const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim();
  if(!token) throw Object.assign(new Error("Sesi admin diperlukan."),{status:401});
  const db=adminClient();
  const {data,error}=await db.auth.getUser(token);
  if(error||!data?.user) throw Object.assign(new Error("Sesi admin tidak valid."),{status:401});
  if(data.user.id!==env("KIVOPAY_ADMIN_UUID","8ea33b7c-1b1f-4fe6-a157-ae38595eef42")) throw Object.assign(new Error("Akses ditolak."),{status:403});
  return db;
}

function normalizedStatus(value, note = "") {
  const text = `${value || ""} ${note || ""}`.toLowerCase();
  if (/\b(success|sukses|successful|completed|complete|done|finished|terkirim|berhasil)\b/.test(text)) return "completed";
  if (/\b(failed|failure|gagal|error|cancelled|canceled|cancel|rejected|ditolak)\b/.test(text)) return "failed";
  return "processing";
}

async function refreshProviderOrders(db, orders) {
  const processing = (orders || []).filter(o => o.status === "processing" && o.vip_trxid).slice(0, 30);
  for (const order of processing) {
    try {
      const provider = await vipaymentRequest("status", { trxid: order.vip_trxid });
      const row = vipaymentRows(provider)[0] || {};
      const providerStatus = String(row.status || row.state || row.transaction_status || provider?.status || order.vip_status || "waiting");
      const note = String(row.note || row.message || provider?.message || provider?.note || order.note || "");
      const status = normalizedStatus(providerStatus, note);
      const patch = { status, vip_status: providerStatus, note, vip_raw: provider, updated_at: new Date().toISOString() };
      if (status === "completed") patch.completed_at = order.completed_at || new Date().toISOString();
      const { data } = await db.from("game_orders").update(patch).eq("id", order.id).select("*").single();
      if (data) Object.assign(order, data);
    } catch (error) {
      console.error("ADMIN REFRESH VIPAYMENT", order.invoice, error.message);
    }
  }
  return orders;
}

async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  try{
    const db=await verifyAdmin(req);
    if(req.method==="GET"){
      const limit=Math.min(Math.max(Number(req.query?.limit||100),1),200);
      const {data,error}=await db.from("game_orders").select("*").order("created_at",{ascending:false}).limit(limit);
      if(error) throw error;
      const orders = await refreshProviderOrders(db, data || []);
      return res.status(200).json({orders});
    }
    if(req.method==="PATCH"){
      const id=String(req.body?.id||"").trim();
      const note=String(req.body?.note||"").trim();
      if(!id) return res.status(400).json({error:"ID order wajib diisi."});
      const {data,error}=await db.from("game_orders").update({note,updated_at:new Date().toISOString()}).eq("id",id).select("*").single();
      if(error) throw error;
      return res.status(200).json({order:data});
    }
    return res.status(405).json({error:"Method tidak diizinkan."});
  }catch(error){
    console.error("ADMIN GAME ORDERS",error);
    return res.status(error.status||500).json({error:error.message||"Gagal memuat order game."});
  }
}
  return {"default": handler};
})();

const mod_admin_reseller = (() => {
  const { optionalAuthUser } = mod__auth_user;
  const { adminClient } = mod__lib;
async function assertAdmin(db,user){
  let result=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
  if(result.error&&/relation .*admin_users|does not exist|schema cache/i.test(result.error.message||'')){
    result=await db.from('admins').select('user_id').eq('user_id',user.id).maybeSingle();
  }
  if(result.error)throw result.error;
  if(!result.data){const e=new Error('Akses hanya untuk admin.');e.status=403;throw e;}
}
const sumStock=variants=>(variants||[]).reduce((n,v)=>n+Math.max(Number(v.stock||0),0),0);

async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const user=await optionalAuthUser(req);
  if(!user)return res.status(401).json({error:'Unauthorized'});
  try{
    const db=adminClient(); await assertAdmin(db,user);
    if(req.method==='GET'){
      const [{data:settings},{data:products},{data:members},{data:orders}]=await Promise.all([
        db.from('reseller_settings').select('*').eq('id','main').maybeSingle(),
        db.from('reseller_catalog_products').select('*').order('sort_order'),
        db.from('reseller_memberships').select('*').order('joined_at',{ascending:false}),
        db.from('reseller_orders').select('*').order('created_at',{ascending:false}).limit(100)
      ]);
      return res.json({settings,products:products||[],members:members||[],orders:orders||[]});
    }
    if(req.method==='POST'){
      const a=String(req.body?.action||'');
      if(a==='settings'){
        const {data,error}=await db.from('reseller_settings').upsert({id:'main',is_open:!!req.body.is_open,join_price:Number(req.body.join_price||0),title:String(req.body.title||''),subtitle:String(req.body.subtitle||''),benefits:req.body.benefits&&typeof req.body.benefits==='object'?req.body.benefits:{},updated_at:new Date().toISOString()}).select().single();
        if(error)throw error; return res.json({settings:data});
      }
      if(a==='product'){
        const id=req.body.id||undefined;
        let variants=Array.isArray(req.body.variants)?req.body.variants:[];
        variants=variants.map((v,i)=>({
          name:String(v.name||`Paket ${i+1}`).trim(),
          normal_price:Number(v.normal_price||0),
          reseller_price:Number(v.reseller_price||0),
          delivery_mode:v.delivery_mode==='automatic'?'automatic':'manual',
          manual_type:(v.manual_type==='invite'||v.delivery_mode==='invite')?'invite':'standard',
          requires_email:v.manual_type==='invite'||v.delivery_mode==='invite'||v.requires_email===true,
          stock:Math.max(Number(v.stock||0),0)
        }));
        if(!variants.length)throw new Error('Minimal satu varian wajib dibuat.');
        const first=variants[0];
        const payload={
          name:String(req.body.name||'').trim(),category:String(req.body.category||'apk-premium'),description:String(req.body.description||'')||null,image_url:String(req.body.image_url||'')||null,
          normal_price:Math.min(...variants.map(v=>v.normal_price)),price:Math.min(...variants.map(v=>v.reseller_price)),stock:sumStock(variants),
          delivery_mode:first.delivery_mode,requires_email:first.requires_email,variants,promo_text:String(req.body.promo_text||'')||null,is_active:req.body.is_active!==false,sort_order:Number(req.body.sort_order||0),updated_at:new Date().toISOString()
        };
        if(!payload.name)throw new Error('Nama produk wajib diisi.');
        const q=id?db.from('reseller_catalog_products').update(payload).eq('id',id):db.from('reseller_catalog_products').insert(payload);
        const {data,error}=await q.select().single(); if(error)throw error;

        const original=Array.isArray(req.body.variants)?req.body.variants:[];
        const rows=[];
        original.forEach((v,i)=>{
          if(v.delivery_mode!=='automatic'||!Array.isArray(v.stock_lines))return;
          v.stock_lines.forEach(line=>{const content=String(line||'').trim();if(content)rows.push({product_id:data.id,variant_name:variants[i]?.name||'Paket utama',content});});
        });
        if(rows.length){
          const ins=await db.from('reseller_stock_items').insert(rows);if(ins.error)throw ins.error;
          const {data:available,error:ae}=await db.from('reseller_stock_items').select('variant_name').eq('product_id',data.id).eq('status','available');if(ae)throw ae;
          const counts={};(available||[]).forEach(x=>counts[x.variant_name]=(counts[x.variant_name]||0)+1);
          variants=variants.map(v=>v.delivery_mode==='automatic'?{...v,stock:Number(counts[v.name]||0)}:v);
          const upd=await db.from('reseller_catalog_products').update({variants,stock:sumStock(variants),updated_at:new Date().toISOString()}).eq('id',data.id).select().single();if(upd.error)throw upd.error;
          return res.json({product:upd.data});
        }
        return res.json({product:data});
      }
      if(a==='member'){
        const status=['active','suspended','expired'].includes(req.body.status)?req.body.status:'suspended';
        const {data,error}=await db.from('reseller_memberships').update({status,updated_at:new Date().toISOString()}).eq('id',req.body.id).select().single();if(error)throw error;return res.json({member:data});
      }
      if(a==='order'){
        const status=['processing','completed','cancelled'].includes(req.body.status)?req.body.status:'processing';
        const {data:o,error:oe}=await db.from('reseller_orders').select('*').eq('id',req.body.id).single();if(oe)throw oe;
        if(status==='cancelled'&&!o.refunded){
          const rf=await db.rpc('wallet_refund',{p_user_id:o.user_id,p_amount:Number(o.amount),p_reference:`REFUND:RESELLER:${o.invoice}`,p_description:`Refund reseller ${o.invoice}`,p_metadata:{order_id:o.id}});if(rf.error)throw rf.error;
          const {data:p}=await db.from('reseller_catalog_products').select('*').eq('id',o.product_id).single();
          if(p){const variants=(p.variants||[]).map(v=>v.name===o.variant_name?{...v,stock:Number(v.stock||0)+1}:v);await db.from('reseller_catalog_products').update({variants,stock:sumStock(variants)}).eq('id',p.id);}
        }
        const patch={status,admin_note:String(req.body.admin_note||'')||null,refunded:status==='cancelled'?true:o.refunded,completed_at:status==='completed'?new Date().toISOString():o.completed_at,updated_at:new Date().toISOString()};
        const {data,error}=await db.from('reseller_orders').update(patch).eq('id',o.id).select().single();if(error)throw error;return res.json({order:data});
      }
      return res.status(400).json({error:'Aksi tidak dikenal.'});
    }
    if(req.method==='DELETE'){
      const id=String(req.query?.id||'');const {error}=await db.from('reseller_catalog_products').delete().eq('id',id);if(error)throw error;return res.json({ok:true});
    }
    return res.status(405).json({error:'Method tidak diizinkan.'});
  }catch(e){const msg=e.message||'Gagal memproses admin reseller.';const setup=/relation .*reseller_|does not exist|schema cache/i.test(msg);return res.status(e.status||500).json({error:msg,setup_required:setup});}
}
  return {"default": handler};
})();

const mod_admin_users = (() => {
  const { adminClient, authClient } = mod__lib;
function json(res,status,body){res.status(status).setHeader('Content-Type','application/json');return res.end(JSON.stringify(body))}
async function requireAdmin(req){const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token)throw new Error('Sesi admin tidak ditemukan.');const verifier=authClient();const{data:userData,error:userError}=await verifier.auth.getUser(token);const db=adminClient();if(userError||!userData?.user)throw new Error('Sesi admin tidak valid.');const{data:admin}=await db.from('admin_users').select('user_id').eq('user_id',userData.user.id).maybeSingle();if(!admin)throw new Error('Akses hanya untuk admin.');return{db,adminUser:userData.user}}
async function handler(req,res){try{const{db,adminUser}=await requireAdmin(req);if(req.method==='GET'){const users=[];for(let page=1;page<=10;page++){const{data,error}=await db.auth.admin.listUsers({page,perPage:200});if(error)throw error;users.push(...(data.users||[]));if((data.users||[]).length<200)break}const ids=users.map(user=>user.id);let profiles=[];if(ids.length){const{data}=await db.from('profiles').select('user_id,display_name,full_name,username,role,is_banned,created_at,updated_at').in('user_id',ids);profiles=data||[]}const map=new Map(profiles.map(profile=>[profile.user_id,profile]));return json(res,200,{ok:true,users:users.map(user=>{const profile=map.get(user.id)||{};return{id:user.id,email:user.email||'',username:profile.username||user.user_metadata?.username||'',display_name:profile.full_name||profile.display_name||user.user_metadata?.full_name||'',role:profile.role||'user',is_banned:!!profile.is_banned,created_at:user.created_at,last_sign_in_at:user.last_sign_in_at,email_confirmed_at:user.email_confirmed_at,is_self:user.id===adminUser.id}})})}if(req.method==='PATCH'){const body=req.body||{},userId=String(body.user_id||'');if(!userId)return json(res,400,{ok:false,message:'User ID wajib diisi.'});if(body.password){const password=String(body.password);if(password.length<6)return json(res,400,{ok:false,message:'Password minimal 6 karakter.'});const{error}=await db.auth.admin.updateUserById(userId,{password});if(error)throw error}const patch={};if('display_name'in body){patch.display_name=String(body.display_name||'').trim();patch.full_name=patch.display_name}if('username'in body)patch.username=String(body.username||'').trim().toLowerCase();if('is_banned'in body)patch.is_banned=!!body.is_banned;if(Object.keys(patch).length){patch.updated_at=new Date().toISOString();const{error}=await db.from('profiles').update(patch).eq('user_id',userId);if(error)throw error}return json(res,200,{ok:true,message:'Data user berhasil diperbarui.'})}if(req.method==='DELETE'){const userId=String(req.query?.user_id||req.body?.user_id||'');if(!userId)return json(res,400,{ok:false,message:'User ID wajib diisi.'});if(userId===adminUser.id)return json(res,400,{ok:false,message:'Admin tidak dapat menghapus akun sendiri.'});const{error}=await db.auth.admin.deleteUser(userId);if(error)throw error;return json(res,200,{ok:true,message:'Akun user berhasil dihapus.'})}res.setHeader('Allow','GET, PATCH, DELETE');return json(res,405,{ok:false,message:'Method tidak didukung.'})}catch(error){const status=/admin|sesi/i.test(error.message||'')?401:500;return json(res,status,{ok:false,message:error.message||'Terjadi kesalahan.'})}}
  return {"default": handler};
})();

const mod_admin_wallet = (() => {
  const { adminClient, authClient } = mod__lib;
function json(res,status,body){res.status(status).setHeader('Content-Type','application/json');return res.end(JSON.stringify(body))}
async function requireAdmin(req){
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token)throw new Error('Sesi admin tidak ditemukan.');
  const verifier=authClient();
  const{data:userData,error:userError}=await verifier.auth.getUser(token);
  const db=adminClient();
  if(userError||!userData?.user)throw new Error('Sesi admin tidak valid.');
  const{data:admin}=await db.from('admin_users').select('user_id').eq('user_id',userData.user.id).maybeSingle();
  if(!admin)throw new Error('Akses hanya untuk admin.');
  return{db,adminUser:userData.user};
}
async function listAuthUsers(db){
  const users=[];
  for(let page=1;page<=10;page++){
    const{data,error}=await db.auth.admin.listUsers({page,perPage:200});
    if(error)throw error;
    users.push(...(data?.users||[]));
    if((data?.users||[]).length<200)break;
  }
  return users;
}
function profileName(p={},auth={}){
  return p.full_name||p.display_name||p.username||auth?.user_metadata?.full_name||auth?.user_metadata?.username||auth?.email?.split('@')[0]||'Pengguna KivoPay';
}
async function handler(req,res){
  try{
    const{db,adminUser}=await requireAdmin(req);
    if(req.method==='GET'){
      // Akun pengguna adalah data utama. Query tambahan tidak boleh membuat dropdown gagal.
      const profilesResult=await db.from('profiles').select('user_id,display_name,full_name,username,balance,created_at').order('balance',{ascending:false}).limit(1000);
      if(profilesResult.error)throw profilesResult.error;
      const profiles=profilesResult.data||[];

      let authUsers=[];
      let authWarning='';
      try{authUsers=await listAuthUsers(db)}catch(error){authWarning=error.message||'Daftar Auth tidak dapat dimuat.'}
      const authMap=new Map(authUsers.map(u=>[u.id,u]));
      const profileMap=new Map(profiles.map(p=>[p.user_id,p]));
      const ids=new Set([...authMap.keys(),...profileMap.keys()]);
      const users=Array.from(ids).map(userId=>{
        const auth=authMap.get(userId)||{};
        const p=profileMap.get(userId)||{};
        return{
          user_id:userId,
          ...p,
          balance:Number(p.balance||0),
          email:auth.email||'',
          username:p.username||auth?.user_metadata?.username||'',
          display_name:profileName(p,auth)
        };
      }).sort((a,b)=>b.balance-a.balance||String(a.display_name).localeCompare(String(b.display_name)));

      let deposits=[],transactions=[];
      const warnings=[];
      const depositsResult=await db.from('deposits').select('id,user_id,invoice,amount,payment_amount,unique_fee,status,created_at,paid_at,expires_at').order('created_at',{ascending:false}).limit(150);
      if(depositsResult.error)warnings.push(`Riwayat deposit: ${depositsResult.error.message}`);else deposits=depositsResult.data||[];
      const transactionsResult=await db.from('wallet_transactions').select('id,user_id,reference,type,amount,balance_after,description,metadata,created_at').order('created_at',{ascending:false}).limit(200);
      if(transactionsResult.error)warnings.push(`Audit saldo: ${transactionsResult.error.message}`);else transactions=transactionsResult.data||[];
      if(authWarning)warnings.push(`Akun Auth: ${authWarning}`);

      const decorate=row=>{
        const auth=authMap.get(row.user_id)||{};
        const p=profileMap.get(row.user_id)||{};
        return{...row,email:auth.email||'',display_name:profileName(p,auth)};
      };
      const completed=deposits.filter(x=>x.status==='completed');
      return json(res,200,{ok:true,
        warnings,
        stats:{
          total_balance:profiles.reduce((n,p)=>n+Number(p.balance||0),0),
          total_deposit:completed.reduce((n,d)=>n+Number(d.amount||0),0),
          completed_deposits:completed.length,
          pending_deposits:deposits.filter(x=>x.status==='pending').length
        },
        users,
        deposits:deposits.map(decorate),
        transactions:transactions.map(decorate)
      });
    }
    if(req.method==='POST'){
      const body=req.body||{};
      const userId=String(body.user_id||'');
      const operation=String(body.operation||'');
      const amount=Math.trunc(Number(body.amount||0));
      const reason=String(body.reason||'').trim();
      if(!userId)return json(res,400,{ok:false,message:'Pilih akun pengguna.'});
      if(!['add','subtract'].includes(operation))return json(res,400,{ok:false,message:'Jenis perubahan saldo tidak valid.'});
      if(!Number.isSafeInteger(amount)||amount<1000||amount>100000000)return json(res,400,{ok:false,message:'Nominal harus antara Rp1.000 dan Rp100.000.000.'});
      if(reason.length<5)return json(res,400,{ok:false,message:'Alasan perubahan saldo minimal 5 karakter.'});
      const reference=`ADMIN-${operation.toUpperCase()}-${Date.now()}-${userId.slice(0,8)}`;
      const{data:existingProfile,error:profileLookupError}=await db.from('profiles').select('user_id').eq('user_id',userId).maybeSingle();
      if(profileLookupError)throw profileLookupError;
      if(!existingProfile){
        const{data:authUserData,error:authUserError}=await db.auth.admin.getUserById(userId);
        if(authUserError)throw authUserError;
        const authUser=authUserData?.user;
        const fallbackName=authUser?.user_metadata?.full_name||authUser?.user_metadata?.username||authUser?.email?.split('@')[0]||'Pengguna KivoPay';
        const{error:profileError}=await db.from('profiles').insert({user_id:userId,display_name:fallbackName,full_name:fallbackName,username:authUser?.user_metadata?.username||null,balance:0});
        if(profileError)throw profileError;
      }
      const{data,error}=await db.rpc('admin_adjust_wallet',{p_user_id:userId,p_amount:amount,p_operation:operation,p_reference:reference,p_reason:reason,p_admin_user_id:adminUser.id});
      if(error)throw error;
      return json(res,200,{ok:true,message:operation==='add'?'Saldo berhasil ditambahkan.':'Saldo berhasil dikurangi.',result:data,reference});
    }
    res.setHeader('Allow','GET, POST');
    return json(res,405,{ok:false,message:'Method tidak didukung.'});
  }catch(error){
    const message=error.message||'Terjadi kesalahan.';
    const status=/admin|sesi/i.test(message)?401:/INSUFFICIENT_BALANCE/i.test(message)?400:500;
    return json(res,status,{ok:false,message:message.replace('INSUFFICIENT_BALANCE','Saldo pengguna tidak mencukupi.')});
  }
}
  return {"default": handler};
})();

const mod_anime = (() => {
const BASE = "https://api.jikan.moe/v4";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildUrl(action, query, page) {
  if (action === "search") {
    if (!query) throw new Error("Nama anime wajib diisi.");
    return `${BASE}/anime?q=${encodeURIComponent(query)}&limit=12&page=${page}&sfw=true`;
  }
  if (action === "top") {
    return `${BASE}/top/anime?filter=bypopularity&limit=12&page=${page}&sfw=true`;
  }
  if (action === "season") {
    return `${BASE}/seasons/now?limit=12&page=${page}&sfw=true`;
  }
  throw new Error("Action tidak didukung.");
}

async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=180");

  const action = String(req.query.action || "search");
  const query = String(req.query.query || "").trim();
  const page = Math.max(1, Number(req.query.page || 1));

  let url;
  try {
    url = buildUrl(action, query, page);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  try {
    let response;

    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; KivoTools/10.2)"
        },
        signal: AbortSignal.timeout(20000)
      });

      if (response.status !== 429) break;
      await sleep(900 * (attempt + 1));
    }

    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = { error: "Respons sumber anime bukan JSON.", detail: text.slice(0, 300) };
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.message || data?.error || "Sumber anime sedang bermasalah.",
        detail: data
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({
      error: "Gagal terhubung ke sumber anime.",
      detail: error?.message || "Unknown error"
    });
  }
}
  return {"default": handler};
})();

const mod_bot_orders = (() => {
  const { optionalAuthUser } = mod__auth_user;
  const { adminClient } = mod__lib;
  const { botController } = mod__bot_controller;
const finalStatus = new Set(['expired','deleted','failed']);
async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await optionalAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Silakan login.' });
  const db = adminClient();
  try {
    if (req.method === 'GET') {
      const invoice = String(req.query?.invoice || '').trim();
      let query = db.from('bot_orders').select('*').eq('user_id', user.id).order('created_at', { ascending:false });
      if (invoice) query = query.eq('invoice', invoice).limit(1);
      else query = query.limit(100);
      const { data, error } = await query;
      if (error) throw error;
      const rows = [];
      for (const row of data || []) {
        let next = row;
        if (row.session_id && !finalStatus.has(row.status)) {
          try {
            const session = await botController(`/api/sessions/${encodeURIComponent(row.session_id)}`);
            const update = {
              status: session.status || row.status,
              pairing_code: session.pairingCode || row.pairing_code,
              connected_at: session.connectedAt || row.connected_at,
              last_seen_at: session.lastSeenAt || row.last_seen_at,
              expires_at: session.expiresAt || row.expires_at,
              error_message: session.error || null,
              controller_data: session,
              updated_at: new Date().toISOString()
            };
            const result = await db.from('bot_orders').update(update).eq('id', row.id).select('*').single();
            if (!result.error) next = result.data;
          } catch {}
        }
        rows.push(next);
      }
      return res.status(200).json({ ok:true, orders: rows });
    }
    if (req.method === 'POST') {
      const invoice = String(req.body?.invoice || '').trim();
      const action = String(req.body?.action || '').trim();
      const { data: order, error } = await db.from('bot_orders').select('*').eq('invoice', invoice).eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      if (!order) return res.status(404).json({ error:'Pesanan tidak ditemukan.' });
      if (!['restart','pairing'].includes(action)) return res.status(400).json({ error:'Aksi tidak tersedia.' });
      let session;
      try {
        session = await botController(`/api/sessions/${encodeURIComponent(order.session_id)}/${action}`, { method:'POST', body: action === 'pairing' ? { phone: order.phone } : {} });
      } catch (controllerError) {
        // Pairing tetap diproses oleh controller meskipun koneksi Vercel selesai lebih dulu.
        // Kembalikan status pending agar frontend melanjutkan polling tanpa alert timeout palsu.
        if (action === 'pairing' && /timeout|aborted/i.test(String(controllerError?.message || controllerError))) {
          await db.from('bot_orders').update({ status:'connecting', error_message:null, updated_at:new Date().toISOString() }).eq('id', order.id);
          return res.status(202).json({ ok:true, pending:true, message:'Pairing sedang diproses.' });
        }
        throw controllerError;
      }
      const { data: fresh } = await db.from('bot_orders').update({ status: session.status || order.status, pairing_code: session.pairingCode || null, error_message:null, controller_data: session, updated_at:new Date().toISOString() }).eq('id', order.id).select('*').single();
      return res.status(200).json({ ok:true, order:fresh || order });
    }
    return res.status(405).json({ error:'Method tidak diizinkan.' });
  } catch (error) { return res.status(500).json({ error:error.message }); }
}
  return {"default": handler};
})();

const mod_bot_plugins = (() => {
  const { optionalAuthUser } = mod__auth_user;
  const { adminClient } = mod__lib;
  const { botController } = mod__bot_controller;
async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await optionalAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Silakan login.' });
  const invoice = String(req.method === 'GET' ? req.query?.invoice : req.body?.invoice || '').trim();
  if (!invoice) return res.status(400).json({ error: 'Invoice wajib diisi.' });
  const db = adminClient();
  try {
    const { data: order, error } = await db.from('bot_orders').select('*').eq('invoice', invoice).eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (!order?.session_id) return res.status(404).json({ error: 'Session bot tidak ditemukan.' });
    if (['expired','deleted','failed'].includes(order.status)) return res.status(400).json({ error: 'Bot ini sudah tidak aktif.' });

    const base = `/api/sessions/${encodeURIComponent(order.session_id)}/plugins`;
    if (req.method === 'GET') {
      const plugins = await botController(base);
      return res.status(200).json({ ok: true, order: { invoice: order.invoice, bot_name: order.bot_name, phone: order.phone, status: order.status }, plugins });
    }
    if (req.method === 'POST') {
      const pluginId = String(req.body?.plugin_id || '').trim();
      const installed = req.body?.installed !== false;
      if (!pluginId) return res.status(400).json({ error: 'Plugin tidak valid.' });
      const result = await botController(`${base}/${encodeURIComponent(pluginId)}`, { method: 'POST', body: { installed } });
      return res.status(200).json({ ok: true, result });
    }
    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Gagal memproses plugin.' });
  }
}
  return {"default": handler};
})();

const mod_cancel_deposit = (() => {
  const { optionalAuthUser } = mod__auth_user;
  const { adminClient, getSanpayMutasi, mutationMatchesOrder, mutasiKey } = mod__lib;
const publicDeposit=d=>({invoice:d.invoice,amount:d.amount,payment_amount:d.payment_amount,unique_fee:d.unique_fee,status:d.status,expires_at:d.expires_at,paid_at:d.paid_at,created_at:d.created_at,qr_content:d.qr_content||null,qr_image:d.qr_image||null});

async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method tidak diizinkan.'});
  try{
    const user=await optionalAuthUser(req);if(!user)return res.status(401).json({error:'Silakan masuk terlebih dahulu.'});
    const invoice=String(req.body?.invoice||'').trim();if(!invoice)return res.status(400).json({error:'Invoice wajib diisi.'});
    const db=adminClient();
    let {data:deposit,error}=await db.from('deposits').select('*').eq('invoice',invoice).eq('user_id',user.id).maybeSingle();
    if(error)throw error;if(!deposit)return res.status(404).json({error:'Deposit tidak ditemukan.'});
    if(deposit.status!=='pending')return res.status(409).json({error:`Deposit sudah berstatus ${deposit.status} dan tidak dapat dibatalkan.`});

    // Cek mutasi sekali lagi agar pembayaran yang sudah masuk tidak ikut dibatalkan.
    const mutations=await getSanpayMutasi();
    const match=mutations.find(m=>mutationMatchesOrder(m,deposit));
    if(match){
      const done=await db.rpc('complete_paid_deposit',{p_deposit_id:deposit.id,p_mutation_key:mutasiKey(match),p_mutation_data:match});
      if(done.error)throw done.error;
      const fresh=await db.from('deposits').select('*').eq('id',deposit.id).single();if(fresh.error)throw fresh.error;
      return res.status(409).json({error:'Pembayaran sudah terdeteksi. Deposit tidak dapat dibatalkan.',deposit:publicDeposit(fresh.data)});
    }

    const {data:cancelled,error:cancelError}=await db.from('deposits').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',deposit.id).eq('status','pending').select('*').maybeSingle();
    if(cancelError)throw cancelError;if(!cancelled)return res.status(409).json({error:'Status deposit sudah berubah. Silakan refresh halaman.'});
    return res.status(200).json({message:'Deposit berhasil dibatalkan.',deposit:publicDeposit(cancelled)});
  }catch(error){console.error('CANCEL DEPOSIT ERROR',error);return res.status(500).json({error:error.message||'Gagal membatalkan deposit.'});}
}
  return {"default": handler};
})();

const mod_chat_message = (() => {
  const { adminClient } = mod__lib;
const clean = value => String(value || "").replace(/\s+/g, " ").trim();
const blocked = [
  "kontol","memek","ngentot","bangsat","anjing","babi","tolol",
  "scam","penipu","carding","judi","slot"
];

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method tidak diizinkan." });
  }

  try {
    const db = adminClient();
    const guestId = clean(req.body?.guest_id).slice(0, 80);
    const nickname = clean(req.body?.nickname).slice(0, 28);
    const message = clean(req.body?.message).slice(0, 520);

    if (!guestId || nickname.length < 2 || message.length < 2) {
      return res.status(400).json({ error: "Nama dan pesan wajib diisi." });
    }

    const lower = `${nickname} ${message}`.toLowerCase();
    if (blocked.some(word => lower.includes(word))) {
      return res.status(400).json({ error: "Pesan mengandung kata yang tidak diperbolehkan." });
    }

    const since = new Date(Date.now() - 15000).toISOString();
    const { count, error: countError } = await db
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("guest_id", guestId)
      .gte("created_at", since);

    if (countError) throw countError;
    if (count) {
      return res.status(429).json({ error: "Tunggu 15 detik sebelum mengirim pesan lagi." });
    }

    const { data, error } = await db
      .from("chat_messages")
      .insert({ guest_id: guestId, nickname, message, is_visible: true })
      .select("id,nickname,message,created_at")
      .single();

    if (error) throw error;
    return res.status(200).json({ message: data });
  } catch (error) {
    console.error("CHAT MESSAGE ERROR", error);
    return res.status(500).json({ error: error.message || "Pesan gagal dikirim." });
  }
}
  return {"default": handler};
})();

const mod_check_deposit = (() => {
  const { optionalAuthUser } = mod__auth_user;
  const { adminClient, getSanpayMutasi, mutationMatchesOrder, mutasiKey } = mod__lib;
const publicDeposit=d=>({invoice:d.invoice,amount:d.amount,payment_amount:d.payment_amount,unique_fee:d.unique_fee,status:d.status,expires_at:d.expires_at,paid_at:d.paid_at,created_at:d.created_at,qr_content:d.qr_content||null,qr_image:d.qr_image||null});
async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    const user=await optionalAuthUser(req); if(!user)return res.status(401).json({error:'Silakan masuk terlebih dahulu.'});
    const invoice=String(req.query?.invoice||req.body?.invoice||'').trim(); if(!invoice)return res.status(400).json({error:'Invoice wajib diisi.'});
    const db=adminClient(); let {data:deposit,error}=await db.from('deposits').select('*').eq('invoice',invoice).eq('user_id',user.id).maybeSingle();
    if(error)throw error; if(!deposit)return res.status(404).json({error:'Deposit tidak ditemukan.'});
    if(deposit.status==='pending'&&new Date(deposit.expires_at).getTime()<=Date.now()){
      const expired=await db.rpc('expire_pending_deposit',{p_deposit_id:deposit.id}); if(expired.error)throw expired.error;
      const fresh=await db.from('deposits').select('*').eq('id',deposit.id).single(); if(fresh.error)throw fresh.error; deposit=fresh.data;
    }
    if(deposit.status==='pending'){
      const mutations=await getSanpayMutasi(); const match=mutations.find(m=>mutationMatchesOrder(m,deposit));
      if(match){const done=await db.rpc('complete_paid_deposit',{p_deposit_id:deposit.id,p_mutation_key:mutasiKey(match),p_mutation_data:match});if(done.error)throw done.error;const fresh=await db.from('deposits').select('*').eq('id',deposit.id).single();if(fresh.error)throw fresh.error;deposit=fresh.data;}
    }
    return res.status(200).json({deposit:publicDeposit(deposit)});
  }catch(error){console.error('CHECK DEPOSIT ERROR',error);return res.status(500).json({error:error.message||'Gagal mengecek deposit.'});}
}
  return {"default": handler};
})();

const mod_check_game_payment = (() => {
  const { adminClient, getSanpayMutasi, mutationMatchesOrder, mutasiKey } = mod__lib;
  const { vipaymentRequest, vipaymentRows } = mod__vipayment;
const publicOrder = (order) => ({
  invoice: order.invoice,
  game_name: order.game_name,
  service_name: order.service_name,
  target: order.target,
  zone: order.zone,
  payment_amount: order.payment_amount,
  status: order.status,
  provider_id: order.vip_trxid,
  provider_status: order.vip_status,
  customer_name: order.customer_name,
  customer_contact: order.customer_contact,
  form_data: order.form_data || {},
  paid_at: order.paid_at,
  completed_at: order.completed_at,
  updated_at: order.updated_at,
  note: order.note,
  expires_at: order.expires_at,
  qr_content: order.qr_content,
  qr_image: order.qr_image,
  created_at: order.created_at,
});

function normalizeProviderStatus(value, note = "") {
  const text = `${value || ""} ${note || ""}`.trim().toLowerCase();
  if (/\b(success|sukses|successful|completed|complete|done|finished|terkirim|berhasil)\b/.test(text)) return "completed";
  if (/\b(failed|failure|gagal|error|cancelled|canceled|cancel|rejected|ditolak)\b/.test(text)) return "failed";
  return "processing";
}

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const invoice = String(req.query?.invoice || req.body?.invoice || "").trim();
  if (!invoice) return res.status(400).json({ error: "Invoice wajib diisi." });

  try {
    const db = adminClient();
    let { data: order, error } = await db.from("game_orders").select("*").eq("invoice", invoice).maybeSingle();
    if (error) throw error;
    if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });

    if (order.status === "pending" && new Date(order.expires_at).getTime() <= Date.now()) {
      await db.from("game_orders").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", order.id);
      order.status = "expired";
    }

    if (order.status === "pending") {
      const mutations = await getSanpayMutasi();
      const mutation = mutations.find((entry) => mutationMatchesOrder(entry, order));
      if (mutation) {
        await db.from("game_orders").update({
          status: "paid",
          paid_at: new Date().toISOString(),
          mutation_key: mutasiKey(mutation),
          mutation_data: mutation,
          updated_at: new Date().toISOString(),
        }).eq("id", order.id);

        try {
          const provider = await vipaymentRequest("order", {
            service: order.service_code,
            data_no: order.target,
            data_zone: order.zone || undefined,
            post_additional_data: order.additional_data || undefined,
          });
          const data = provider?.data || {};
          await db.from("game_orders").update({
            status: "processing",
            vip_trxid: String(data.trxid || ""),
            vip_status: String(data.status || "waiting"),
            note: String(data.note || provider?.message || "Pesanan sedang diproses."),
            vip_raw: provider,
            updated_at: new Date().toISOString(),
          }).eq("id", order.id);
        } catch (providerError) {
          await db.from("game_orders").update({
            status: "failed",
            vip_status: "error",
            note: providerError.message,
            updated_at: new Date().toISOString(),
          }).eq("id", order.id);
        }
      }
    }

    ({ data: order, error } = await db.from("game_orders").select("*").eq("id", order.id).single());
    if (error) throw error;

    if (order.status === "processing" && order.vip_trxid) {
      try {
        const provider = await vipaymentRequest("status", { trxid: order.vip_trxid });
        const data = vipaymentRows(provider)[0] || {};
        const providerStatus = String(data.status || data.state || data.transaction_status || provider?.status || order.vip_status || "waiting");
        const note = String(data.note || data.message || provider?.message || provider?.note || order.note || "");
        const status = normalizeProviderStatus(providerStatus, note);
        await db.from("game_orders").update({
          status,
          vip_status: providerStatus,
          note,
          vip_raw: provider,
          completed_at: status === "completed" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        }).eq("id", order.id);
        order = { ...order, status, vip_status: providerStatus, note };
      } catch (statusError) {
        console.error("VIPAYMENT STATUS", statusError);
      }
    }

    return res.status(200).json({ order: publicOrder(order) });
  } catch (error) {
    console.error("CHECK GAME PAYMENT", error);
    return res.status(500).json({ error: error.message || "Gagal mengecek transaksi." });
  }
}
  return {"default": handler};
})();

const mod_check_payment = (() => {
  const { adminClient, getSanpayMutasi, mutationMatchesOrder, mutasiKey, publicOrder } = mod__lib;
async function handler(req,res){
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
      const match=mutations.find(m=>mutationMatchesOrder(m,order));
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
  return {"default": handler};
})();

const mod_check_robux_payment = (() => {
  const { adminClient, getSanpayMutasi, mutationMatchesOrder, mutasiKey } = mod__lib;
async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const invoice=String(req.query?.invoice||req.body?.invoice||'').trim();
  if(!invoice) return res.status(400).json({error:'Invoice wajib diisi.'});
  try{
    const db=adminClient();
    let {data:order,error}=await db.from('robux_orders').select('*').eq('invoice',invoice).maybeSingle();
    if(error) throw error; if(!order) return res.status(404).json({error:'Pesanan Robux tidak ditemukan.'});
    if(order.status==='pending' && new Date(order.expires_at).getTime()<=Date.now()){
      const changed=await db.from('robux_orders').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',order.id).eq('status','pending').select('*').maybeSingle();
      order=changed.data||{...order,status:'cancelled'};
    }
    if(order.status==='pending'){
      const mutations=await getSanpayMutasi();
      const match=mutations.find(m=>mutationMatchesOrder(m,order));
      if(match){
        const key=mutasiKey(match);
        const [{data:usedRobux},{data:usedStore}]=await Promise.all([
          db.from('robux_orders').select('id').eq('payment_reference',key).neq('id',order.id).maybeSingle(),
          db.from('orders').select('id').eq('payment_reference',key).maybeSingle()
        ]);
        if(!usedRobux && !usedStore){
          const {data:fresh,error:ue}=await db.from('robux_orders').update({status:'paid',paid_at:new Date().toISOString(),payment_reference:key,payment_raw:match,updated_at:new Date().toISOString()}).eq('id',order.id).eq('status','pending').select('*').single();
          if(ue) throw ue; order=fresh;
        }
      }
    }
    return res.status(200).json({order:publicRobux(order)});
  }catch(e){console.error('CHECK ROBUX PAYMENT ERROR',e);return res.status(500).json({error:e.message||'Gagal mengecek pembayaran.'});}
}
function publicRobux(o){return {invoice:o.invoice,method_name:o.method_name,package_label:o.package_label,robux_amount:o.robux_amount,amount:o.amount,payment_amount:o.payment_amount,unique_fee:o.unique_fee,username:o.username,whatsapp:o.whatsapp,status:o.status,expires_at:o.expires_at,paid_at:o.paid_at,created_at:o.created_at,updated_at:o.updated_at,admin_note:o.admin_note||'',qr_content:o.qr_content||'',qr_image:o.qr_image||''};}
  return {"default": handler};
})();

const mod_community_feed = (() => {
  const { adminClient } = mod__lib;
async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "GET") return res.status(405).json({ error: "Method tidak diizinkan." });

  try {
    const db = adminClient();
    const [{ data: ratings, error: ratingError }, { data: messages, error: chatError }] = await Promise.all([
      db.from("product_ratings")
        .select("id,customer_name,rating,review,created_at,products(name)")
        .eq("is_visible", true)
        .order("created_at", { ascending: false })
        .limit(20),
      db.from("chat_messages")
        .select("id,guest_id,nickname,message,created_at,is_visible")
        .eq("is_visible", true)
        .order("created_at", { ascending: false })
        .limit(50)
    ]);

    if (ratingError) throw ratingError;
    if (chatError) throw chatError;
    return res.status(200).json({ ratings: ratings || [], messages: (messages || []).reverse() });
  } catch (error) {
    console.error("COMMUNITY FEED ERROR", error);
    return res.status(500).json({ error: error.message || "Komunitas gagal dimuat." });
  }
}
  return {"default": handler};
})();

const mod_create_bot_order = (() => {
  const { optionalAuthUser } = mod__auth_user;
  const { adminClient, invoiceId } = mod__lib;
  const { botController, normalizePhone, rentalDays } = mod__bot_controller;
async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method tidak diizinkan.' });
  const authUser = await optionalAuthUser(req);
  if (!authUser) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
  const db = adminClient();
  let order = null;
  let debited = false;
  try {
    const productId = String(req.body?.product_id || '').trim();
    const variantIndex = Number(req.body?.variant_index || 0);
    const customerName = String(req.body?.customer_name || '').trim();
    const phone = normalizePhone(req.body?.customer_contact || req.body?.phone);
    const botName = String(req.body?.bot_name || 'KEIINEXUS').trim().slice(0, 60);
    const prefix = String(req.body?.prefix || '.').trim().slice(0, 5) || '.';
    if (!productId || !customerName) return res.status(400).json({ error: 'Data pesanan belum lengkap.' });

    const { data: product, error: pe } = await db.from('products').select('*').eq('id', productId).eq('is_active', true).eq('category', 'sewa-bot').maybeSingle();
    if (pe) throw pe;
    if (!product) return res.status(404).json({ error: 'Produk sewa bot tidak ditemukan.' });
    if (Number(product.stock || 0) <= 0) return res.status(409).json({ error: 'Slot sewa bot sedang penuh.' });

    const variants = Array.isArray(product.variants) ? product.variants : [];
    const variant = variants[variantIndex] || { name: 'Paket utama', price: product.price };
    const amount = Number(variant.price ?? product.price);
    const durationDays = Number(variant.duration_days || variant.days || rentalDays(variant.name, 30));
    const invoice = invoiceId().replace('KIVO-', 'BOT-');
    const sessionId = invoice.replace(/[^A-Z0-9_-]/gi, '').slice(0, 70);
    const expiresAt = new Date(Date.now() + durationDays * 86400000).toISOString();

    const { data: inserted, error: oe } = await db.from('bot_orders').insert({
      invoice, user_id: authUser.id, product_id: product.id, product_name: product.name,
      variant_name: String(variant.name || 'Paket utama'), amount, customer_name: customerName,
      phone, bot_name: botName, prefix, duration_days: durationDays, session_id: sessionId,
      status: 'creating', expires_at: expiresAt
    }).select('*').single();
    if (oe) throw oe;
    order = inserted;

    const debit = await db.rpc('wallet_debit', {
      p_user_id: authUser.id, p_amount: amount, p_reference: `BOT:${invoice}`,
      p_description: `Sewa bot ${product.name}`, p_metadata: { bot_order_id: order.id, invoice }
    });
    if (debit.error) {
      if (String(debit.error.message || '').includes('INSUFFICIENT_BALANCE')) { const e = new Error('Saldo KivoPay tidak cukup.'); e.statusCode = 402; e.needDeposit = true; throw e; }
      throw debit.error;
    }
    debited = true;

    // Controller hanya menerima pekerjaan lalu pairing dibuat di background.
    // Request ini harus selesai cepat agar Vercel tidak memutus koneksi.
    const session = await botController('/api/sessions', { method: 'POST', timeout: 12000, body: {
      session_id: sessionId, phone, duration_days: durationDays, expires_at: expiresAt,
      order_id: order.id, user_id: authUser.id, product_id: product.id, bot_name: botName, prefix
    }});

    const { data: fresh, error: ue } = await db.from('bot_orders').update({
      status: session.status || 'creating', pairing_code: session.pairingCode || null,
      controller_data: session, error_message: null, updated_at: new Date().toISOString()
    }).eq('id', order.id).select('*').single();
    if (ue) throw ue;
    await db.from('products').update({ stock: Math.max(Number(product.stock || 0) - 1, 0), updated_at: new Date().toISOString() }).eq('id', product.id);
    return res.status(200).json({ ok: true, order: fresh, balance_after: debit.data?.balance });
  } catch (error) {
    console.error('CREATE BOT ORDER', error);
    if (order) await db.from('bot_orders').update({ status: 'failed', error_message: error.message, updated_at: new Date().toISOString() }).eq('id', order.id);
    if (debited && order) {
      try { await db.rpc('wallet_refund', { p_user_id: authUser.id, p_amount: order.amount, p_reference: `REFUND:BOT:${order.invoice}`, p_description: `Pengembalian ${order.invoice}`, p_metadata: { reason: error.message } }); } catch {}
    }
    return res.status(error.statusCode || 500).json({ error: error.message || 'Gagal membuat bot.', need_deposit: Boolean(error.needDeposit) });
  }
}
  return {"default": handler};
})();

const mod_create_deposit = (() => {
  const { optionalAuthUser } = mod__auth_user;
  const { adminClient, createSanpayQris, uniqueFee, invoiceId } = mod__lib;
const publicDeposit = d => ({invoice:d.invoice,amount:d.amount,payment_amount:d.payment_amount,unique_fee:d.unique_fee,status:d.status,expires_at:d.expires_at,paid_at:d.paid_at,created_at:d.created_at,qr_content:d.qr_content||null,qr_image:d.qr_image||null});

async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({error:'Method tidak diizinkan.'});
  try{
    const user=await optionalAuthUser(req);
    if(!user) return res.status(401).json({error:'Silakan masuk terlebih dahulu.'});
    const amount=Math.round(Number(req.body?.amount||0));
    if(!Number.isFinite(amount)||amount<2000||amount>2000000||amount%1000!==0)
      return res.status(400).json({error:'Nominal deposit harus Rp2.000–Rp2.000.000 dan kelipatan Rp1.000.'});
    const db=adminClient(), fee=uniqueFee(), paymentAmount=amount+fee, invoice=invoiceId().replace('KIVO-','KIVO-DEP-');
    const expiresAt=new Date(Date.now()+Number(process.env.PAYMENT_EXPIRE_MINUTES||10)*60000).toISOString();
    const {data:deposit,error:insertError}=await db.from('deposits').insert({user_id:user.id,invoice,amount,payment_amount:paymentAmount,unique_fee:fee,status:'pending',expires_at:expiresAt}).select('*').single();
    if(insertError) throw insertError;
    try{
      const payment=await createSanpayQris(paymentAmount,invoice,`Deposit saldo KivoPay ${invoice}`);
      const {data:updated,error:updateError}=await db.from('deposits').update({payment_reference:payment.transactionId,qr_content:payment.qrContent||null,qr_image:payment.qrImage||null,payment_raw:payment.raw,updated_at:new Date().toISOString()}).eq('id',deposit.id).select('*').single();
      if(updateError) throw updateError;
      return res.status(200).json({deposit:publicDeposit(updated)});
    }catch(error){
      await db.from('deposits').update({status:'cancelled',payment_raw:{error:error.message},updated_at:new Date().toISOString()}).eq('id',deposit.id);
      throw error;
    }
  }catch(error){console.error('CREATE DEPOSIT ERROR',error);return res.status(500).json({error:error.message||'Gagal membuat deposit.'});}
}
  return {"default": handler};
})();

const mod_create_game_order = (() => {
  const { optionalAuthUser } = mod__auth_user;
  const { adminClient, createSanpayQris, uniqueFee, invoiceId } = mod__lib;
  const { vipaymentRequest, vipaymentRows, vipaymentService } = mod__vipayment;
function isActive(status) {
  return String(status || "available").toLowerCase() === "available";
}

function categoryOf(name) {
  const n = String(name || "").toLowerCase();
  const streaming = ["iqiyi", "netflix", "spotify", "youtube", "viu", "vidio", "wetv", "disney", "prime video", "hbo", "canva", "capcut", "alight motion", "bstation", "vision+", "mola", "loklok"];
  const voucher = ["voucher", "gift card", "steam wallet", "google play", "itunes", "playstation", "xbox", "garena shells", "razergold", "wallet"];
  if (streaming.some((key) => n.includes(key))) return "streaming";
  if (voucher.some((key) => n.includes(key))) return "voucher";
  return "other";
}

function usesStockValidation(name) {
  return ["streaming", "voucher"].includes(categoryOf(name));
}

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method tidak diizinkan." });

  try {
    const service = String(req.body?.service || "").trim();
    const target = String(req.body?.target || "").trim();
    const zone = String(req.body?.zone || "").trim();
    const additionalData = String(req.body?.additional_data || "").trim();
    const formData = req.body?.form_data && typeof req.body.form_data === 'object' ? req.body.form_data : {};
    const customerName = String(req.body?.customer_name || "").trim();
    const customerContact = String(req.body?.customer_contact || "").trim();
    const paymentMethod = String(req.body?.payment_method || "qris").toLowerCase() === "balance" ? "balance" : "qris";

    if (!service || !target || !customerName || !customerContact) {
      return res.status(400).json({ error: "Data checkout belum lengkap." });
    }

    const catalog = await vipaymentRequest("services", { filter_status: "available" });
    const item = vipaymentRows(catalog)
      .map(vipaymentService)
      .find((entry) => entry.code === service && isActive(entry.status));

    if (!item) return res.status(409).json({ error: "Layanan sedang tidak tersedia." });
    if (usesStockValidation(item.game) && item.stock !== null && item.stock < 1) {
      return res.status(409).json({ error: "Stok produk sedang habis. Silakan pilih produk lain." });
    }

    const db = adminClient();
    const authUser = await optionalAuthUser(req);
    const { data: gameConfig } = await db.from('game_catalog').select('form_schema').eq('vip_brand', item.game).maybeSingle();
    const schema = Array.isArray(gameConfig?.form_schema) ? gameConfig.form_schema : [];
    for (const field of schema) {
      const value = String(formData[field.key] ?? '').trim();
      if (field.required && !value) return res.status(400).json({ error: `${field.label || field.key} wajib diisi.` });
    }

    const cost = Number(item.price || 0);
    if (!cost) return res.status(409).json({ error: "Harga layanan VIPayment tidak valid." });

    const lowProfit = Number(process.env.VIPAYMENT_PROFIT_MIN || 2000);
    const maxProfit = Number(process.env.VIPAYMENT_PROFIT_MAX || 3000);
    const threshold = Number(process.env.VIPAYMENT_PROFIT_THRESHOLD || 10000);
    const amount = cost + (cost < threshold ? lowProfit : maxProfit);
    const fee = paymentMethod === "balance" ? 0 : uniqueFee();
    const paymentAmount = amount + fee;
    const invoice = invoiceId();
    const expiresAt = new Date(Date.now() + Number(process.env.PAYMENT_EXPIRE_MINUTES || 10) * 60000).toISOString();

    if (paymentMethod === "balance" && !authUser) return res.status(401).json({ error: "Silakan masuk untuk menggunakan Saldo KivoPay." });
    const payment = paymentMethod === "qris" ? await createSanpayQris(paymentAmount, invoice, `Top Up ${item.game} - ${item.name}`) : null;
    const { data, error } = await db
      .from("game_orders")
      .insert({
        invoice,
        service_code: service,
        game_name: item.game,
        service_name: item.name,
        target,
        zone: zone || null,
        additional_data: additionalData || null,
        form_data: formData,
        cost_price: cost,
        sell_price: amount,
        payment_amount: paymentAmount,
        unique_fee: fee,
        customer_name: customerName,
        customer_contact: customerContact,
        status: "pending",
        expires_at: expiresAt,
        payment_reference: payment?.transactionId || null,
        qr_content: payment?.qrContent || null,
        qr_image: payment?.qrImage || null,
        payment_raw: payment?.raw || null,
        payment_method: paymentMethod,
        user_id: authUser?.id || null,
      })
      .select("*")
      .single();

    if (error) throw error;

    if (paymentMethod === "balance") {
      const debit = await db.rpc("wallet_debit", { p_user_id: authUser.id, p_amount: amount, p_reference: `GAME:${invoice}`, p_description: `Top Up ${item.game} - ${item.name}`, p_metadata: { order_id: data.id, invoice } });
      if (debit.error) {
        await db.from("game_orders").update({ status: "cancelled", note: debit.error.message }).eq("id", data.id);
        if (String(debit.error.message || "").includes("INSUFFICIENT_BALANCE")) return res.status(402).json({ error: "Saldo KivoPay tidak cukup.", need_deposit: true });
        throw debit.error;
      }
      try {
        const provider = await vipaymentRequest("order", { service: data.service_code, data_no: data.target, data_zone: data.zone || undefined, post_additional_data: data.additional_data || undefined });
        const pd = provider?.data || {};
        await db.from("game_orders").update({ status: "processing", paid_at: new Date().toISOString(), vip_trxid: String(pd.trxid || ""), vip_status: String(pd.status || "waiting"), note: String(pd.note || provider?.message || "Pesanan sedang diproses."), vip_raw: provider, updated_at: new Date().toISOString() }).eq("id", data.id);
        data.status = "processing"; data.paid_at = new Date().toISOString();
      } catch (providerError) {
        await db.rpc("wallet_refund", { p_user_id: authUser.id, p_amount: amount, p_reference: `REFUND:GAME:${invoice}`, p_description: `Pengembalian ${invoice}`, p_metadata: { reason: providerError.message } });
        await db.from("game_orders").update({ status: "failed", vip_status: "error", note: providerError.message, updated_at: new Date().toISOString() }).eq("id", data.id);
        throw new Error("Pesanan gagal dikirim. Saldo sudah dikembalikan.");
      }
    }

    return res.status(200).json({
      order: {
        invoice: data.invoice,
        game_name: data.game_name,
        service_name: data.service_name,
        target: data.target,
        zone: data.zone,
        payment_amount: data.payment_amount,
        status: data.status,
        expires_at: data.expires_at,
        qr_content: data.qr_content,
        qr_image: data.qr_image,
        payment_method: paymentMethod,
      },
    });
  } catch (error) {
    console.error("CREATE GAME ORDER", error);
    return res.status(500).json({ error: error.message || "Gagal membuat pesanan game." });
  }
}
  return {"default": handler};
})();

const mod_create_nokos_order = (() => {
  const { optionalAuthUser } = mod__auth_user;
  const { adminClient, invoiceId } = mod__lib;
  const { rumahOtp, safeSupplierError } = mod__rumahotp;
async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({error:'Method tidak diizinkan.'});
  let debited=false, order=null, user=null, amount=0, invoice='';
  try{
    user=await optionalAuthUser(req);
    if(!user) return res.status(401).json({error:'Silakan login terlebih dahulu.'});
    const serviceId=Number(req.body?.service_id), numberId=Number(req.body?.number_id), operatorId=Number(req.body?.operator_id);
    const providerId=String(req.body?.provider_id||'').trim();
    if(!serviceId||!numberId||!providerId||!operatorId) return res.status(400).json({error:'Data aplikasi, negara, provider, atau operator belum lengkap.'});
    const db=adminClient();
    const {data:settings,error:settingsError}=await db.from('nokos_settings').select('*').eq('id',1).single();
    if(settingsError) throw settingsError;
    if(settings.enabled===false) return res.status(503).json({error:'Katalog Nokos sedang ditutup sementara.'});
    const [services,countries]=await Promise.all([rumahOtp('/v2/services'),rumahOtp('/v2/countries',{service_id:serviceId})]);
    const service=(services.data||[]).find(x=>Number(x.service_code)===serviceId);
    const country=(countries.data||[]).find(x=>Number(x.number_id)===numberId);
    const priceItem=(country?.pricelist||[]).find(x=>String(x.provider_id)===providerId && x.available!==false && Number(x.stock||0)>0);
    if(!service||!country||!priceItem) return res.status(409).json({error:'Layanan sudah berubah atau stok sedang habis. Silakan pilih ulang.'});
    const supplierPrice=Number(priceItem.price||0), margin=Math.max(0,Number(settings.global_margin||0));
    amount=supplierPrice+margin; invoice=invoiceId().replace('KIVO-','NOKOS-');
    const expiresAt=new Date(Date.now()+20*60*1000).toISOString();
    const insert=await db.from('nokos_orders').insert({invoice,user_id:user.id,service_id:serviceId,service_name:service.service_name,service_img:service.service_img,country_name:country.name,country_iso:country.iso_code,country_prefix:country.prefix,number_id:numberId,provider_id:providerId,operator_id:operatorId,supplier_price:supplierPrice,sell_price:amount,status:'creating',expires_at:expiresAt}).select('*').single();
    if(insert.error) throw insert.error; order=insert.data;
    const debit=await db.rpc('wallet_debit',{p_user_id:user.id,p_amount:amount,p_reference:`NOKOS:${invoice}`,p_description:`Nokos ${service.service_name} - ${country.name}`,p_metadata:{order_id:order.id,invoice}});
    if(debit.error){await db.from('nokos_orders').update({status:'failed',note:debit.error.message}).eq('id',order.id);if(String(debit.error.message).includes('INSUFFICIENT_BALANCE'))return res.status(402).json({error:'Saldo KivoPay tidak cukup.',need_deposit:true});throw debit.error;}
    debited=true;
    const supplier=await rumahOtp('/v2/orders',{number_id:numberId,provider_id:providerId,operator_id:operatorId});
    const d=supplier.data||{};
    const update={supplier_order_id:String(d.order_id||''),phone_number:String(d.phone_number||''),operator_name:String(d.operator||''),supplier_price:Number(d.price||supplierPrice),status:'received',supplier_status:'received',created_supplier_at:d.created_at?new Date(Number(d.created_at)).toISOString():null,expires_at:d.expired_at?new Date(Number(d.expired_at)).toISOString():expiresAt,supplier_raw:supplier,updated_at:new Date().toISOString()};
    const saved=await db.from('nokos_orders').update(update).eq('id',order.id).select('*').single();
    if(saved.error) throw saved.error;
    return res.status(200).json({success:true,order:publicOrder(saved.data)});
  }catch(e){
    console.error('CREATE NOKOS',e);
    if(debited&&user&&invoice){try{const db=adminClient();await db.rpc('wallet_refund',{p_user_id:user.id,p_amount:amount,p_reference:`REFUND:NOKOS:${invoice}`,p_description:`Pengembalian ${invoice}`,p_metadata:{reason:String(e.message||'supplier error')}});if(order)await db.from('nokos_orders').update({status:'failed',note:safeSupplierError(e),updated_at:new Date().toISOString()}).eq('id',order.id);}catch(refundError){console.error('NOKOS REFUND',refundError);}}
    return res.status(500).json({error:debited?'Pesanan gagal dibuat. Saldo sudah dikembalikan.':safeSupplierError(e)});
  }
}

function publicOrder(o){return {invoice:o.invoice,service_name:o.service_name,service_img:o.service_img,country_name:o.country_name,operator_name:o.operator_name,phone_number:o.phone_number,sell_price:o.sell_price,status:o.status,otp_code:o.otp_code,otp_message:o.otp_message,expires_at:o.expires_at,created_at:o.created_at};}
  return {"default": handler};
})();

const mod_create_order = (() => {
  const { optionalAuthUser } = mod__auth_user;
  const { adminClient, createSanpayQris, uniqueFee, invoiceId, publicOrder } = mod__lib;
async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method tidak diizinkan." });

  try {
    const db = adminClient();
    const authUser = await optionalAuthUser(req);
    const productId = String(req.body?.product_id || "").trim();
    const variantIndex = Number(req.body?.variant_index || 0);
    const customerName = String(req.body?.customer_name || "").trim();
    const customerContact = String(req.body?.customer_contact || "").trim();
    const customerEmail = String(req.body?.customer_email || "").trim().toLowerCase();
    const paymentMethod = String(req.body?.payment_method || "qris").toLowerCase() === "balance" ? "balance" : "qris";
    if (!productId || !customerName || !customerContact) {
      return res.status(400).json({ error: "Data checkout belum lengkap." });
    }

    const { data: product, error: pe } = await db.from("products").select("*")
      .eq("id", productId).eq("is_active", true).maybeSingle();
    if (pe) throw pe;
    if (!product) return res.status(404).json({ error: "Produk tidak ditemukan." });

    const variants = Array.isArray(product.variants) ? product.variants : [];
    const variant = variants[variantIndex] || { name: "Paket utama", price: product.price };
    const variantName = String(variant.name || "Paket utama").trim();
    const baseAmount = Number(variant.price ?? product.price);

    const isManualPanel = product.category === "panel-pterodactyl";
    const apkMode = String(product.delivery_mode || "automatic");
    const isManualApk = product.category === "apk-premium" && ["manual", "invite"].includes(apkMode);
    const isInviteApk = isManualApk && (product.requires_email === true || apkMode === "invite");
    if (isInviteApk && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return res.status(400).json({ error: "Email aktif wajib diisi untuk produk invite." });
    }
    const isManualDelivery = isManualPanel || isManualApk;

    // Stok lama V17 sering tersimpan sebagai "Paket utama". Cek stok paket
    // yang dipilih dahulu, lalu fallback hanya ke "Paket utama" (bukan paket lain).
    const compatibleNames = variantName.toLowerCase() === "paket utama"
      ? [variantName]
      : [variantName, "Paket utama"];

    const { count, error: stockError } = isManualDelivery ? { count: Number(product.stock || 0), error: null } : await db.from("stock_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", product.id)
      .eq("status", "available")
      .in("variant_name", compatibleNames);
    if (stockError) throw stockError;
    if (!Number(count || 0)) {
      return res.status(409).json({ error: "Stok paket ini sedang habis." });
    }

    const fee = paymentMethod === "balance" ? 0 : uniqueFee();
    const paymentAmount = baseAmount + fee;
    const invoice = invoiceId();
    const expiresAt = new Date(Date.now() + Number(process.env.PAYMENT_EXPIRE_MINUTES || 10) * 60000).toISOString();

    const { data: order, error: oe } = await db.from("orders").insert({
      invoice,
      product_id: product.id,
      product_name: product.name,
      variant_name: variantName,
      amount: baseAmount,
      payment_amount: paymentAmount,
      unique_fee: fee,
      customer_name: customerName,
      customer_contact: customerContact,
      customer_email: customerEmail || null,
      user_id: authUser?.id || null,
      status: "pending",
      order_type: isManualPanel ? "panel-pterodactyl" : product.category,
      delivery_mode: isManualApk ? "manual" : "automatic",
      requires_email: isInviteApk,
      payment_method: paymentMethod,
      expires_at: expiresAt
    }).select("*").single();
    if (oe) throw oe;

    let balanceDebited = false;
    try {
      if (paymentMethod === "balance") {
        if (!authUser) throw new Error("Silakan masuk untuk menggunakan Saldo KivoPay.");
        const reserved = isManualDelivery ? { error: null } : await db.rpc("reserve_order_stock", { p_order_id: order.id });
        if (reserved.error) throw reserved.error;
        const debit = await db.rpc("wallet_debit", {
          p_user_id: authUser.id, p_amount: baseAmount, p_reference: `ORDER:${invoice}`,
          p_description: `Pembayaran ${product.name}`, p_metadata: { order_id: order.id, invoice }
        });
        if (debit.error) {
          if (!isManualDelivery) try { await db.rpc("release_order_stock", { p_order_id: order.id }); } catch {}
          if (String(debit.error.message || "").includes("INSUFFICIENT_BALANCE")) return res.status(402).json({ error: "Saldo KivoPay tidak cukup.", need_deposit: true });
          throw debit.error;
        }
        balanceDebited = true;
        if (isManualDelivery) {
          const consumed = await db.rpc("complete_manual_balance_order", { p_order_id: order.id });
          if (consumed.error) throw consumed.error;
        } else {
          const { data: stock } = await db.from("stock_items").select("*").eq("order_id", order.id).eq("status", "reserved").maybeSingle();
          if (!stock) throw new Error("Stok pesanan tidak berhasil diamankan.");
          await db.from("stock_items").update({ status: "sold", sold_at: new Date().toISOString() }).eq("id", stock.id);
          await db.from("orders").update({ status: "completed", paid_at: new Date().toISOString(), delivered_at: new Date().toISOString(), delivery_content: stock.content, updated_at: new Date().toISOString() }).eq("id", order.id);
          await db.from("products").update({ stock: Math.max(Number(product.stock || 0) - 1, 0), updated_at: new Date().toISOString() }).eq("id", product.id);
        }
        const { data: fresh } = await db.from("orders").select("*").eq("id", order.id).single();
        return res.status(200).json({ order: publicOrder(fresh || order), payment_method: "balance", balance_after: debit.data?.balance });
      }
      const payment = await createSanpayQris(
        paymentAmount,
        invoice,
        `Order ${product.name} - ${variantName}`
      );

      const reserved = isManualDelivery ? { error: null } : await db.rpc("reserve_order_stock", { p_order_id: order.id });
      if (reserved.error) {
        const message = String(reserved.error.message || "");
        await db.from("orders").update({
          status: "cancelled",
          payment_raw: { error: message },
          updated_at: new Date().toISOString()
        }).eq("id", order.id);
        if (message.includes("STOCK_EMPTY")) {
          return res.status(409).json({ error: "Stok paket ini baru saja habis." });
        }
        throw reserved.error;
      }

      const { error: ue } = await db.from("orders").update({
        payment_reference: payment.transactionId,
        qr_content: payment.qrContent || null,
        qr_image: payment.qrImage || null,
        payment_raw: payment.raw
      }).eq("id", order.id);
      if (ue) throw ue;

      return res.status(200).json({
        order: publicOrder({
          ...order,
          payment_amount: paymentAmount,
          qr_content: payment.qrContent,
          qr_image: payment.qrImage
        }),
        qr_content: payment.qrContent,
        qr_image: payment.qrImage,
        expires_at: expiresAt
      });
    } catch (error) {
      if (balanceDebited && authUser) {
        try { await db.rpc("wallet_refund", { p_user_id: authUser.id, p_amount: baseAmount, p_reference: `REFUND:ORDER:${invoice}`, p_description: `Pengembalian ${invoice}`, p_metadata: { reason: error.message } }); } catch {}
      }
      try { await db.rpc("release_order_stock", { p_order_id: order.id }); } catch {}
      await db.from("orders").update({
        status: "cancelled",
        payment_raw: { error: error.message },
        updated_at: new Date().toISOString()
      }).eq("id", order.id);
      throw error;
    }
  } catch (error) {
    console.error("CREATE ORDER ERROR", error);
    return res.status(500).json({ error: error.message || "Gagal membuat pembayaran." });
  }
}
  return {"default": handler};
})();

const mod_create_reseller_order = (() => {
  const { optionalAuthUser } = mod__auth_user;
  const { adminClient, invoiceId } = mod__lib;
const sumStock=variants=>(variants||[]).reduce((n,v)=>n+Math.max(Number(v.stock||0),0),0);
async function handler(req,res){
  res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Method tidak diizinkan.'});
  const user=await optionalAuthUser(req);if(!user)return res.status(401).json({error:'Silakan masuk terlebih dahulu.'});
  let debited=false,amount=0,invoice='';
  try{
    const db=adminClient(),productId=String(req.body?.product_id||''),variantIndex=Number(req.body?.variant_index||0),customerName=String(req.body?.customer_name||'').trim(),customerContact=String(req.body?.customer_contact||'').trim(),customerEmail=String(req.body?.customer_email||'').trim().toLowerCase();
    if(!productId||!customerName||!customerContact)return res.status(400).json({error:'Data order belum lengkap.'});
    const {data:m}=await db.from('reseller_memberships').select('*').eq('user_id',user.id).eq('status','active').maybeSingle();if(!m)return res.status(403).json({error:'Akses reseller tidak aktif.'});
    const {data:p,error:pe}=await db.from('reseller_catalog_products').select('*').eq('id',productId).eq('is_active',true).maybeSingle();if(pe)throw pe;if(!p)return res.status(404).json({error:'Produk reseller tidak tersedia.'});
    const rawVariants=Array.isArray(p.variants)&&p.variants.length?p.variants:[{name:'Paket utama',normal_price:p.normal_price??p.price,reseller_price:p.price,delivery_mode:p.delivery_mode,requires_email:p.requires_email,stock:p.stock}];
    const variants=rawVariants.map((v,i)=>({...v,stock:v.stock!=null?Number(v.stock):(i===0?Number(p.stock||0):0)})),variant=variants[variantIndex]||variants[0];
    amount=Number(variant.reseller_price??p.price);const mode=variant.delivery_mode==='automatic'?'automatic':'manual',requiresEmail=variant.manual_type==='invite'||variant.requires_email===true;
    if(!Number.isFinite(amount)||amount<0)return res.status(400).json({error:'Harga reseller tidak valid.'});
    if(requiresEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))return res.status(400).json({error:'Masukkan email aktif terlebih dahulu.'});
    if(Number(variant.stock||0)<=0)return res.status(409).json({error:'Stok atau slot varian ini habis.'});
    invoice=invoiceId();
    const debit=await db.rpc('wallet_debit',{p_user_id:user.id,p_amount:amount,p_reference:`RESELLER-ORDER:${invoice}`,p_description:`Order reseller ${p.name}`,p_metadata:{reseller_product_id:p.id,invoice,variant:variant.name}});
    if(debit.error){if(String(debit.error.message||'').includes('INSUFFICIENT_BALANCE'))return res.status(402).json({error:'Saldo KivoPay tidak cukup.',need_deposit:true});throw debit.error}debited=true;
    let deliveryContent=null,status='pending';
    if(mode==='automatic'){
      const {data:stock,error:se}=await db.from('reseller_stock_items').select('*').eq('product_id',p.id).eq('status','available').eq('variant_name',String(variant.name||'Paket utama')).limit(1).maybeSingle();if(se)throw se;if(!stock)throw new Error('Stok otomatis untuk varian ini habis.');
      deliveryContent=stock.content;status='completed';await db.from('reseller_stock_items').update({status:'sold',sold_at:new Date().toISOString()}).eq('id',stock.id);
    }
    const {data:o,error:oe}=await db.from('reseller_orders').insert({invoice,user_id:user.id,reseller_code:m.reseller_code,product_id:p.id,product_name:p.name,variant_name:String(variant.name||'Paket utama'),amount,customer_name:customerName,customer_contact:customerContact,customer_email:requiresEmail?customerEmail:null,delivery_mode:mode,requires_email:requiresEmail,payment_method:'balance',status,delivery_content:deliveryContent,paid_at:new Date().toISOString(),completed_at:status==='completed'?new Date().toISOString():null}).select().single();if(oe)throw oe;
    const nextVariants=variants.map((v,i)=>i===variantIndex?{...v,stock:Math.max(Number(v.stock||0)-1,0)}:v);
    await db.from('reseller_catalog_products').update({variants:nextVariants,stock:sumStock(nextVariants),updated_at:new Date().toISOString()}).eq('id',p.id);
    return res.json({order:o,payment_method:'balance',balance_after:debit.data?.balance});
  }catch(e){if(debited&&user)try{await adminClient().rpc('wallet_refund',{p_user_id:user.id,p_amount:amount,p_reference:`REFUND:RESELLER:${invoice}`,p_description:`Refund ${invoice}`,p_metadata:{reason:e.message}})}catch{}return res.status(500).json({error:e.message||'Gagal membuat order reseller.'});}
}
  return {"default": handler};
})();

const mod_create_robux_order = (() => {
  const { adminClient, createSanpayQris, uniqueFee } = mod__lib;
  const { optionalAuthUser } = mod__auth_user;
const clean = (v, max=200) => String(v ?? '').trim().slice(0,max);
const invoiceId = () => `RBX-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({error:'Method tidak diizinkan.'});
  try{
    const db=adminClient();
    const authUser=await optionalAuthUser(req);
    const paymentMethod=String(req.body?.payment_method||'qris').toLowerCase()==='balance'?'balance':'qris';
    const methodId=clean(req.body?.method_id,60), packageId=clean(req.body?.package_id,60);
    const username=clean(req.body?.username,40), whatsapp=clean(req.body?.whatsapp,20);
    if(!methodId||!packageId||!username||!whatsapp) return res.status(400).json({error:'Username Roblox, nomor WhatsApp, metode, dan paket wajib diisi.'});

    const [{data:method,error:me},{data:pack,error:pe}] = await Promise.all([
      db.from('robux_methods').select('*').eq('id',methodId).eq('is_active',true).maybeSingle(),
      db.from('robux_packages').select('*').eq('id',packageId).eq('method_id',methodId).eq('is_active',true).maybeSingle()
    ]);
    if(me) throw me; if(pe) throw pe;
    if(!method||!pack) return res.status(404).json({error:'Metode atau paket Robux tidak tersedia.'});

    const isLogin=method.form_type==='login';
    const password=clean(req.body?.password,120);
    const backupCodes=[clean(req.body?.backup_code_1,80),clean(req.body?.backup_code_2,80),clean(req.body?.backup_code_3,80)];
    if(isLogin && (!password || backupCodes.some(x=>!x))) return res.status(400).json({error:'Via Login wajib mengisi password dan 3 backup code.'});

    if(paymentMethod==='balance' && !authUser) return res.status(401).json({error:'Silakan masuk untuk menggunakan Saldo KivoPay.',code:'AUTH_REQUIRED'});

    const fee=paymentMethod==='balance'?0:uniqueFee(), amount=Number(pack.price||0), paymentAmount=amount+fee;
    const invoice=invoiceId();
    const expiresAt=new Date(Date.now()+Number(process.env.PAYMENT_EXPIRE_MINUTES||10)*60000).toISOString();
    const {data:order,error:oe}=await db.from('robux_orders').insert({
      invoice,method_id:method.id,package_id:pack.id,method_name:method.name,package_label:pack.label,
      robux_amount:pack.robux_amount,amount,payment_amount:paymentAmount,unique_fee:fee,
      username,whatsapp,password:isLogin?password:null,backup_codes:isLogin?backupCodes:[],
      status:'pending',expires_at:expiresAt,user_id:authUser?.id||null,payment_method:paymentMethod
    }).select('*').single();
    if(oe) throw oe;

    try{
      if(paymentMethod==='balance'){
        const debit=await db.rpc('wallet_debit',{p_user_id:authUser.id,p_amount:amount,p_reference:`ROBUX:${invoice}`,p_description:`Top Up ${pack.label}`,p_metadata:{order_id:order.id,invoice}});
        if(debit.error){await db.from('robux_orders').update({status:'cancelled',admin_note:debit.error.message}).eq('id',order.id);if(String(debit.error.message||'').includes('INSUFFICIENT_BALANCE'))return res.status(402).json({error:'Saldo KivoPay tidak cukup.',need_deposit:true});throw debit.error;}
        const paidAt=new Date().toISOString();
        await db.from('robux_orders').update({status:'paid',paid_at:paidAt,updated_at:paidAt}).eq('id',order.id);
        return res.status(200).json({order:publicRobux({...order,status:'paid',paid_at:paidAt}),payment_method:'balance',balance_after:debit.data?.balance});
      }
      const payment=await createSanpayQris(paymentAmount,invoice,`Top Up ${pack.label} - ${method.name}`);
      const {error:ue}=await db.from('robux_orders').update({
        payment_reference:payment.transactionId,qr_content:payment.qrContent||null,qr_image:payment.qrImage||null,payment_raw:payment.raw
      }).eq('id',order.id);
      if(ue) throw ue;
      return res.status(200).json({order:publicRobux(order),qr_content:payment.qrContent,qr_image:payment.qrImage,expires_at:expiresAt});
    }catch(e){
      await db.from('robux_orders').update({status:'cancelled',payment_raw:{error:e.message}}).eq('id',order.id);
      throw e;
    }
  }catch(e){
    console.error('CREATE ROBUX ORDER ERROR',e);
    return res.status(500).json({error:e.message||'Gagal membuat pembayaran Robux.'});
  }
}

function publicRobux(o){return {invoice:o.invoice,method_name:o.method_name,package_label:o.package_label,robux_amount:o.robux_amount,amount:o.amount,payment_amount:o.payment_amount,username:o.username,whatsapp:o.whatsapp,status:o.status,expires_at:o.expires_at,paid_at:o.paid_at,created_at:o.created_at};}
  return {"default": handler};
})();

const mod_deposit_history = (() => {
  const { optionalAuthUser } = mod__auth_user;
  const { adminClient } = mod__lib;
async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{const user=await optionalAuthUser(req);if(!user)return res.status(401).json({error:'Silakan masuk terlebih dahulu.'});const db=adminClient();const {data,error}=await db.from('deposits').select('invoice,amount,payment_amount,unique_fee,status,expires_at,paid_at,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(50);if(error)throw error;const {data:profile}=await db.from('profiles').select('balance').eq('user_id',user.id).maybeSingle();return res.status(200).json({balance:Number(profile?.balance||0),deposits:data||[]});}catch(error){return res.status(500).json({error:error.message||'Gagal memuat riwayat deposit.'});}
}
  return {"default": handler};
})();

const mod_game_catalog = (() => {
  const { adminClient } = mod__lib;
async function handler(req,res){
  res.setHeader("Cache-Control","s-maxage=120, stale-while-revalidate=300");
  try{const db=adminClient();const {data,error}=await db.from("game_catalog").select("*").eq("is_active",true).order("sort_order",{ascending:true});if(error)throw error;return res.status(200).json({games:data||[]});}catch(e){return res.status(200).json({games:[]});}
}
  return {"default": handler};
})();

const mod_game_nickname = (() => {
  const { vipaymentRequest, vipaymentRows } = mod__vipayment;
const aliases = (game) => {
  const raw = String(game || "").trim();
  const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const compact = slug.replace(/-/g, "");
  const known = [];
  if (/mobile\s*legends|mobile-legends|^ml(bb)?$/i.test(raw)) known.push("mobile-legends", "mobilelegends", "mlbb", "ml");
  if (/free\s*fire/i.test(raw)) known.push("free-fire", "freefire", "ff");
  if (/honor\s*of\s*kings/i.test(raw)) known.push("honor-of-kings", "hok");
  return [...new Set([raw, slug, compact, ...known].filter(Boolean))];
};

function nicknameFrom(provider) {
  const row = vipaymentRows(provider)[0] || {};
  const value = row.nickname ?? row.username ?? row.name ?? row.data ?? provider?.nickname ?? provider?.data;
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method tidak diizinkan." });

  const serviceCode = String(req.body?.code || "").trim();
  const game = String(req.body?.game || "").trim();
  const target = String(req.body?.target || "").trim();
  const zone = String(req.body?.zone || "").trim();
  if (!target) return res.status(400).json({ error: "Isi ID terlebih dahulu." });

  const candidates = [...aliases(game), serviceCode].filter(Boolean);
  let lastError = null;
  for (const code of candidates) {
    try {
      const provider = await vipaymentRequest("get-nickname", {
        code,
        target,
        additional_target: zone || undefined,
      });
      const nickname = nicknameFrom(provider);
      if (nickname) return res.status(200).json({ supported: true, nickname, code });
      lastError = new Error(provider?.message || "Nickname tidak ditemukan.");
    } catch (error) {
      lastError = error;
    }
  }
  return res.status(422).json({
    error: lastError?.message || "Cek nickname belum tersedia untuk game ini. ID tetap bisa dipakai untuk transaksi.",
    supported: false,
  });
}
  return {"default": handler};
})();

const mod_game_order_history = (() => {
  const { adminClient } = mod__lib;
function publicOrder(o) {
  return {
    invoice:o.invoice, service_code:o.service_code, game_name:o.game_name,
    service_name:o.service_name, target:o.target, zone:o.zone, form_data:o.form_data || {},
    payment_amount:o.payment_amount, customer_name:o.customer_name,
    customer_contact:o.customer_contact, status:o.status,
    provider_id:o.vip_trxid || null, provider_status:o.vip_status || null,
    note:o.note || null, created_at:o.created_at, paid_at:o.paid_at,
    completed_at:o.completed_at, updated_at:o.updated_at
  };
}

async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST") return res.status(405).json({error:"Method tidak diizinkan."});
  try{
    const invoices=[...new Set((Array.isArray(req.body?.invoices)?req.body.invoices:[]).map(x=>String(x||"").trim()).filter(Boolean))].slice(0,100);
    if(!invoices.length) return res.status(200).json({orders:[]});
    const db=adminClient();
    const {data,error}=await db.from("game_orders").select("*").in("invoice",invoices).order("created_at",{ascending:false});
    if(error) throw error;
    return res.status(200).json({orders:(data||[]).map(publicOrder)});
  }catch(error){
    console.error("GAME ORDER HISTORY",error);
    return res.status(500).json({error:error.message||"Gagal memuat riwayat."});
  }
}
  return {"default": handler};
})();

const mod_game_services = (() => {
  const { vipaymentRequest, vipaymentRows, vipaymentService, vipaymentErrorPayload } = mod__vipayment;
function sellPrice(cost) {
  const value = Number(cost || 0);
  const low = Number(process.env.VIPAYMENT_PROFIT_MIN || 2000);
  const high = Number(process.env.VIPAYMENT_PROFIT_MAX || 3000);
  const threshold = Number(process.env.VIPAYMENT_PROFIT_THRESHOLD || 10000);
  return value + (value < threshold ? low : high);
}

function isActive(status) {
  return String(status || "available").toLowerCase() === "available";
}

async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  if (req.method !== "GET") return res.status(405).json({ error: "Method tidak diizinkan." });

  try {
    const exactGame = String(req.query?.game || "").trim();
    const search = String(req.query?.search || "").trim().toLowerCase();
    const limit = Math.min(Math.max(Number(req.query?.limit || 0), 0), 200);

    // VIPayment filter_game cenderung membutuhkan nama game yang persis.
    // Untuk pencarian admin, ambil katalog aktif lalu filter lokal agar kata seperti "ML" tetap ditemukan.
    const provider = await vipaymentRequest("services", exactGame && !search ? {
      filter_game: exactGame,
      filter_status: "available",
    } : {
      filter_status: "available",
    });

    let services = vipaymentRows(provider)
      .map(vipaymentService)
      .filter((item) => item.code && isActive(item.status))
      .map((item) => ({ ...item, sell_price: sellPrice(item.price) }));

    if (search) {
      services = services.filter((item) =>
        [item.game, item.name, item.code].join(" ").toLowerCase().includes(search)
      );
    }
    if (limit) services = services.slice(0, limit);

    return res.status(200).json({ services, total: services.length });
  } catch (error) {
    const detail = vipaymentErrorPayload(error);
    console.error("[VIPayment service error]", detail);
    return res.status(502).json({
      error: detail.message || "Gagal mengambil layanan VIPayment.",
      debug: detail.debug,
    });
  }
}
  return {"default": handler};
})();

const mod_join_reseller = (() => {
  const { optionalAuthUser } = mod__auth_user;
  const { adminClient } = mod__lib;
async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST') return res.status(405).json({error:'Method tidak diizinkan.'});
 const user=await optionalAuthUser(req); if(!user)return res.status(401).json({error:'Silakan masuk terlebih dahulu.'});
 try{
  const db=adminClient();
  const {data:existing}=await db.from('reseller_memberships').select('*').eq('user_id',user.id).maybeSingle();
  if(existing?.status==='active') return res.status(409).json({error:'Akun kamu sudah menjadi reseller.'});
  const {data:settings,error:se}=await db.from('reseller_settings').select('*').eq('id','main').single(); if(se)throw se;
  if(!settings.is_open)return res.status(403).json({error:'Pendaftaran reseller sedang ditutup.'});
  const price=Number(settings.join_price||0);
  const ref=`RESELLER-JOIN:${user.id}:${Date.now()}`;
  const debit=await db.rpc('wallet_debit',{p_user_id:user.id,p_amount:price,p_reference:ref,p_description:'Pendaftaran KivoPay Reseller',p_metadata:{type:'reseller_join'}});
  if(debit.error){
   if(String(debit.error.message||'').includes('INSUFFICIENT_BALANCE'))return res.status(402).json({error:'Saldo KivoPay tidak cukup.',need_deposit:true});
   throw debit.error;
  }
  const code=`KVP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const payload={user_id:user.id,status:'active',reseller_code:code,joined_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  const query=existing?db.from('reseller_memberships').update(payload).eq('user_id',user.id):db.from('reseller_memberships').insert(payload);
  const {data,error}=await query.select('*').single();
  if(error){await db.rpc('wallet_refund',{p_user_id:user.id,p_amount:price,p_reference:`REFUND:${ref}`,p_description:'Pengembalian pendaftaran reseller',p_metadata:{reason:error.message}});throw error;}
  return res.json({membership:data,balance_after:debit.data?.balance});
 }catch(e){return res.status(500).json({error:e.message||'Gagal bergabung sebagai reseller.'});}
}
  return {"default": handler};
})();

const mod_live_orders = (() => {
  const { adminClient } = mod__lib;
function maskName(value) {
  const first = String(value || "Pelanggan").trim().split(/\s+/)[0] || "Pelanggan";
  if (first.length <= 1) return `${first.toUpperCase()}***`;
  if (first.length === 2) return `${first[0].toUpperCase()}***`;
  return `${first.slice(0, 2).replace(/^./, c => c.toUpperCase())}${"*".repeat(Math.min(4, Math.max(2, first.length - 2)))}`;
}

async function handler(req, res) {
  res.setHeader("Cache-Control", "public, s-maxage=8, stale-while-revalidate=20");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok:false, message:"Method tidak didukung." });

  try {
    const db = adminClient();
    const { data, error } = await db
      .from("orders")
      .select("id,customer_name,product_name,variant_name,amount,payment_amount,status,created_at")
      .in("status", ["paid", "processing", "completed"])
      .order("created_at", { ascending:false })
      .limit(12);

    if (error) throw error;

    const orders = (data || []).map(order => ({
      id: order.id,
      customer_name: maskName(order.customer_name),
      product_name: order.product_name || "Produk Digital",
      variant_name: order.variant_name || "Paket utama",
      amount: Number(order.payment_amount || order.amount || 0),
      status: order.status,
      created_at: order.created_at
    }));

    return res.status(200).json({ ok:true, orders });
  } catch (error) {
    console.error("live-orders:", error);
    return res.status(500).json({ ok:false, message:"Aktivitas transaksi belum dapat dimuat." });
  }
}
  return {"default": handler};
})();

const mod_media = (() => {
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0
    );
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  return true;
}

function safeFilename(value = "kivo-media") {
  return String(value)
    .replace(/[\r\n"]/g, "")
    .replace(/[^\w.\- ]/g, "_")
    .slice(0, 90) || "kivo-media";
}

async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method tidak diizinkan." });
  }

  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
  const mode = req.query.mode === "download" ? "download" : "stream";
  const filename = safeFilename(req.query.filename);

  if (!rawUrl) return res.status(400).json({ error: "URL media wajib diisi." });

  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: "URL media tidak valid." });
  }

  if (target.protocol !== "https:") {
    return res.status(400).json({ error: "Hanya URL HTTPS yang diizinkan." });
  }

  try {
    const records = await dns.lookup(target.hostname, { all: true });
    if (!records.length || records.some(record => isPrivateIp(record.address))) {
      return res.status(403).json({ error: "Host media tidak diizinkan." });
    }
  } catch {
    return res.status(400).json({ error: "Host media tidak dapat diverifikasi." });
  }

  const headers = {
    "User-Agent": "Mozilla/5.0 KivoTools/9.1",
    "Accept": "*/*"
  };

  if (req.headers.range) headers.Range = req.headers.range;

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(25000)
    });

    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status).json({
        error: "Media dari server asal tidak dapat dimuat.",
        status: upstream.status
      });
    }

    const passHeaders = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "etag",
      "last-modified"
    ];

    for (const name of passHeaders) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
    res.setHeader(
      "Content-Disposition",
      `${mode === "download" ? "attachment" : "inline"}; filename="${filename}"`
    );

    res.status(upstream.status);

    if (req.method === "HEAD" || !upstream.body) return res.end();

    Readable.fromWeb(upstream.body).on("error", () => {
      if (!res.headersSent) res.status(502);
      res.end();
    }).pipe(res);
  } catch (error) {
    return res.status(502).json({
      error: "Gagal mengambil media.",
      detail: error?.message || "Unknown error"
    });
  }
}
  return {"default": handler};
})();

const mod_nokos_catalog = (() => {
  const { rumahOtp, safeSupplierError } = mod__rumahotp;
  const { adminClient } = mod__lib;
async function handler(req,res){
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
    return res.status(200).json({success:true,data:payload,margin:Number(settings?.global_margin||2000)});
  }catch(e){return res.status(502).json({error:safeSupplierError(e)});}
}
  return {"default": handler};
})();

const mod_nokos_orders = (() => {
  const { optionalAuthUser } = mod__auth_user;
  const { adminClient } = mod__lib;
  const { rumahOtp, safeSupplierError } = mod__rumahotp;
const pub=o=>({
 invoice:o.invoice,service_name:o.service_name,service_img:o.service_img,country_name:o.country_name,
 country_prefix:o.country_prefix,operator_name:o.operator_name,phone_number:o.phone_number,
 sell_price:o.sell_price,status:o.status,supplier_status:o.supplier_status,otp_code:o.otp_code,
 otp_message:o.otp_message,note:o.note,expires_at:o.expires_at,created_at:o.created_at,
 updated_at:o.updated_at,refund_status:o.refund_status,refunded_at:o.refunded_at
});

async function ensureCancelRefund(db,o){
 if(String(o.status||'').toLowerCase()!=='canceled') return o;
 if(o.refunded_at||String(o.refund_status||'').toLowerCase()==='refunded') return o;

 const amount=Math.max(0,Number(o.sell_price||0));
 if(!amount) return o;

 await db.from('nokos_orders').update({refund_status:'processing',updated_at:new Date().toISOString()}).eq('id',o.id);
 const {data,error}=await db.rpc('wallet_refund',{
  p_user_id:o.user_id,
  p_amount:amount,
  p_reference:`REFUND:NOKOS:CANCEL:${o.invoice}`,
  p_description:`Refund pembatalan Nokos ${o.invoice}`,
  p_metadata:{invoice:o.invoice,supplier_order_id:o.supplier_order_id,reason:'Pesanan Nokos dibatalkan'}
 });
 if(error){
  await db.from('nokos_orders').update({refund_status:'pending',note:`Pesanan dibatalkan. Refund saldo sedang diproses: ${error.message}`,updated_at:new Date().toISOString()}).eq('id',o.id);
  throw new Error(`Pesanan berhasil dibatalkan, tetapi refund saldo belum berhasil: ${error.message}`);
 }
 const patch={refund_status:'refunded',refunded_at:new Date().toISOString(),note:`Pesanan dibatalkan. Saldo ${amount.toLocaleString('id-ID')} telah dikembalikan.`,updated_at:new Date().toISOString()};
 await db.from('nokos_orders').update(patch).eq('id',o.id);
 return Object.assign(o,patch,{refund_result:data});
}

async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const user=await optionalAuthUser(req);
 if(!user)return res.status(401).json({error:'Silakan login terlebih dahulu.'});
 const db=adminClient();
 try{
  if(req.method==='GET'){
   const invoice=String(req.query.invoice||'');
   let q=db.from('nokos_orders').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100);
   if(invoice)q=q.eq('invoice',invoice);
   const {data,error}=await q;
   if(error)throw error;
   const rows=data||[];

   await Promise.all(rows.filter(o=>o.supplier_order_id&&['received','waiting','expiring','creating'].includes(String(o.status||'').toLowerCase())).map(async o=>{
    try{
     const r=await rumahOtp('/v1/orders/get_status',{order_id:o.supplier_order_id});
     const d=r.data||{};
     const patch={supplier_status:d.status||o.supplier_status,status:normalize(d.status),phone_number:d.phone_number||o.phone_number,otp_code:d.otp_code||null,otp_message:d.otp_msg||null,expires_at:d.expired_at?new Date(Number(d.expired_at)).toISOString():o.expires_at,supplier_raw:r,updated_at:new Date().toISOString()};
     await db.from('nokos_orders').update(patch).eq('id',o.id);
     Object.assign(o,patch);
    }catch{}
   }));

   // Refund yang sempat gagal akan dicoba ulang otomatis saat riwayat dibuka/refresh.
   await Promise.all(rows.filter(o=>String(o.status||'').toLowerCase()==='canceled'&&!o.refunded_at).map(async o=>{
    try{await ensureCancelRefund(db,o);}catch{}
   }));
   return res.status(200).json({orders:rows.map(pub)});
  }

  if(req.method==='POST'){
   const invoice=String(req.body?.invoice||''),action=String(req.body?.action||'');
   if(!['cancel','done','resend'].includes(action))return res.status(400).json({error:'Aksi tidak valid.'});
   const {data:o,error}=await db.from('nokos_orders').select('*').eq('invoice',invoice).eq('user_id',user.id).single();
   if(error||!o)return res.status(404).json({error:'Pesanan tidak ditemukan.'});
   if(!o.supplier_order_id)return res.status(409).json({error:'ID supplier belum tersedia.'});

   if(action==='cancel'){
    const age=Date.now()-new Date(o.created_at).getTime();
    const wait=2*60*1000;
    if(!Number.isFinite(age)||age<wait){
     const left=Math.max(1,Math.ceil((wait-age)/1000));
     return res.status(409).json({error:`Pesanan baru bisa dibatalkan dalam ${left} detik.`});
    }

    // Bila supplier sudah pernah dibatalkan tetapi refund tertunda, jangan cancel dua kali.
    if(String(o.status||'').toLowerCase()!=='canceled'){
     const r=await rumahOtp('/v1/orders/set_status',{order_id:o.supplier_order_id,status:'cancel'});
     const supplierStatus=String(r.data?.status||'cancel').toLowerCase();
     if(!['cancel','canceled'].includes(supplierStatus))throw new Error('Supplier belum mengonfirmasi pembatalan pesanan.');
     const patch={status:'canceled',supplier_status:supplierStatus,supplier_raw:r,refund_status:'pending',updated_at:new Date().toISOString()};
     await db.from('nokos_orders').update(patch).eq('id',o.id);
     Object.assign(o,patch);
    }

    await ensureCancelRefund(db,o);
    return res.status(200).json({success:true,status:'canceled',refunded:true,refund_amount:Number(o.sell_price||0)});
   }

   const r=await rumahOtp('/v1/orders/set_status',{order_id:o.supplier_order_id,status:action});
   const next=action==='done'?'completed':o.status;
   await db.from('nokos_orders').update({status:next,supplier_status:r.data?.status||action,supplier_raw:r,updated_at:new Date().toISOString()}).eq('id',o.id);
   return res.status(200).json({success:true,status:next});
  }
  return res.status(405).json({error:'Method tidak diizinkan.'});
 }catch(e){return res.status(500).json({error:safeSupplierError(e)});}
}
function normalize(s){s=String(s||'').toLowerCase();return ({waiting:'received',received:'received',completed:'completed',canceled:'canceled',cancel:'canceled',expiring:'expiring'})[s]||s||'received';}
  return {"default": handler};
})();

const mod_panelpedia_profile = (() => {
  const { adminClient, env } = mod__lib;
  const { panelpediaRequest, panelpediaErrorPayload } = mod__panelpedia;
async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method tidak diizinkan." });

  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return res.status(401).json({ error: "Sesi admin diperlukan." });

    const db = adminClient();
    const { data, error } = await db.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "Sesi admin tidak valid." });

    const adminId = env("KIVOPAY_ADMIN_UUID", "8ea33b7c-1b1f-4fe6-a157-ae38595eef42");
    if (data.user.id !== adminId) return res.status(403).json({ error: "Akses ditolak." });

    const provider = await panelpediaRequest("profile");
    const profile = provider?.data || {};
    return res.status(200).json({
      connected: true,
      profile: {
        username: String(profile.username || "-"),
        balance: Number(profile.balance || 0),
        role: String(profile.role || "-"),
      },
      message: provider?.msg || "PanelPedia terhubung.",
    });
  } catch (error) {
    const detail = panelpediaErrorPayload(error);
    console.error("[PanelPedia profile error]", detail);
    return res.status(502).json({ connected: false, error: detail.message || "Gagal menghubungkan PanelPedia.", debug: detail });
  }
}
  return {"default": handler};
})();

const mod_reconcile_payments = (() => {
  const { adminClient, getSanpayMutasi, mutationMatchesOrder, mutasiKey, env } = mod__lib;
async function handler(req,res){
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
  return {"default": handler};
})();

const mod_reseller_catalog = (() => {
  const { optionalAuthUser } = mod__auth_user;
  const { adminClient } = mod__lib;
async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method tidak diizinkan.'});
  const user=await optionalAuthUser(req);if(!user)return res.status(401).json({error:'Silakan masuk terlebih dahulu.'});
  try{
    const db=adminClient();
    const {data:m}=await db.from('reseller_memberships').select('*').eq('user_id',user.id).eq('status','active').maybeSingle();if(!m)return res.status(403).json({error:'Akses reseller belum aktif.'});
    const {data,error}=await db.from('reseller_catalog_products').select('*').eq('is_active',true).order('sort_order');if(error)throw error;
    return res.json({membership:m,items:(data||[]).map(p=>{
      const raw=Array.isArray(p.variants)&&p.variants.length?p.variants:[{name:'Paket utama',normal_price:p.normal_price??p.price,reseller_price:p.price,delivery_mode:p.delivery_mode,requires_email:p.requires_email,stock:p.stock}];
      const variants=raw.map((v,i)=>({...v,stock:v.stock!=null?Number(v.stock):(i===0?Number(p.stock||0):0)}));
      return {id:p.id,product_id:p.id,normal_price:Math.min(...variants.map(v=>Number(v.normal_price??p.normal_price??p.price))),reseller_price:Math.min(...variants.map(v=>Number(v.reseller_price??p.price))),variant_prices:Object.fromEntries(variants.map(v=>[v.name,{normal_price:Number(v.normal_price??p.normal_price??p.price),reseller_price:Number(v.reseller_price??p.price),stock:Number(v.stock||0),delivery_mode:v.delivery_mode||p.delivery_mode,requires_email:v.requires_email===true||v.manual_type==='invite'}])),is_exclusive:true,promo_text:p.promo_text,product:{...p,variants,stock:variants.reduce((n,v)=>n+Number(v.stock||0),0)}};
    })});
  }catch(e){return res.status(500).json({error:e.message||'Gagal memuat katalog reseller.'});}
}
  return {"default": handler};
})();

const mod_reseller_orders = (() => {
  const { optionalAuthUser } = mod__auth_user;
  const { adminClient } = mod__lib;
async function handler(req,res){res.setHeader('Cache-Control','no-store');const user=await optionalAuthUser(req);if(!user)return res.status(401).json({error:'Unauthorized'});if(req.method!=='GET')return res.status(405).json({error:'Method tidak diizinkan.'});try{const {data,error}=await adminClient().from('reseller_orders').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(50);if(error)throw error;return res.json({orders:data||[]})}catch(e){return res.status(500).json({error:e.message})}}
  return {"default": handler};
})();

const mod_reseller_status = (() => {
  const { optionalAuthUser } = mod__auth_user;
  const { adminClient } = mod__lib;
async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET') return res.status(405).json({error:'Method tidak diizinkan.'});
 const user=await optionalAuthUser(req); if(!user)return res.status(401).json({error:'Silakan masuk terlebih dahulu.'});
 try{
  const db=adminClient();
  const [{data:settings},{data:membership},profileByUser]=await Promise.all([
   db.from('reseller_settings').select('*').eq('id','main').maybeSingle(),
   db.from('reseller_memberships').select('*').eq('user_id',user.id).maybeSingle(),
   db.from('profiles').select('balance').eq('user_id',user.id).maybeSingle()
  ]);
  let profile=profileByUser?.data||null;
  if(!profile){const fallback=await db.from('profiles').select('balance').eq('id',user.id).maybeSingle();profile=fallback.data||null;}
  return res.json({settings:settings||{is_open:true,join_price:50000},membership:membership||null,balance:Number(profile?.balance||0)});
 }catch(e){return res.status(500).json({error:e.message||'Gagal memuat status reseller.'});}
}
  return {"default": handler};
})();

const mod_siputzx = (() => {
const BASE = "https://api.siputzx.my.id";

const routes = {
  translate: { path: "/api/tools/translate", params: ["text","source","target"] },
  tiktokstalk: { path: "/api/stalk/tiktok", params: ["username"] },
  zodiac: { path: "/api/primbon/zodiak", params: ["zodiac"], rename: { zodiac: "zodiak" } },
  name: { path: "/api/primbon/artinama", params: ["name"], rename: {name:"nama"} },
  health: { path: "/api/primbon/cek_potensi_penyakit", params: ["tgl","bln","thn"] },
  weather: { path: "/api/info/cuaca", params: ["q"] },
  snack: { path: "/api/d/snackvideo", params: ["url"] },
  tiktokdl: { path: "/api/d/tiktok/v2", params: ["url"] },
  capcut: { path: "/api/d/capcut", params: ["url"] },
  ai: { path: "/api/ai/gptoss120b", params: ["prompt","system","temperature"] },
  animequote: { path: "/api/s/animequotes", params: ["query"] }
};

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const { endpoint } = req.query;
  const cfg = routes[endpoint];
  if (!cfg) return res.status(400).json({ error: "Endpoint tidak diizinkan." });

  const qs = new URLSearchParams();
  for (const key of cfg.params) {
    const value = req.query[key];
    if (value === undefined || value === "") continue;
    qs.set((cfg.rename && cfg.rename[key]) || key, String(value));
  }

  try {
    const response = await fetch(`${BASE}${cfg.path}?${qs.toString()}`, {
      headers: { "Accept": "application/json", "User-Agent": "KivoTools/2.0" }
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(502).json({ error: "Gagal menghubungi layanan API.", detail: error.message });
  }
}
  return {"default": handler};
})();

const mod_submit_rating = (() => {
  const { adminClient } = mod__lib;
const clean = value => String(value || "").trim();

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method tidak diizinkan." });
  }

  try {
    const db = adminClient();
    const invoice = clean(req.body?.invoice).toUpperCase();
    const contact = clean(req.body?.contact);
    const rating = Number(req.body?.rating);
    const review = clean(req.body?.review).slice(0, 500);

    if (!invoice || !contact || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Data rating belum lengkap." });
    }

    const { data: order, error: orderError } = await db
      .from("orders")
      .select("id,product_id,invoice,customer_name,customer_contact,status")
      .eq("invoice", invoice)
      .maybeSingle();

    if (orderError) throw orderError;
    if (!order) return res.status(404).json({ error: "Invoice tidak ditemukan." });
    if (order.status !== "completed") {
      return res.status(409).json({ error: "Rating hanya dapat diberikan setelah pesanan selesai." });
    }

    const normalizedStored = clean(order.customer_contact).replace(/\s+/g, "");
    const normalizedInput = contact.replace(/\s+/g, "");
    if (normalizedStored !== normalizedInput) {
      return res.status(403).json({ error: "Kontak tidak cocok dengan pesanan." });
    }

    const { data, error } = await db
      .from("product_ratings")
      .upsert({
        order_id: order.id,
        product_id: order.product_id,
        invoice: order.invoice,
        customer_name: order.customer_name,
        rating,
        review,
        is_visible: true,
        updated_at: new Date().toISOString()
      }, { onConflict: "order_id" })
      .select("id,rating,review,created_at")
      .single();

    if (error) throw error;
    return res.status(200).json({ rating: data });
  } catch (error) {
    console.error("SUBMIT RATING ERROR", error);
    return res.status(500).json({ error: error.message || "Gagal menyimpan rating." });
  }
}
  return {"default": handler};
})();

const mod_product_stock = (() => {
  const { adminClient } = mod__lib;
  async function handler(req,res){
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='GET') return res.status(405).json({error:'Method tidak diizinkan.'});
    try{
      const db=adminClient();
      const productId=String(req.query?.product_id||'').trim();
      const variantId=String(req.query?.variant_id||'').trim();
      if(!productId && !variantId) return res.status(400).json({error:'product_id atau variant_id wajib diisi.'});
      let q=db.from('product_stock').select('*');
      if(productId) q=q.eq('product_id',productId);
      if(variantId) q=q.eq('variant_id',variantId);
      const {data,error}=await q;
      if(error){
        // Fail softly for older databases that do not have product_stock table.
        return res.status(200).json({stock:0,available:false,rows:[],warning:error.message});
      }
      const rows=data||[];
      const availableRows=rows.filter(r=>!r.is_used && !r.used_at && String(r.status||'available').toLowerCase()!=='used');
      return res.status(200).json({stock:availableRows.length,available:availableRows.length>0,rows:availableRows});
    }catch(e){ return res.status(500).json({error:e.message||'Gagal memuat stock.'}); }
  }
  return {default:handler};
})();

const ROUTES = {
  "admin-bot-backups": mod_admin_bot_backups.default,
  "admin-bot-orders": mod_admin_bot_orders.default,
  "admin-game-orders": mod_admin_game_orders.default,
  "admin-reseller": mod_admin_reseller.default,
  "admin-users": mod_admin_users.default,
  "admin-wallet": mod_admin_wallet.default,
  "anime": mod_anime.default,
  "bot-orders": mod_bot_orders.default,
  "bot-plugins": mod_bot_plugins.default,
  "cancel-deposit": mod_cancel_deposit.default,
  "chat-message": mod_chat_message.default,
  "check-deposit": mod_check_deposit.default,
  "check-game-payment": mod_check_game_payment.default,
  "check-payment": mod_check_payment.default,
  "check-robux-payment": mod_check_robux_payment.default,
  "community-feed": mod_community_feed.default,
  "create-bot-order": mod_create_bot_order.default,
  "create-deposit": mod_create_deposit.default,
  "create-game-order": mod_create_game_order.default,
  "create-nokos-order": mod_create_nokos_order.default,
  "create-order": mod_create_order.default,
  "create-reseller-order": mod_create_reseller_order.default,
  "create-robux-order": mod_create_robux_order.default,
  "deposit-history": mod_deposit_history.default,
  "game-catalog": mod_game_catalog.default,
  "game-nickname": mod_game_nickname.default,
  "game-order-history": mod_game_order_history.default,
  "game-services": mod_game_services.default,
  "join-reseller": mod_join_reseller.default,
  "live-orders": mod_live_orders.default,
  "media": mod_media.default,
  "nokos-catalog": mod_nokos_catalog.default,
  "nokos-orders": mod_nokos_orders.default,
  "panelpedia-profile": mod_panelpedia_profile.default,
  "product-stock": mod_product_stock.default,
  "reconcile-payments": mod_reconcile_payments.default,
  "reseller-catalog": mod_reseller_catalog.default,
  "reseller-orders": mod_reseller_orders.default,
  "reseller-status": mod_reseller_status.default,
  "siputzx": mod_siputzx.default,
  "submit-rating": mod_submit_rating.default,
};

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const rawRoute = String(req.query?.route || req.query?.endpoint || '').trim();
  let route = rawRoute.replace(/^\/+|\/+$/g,'');
  if(!route){
    try { const p=new URL(req.url,'https://kivopay.local').pathname; route=p.replace(/^\/api\/?/,'').replace(/^\/+|\/+$/g,''); } catch {}
  }
  if(route==='index' || !route) return res.status(200).json({ok:true,service:'KivoPay API',mode:'single-function'});
  const target=ROUTES[route];
  if(!target) return res.status(404).json({error:'Endpoint API tidak ditemukan.',route});
  return target(req,res);
}
