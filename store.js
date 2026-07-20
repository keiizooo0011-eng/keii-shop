
(() => {
  const cfg = window.KIVOPAY_CONFIG || {};
  const configured =
    cfg.supabaseUrl &&
    cfg.supabaseAnonKey &&
    !cfg.supabaseUrl.startsWith("ISI_") &&
    !cfg.supabaseAnonKey.startsWith("ISI_");

  const sb = configured && window.supabase
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)
    : null;

  const rupiah = n => new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0
  }).format(Number(n || 0));

  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));

  const demoProducts = [
    {
      id: "demo-apk",
      name: "Contoh APK Premium",
      category: "apk-premium",
      description: "Produk contoh. Tambahkan produk asli melalui panel admin.",
      price: 15000,
      image_url: "https://img2.pixhost.to/images/9481/751089580_papaqueen.jpg",
      stock: 10,
      is_active: true,
      variants: [{name:"1 Bulan", price:15000}]
    },
    {
      id: "demo-bot",
      name: "Contoh Sewa Bot",
      category: "sewa-bot",
      description: "Paket sewa bot contoh untuk tampilan awal KivoPay.",
      price: 25000,
      image_url: "https://img2.pixhost.to/images/9481/751089580_papaqueen.jpg",
      stock: 5,
      is_active: true,
      variants: [{name:"30 Hari", price:25000}]
    }
  ];

  async function loadProducts() {
    if (!sb) return demoProducts;
    const { data, error } = await sb
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  function productCard(p) {
    const cat = p.category === "sewa-bot" ? "Sewa Bot" : "APK Premium";
    return `
      <article class="store-card" data-category="${esc(p.category)}">
        <div class="store-image-wrap">
          <img class="store-image" src="${esc(p.image_url || "https://img2.pixhost.to/images/9481/751089580_papaqueen.jpg")}" alt="${esc(p.name)}">
          <span class="store-category">${cat}</span>
        </div>
        <div class="store-card-body">
          <h3>${esc(p.name)}</h3>
          <p>${esc(p.description || "Produk digital KivoPay.")}</p>
          <div class="store-meta">
            <strong>${rupiah(p.price)}</strong>
            <span>Stok ${Number(p.stock || 0)}</span>
          </div>
          <button class="store-buy" data-product-id="${esc(p.id)}">Beli Sekarang</button>
        </div>
      </article>`;
  }

  async function renderStore() {
    const root = document.querySelector("#storeGrid");
    if (!root) return;
    root.innerHTML = `<div class="store-loading">Memuat produk...</div>`;
    try {
      const products = await loadProducts();
      window.__KIVO_PRODUCTS__ = products;
      root.innerHTML = products.length
        ? products.map(productCard).join("")
        : `<div class="store-empty">Belum ada produk aktif. Tambahkan dari Admin Panel.</div>`;
      document.querySelectorAll(".store-buy").forEach(btn => {
        btn.onclick = () => openCheckout(btn.dataset.productId);
      });
    } catch (e) {
      root.innerHTML = `<div class="store-empty">Produk gagal dimuat: ${esc(e.message)}</div>`;
    }
  }

  function openCheckout(id) {
    const product = (window.__KIVO_PRODUCTS__ || []).find(p => String(p.id) === String(id));
    if (!product) return;
    const modal = document.querySelector("#shopModal");
    const body = document.querySelector("#shopModalBody");
    if (!modal || !body) return;

    let variants = Array.isArray(product.variants) ? product.variants : [];
    if (!variants.length) variants = [{name:"Paket utama",price:product.price}];

    body.innerHTML = `
      <button class="shop-close" type="button" aria-label="Tutup">×</button>
      <div class="checkout-head">
        <img src="${esc(product.image_url || "")}" alt="${esc(product.name)}">
        <div><span>CHECKOUT KIVOPAY</span><h2>${esc(product.name)}</h2></div>
      </div>
      <label>Pilih paket</label>
      <select id="checkoutVariant">
        ${variants.map((v,i)=>`<option value="${i}">${esc(v.name)} — ${rupiah(v.price ?? product.price)}</option>`).join("")}
      </select>
      <label>Nama pembeli</label>
      <input id="checkoutName" placeholder="Nama kamu">
      <label>Nomor WhatsApp / Telegram</label>
      <input id="checkoutContact" placeholder="Contoh: 62812xxxx">
      <button id="checkoutSubmit" class="checkout-submit">Buat Pesanan</button>
      <p class="checkout-note">Pembayaran QRIS Sanpay akan diaktifkan pada tahap gateway. Versi ini membuat order pending untuk menguji Store dan Admin.</p>`;

    modal.classList.add("open");
    body.querySelector(".shop-close").onclick = () => modal.classList.remove("open");

    body.querySelector("#checkoutSubmit").onclick = async () => {
      const name = body.querySelector("#checkoutName").value.trim();
      const contact = body.querySelector("#checkoutContact").value.trim();
      const variantIndex = Number(body.querySelector("#checkoutVariant").value);
      if (!name || !contact) return alert("Nama dan kontak wajib diisi.");

      const submit = body.querySelector("#checkoutSubmit");
      submit.disabled = true;
      submit.textContent = "Membuat QRIS...";

      try {
        const response = await fetch("/api/create-order", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({
            product_id: product.id,
            variant_index: variantIndex,
            customer_name: name,
            customer_contact: contact
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Gagal membuat pembayaran.");
        showPayment(data);
      } catch (e) {
        alert(e.message);
        submit.disabled = false;
        submit.textContent = "Buat Pesanan";
      }
    };

    function showPayment(data) {
      const order = data.order;
      const expiry = new Date(data.expires_at);
      body.innerHTML = `
        <button class="shop-close" type="button">×</button>
        <div class="payment-view">
          <span class="payment-label">PEMBAYARAN QRIS</span>
          <h2>${esc(order.product_name)}</h2>
          <p>Scan QRIS dan bayar sesuai nominal sampai tiga angka terakhir.</p>
          <div id="qrisBox" class="qris-box"></div>
          <div class="payment-total"><span>Total pembayaran</span><strong>${rupiah(order.payment_amount)}</strong></div>
          <div class="invoice-copy"><span>${esc(order.invoice)}</span><button id="copyInvoice">Salin</button></div>
          <div id="paymentStatus" class="payment-status pending">Menunggu pembayaran...</div>
          <small>Berlaku sampai ${expiry.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})}</small>
        </div>`;
      body.querySelector(".shop-close").onclick = () => modal.classList.remove("open");
      body.querySelector("#copyInvoice").onclick = async () => {
        await navigator.clipboard.writeText(order.invoice);
        body.querySelector("#copyInvoice").textContent = "Tersalin";
      };

      const box = body.querySelector("#qrisBox");
      if (data.qr_image) box.innerHTML = `<img src="${esc(data.qr_image)}" alt="QRIS pembayaran">`;
      else if (data.qr_content && window.QRCode) new QRCode(box,{text:data.qr_content,width:230,height:230});
      else box.innerHTML = "<p>QRIS tidak dapat ditampilkan. Hubungi admin.</p>";

      let stopped = false;
      const check = async () => {
        if (stopped || !document.body.contains(body)) return;
        try {
          const r = await fetch("/api/check-payment?invoice="+encodeURIComponent(order.invoice),{cache:"no-store"});
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || "Gagal cek pembayaran.");
          const current = d.order;
          const status = body.querySelector("#paymentStatus");
          if (!status) return;
          status.className = "payment-status " + current.status;

          if (current.status === "completed") {
            stopped = true;
            status.textContent = "Pembayaran berhasil • Produk terkirim";
            body.querySelector(".payment-view").insertAdjacentHTML("beforeend",`
              <div class="delivery-box">
                <span>PRODUK / AKSES KAMU</span>
                <pre>${esc(current.delivery_content || "Pesanan berhasil diproses.")}</pre>
                <button id="copyDelivery">Salin Produk</button>
              </div>`);
            body.querySelector("#copyDelivery").onclick = async () => {
              await navigator.clipboard.writeText(current.delivery_content || "");
              body.querySelector("#copyDelivery").textContent = "Berhasil disalin";
            };
            renderStore();
            return;
          }
          if (current.status === "processing") { stopped=true; status.textContent="Pembayaran masuk • Menunggu proses admin"; return; }
          if (current.status === "cancelled") { stopped=true; status.textContent="Pembayaran kedaluwarsa / dibatalkan"; return; }
          status.textContent = "Menunggu pembayaran...";
        } catch {
          const status = body.querySelector("#paymentStatus");
          if (status) status.textContent = "Mengecek ulang pembayaran...";
        }
        setTimeout(check,5000);
      };
      check();
    }
  }

  function setupCategoryFilters() {
    document.querySelectorAll("[data-store-filter]").forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll("[data-store-filter]").forEach(x=>x.classList.remove("active"));
        btn.classList.add("active");
        const cat = btn.dataset.storeFilter;
        document.querySelectorAll(".store-card").forEach(card => {
          card.hidden = cat !== "all" && card.dataset.category !== cat;
        });
      };
    });
  }

  async function checkOrder() {
    const input = document.querySelector("#orderLookup");
    const result = document.querySelector("#orderLookupResult");
    if (!input || !result) return;
    const invoice = input.value.trim();
    if (!invoice) return;

    result.textContent = "Mencari pesanan...";
    try {
      const response = await fetch("/api/check-payment?invoice="+encodeURIComponent(invoice),{cache:"no-store"});
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Pesanan tidak ditemukan.");
      const order = payload.order;
      result.innerHTML = order ? `
        <div class="order-result-card">
          <strong>${esc(order.invoice)}</strong>
          <span>${esc(order.product_name)} • ${esc(order.variant_name || "")}</span>
          <span>${rupiah(order.amount)}</span>
          <b class="status-${esc(order.status)}">${esc(order.status).toUpperCase()}</b>
        </div>` : "Pesanan tidak ditemukan.";
    } catch(e) {
      result.textContent = "Gagal mencari: " + e.message;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderStore();
    setupCategoryFilters();
    document.querySelector("#orderLookupBtn")?.addEventListener("click", checkOrder);
    document.querySelector("#shopModal")?.addEventListener("click", e => {
      if (e.target.id === "shopModal") e.currentTarget.classList.remove("open");
    });
  });

  window.KivoStore = { sb, configured, rupiah, esc, renderStore };
})();
