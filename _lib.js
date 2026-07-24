
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
