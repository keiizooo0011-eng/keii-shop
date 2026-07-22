import { adminClient, getSanpayMutasi, normalizeAmount, mutasiKey } from "./_lib.js";
import { panelpediaRequest } from "./_panelpedia.js";

const publicOrder = (order) => ({
  invoice: order.invoice,
  game_name: order.game_name,
  service_name: order.service_name,
  target: order.target,
  zone: order.zone,
  payment_amount: order.payment_amount,
  status: order.status,
  provider_status: order.vip_status,
  note: order.note,
  expires_at: order.expires_at,
  qr_content: order.qr_content,
  qr_image: order.qr_image,
  created_at: order.created_at,
});

function normalizeProviderStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (["sukses", "success", "completed", "complete", "done"].includes(status)) return "completed";
  if (["gagal", "failed", "error", "cancel", "canceled", "cancelled"].includes(status)) return "failed";
  return "processing";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const invoice = String(req.query?.invoice || req.body?.invoice || "").trim();
  if (!invoice) return res.status(400).json({ error: "Invoice wajib diisi." });

  try {
    const db = adminClient();
    let { data: order, error } = await db.from("game_orders").select("*").eq("invoice", invoice).maybeSingle();
    if (error) throw error;
    if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });

    if (order.status === "pending" && new Date(order.expires_at).getTime() <= Date.now()) {
      await db.from("game_orders").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", order.id);
      order.status = "expired";
    }

    if (order.status === "pending") {
      const mutations = await getSanpayMutasi();
      const mutation = mutations.find((entry) => normalizeAmount(entry.amount) === Number(order.payment_amount));
      if (mutation) {
        await db
          .from("game_orders")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            mutation_key: mutasiKey(mutation),
            mutation_data: mutation,
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id);

        try {
          const provider = await panelpediaRequest("order", {
            order_id: order.invoice,
            service_id: order.service_code,
            target_id: order.target,
            target_server: order.zone || "",
          });
          const data = provider?.data || {};
          await db
            .from("game_orders")
            .update({
              status: "processing",
              vip_trxid: String(data.order_id || order.invoice),
              vip_status: String(data.status || "Proses"),
              note: String(data.note || provider?.msg || "Pesanan sedang diproses."),
              vip_raw: provider,
              updated_at: new Date().toISOString(),
            })
            .eq("id", order.id);
        } catch (providerError) {
          await db
            .from("game_orders")
            .update({
              status: "failed",
              vip_status: "Gagal",
              note: providerError.message,
              updated_at: new Date().toISOString(),
            })
            .eq("id", order.id);
        }
      }
    }

    ({ data: order, error } = await db.from("game_orders").select("*").eq("id", order.id).single());
    if (error) throw error;

    if (order.status === "processing" && order.vip_trxid) {
      try {
        const provider = await panelpediaRequest("status", { order_id: order.vip_trxid });
        const data = provider?.data || {};
        const providerStatus = String(data.status || order.vip_status || "Proses");
        const status = normalizeProviderStatus(providerStatus);
        const note = String(data.note || provider?.msg || order.note || "");
        await db
          .from("game_orders")
          .update({
            status,
            vip_status: providerStatus,
            note,
            vip_raw: provider,
            completed_at: status === "completed" ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id);
        order = { ...order, status, vip_status: providerStatus, note };
      } catch (error) {
        // Gangguan cek status tidak mengubah order menjadi gagal; polling berikutnya akan mencoba lagi.
        console.error("PANELPEDIA STATUS", error);
      }
    }

    return res.status(200).json({ order: publicOrder(order) });
  } catch (error) {
    console.error("CHECK GAME PAYMENT", error);
    return res.status(500).json({ error: error.message || "Gagal mengecek transaksi." });
  }
}
