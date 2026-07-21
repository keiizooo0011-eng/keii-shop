// KivoPay — konfigurasi publik frontend.
// Publishable key aman berada di frontend selama RLS Supabase aktif.
// JANGAN pernah menaruh service_role/secret key di file ini.
window.KIVOPAY_CONFIG = {
  supabaseUrl: "https://hfxdsyzdlfrekqrfleai.supabase.co",
  supabaseAnonKey: "sb_publishable_NLCCMCVB330LiKCfCVq7GQ_B9iyNSXk",
  storageBucket: "keiishop",

  // Isi nomor WhatsApp memakai format negara tanpa tanda +. Contoh: 6281234567890
  csWhatsapp: "6285657279971",
  // Isi username atau URL Telegram. Contoh: keiiofficial atau https://t.me/keiiofficial
  csTelegram: "https://t.me/keiixyzpedia",
  csMessage: "Halo KivoPay, saya membutuhkan bantuan terkait pesanan saya."
};
