(() => {
  'use strict';

  const PAGE_HAS_FEED = Boolean(document.getElementById('kivoLiveOrderList'));
  const SEEN_KEY = 'kivopay_seen_live_order_v60';
  const POLL_INTERVAL = 15000;
  let newestOrderId = localStorage.getItem(SEEN_KEY) || '';
  let initialized = false;
  let busy = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  })[char]);

  const rupiah = value => new Intl.NumberFormat('id-ID', {
    style:'currency', currency:'IDR', maximumFractionDigits:0
  }).format(Number(value || 0));

  function timeAgo(value) {
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return 'baru saja';
    const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
    if (seconds < 60) return 'baru saja';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} menit lalu`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} jam lalu`;
    return `${Math.floor(hours / 24)} hari lalu`;
  }

  function statusLabel(status) {
    return status === 'completed' ? 'Pesanan selesai'
      : status === 'processing' ? 'Sedang diproses'
      : 'Pembayaran berhasil';
  }

  function ensureToast() {
    let toast = document.getElementById('kivoOrderToast');
    if (toast) return toast;
    toast = document.createElement('aside');
    toast.id = 'kivoOrderToast';
    toast.className = 'kivo-order-toast';
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = '<span class="kivo-order-toast-icon">✓</span><div><small>TRANSAKSI TERBARU</small><strong></strong><p></p></div><button type="button" aria-label="Tutup">×</button>';
    toast.querySelector('button').onclick = () => toast.classList.remove('show');
    document.body.appendChild(toast);
    return toast;
  }

  function showToast(order) {
    if (!order) return;
    const toast = ensureToast();
    toast.querySelector('strong').textContent = `${order.customer_name} membeli ${order.product_name}`;
    toast.querySelector('p').textContent = `${order.variant_name} • ${rupiah(order.amount)}`;
    toast.classList.remove('show');
    requestAnimationFrame(() => toast.classList.add('show'));
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 6500);
  }

  function card(order) {
    return `<article class="kivo-live-order-card">
      <span class="kivo-live-avatar">${esc(String(order.customer_name || 'K').charAt(0))}</span>
      <div class="kivo-live-order-main">
        <div class="kivo-live-order-title"><strong>${esc(order.customer_name)}</strong><span class="kivo-live-status ${esc(order.status)}">${esc(statusLabel(order.status))}</span></div>
        <p>membeli <b>${esc(order.product_name)}</b></p>
        <div class="kivo-live-order-meta"><span>${esc(order.variant_name)}</span><i>•</i><span>${rupiah(order.amount)}</span><i>•</i><span>${esc(timeAgo(order.created_at))}</span></div>
      </div>
    </article>`;
  }

  function render(orders) {
    const list = document.getElementById('kivoLiveOrderList');
    const count = document.getElementById('kivoLiveOrderCount');
    if (!list) return;
    if (count) count.textContent = orders.length ? `${orders.length} transaksi terbaru` : 'Belum ada transaksi';
    list.innerHTML = orders.length ? orders.map(card).join('')
      : '<div class="kivo-live-empty"><span>◎</span><strong>Belum ada pembelian terbaru</strong><p>Transaksi yang sudah dibayar akan tampil otomatis di sini.</p></div>';
  }

  function renderError() {
    if (!PAGE_HAS_FEED) return;
    const list = document.getElementById('kivoLiveOrderList');
    const count = document.getElementById('kivoLiveOrderCount');
    if (count) count.textContent = 'Gagal memuat aktivitas';
    if (list) list.innerHTML = '<button type="button" class="kivo-live-retry">Coba Muat Ulang</button>';
    list?.querySelector('.kivo-live-retry')?.addEventListener('click', () => fetchOrders({ notify:false }));
  }

  async function fetchOrders({ notify = true } = {}) {
    if (busy) return;
    busy = true;
    try {
      const response = await fetch(`/api/live-orders?t=${Date.now()}`, { cache:'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.message || 'Gagal memuat aktivitas');
      const orders = Array.isArray(body.orders) ? body.orders : [];
      if (PAGE_HAS_FEED) render(orders);

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
    } catch (error) {
      console.warn('KivoPay live activity:', error);
      renderError();
    } finally {
      busy = false;
    }
  }

  const init = () => {
    fetchOrders({ notify:false });
    setInterval(() => fetchOrders({ notify:true }), POLL_INTERVAL);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) fetchOrders({ notify:true });
    });
    window.addEventListener('online', () => fetchOrders({ notify:false }));
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
