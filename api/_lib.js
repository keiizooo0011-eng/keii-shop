
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const env = (name, fallback = "") => String(process.env[name] || fallback).trim();

export function authClient() {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("Supabase auth environment belum lengkap.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function adminClient() {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase server environment belum lengkap.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function signPayload(payload) {
  return crypto.createHmac("sha256", env("SANPAY_API_KEY"))
    .update(JSON.stringify(payload)).digest("hex");
}

export function sanpayUrl(endpoint) {
  return env("SANPAY_BASE_URL", "https://sanpay.site").replace(/\/$/, "") + endpoint;
}

export async function createSanpayQris(amount, invoice, description) {
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

export async function getSanpayMutasi() {
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

export function mutationTimestamp(mutation) {
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
  const direct = new Date(value);
  if (Number.isFinite(direct.getTime())) return direct;

  // Common Indonesian/Sanpay formats: DD/MM/YYYY HH:mm:ss or DD-MM-YYYY HH:mm:ss.
  const match = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const [, day, month, year, hour = "0", minute = "0", second = "0"] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function mutationReference(mutation) {
  return String(firstValue(mutation, [
    "partnerReferenceNo", "partner_reference_no", "referenceNo", "reference_no",
    "merchantReference", "merchant_reference", "externalId", "external_id",
    "invoice", "description", "note", "remark"
  ]) || "").trim();
}

export function mutationIsCredit(mutation) {
  const text = String(firstValue(mutation, [
    "type", "transactionType", "transaction_type", "direction", "flow", "status"
  ]) || "").toLowerCase();
  if (/debit|keluar|withdraw|outgoing|expense|refund/.test(text)) return false;
  return true;
}

export function mutationMatchesOrder(mutation, order) {
  if (!mutation || !order) return false;
  if (normalizeAmount(mutation.amount) !== Number(order.payment_amount)) return false;
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

export function normalizeAmount(value) {
  if (typeof value === "number") return Math.round(value);
  return Number(String(value || "0").replace(/[^0-9]/g, ""));
}
export function mutasiKey(m) {
  return String(m.transactionID || m.transactionId || m.transaction_id || m.id ||
    `${m.transactionDate || m.date || ""}-${m.amount || ""}-${m.customerName || ""}`);
}
export function uniqueFee() {
  const min = Number(env("SANPAY_UNIQUE_FEE_MIN", "100"));
  const max = Number(env("SANPAY_UNIQUE_FEE_MAX", "200"));
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
export function invoiceId() {
  return `KIVO-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}
export function publicOrder(o) {
  return {
    invoice:o.invoice, product_name:o.product_name, variant_name:o.variant_name,
    amount:o.amount, payment_amount:o.payment_amount, status:o.status,
    expires_at:o.expires_at, paid_at:o.paid_at, delivered_at:o.delivered_at,
    qr_content:o.qr_content || null, qr_image:o.qr_image || null,
    delivery_content:o.status === "completed" ? o.delivery_content : null,
    created_at:o.created_at
  };
}
