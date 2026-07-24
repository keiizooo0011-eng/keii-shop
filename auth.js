(() => {
  const cfg = window.KIVOPAY_CONFIG || {};
  const valid = window.supabase && cfg.supabaseUrl && cfg.supabaseAnonKey;
  const db = valid ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  window.KivoAuth = {
    db,
    async session(){ if(!db) return null; const {data}=await db.auth.getSession(); return data.session || null; },
    async profile(userId){
      if(!db || !userId) return null;
      const {data}=await db.from('profiles').select('*').eq('id',userId).maybeSingle();
      return data || null;
    },
    async isAdmin(userId){
      if(!db || !userId) return false;
      const {data}=await db.from('admin_users').select('user_id').eq('user_id',userId).maybeSingle();
      return !!data;
    },
    async accessToken(){ const s=await this.session(); return s?.access_token || ''; },
    async authHeaders(extra={}){ const t=await this.accessToken(); return t?{...extra,Authorization:`Bearer ${t}`}:{...extra}; },
    async signOut(){ if(db) await db.auth.signOut(); location.href='login.html'; }
  };
})();