import dns from "node:dns/promises";
import net from "node:net";
import { Readable } from "node:stream";

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

export default async function handler(req, res) {
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
