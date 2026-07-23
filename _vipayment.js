import crypto from "node:crypto";
import { env } from "./_lib.js";

const API_URL = () => env("VIPAYMENT_API_URL", "https://vip-reseller.co.id/api/game-feature");
const GATEWAY_URL = () => env("VIPAYMENT_GATEWAY_URL", "").replace(/\/$/, "");
const GATEWAY_TOKEN = () => env("KIVOPAY_GATEWAY_TOKEN", "");
const API_ID = () => env("VIPAY_I_ID", env("VIPAYMENT_API_ID", ""));
const API_KEY = () => env("VIPAY_KEY", env("VIPAYMENT_API_KEY", ""));

export function vipaymentConfigured() {
  return Boolean((GATEWAY_URL() && GATEWAY_TOKEN()) || (API_ID() && API_KEY()));
}

export function vipaymentSign() {
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

export async function vipaymentRequest(type, payload = {}) {
  return GATEWAY_URL() ? gatewayRequest(type, payload) : directRequest(type, payload);
}

export function vipaymentRows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (value?.data && typeof value.data === "object") return [value.data];
  return [];
}

export function vipaymentCost(service) {
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

export function vipaymentService(service) {
  return {
    code: String(service?.code ?? service?.id ?? ""),
    game: String(service?.game ?? service?.brand ?? service?.category ?? "Game"),
    name: String(service?.name ?? service?.service ?? "Paket"),
    price: vipaymentCost(service),
    description: String(service?.description ?? ""),
    server: String(service?.server ?? ""),
    status: String(service?.status ?? "available"),
    raw: service,
  };
}

export function vipaymentErrorPayload(error) {
  return {
    message: error?.message || "Terjadi gangguan saat menghubungi VIPayment.",
    debug: error?.debug || null,
  };
}
