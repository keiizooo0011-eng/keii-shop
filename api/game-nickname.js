import { vipaymentRequest, vipaymentRows } from "./_vipayment.js";

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

export default async function handler(req, res) {
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
