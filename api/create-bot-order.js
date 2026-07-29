import { optionalAuthUser } from './_auth-user.js';
import { adminClient, invoiceId } from './_lib.js';
import { botController, normalizePhone, rentalDays } from './_bot-controller.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method tidak diizinkan.' });
  const authUser = await optionalAuthUser(req);
  if (!authUser) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
  const db = adminClient();
  let order = null;
  let debited = false;
  try {
    const productId = String(req.body?.product_id || '').trim();
    const variantIndex = Number(req.body?.variant_index || 0);
    const customerName = String(req.body?.customer_name || '').trim();
    const phone = normalizePhone(req.body?.customer_contact || req.body?.phone);
    const botName = String(req.body?.bot_name || 'KEIINEXUS').trim().slice(0, 60);
    const prefix = String(req.body?.prefix || '.').trim().slice(0, 5) || '.';
    if (!productId || !customerName) return res.status(400).json({ error: 'Data pesanan belum lengkap.' });

    const { data: product, error: pe } = await db.from('products').select('*').eq('id', productId).eq('is_active', true).eq('category', 'sewa-bot').maybeSingle();
    if (pe) throw pe;
    if (!product) return res.status(404).json({ error: 'Produk sewa bot tidak ditemukan.' });
    if (Number(product.stock || 0) <= 0) return res.status(409).json({ error: 'Slot sewa bot sedang penuh.' });

    const variants = Array.isArray(product.variants) ? product.variants : [];
    const variant = variants[variantIndex] || { name: 'Paket utama', price: product.price };
    const amount = Number(variant.price ?? product.price);
    const durationDays = Number(variant.duration_days || variant.days || rentalDays(variant.name, 30));
    const invoice = invoiceId().replace('KIVO-', 'BOT-');
    const sessionId = invoice.replace(/[^A-Z0-9_-]/gi, '').slice(0, 70);
    const expiresAt = new Date(Date.now() + durationDays * 86400000).toISOString();

    const { data: inserted, error: oe } = await db.from('bot_orders').insert({
      invoice, user_id: authUser.id, product_id: product.id, product_name: product.name,
      variant_name: String(variant.name || 'Paket utama'), amount, customer_name: customerName,
      phone, bot_name: botName, prefix, duration_days: durationDays, session_id: sessionId,
      status: 'creating', expires_at: expiresAt
    }).select('*').single();
    if (oe) throw oe;
    order = inserted;

    const debit = await db.rpc('wallet_debit', {
      p_user_id: authUser.id, p_amount: amount, p_reference: `BOT:${invoice}`,
      p_description: `Sewa bot ${product.name}`, p_metadata: { bot_order_id: order.id, invoice }
    });
    if (debit.error) {
      if (String(debit.error.message || '').includes('INSUFFICIENT_BALANCE')) { const e = new Error('Saldo KivoPay tidak cukup.'); e.statusCode = 402; e.needDeposit = true; throw e; }
      throw debit.error;
    }
    debited = true;

    // Controller hanya menerima pekerjaan lalu pairing dibuat di background.
    // Request ini harus selesai cepat agar Vercel tidak memutus koneksi.
    const session = await botController('/api/sessions', { method: 'POST', timeout: 12000, body: {
      session_id: sessionId, phone, duration_days: durationDays, expires_at: expiresAt,
      order_id: order.id, user_id: authUser.id, product_id: product.id, bot_name: botName, prefix
    }});

    const { data: fresh, error: ue } = await db.from('bot_orders').update({
      status: session.status || 'creating', pairing_code: session.pairingCode || null,
      controller_data: session, error_message: null, updated_at: new Date().toISOString()
    }).eq('id', order.id).select('*').single();
    if (ue) throw ue;
    await db.from('products').update({ stock: Math.max(Number(product.stock || 0) - 1, 0), updated_at: new Date().toISOString() }).eq('id', product.id);
    return res.status(200).json({ ok: true, order: fresh, balance_after: debit.data?.balance });
  } catch (error) {
    console.error('CREATE BOT ORDER', error);
    if (order) await db.from('bot_orders').update({ status: 'failed', error_message: error.message, updated_at: new Date().toISOString() }).eq('id', order.id);
    if (debited && order) {
      try { await db.rpc('wallet_refund', { p_user_id: authUser.id, p_amount: order.amount, p_reference: `REFUND:BOT:${order.invoice}`, p_description: `Pengembalian ${order.invoice}`, p_metadata: { reason: error.message } }); } catch {}
    }
    return res.status(error.statusCode || 500).json({ error: error.message || 'Gagal membuat bot.', need_deposit: Boolean(error.needDeposit) });
  }
}
