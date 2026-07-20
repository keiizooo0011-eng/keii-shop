
(() => {
  const cfg = window.KIVOPAY_CONFIG || {};
  const ok = cfg.supabaseUrl && cfg.supabaseAnonKey &&
    !cfg.supabaseUrl.startsWith("ISI_") && !cfg.supabaseAnonKey.startsWith("ISI_");
  const sb = ok && window.supabase ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const rupiah = n => new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n||0));
  let currentImageUrl = "";
  let productsCache = [];

  function msg(el, text, type="") {
    el.textContent = text;
    el.className = "admin-message " + type;
  }

  async function requireAdmin(userId) {
    const { data, error } = await sb.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return !!data;
  }

  async function boot() {
    if (!sb) {
      msg($("#loginMessage"), "Isi Project URL dan Publishable Key di config.js terlebih dahulu.", "error");
      return;
    }
    const { data } = await sb.auth.getSession();
    if (data.session) await showDashboard(data.session.user);
  }

  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    msg($("#loginMessage"), "Memeriksa akun...");
    try {
      const { data, error } = await sb.auth.signInWithPassword({
        email: $("#loginEmail").value.trim(),
        password: $("#loginPassword").value
      });
      if (error) throw error;
      await showDashboard(data.user);
    } catch(e) {
      msg($("#loginMessage"), e.message, "error");
    }
  });

  async function showDashboard(user) {
    try {
      if (!(await requireAdmin(user.id))) {
        await sb.auth.signOut();
        throw new Error("Akun ini belum terdaftar di tabel admin_users. Jalankan SQL setup sesuai README.");
      }
      $("#adminLogin").hidden = true;
      $("#adminDashboard").hidden = false;
      await Promise.all([loadProducts(), loadOrders(), loadAdminRatings(), loadAdminChat()]);
    } catch(e) {
      msg($("#loginMessage"), e.message, "error");
    }
  }

  $("#logoutBtn").onclick = async () => {
    await sb.auth.signOut();
    location.reload();
  };

  $("#productImage").onchange = e => {
    const file = e.target.files[0];
    if (file) $("#imagePreview").src = URL.createObjectURL(file);
  };

  function parseVariants(text, fallbackPrice) {
    return text.split("\n").map(x=>x.trim()).filter(Boolean).map(line=>{
      const [name, price] = line.split("|");
      return {name:(name||"Paket").trim(), price:Number(price||fallbackPrice)};
    });
  }

  async function uploadImage(file) {
    if (!file) return currentImageUrl || $("#imagePreview").src;
    if (file.size > 5 * 1024 * 1024) throw new Error("Ukuran foto maksimal 5 MB.");
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `products/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from(cfg.storageBucket || "keiishop")
      .upload(path, file, {cacheControl:"3600", upsert:false});
    if (error) throw error;
    return sb.storage.from(cfg.storageBucket || "keiishop").getPublicUrl(path).data.publicUrl;
  }

  $("#productForm").onsubmit = async e => {
    e.preventDefault();
    const button = $("#saveProductBtn");
    button.disabled = true;
    msg($("#productMessage"), "Menyimpan produk...");
    try {
      const image_url = await uploadImage($("#productImage").files[0]);
      const price = Number($("#productPrice").value);
      const payload = {
        name: $("#productName").value.trim(),
        category: $("#productCategory").value,
        description: $("#productDescription").value.trim(),
        price,
        stock: Number($("#productStock").value),
        image_url,
        variants: parseVariants($("#productVariants").value, price),
        is_active: $("#productActive").checked,
        updated_at: new Date().toISOString()
      };
      const id = $("#productId").value;
      const query = id ? sb.from("products").update(payload).eq("id",id) : sb.from("products").insert(payload);
      const { error } = await query;
      if (error) throw error;
      msg($("#productMessage"), id ? "Produk berhasil diperbarui." : "Produk berhasil ditambahkan.", "success");
      resetForm();
      await loadProducts();
    } catch(e) {
      msg($("#productMessage"), e.message, "error");
    } finally {
      button.disabled = false;
    }
  };

  function resetForm() {
    $("#productForm").reset();
    $("#productId").value = "";
    $("#productActive").checked = true;
    $("#imagePreview").src = "https://img2.pixhost.to/images/9481/751089580_papaqueen.jpg";
    $("#cancelEditBtn").hidden = true;
    $("#saveProductBtn").textContent = "Simpan Produk";
    currentImageUrl = "";
  }
  $("#cancelEditBtn").onclick = resetForm;

  async function loadProducts() {
    const { data, error } = await sb.from("products").select("*").order("created_at",{ascending:false});
    if (error) return msg($("#productMessage"), error.message, "error");
    productsCache = data || [];
    $("#statProducts").textContent = productsCache.length;
    $("#statStock").textContent = productsCache.reduce((a,p)=>a+Number(p.stock||0),0);
    $("#adminProductList").innerHTML = productsCache.length ? productsCache.map(p=>`
      <article class="admin-product-item">
        <img src="${esc(p.image_url || "")}" alt="${esc(p.name)}">
        <div>
          <strong>${esc(p.name)}</strong>
          <span>${p.category==="sewa-bot"?"Sewa Bot":"APK Premium"} • ${rupiah(p.price)}</span>
          <small>Stok ${Number(p.stock||0)} • ${p.is_active?"Aktif":"Nonaktif"}</small>
        </div>
        <div class="item-actions">
          <button data-edit="${p.id}">Edit</button>
          <button data-delete="${p.id}" class="danger">Hapus</button>
        </div>
      </article>`).join("") : `<p class="muted">Belum ada produk.</p>`;

    document.querySelectorAll("[data-edit]").forEach(btn=>btn.onclick=()=>editProduct(btn.dataset.edit));
    document.querySelectorAll("[data-delete]").forEach(btn=>btn.onclick=()=>deleteProduct(btn.dataset.delete));
    const stockSelect=$("#stockProduct");
    if(stockSelect){
      stockSelect.innerHTML=productsCache.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
      loadStockSummary();
    }
  }

  function editProduct(id) {
    const p = productsCache.find(x=>String(x.id)===String(id));
    if (!p) return;
    $("#productId").value = p.id;
    $("#productName").value = p.name;
    $("#productCategory").value = p.category;
    $("#productPrice").value = p.price;
    $("#productStock").value = p.stock;
    $("#productDescription").value = p.description || "";
    $("#productVariants").value = (p.variants || []).map(v=>`${v.name}|${v.price}`).join("\n");
    $("#productActive").checked = !!p.is_active;
    $("#imagePreview").src = p.image_url || "";
    currentImageUrl = p.image_url || "";
    $("#cancelEditBtn").hidden = false;
    $("#saveProductBtn").textContent = "Update Produk";
    scrollTo({top:0,behavior:"smooth"});
  }

  async function deleteProduct(id) {
    const product = productsCache.find(item => String(item.id) === String(id));
    const productName = product?.name || "produk ini";

    if (!confirm(`Hapus "${productName}"? Produk dan seluruh stok terkait akan dihapus permanen.`)) return;

    try {
      const { error: stockError } = await sb.from("stock_items").delete().eq("product_id", id);
      if (stockError && !String(stockError.message || "").includes("does not exist")) {
        throw stockError;
      }

      const { error } = await sb.from("products").delete().eq("id", id);
      if (error) throw error;

      msg($("#productMessage"), `"${productName}" berhasil dihapus.`, "success");
      await loadProducts();
    } catch (error) {
      alert("Produk gagal dihapus: " + error.message);
    }
  }

  async function loadOrders() {
    const { data, error } = await sb.from("orders").select("*").order("created_at",{ascending:false}).limit(50);
    if (error) return;
    const orders = data || [];
    $("#statOrders").textContent = orders.length;
    $("#statPending").textContent = orders.filter(x=>x.status==="pending").length;
    $("#adminOrderList").innerHTML = orders.length ? orders.map(o=>`
      <article class="admin-order-item">
        <div><strong>${esc(o.invoice)}</strong><span>${esc(o.customer_name)} • ${esc(o.customer_contact)}</span></div>
        <div><span>${esc(o.product_name)} • ${esc(o.variant_name||"")}</span><strong>${rupiah(o.amount)}</strong></div>
        <select data-order-status="${o.id}">
          ${["pending","paid","processing","completed","cancelled"].map(s=>`<option ${o.status===s?"selected":""} value="${s}">${s}</option>`).join("")}
        </select>
      </article>`).join("") : `<p class="muted">Belum ada pesanan.</p>`;

    document.querySelectorAll("[data-order-status]").forEach(sel=>{
      sel.onchange=async()=>{
        const {error}=await sb.from("orders").update({status:sel.value,updated_at:new Date().toISOString()}).eq("id",sel.dataset.orderStatus);
        if(error) alert(error.message);
        else loadOrders();
      };
    });
  }


  function splitStock(text){return text.split(/\n\s*---\s*\n/g).map(x=>x.trim()).filter(Boolean);}
  $("#stockForm")?.addEventListener("submit",async e=>{
    e.preventDefault();
    const productId=$("#stockProduct").value, variantName=$("#stockVariant").value.trim();
    const contents=splitStock($("#stockContents").value);
    if(!productId||!variantName||!contents.length)return;
    msg($("#stockMessage"),`Menambahkan ${contents.length} stok...`);
    const {error}=await sb.from("stock_items").insert(contents.map(content=>({
      product_id:productId,variant_name:variantName,content,status:"available"
    })));
    if(error)return msg($("#stockMessage"),error.message,"error");
    const product=productsCache.find(p=>String(p.id)===String(productId));
    if(product)await sb.from("products").update({
      stock:Number(product.stock||0)+contents.length,updated_at:new Date().toISOString()
    }).eq("id",productId);
    $("#stockContents").value="";
    msg($("#stockMessage"),`${contents.length} stok berhasil ditambahkan.`,"success");
    await loadProducts();
  });
  async function loadStockSummary(){
    const root=$("#stockSummary");if(!root)return;
    const {data,error}=await sb.from("stock_items").select("product_id,variant_name,status");
    if(error){root.textContent=error.message;return;}
    const groups={};
    for(const item of data||[]){
      const key=`${item.product_id}|${item.variant_name}`;
      if(!groups[key])groups[key]={product_id:item.product_id,variant:item.variant_name,available:0,sold:0};
      if(item.status==="available")groups[key].available++;
      if(item.status==="sold")groups[key].sold++;
    }
    root.innerHTML=Object.values(groups).length?Object.values(groups).map(g=>{
      const product=productsCache.find(p=>String(p.id)===String(g.product_id));
      return `<div class="stock-row"><strong>${esc(product?.name||"Produk")}</strong><span>${esc(g.variant)}</span><b>${g.available} tersedia</b><small>${g.sold} terjual</small></div>`;
    }).join(""):`<p class="muted">Belum ada stok auto-delivery.</p>`;
  }


  async function loadAdminRatings(){
    const root=$("#adminRatingList");
    if(!root)return;
    const {data,error}=await sb.from("product_ratings")
      .select("id,customer_name,rating,review,is_visible,created_at,products(name)")
      .order("created_at",{ascending:false}).limit(50);
    if(error){root.innerHTML=`<p class="muted">${esc(error.message)}</p>`;return;}
    root.innerHTML=(data||[]).length?(data||[]).map(item=>`
      <article class="moderation-item">
        <div>
          <strong>${esc(item.customer_name)} • ${"★".repeat(item.rating)}</strong>
          <span>${esc(item.products?.name||"Produk")}</span>
          <p>${esc(item.review||"Tanpa ulasan")}</p>
        </div>
        <div class="item-actions">
          <button data-toggle-rating="${item.id}" data-visible="${item.is_visible}">${item.is_visible?"Sembunyikan":"Tampilkan"}</button>
          <button data-delete-rating="${item.id}" class="danger">Hapus</button>
        </div>
      </article>`).join(""):`<p class="muted">Belum ada rating.</p>`;

    document.querySelectorAll("[data-toggle-rating]").forEach(btn=>btn.onclick=async()=>{
      const visible=btn.dataset.visible==="true";
      const {error}=await sb.from("product_ratings").update({is_visible:!visible}).eq("id",btn.dataset.toggleRating);
      if(error)alert(error.message);else loadAdminRatings();
    });
    document.querySelectorAll("[data-delete-rating]").forEach(btn=>btn.onclick=async()=>{
      if(!confirm("Hapus rating ini?"))return;
      const {error}=await sb.from("product_ratings").delete().eq("id",btn.dataset.deleteRating);
      if(error)alert(error.message);else loadAdminRatings();
    });
  }

  async function loadAdminChat(){
    const root=$("#adminChatList");
    if(!root)return;
    const {data,error}=await sb.from("chat_messages")
      .select("id,nickname,message,is_visible,created_at")
      .order("created_at",{ascending:false}).limit(80);
    if(error){root.innerHTML=`<p class="muted">${esc(error.message)}</p>`;return;}
    root.innerHTML=(data||[]).length?(data||[]).map(item=>`
      <article class="moderation-item">
        <div>
          <strong>${esc(item.nickname)}</strong>
          <span>${new Date(item.created_at).toLocaleString("id-ID")}</span>
          <p>${esc(item.message)}</p>
        </div>
        <div class="item-actions">
          <button data-toggle-chat="${item.id}" data-visible="${item.is_visible}">${item.is_visible?"Sembunyikan":"Tampilkan"}</button>
          <button data-delete-chat="${item.id}" class="danger">Hapus</button>
        </div>
      </article>`).join(""):`<p class="muted">Belum ada chat.</p>`;

    document.querySelectorAll("[data-toggle-chat]").forEach(btn=>btn.onclick=async()=>{
      const visible=btn.dataset.visible==="true";
      const {error}=await sb.from("chat_messages").update({is_visible:!visible}).eq("id",btn.dataset.toggleChat);
      if(error)alert(error.message);else loadAdminChat();
    });
    document.querySelectorAll("[data-delete-chat]").forEach(btn=>btn.onclick=async()=>{
      if(!confirm("Hapus pesan ini?"))return;
      const {error}=await sb.from("chat_messages").delete().eq("id",btn.dataset.deleteChat);
      if(error)alert(error.message);else loadAdminChat();
    });
  }

  $("#refreshRatings")?.addEventListener("click",loadAdminRatings);
  $("#refreshChat")?.addEventListener("click",loadAdminChat);

  $("#refreshProducts").onclick = loadProducts;
  $("#refreshOrders").onclick = loadOrders;
  boot();
})();
