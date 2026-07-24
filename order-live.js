(() => {
  'use strict';

  const CONFIG = window.KIVOPAY_CONFIG || {};
  const PAGE_HAS_FEED = Boolean(document.getElementById('kivoLiveOrders'));
  const SEEN_KEY = 'kivopay_seen_live_order';
  const POLL_INTERVAL = 18000;
  let db = null;
  let newestOrderId = localStorage.getItem(SEEN_KEY) || '';
  let initialized = false;
  let pollTimer = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  })[char]);

  const rupiah = value => new Intl.NumberFormat('id-ID', {
    style:'currency', currency:'IDR', maximumFractionDigits:0
  }).format(Number(value || 0));

  function maskName(name) {
    const clean = String(name || 'Pelanggan KivoPay').trim();
    const first = clean.split(/\s+/)[0] || 'Pelanggan';
    if (first.length <= 2) return `${first.charAt(0).toUpperCase()}***`;
    return `${first.slice(0, 2).replace(/^./, c => c.toUpperCase())}${'*'.repeat(Math.min(4, Math.max(2, first.length - 2)))}`;
  }

  function timeAgo(value) {
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return 'baru saja';
    const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
    if (seconds < 60) return 'baru saja';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} menit lalu`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} jam lalu`;
    const days = Math.floor(hours / 24);
    return `${days} hari lalu`;
  }

  function statusLabel(status) {
    const labels = {
      pending:'Menunggu pembayaran', paid:'Pembayaran berhasil',
      processing:'Sedang diproses', completed:'Pesanan selesai'
    };
    return labels[status] || 'Order masuk';
  }

  function statusClass(status) {
    return ['paid','processing','completed'].includes(status) ? status : 'pending';
  }

  function ensureToast() {
    let toast = document.getElementById('kivoOrderToast');
    if (toast) return toast;
    toast = document.createElement('aside');
    toast.id = 'kivoOrderToast';
    toast.className = 'kivo-order-toast';
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = `
      <span class="kivo-order-toast-icon">✓</span>
      <div><small>ORDER BARU KIVOPAY</small><strong></strong><p></p></div>
      <button type="button" aria-label="Tutup notifikasi">×</button>`;
    toast.querySelector('button').addEventListener('click', () => toast.classList.remove('show'));
    document.body.appendChild(toast);
    return toast;
  }

  function showToast(order) {
    if (!order || order.status === 'cancelled') return;
    const toast = ensureToast();
    toast.querySelector('strong').textContent = `${maskName(order.customer_name)} membeli ${order.product_name || 'produk digital'}`;
    toast.querySelector('p').textContent = `${order.variant_name || 'Paket utama'} • ${rupiah(order.amount)} • ${statusLabel(order.status)}`;
    toast.classList.remove('show');
    requestAnimationFrame(() => toast.classList.add('show'));
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 6500);
  }

  function cardMarkup(order) {
    return `<article class="kivo-live-order-card">
      <span class="kivo-live-avatar">${esc(maskName(order.customer_name).charAt(0))}</span>
      <div class="kivo-live-order-main">
        <div class="kivo-live-order-title"><strong>${esc(maskName(order.customer_name))}</strong><span class="kivo-live-status ${statusClass(order.status)}">${esc(statusLabel(order.status))}</span></div>
        <p>membeli <b>${esc(order.product_name || 'Produk Digital')}</b></p>
        <div class="kivo-live-order-meta"><span>${esc(order.variant_name || 'Paket utama')}</span><i>•</i><span>${rupiah(order.amount)}</span><i>•</i><span>${esc(timeAgo(order.created_at))}</span></div>
      </div>
    </article>`;
  }

  function renderFeed(orders) {
    const list = document.getElementById('kivoLiveOrderList');
    const count = document.getElementById('kivoLiveOrderCount');
    if (!list) return;
    if (count) count.textContent = `${orders.length} aktivitas terbaru`;
    list.innerHTML = orders.length
      ? orders.map(cardMarkup).join('')
      : `<div class="kivo-live-empty"><span>◎</span><strong>Belum ada aktivitas order</strong><p>Order terbaru akan tampil otomatis di sini.</p></div>`;
  }

  async function fetchOrders({ notify = false } = {}) {
    if (!db) return;
    const { data, error } = await db
      .from('orders')
      .select('id,customer_name,product_name,variant_name,amount,status,created_at')
      .neq('status', 'cancelled')
      .order('created_at', { ascending:false })
      .limit(8);

    if (error) {
      console.warn('KivoPay live orders:', error.message || error);
      return;
    }

    const orders = data || [];
    if (PAGE_HAS_FEED) renderFeed(orders);

    const latest = orders[0];
    if (!latest) { initialized = true; return; }

    if (!initialized) {
      initialized = true;
      newestOrderId = latest.id;
      localStorage.setItem(SEEN_KEY, latest.id);
      return;
    }

    if (notify && latest.id !== newestOrderId) {
      newestOrderId = latest.id;
      localStorage.setItem(SEEN_KEY, latest.id);
      showToast(latest);
    }
  }

  function startRealtime() {
    try {
      db.channel(`kivopay-live-orders-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', {
          event:'INSERT', schema:'public', table:'orders'
        }, payload => {
          const order = payload.new;
          if (!order || order.status === 'cancelled') return;
          newestOrderId = order.id;
          localStorage.setItem(SEEN_KEY, order.id);
          showToast(order);
          fetchOrders();
        })
        .subscribe();
    } catch (error) {
      console.warn('Realtime order notification unavailable:', error);
    }
  }

  async function init() {
    if (!window.supabase?.createClient || !CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey) return;
    db = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false }
    });

    await fetchOrders();
    startRealtime();
    pollTimer = setInterval(() => fetchOrders({ notify:true }), POLL_INTERVAL);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) fetchOrders({ notify:true });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
