import { adminClient, env } from "./_lib.js";
import { panelpediaRequest, panelpediaErrorPayload } from "./_panelpedia.js";

export default async function handler(req, res) {
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
