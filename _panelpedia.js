import crypto from "node:crypto";
import { env } from "./_lib.js";

const BASE_URL = () => env("PANELPEDIA_BASE_URL", "https://panelpediatopup.com/api").replace(/\/$/, "");
const apiId = () => env("PANELPEDIA_API_ID");
const apiKey = () => env("PANELPEDIA_API_KEY");

export class PanelPediaError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "PanelPediaError";
    this.status = Number(details.status || 0);
    this.endpoint = String(details.endpoint || "");
    this.contentType = String(details.contentType || "");
    this.responsePreview = String(details.responsePreview || "");
    this.server = String(details.server || "");
    this.cfRay = String(details.cfRay || "");
  }
}

export function panelpediaConfigured() {
  return Boolean(apiId() && apiKey());
}

export function panelpediaSignature() {
  return crypto.createHash("md5").update(apiId() + apiKey()).digest("hex");
}

function cleanPreview(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .trim()
    .slice(0, 500);
}

export function panelpediaErrorPayload(error) {
  return {
    message: error?.message || "PanelPedia gagal dihubungi.",
    provider_http_status: Number(error?.status || 0) || undefined,
    provider_endpoint: error?.endpoint || undefined,
    provider_content_type: error?.contentType || undefined,
    provider_response_preview: error?.responsePreview || undefined,
    provider_server: error?.server || undefined,
    provider_cf_ray: error?.cfRay || undefined,
  };
}

export async function panelpediaRequest(endpoint, payload = {}) {
  if (!panelpediaConfigured()) {
    throw new PanelPediaError("Environment PanelPedia belum lengkap.", { endpoint });
  }

  const normalizedEndpoint = String(endpoint).replace(/^\//, "");
  const body = new URLSearchParams({
    api_id: apiId(),
    api_key: apiKey(),
    signature: panelpediaSignature(),
    ...Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== "")
    ),
  });

  let response;
  try {
    response = await fetch(`${BASE_URL()}/${normalizedEndpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json, text/plain, */*",
        "User-Agent": "KivoPay/20.7.1 (+https://kivopay.shop)",
      },
      body,
      signal: AbortSignal.timeout(25000),
    });
  } catch (error) {
    throw new PanelPediaError(`Tidak dapat terhubung ke PanelPedia: ${error?.message || "network error"}`, {
      endpoint: normalizedEndpoint,
    });
  }

  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const meta = {
    status: response.status,
    endpoint: normalizedEndpoint,
    contentType,
    responsePreview: cleanPreview(text),
    server: response.headers.get("server") || "",
    cfRay: response.headers.get("cf-ray") || "",
  };

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new PanelPediaError(`Respons PanelPedia bukan JSON (HTTP ${response.status}).`, meta);
  }

  if (!response.ok || json?.result === false) {
    throw new PanelPediaError(
      json?.msg || json?.message || json?.error || `PanelPedia HTTP ${response.status}`,
      { ...meta, responsePreview: cleanPreview(text) }
    );
  }

  return json;
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
