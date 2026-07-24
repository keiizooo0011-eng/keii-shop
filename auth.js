(() => {
  const cfg = window.KIVOPAY_CONFIG || {};
  const valid = window.supabase && cfg.supabaseUrl && cfg.supabaseAnonKey;
  const db = valid ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  async function profileByUserId(userId) {
    if (!db || !userId) return null;
    let result = await db.from('profiles').select('*').eq('user_id', userId).maybeSingle();
    if (!result.error && result.data) return result.data;
    result = await db.from('profiles').select('*').eq('id', userId).maybeSingle();
    return result.data || null;
  }
  window.KivoAuth = {
    db,
    async session(){ if(!db)return null; const {data}=await db.auth.getSession(); return data.session||null; },
    profile: profileByUserId,
    async isAdmin(userId){ if(!db||!userId)return false; const {data}=await db.from('admin_users').select('user_id').eq('user_id',userId).maybeSingle(); return !!data; },
    async accessToken(){ const session=await this.session(); return session?.access_token||''; },
    async authHeaders(extra={}){ const token=await this.accessToken(); return token?{...extra,Authorization:`Bearer ${token}`}:{...extra}; },
    async signOut(){ if(db)await db.auth.signOut(); location.replace('login.html'); }
  };
})();