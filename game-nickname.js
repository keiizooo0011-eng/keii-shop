export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method tidak diizinkan." });

  const target = String(req.body?.target || "").trim();
  if (!target) return res.status(400).json({ error: "Isi ID terlebih dahulu." });

  // Dokumentasi PanelPedia yang digunakan KivoPay tidak menyediakan endpoint nickname.
  // Checkout tetap dapat dilanjutkan setelah pembeli memastikan ID/Zone benar.
  return res.status(200).json({
    supported: false,
    nickname: "",
    country: null,
    message: "Cek nickname tidak tersedia di PanelPedia. Pastikan User ID dan Zone/Server sudah benar.",
  });
}
