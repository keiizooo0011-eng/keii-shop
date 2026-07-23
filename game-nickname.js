import { vipaymentRequest } from "./_vipayment.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method tidak diizinkan." });

  const code = String(req.body?.code || "").trim();
  const target = String(req.body?.target || "").trim();
  const zone = String(req.body?.zone || "").trim();
  if (!code || !target) return res.status(400).json({ error: "Pilih produk dan isi ID terlebih dahulu." });

  try {
    const provider = await vipaymentRequest("get-nickname", {
      code,
      target,
      additional_target: zone || undefined,
    });
    return res.status(200).json({
      supported: true,
      nickname: String(provider?.data || ""),
      country: provider?.country || null,
      message: provider?.message || "Nickname ditemukan.",
    });
  } catch (error) {
    return res.status(422).json({ error: error.message || "Nickname tidak ditemukan. Pastikan ID dan Zone benar." });
  }
}
