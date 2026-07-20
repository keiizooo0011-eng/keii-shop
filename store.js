
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

  const guestId = (() => {
    let id = localStorage.getItem("kivo_guest_id");
    if (!id) {
      id = `guest-${crypto.randomUUID()}`;
      localStorage.setItem("kivo_guest_id", id);
    }
    return id;
  })();

  const stars = value => {
    const rating = Math.max(0, Math.min(5, Number(value || 0)));
    return `<span class="stars" aria-label="${rating} dari 5">${"★".repeat(Math.round(rating))}${"☆".repeat(5 - Math.round(rating))}</span>`;
  };

  function parseDeliveryContent(content) {
    const raw = String(content || "").replace(/\r\n?/g, "\n").trim();
    if (!raw) return [];

    const fields = [];
    const addField = (label, value, type = "data") => {
      const cleanValue = String(value ?? "").trim();
      if (!cleanValue) return;
      fields.push({
        label: String(label || `Data ${fields.length + 1}`).trim(),
        value: cleanValue,
        type
      });
    };

    const detectType = value => {
      const text = String(value || "").trim();
      // URL wajib diperiksa sebelum email karena URL generator dapat mengandung alamat email.
      if (/^(?:https?:\/\/|www\.)\S+$/i.test(text)) return "url";
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return "email";
      if (/^\+?[0-9][0-9 .()-]{7,}$/.test(text)) return "phone";
      if (/^(?:[A-Z0-9]{3,}[-_]){1,}[A-Z0-9_-]+$/i.test(text)) return "license";
      return "data";
    };

    const guessLabel = (value, position = 0) => {
      const type = detectType(value);
      if (type === "url") return "Link / URL";
      if (type === "email") return "Email";
      if (type === "phone") return "Nomor / Kontak";
      if (type === "license") return "Kode / Lisensi";
      if (position === 1 && !/\s/.test(String(value)) && String(value).length <= 100) return "Password / Data 2";
      return `Data ${position + 1}`;
    };

    // Stok mendukung dua gaya sekaligus:
    // 1) data1|data2|data3
    // 2) data1 [Enter] data2 [Enter] data3
    // Pemisah antar stok tetap dikelola admin dengan baris ---.
    raw.split("\n").map(line => line.trim()).filter(Boolean).forEach(line => {
      const values = line.includes("|")
        ? line.split("|").map(part => part.trim()).filter(Boolean)
        : [line];

      values.forEach((value, position) => {
        // Label bebas seperti "Email: ..." atau "Link: ..." tetap didukung,
        // tetapi protokol http:// dan https:// tidak pernah dipotong.
        const labeled = value.match(/^([^:]{2,40})\s*:\s*(.+)$/);
        if (labeled && !/^(?:https?|ftp)$/i.test(labeled[1].trim())) {
          const actualValue = labeled[2].trim();
          addField(labeled[1], actualValue, detectType(actualValue));
          return;
        }

        let normalized = value;
        if (/^www\./i.test(normalized)) normalized = `https://${normalized}`;
        addField(guessLabel(normalized, position), normalized, detectType(normalized));
      });
    });

    return fields;
  }

  async function copyText(text) {
    const value = String(text ?? "");
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (_) {}

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Browser tidak mengizinkan penyalinan otomatis.");
    return true;
  }

  function deliveryMarkup(order) {
    const fields = parseDeliveryContent(order.delivery_content);
    return `
      <section class="delivery-receipt">
        <div class="delivery-success-icon">✓</div>
        <div class="delivery-receipt-head">
          <span>PESANAN BERHASIL</span>
          <h3>Data produk sudah siap</h3>
          <p>Simpan data ini di tempat aman dan jangan membagikannya kepada siapa pun.</p>
        </div>

        <div class="delivery-order-meta">
          <div><span>Invoice</span><strong>${esc(order.invoice)}</strong></div>
          <div><span>Produk</span><strong>${esc(order.product_name)}</strong></div>
          <div><span>Paket</span><strong>${esc(order.variant_name || "Paket utama")}</strong></div>
        </div>

        <div class="delivery-fields">
          ${fields.length ? fields.map((field, index) => `
            <div class="delivery-field">
              <div>
                <span>${esc(field.label)}</span>
                ${field.type === "url"
                  ? `<a class="delivery-value delivery-link" href="${esc(field.value)}" target="_blank" rel="noopener noreferrer">${esc(field.value)}</a>`
                  : `<strong class="delivery-value">${esc(field.value)}</strong>`}
              </div>
              <button type="button" data-copy-field="${index}">Salin</button>
            </div>`).join("") : `
            <div class="delivery-field">
              <div><span>Informasi</span><strong>Pesanan berhasil diproses.</strong></div>
            </div>`}
        </div>

        <div class="delivery-receipt-actions">
          <button type="button" data-copy-all>Salin Semua</button>
          <button type="button" data-save-delivery>Simpan TXT</button>
        </div>

        <div class="delivery-rating-box">
          <span>Bagaimana pengalamanmu?</span>
          <div class="rating-input" data-rating-input>
            ${[1,2,3,4,5].map(n => `<button type="button" data-rate="${n}" aria-label="${n} bintang">☆</button>`).join("")}
          </div>
          <textarea data-rating-review maxlength="500" placeholder="Tulis ulasan singkat (opsional)"></textarea>
          <button type="button" data-submit-rating>Kirim Rating</button>
          <small data-rating-message></small>
        </div>
      </section>`;
  }

  function bindDeliveryActions(root, order, contact) {
    const fields = parseDeliveryContent(order.delivery_content);

    root.querySelectorAll("[data-copy-field]").forEach(button => {
      button.onclick = async () => {
        const field = fields[Number(button.dataset.copyField)];
        try {
          await copyText(field?.value || "");
          button.textContent = "Tersalin ✓";
        } catch (error) {
          button.textContent = "Gagal—tekan lama data";
        }
      };
    });

    root.querySelector("[data-copy-all]")?.addEventListener("click", async event => {
      try {
        await copyText(String(order.delivery_content || ""));
        event.currentTarget.textContent = "Berhasil disalin ✓";
      } catch (error) {
        event.currentTarget.textContent = "Gagal menyalin";
      }
    });

    root.querySelector("[data-save-delivery]")?.addEventListener("click", event => {
      const text = [
        "KIVOPAY — DATA PESANAN",
        `Invoice: ${order.invoice}`,
        `Produk: ${order.product_name}`,
        `Paket: ${order.variant_name || "Paket utama"}`,
        "",
        String(order.delivery_content || "")
      ].join("\n");
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `KivoPay-${order.invoice}.txt`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      event.currentTarget.textContent = "TXT tersimpan";
    });

    let selectedRating = 0;
    const ratingButtons = [...root.querySelectorAll("[data-rate]")];
    ratingButtons.forEach(button => {
      button.onclick = () => {
        selectedRating = Number(button.dataset.rate);
        ratingButtons.forEach(item => {
          item.textContent = Number(item.dataset.rate) <= selectedRating ? "★" : "☆";
          item.classList.toggle("active", Number(item.dataset.rate) <= selectedRating);
        });
      };
    });

    root.querySelector("[data-submit-rating]")?.addEventListener("click", async event => {
      const message = root.querySelector("[data-rating-message]");
      if (!selectedRating) {
        message.textContent = "Pilih jumlah bintang terlebih dahulu.";
        return;
      }
      if (!contact) {
        message.textContent = "Rating dapat dikirim langsung setelah checkout selesai.";
        return;
      }

      event.currentTarget.disabled = true;
      message.textContent = "Menyimpan rating...";
      try {
        const response = await fetch("/api/submit-rating", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({
            invoice: order.invoice,
            contact,
            rating: selectedRating,
            review: root.querySelector("[data-rating-review]")?.value || ""
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Rating gagal disimpan.");
        message.textContent = "Terima kasih! Rating kamu sudah tersimpan.";
        event.currentTarget.textContent = "Rating Terkirim";
        loadRatings();
      } catch (error) {
        message.textContent = error.message;
        event.currentTarget.disabled = false;
      }
    });
  }


  const fallbackProducts = [
    {
      id: "demo-apk",
      name: "Contoh APK Premium",
      category: "apk-premium",
      description: "Produk digital premium tersedia melalui KivoPay.",
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
      description: "Paket sewa bot dengan proses cepat melalui KivoPay.",
      price: 25000,
      image_url: "https://img2.pixhost.to/images/9481/751089580_papaqueen.jpg",
      stock: 5,
      is_active: true,
      variants: [{name:"30 Hari", price:25000}]
    }
  ];

  async function loadProducts() {
    if (!sb) return fallbackProducts;
    const { data, error } = await sb
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const products = data || [];
    const { data: ratings } = await sb
      .from("product_ratings")
      .select("product_id,rating")
      .eq("is_visible", true);

    const map = {};
    for (const item of ratings || []) {
      if (!map[item.product_id]) map[item.product_id] = { total: 0, count: 0 };
      map[item.product_id].total += Number(item.rating || 0);
      map[item.product_id].count += 1;
    }

    return products.map(product => ({
      ...product,
      rating_count: map[product.id]?.count || 0,
      rating_average: map[product.id]?.count
        ? map[product.id].total / map[product.id].count
        : 0
    }));
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
          <div class="product-rating-mini">
            ${stars(p.rating_average || 0)}
            <span>${Number(p.rating_count || 0) ? `${Number(p.rating_average || 0).toFixed(1)} (${Number(p.rating_count)})` : "Belum ada rating"}</span>
          </div>
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
      <button id="checkoutSubmit" class="checkout-submit">Buat Pesanan</button>`;

    modal.classList.add("open");
    body.querySelector(".shop-close").onclick = () => modal.classList.remove("open");

    body.querySelector("#checkoutSubmit").onclick = async () => {
      const name = body.querySelector("#checkoutName").value.trim();
      const contact = body.querySelector("#checkoutContact").value.trim();
      const checkoutContact = contact;
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
          <div class="payment-actions">
            <button id="downloadQris" type="button">Download QRIS</button>
            <button id="cancelPayment" type="button" class="payment-cancel">Batal</button>
          </div>
        </div>`;
      body.querySelector(".shop-close").onclick = () => modal.classList.remove("open");
      body.querySelector("#copyInvoice").onclick = async () => {
        await copyText(order.invoice);
        body.querySelector("#copyInvoice").textContent = "Tersalin ✓";
      };

      const box = body.querySelector("#qrisBox");
      if (data.qr_image) {
        box.innerHTML = `<img src="${esc(data.qr_image)}" crossorigin="anonymous" alt="QRIS pembayaran">`;
      } else if (data.qr_content && window.QRCode) {
        new QRCode(box,{text:data.qr_content,width:230,height:230});
      } else {
        box.innerHTML = "<p>QRIS tidak dapat ditampilkan. Silakan hubungi admin.</p>";
      }

      body.querySelector("#cancelPayment").onclick = () => {
        stopped = true;
        modal.classList.remove("open");
      };

      body.querySelector("#downloadQris").onclick = async () => {
        const button = body.querySelector("#downloadQris");
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = "Menyiapkan...";

        try {
          const image = box.querySelector("img");
          const canvas = box.querySelector("canvas");
          let href = "";

          if (canvas) {
            href = canvas.toDataURL("image/png");
          } else if (image) {
            try {
              const response = await fetch(image.src, {cache:"no-store"});
              if (!response.ok) throw new Error("Gagal mengambil gambar QRIS.");
              const blob = await response.blob();
              href = URL.createObjectURL(blob);
            } catch {
              href = image.src;
            }
          }

          if (!href) throw new Error("Gambar QRIS belum tersedia.");

          const link = document.createElement("a");
          link.href = href;
          link.download = `QRIS-${order.invoice}.png`;
          link.target = "_blank";
          document.body.appendChild(link);
          link.click();
          link.remove();

          if (href.startsWith("blob:")) {
            setTimeout(() => URL.revokeObjectURL(href), 2000);
          }
        } catch (error) {
          alert(error.message || "QRIS gagal di-download.");
        } finally {
          button.disabled = false;
          button.textContent = originalText;
        }
      };

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
            body.querySelector(".payment-view").insertAdjacentHTML("beforeend", deliveryMarkup(current));
            bindDeliveryActions(body.querySelector(".delivery-receipt"), current, checkoutContact);
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
        </div>
        ${order.status === "completed" ? deliveryMarkup(order) : ""}` : "Pesanan tidak ditemukan.";

      if (order?.status === "completed") {
        bindDeliveryActions(result.querySelector(".delivery-receipt"), order, "");
      }
    } catch(e) {
      result.textContent = "Gagal mencari: " + e.message;
    }
  }


  let communityCache = null;

  async function fetchCommunityFeed(force = false) {
    if (communityCache && !force) return communityCache;
    const response = await fetch(`/api/community-feed?t=${Date.now()}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Komunitas gagal dimuat.");
    communityCache = data;
    return data;
  }

  async function loadRatings(force = false) {
    const list = document.querySelector("#ratingList");
    const summary = document.querySelector("#ratingSummary");
    if (!list) return;

    try {
      const feed = await fetchCommunityFeed(force);
      const rows = feed.ratings || [];
      const avg = rows.length ? rows.reduce((sum, item) => sum + Number(item.rating || 0), 0) / rows.length : 0;
      summary.innerHTML = rows.length ? `${stars(avg)} <b>${avg.toFixed(1)}</b> • ${rows.length} ulasan terbaru` : "Belum ada rating";
      list.innerHTML = rows.length ? rows.map(item => `
        <article class="rating-item">
          <div class="rating-avatar">${esc((item.customer_name || "U").slice(0,1).toUpperCase())}</div>
          <div><div class="rating-item-head"><strong>${esc(item.customer_name || "Pembeli")}</strong>${stars(item.rating)}</div>
          <span>${esc(item.products?.name || "Produk KivoPay")}</span>
          <p>${esc(item.review || "Transaksi berhasil dan produk diterima.")}</p></div>
        </article>`).join("") : `<div class="community-empty">Belum ada rating. Jadilah pembeli pertama yang memberi ulasan.</div>`;
    } catch (error) {
      list.innerHTML = `<div class="community-empty"><strong>Rating belum dapat dimuat</strong><small>${esc(error.message)}</small><button type="button" onclick="location.reload()">Coba lagi</button></div>`;
    }
  }

  function chatItem(item) {
    const time = new Date(item.created_at).toLocaleTimeString("id-ID", {hour:"2-digit",minute:"2-digit"});
    const mine = item.guest_id && item.guest_id === guestId;
    return `
      <article class="chat-message ${mine ? "mine" : "other"}">
        <div class="chat-avatar">${esc((item.nickname || "U").slice(0,1).toUpperCase())}</div>
        <div class="chat-bubble-wrap">
          <div class="chat-message-head"><strong>${esc(item.nickname)}${mine ? " • Kamu" : ""}</strong><time>${time}</time></div>
          <p>${esc(item.message)}</p>
        </div>
      </article>`;
  }

  async function loadChat(force = false) {
    const root = document.querySelector("#chatMessages");
    if (!root) return;
    try {
      const feed = await fetchCommunityFeed(force);
      const rows = feed.messages || [];
      root.innerHTML = rows.length ? rows.map(chatItem).join("") : `
        <div class="chat-welcome-state">
          <div class="chat-welcome-logo">K</div>
          <h4>Mulai obrolan di Kivo Community</h4>
          <p>Kirim pesan pertama, bagikan pengalaman, atau tanyakan sesuatu kepada pengguna lain.</p>
        </div>`;
      root.scrollTop = root.scrollHeight;
    } catch (error) {
      root.innerHTML = `<div class="community-empty"><strong>Chat belum dapat dimuat</strong><small>${esc(error.message)}</small><button type="button" onclick="location.reload()">Coba lagi</button></div>`;
    }
  }

  function setupChat() {
    const form = document.querySelector("#chatForm");
    const nickname = document.querySelector("#chatNickname");
    const input = document.querySelector("#chatInput");
    if (!form || !sb) return;

    nickname.value = localStorage.getItem("kivo_chat_nickname") || "";
    form.onsubmit = async event => {
      event.preventDefault();
      const name = nickname.value.trim();
      const message = input.value.trim();
      if (!name || !message) return;

      const button = form.querySelector("button");
      button.disabled = true;
      button.textContent = "Mengirim...";

      try {
        const response = await fetch("/api/chat-message", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({guest_id: guestId, nickname:name, message})
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Pesan gagal dikirim.");
        localStorage.setItem("kivo_chat_nickname", name);
        input.value = "";
        communityCache = null;
        await loadChat(true);
      } catch (error) {
        alert(error.message);
      } finally {
        button.disabled = false;
        button.textContent = "Kirim";
      }
    };

    sb.channel("kivopay-global-chat")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages"
      }, payload => {
        if (!payload.new?.is_visible) return;
        const root = document.querySelector("#chatMessages");
        if (!root) return;
        if (root.querySelector(".community-empty")) root.innerHTML = "";
        root.insertAdjacentHTML("beforeend", chatItem(payload.new));
        root.scrollTop = root.scrollHeight;
      })
      .subscribe();
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderStore();
    setupCategoryFilters();
    loadRatings();
    loadChat();
    setupChat();
    document.querySelector("#orderLookupBtn")?.addEventListener("click", checkOrder);
    document.querySelector("#shopModal")?.addEventListener("click", e => {
      if (e.target.id === "shopModal") e.currentTarget.classList.remove("open");
    });
  });

  window.KivoStore = { sb, configured, rupiah, esc, renderStore };
})();
