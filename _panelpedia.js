import crypto from "node:crypto";
import { env } from "./_lib.js";

const BASE_URL = () => env("PANELPEDIA_BASE_URL", "https://panelpediatopup.com/api").replace(/\/$/, "");
const GATEWAY_URL = () => env("PANELPEDIA_GATEWAY_URL", "").replace(/\/$/, "");
const GATEWAY_TOKEN = () => env("KIVOPAY_GATEWAY_TOKEN", "");
const apiId = () => env("PANELPEDIA_API_ID");
const apiKey = () => env("PANELPEDIA_API_KEY");

export function panelpediaConfigured() {
  return Boolean((GATEWAY_URL() && GATEWAY_TOKEN()) || (apiId() && apiKey()));
}

export function panelpediaSignature() {
  return crypto.createHash("md5").update(apiId() + apiKey()).digest("hex");
}

async function gatewayRequest(endpoint, payload) {
  const route = endpoint === "service" ? "services" : endpoint;
  const response = await fetch(`${GATEWAY_URL()}/panelpedia/${route}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Gateway-Token": GATEWAY_TOKEN(),
    },
    body: JSON.stringify(payload || {}),
    signal: AbortSignal.timeout(30000),
  });

  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch {
    throw new Error(`Gateway Nexus membalas non-JSON (HTTP ${response.status}).`);
  }
  if (!response.ok || json?.ok === false) {
    const error = new Error(json?.error || `Gateway Nexus HTTP ${response.status}`);
    error.debug = json?.debug;
    throw error;
  }
  return json?.data;
}

async function directRequest(endpoint, payload) {
  if (!apiId() || !apiKey()) throw new Error("Environment PanelPedia belum lengkap.");
  const body = new URLSearchParams({
    api_id: apiId(),
    api_key: apiKey(),
    signature: panelpediaSignature(),
    ...Object.fromEntries(Object.entries(payload || {}).filter(([, value]) => value !== undefined && value !== null && value !== "")),
  });
  const response = await fetch(`${BASE_URL()}/${String(endpoint).replace(/^\//, "")}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    signal: AbortSignal.timeout(25000),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`Respons PanelPedia bukan JSON (HTTP ${response.status}).`); }
  if (!response.ok || json?.result === false) throw new Error(json?.msg || json?.message || json?.error || `PanelPedia HTTP ${response.status}`);
  return json;
}

export async function panelpediaRequest(endpoint, payload = {}) {
  if (GATEWAY_URL()) {
    if (!GATEWAY_TOKEN()) throw new Error("KIVOPAY_GATEWAY_TOKEN belum diisi di Vercel.");
    return gatewayRequest(endpoint, payload);
  }
  return directRequest(endpoint, payload);
}

export function panelpediaRows(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    if (Array.isArray(data.data)) return data.data;
    const values = Object.values(data);
    if (values.length && values.every((value) => value && typeof value === "object")) return values;
    return [data];
  }
  return [];
}

export function panelpediaCost(service) {
  const tier = env("PANELPEDIA_PRICE_TIER", "basic").toLowerCase();
  const prices = service?.harga || service?.price || {};
  const preferred = Number(prices?.[tier]);
  if (Number.isFinite(preferred) && preferred > 0) return preferred;
  for (const key of ["basic", "gold", "platinum"]) {
    const value = Number(prices?.[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  const direct = Number(service?.harga || service?.price || service?.cost || 0);
  return Number.isFinite(direct) ? direct : 0;
}

export function panelpediaService(service) {
  const price = panelpediaCost(service);
  return {
    code: String(service?.id ?? service?.service_id ?? service?.code ?? ""),
    game: String(service?.game ?? service?.brand ?? service?.category ?? "Game"),
    name: String(service?.nama_layanan ?? service?.name ?? service?.service ?? "Paket"),
    price,
    description: String(service?.description ?? service?.deskripsi ?? ""),
    server: String(service?.server ?? ""),
    status: String(service?.status ?? "Aktif"),
    raw: service,
  };
}
