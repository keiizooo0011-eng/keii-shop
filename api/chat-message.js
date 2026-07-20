
import { adminClient } from "./_lib.js";

const clean = value => String(value || "").replace(/\s+/g, " ").trim();
const blocked = [
  "kontol","memek","ngentot","bangsat","anjing","babi","tolol",
  "scam","penipu","carding","judi","slot"
];

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method tidak diizinkan." });
  }

  try {
    const db = adminClient();
    const guestId = clean(req.body?.guest_id).slice(0, 80);
    const nickname = clean(req.body?.nickname).slice(0, 28);
    const message = clean(req.body?.message).slice(0, 280);

    if (!guestId || nickname.length < 2 || message.length < 2) {
      return res.status(400).json({ error: "Nama dan pesan wajib diisi." });
    }

    const lower = `${nickname} ${message}`.toLowerCase();
    if (blocked.some(word => lower.includes(word))) {
      return res.status(400).json({ error: "Pesan mengandung kata yang tidak diperbolehkan." });
    }

    const since = new Date(Date.now() - 15000).toISOString();
    const { count, error: countError } = await db
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("guest_id", guestId)
      .gte("created_at", since);

    if (countError) throw countError;
    if (count) {
      return res.status(429).json({ error: "Tunggu 15 detik sebelum mengirim pesan lagi." });
    }

    const { data, error } = await db
      .from("chat_messages")
      .insert({ guest_id: guestId, nickname, message, is_visible: true })
      .select("id,nickname,message,created_at")
      .single();

    if (error) throw error;
    return res.status(200).json({ message: data });
  } catch (error) {
    console.error("CHAT MESSAGE ERROR", error);
    return res.status(500).json({ error: error.message || "Pesan gagal dikirim." });
  }
}
