(function () {
  const config = window.COSPILOT_SUPABASE_CONFIG || {};
  const canConnect = Boolean(config.url && config.anonKey && window.supabase?.createClient);
  const client = canConnect ? window.supabase.createClient(config.url, config.anonKey) : null;

  function enabled() {
    return Boolean(client);
  }

  async function loadCustomerProfile(userId) {
    if (!client || !userId) return null;
    const { data, error } = await client.from("customer_profiles").select("profile").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data?.profile ? { ...data.profile, userId } : null;
  }

  async function saveCustomerProfile(profile) {
    if (!client || !profile?.userId) return null;
    const { error } = await client.from("customer_profiles").upsert({
      user_id: profile.userId,
      profile: profile,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  async function loadProviderProfile(userId) {
    if (!client || !userId) return null;
    const { data, error } = await client.from("provider_profiles").select("profile").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data?.profile || null;
  }

  async function saveProviderProfile(profile) {
    if (!client || !profile?.userId) return null;
    const { error } = await client.from("provider_profiles").upsert({
      user_id: profile.userId,
      provider_id: profile.providerId || profile.id,
      profile: profile,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  async function hydrateUserData(user) {
    if (!client || !user?.id) return;
    try {
      if (user.role === "customer") {
        const profile = await loadCustomerProfile(user.id);
        if (profile) window.profileStore?.replaceProfile(profile);
      }
      if (user.role === "provider") {
        const profile = await loadProviderProfile(user.id);
        if (profile) window.providerStore?.replaceProfile(profile);
      }
    } catch (error) {
      console.warn("Supabase profile hydration failed; using local cache.", error);
    }
  }

  window.cospilotSupabase = {
    client,
    enabled,
    loadCustomerProfile,
    saveCustomerProfile,
    loadProviderProfile,
    saveProviderProfile,
    hydrateUserData,
  };
})();
