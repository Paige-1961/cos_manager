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

  async function loadPublishedProviderProfiles() {
    if (!client) return [];
    const { data, error } = await client.from("provider_profiles").select("profile");
    if (error) throw error;
    return (data || []).map((row) => row.profile).filter((profile) => profile && profile.isPublished === true);
  }

  async function hydratePublishedProviders() {
    if (!client) return [];
    try {
      const profiles = await loadPublishedProviderProfiles();
      window.providerStore?.replacePublishedProfiles(profiles);
      return profiles;
    } catch (error) {
      console.warn("Published provider hydration failed; using mock and local providers.", error);
      return [];
    }
  }

  async function loadBookings(userId) {
    if (!client || !userId) return [];
    const { data, error } = await client.from("bookings").select("*").or(`customer_user_id.eq.${userId},provider_user_id.eq.${userId}`).order("updated_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function saveBooking(booking) {
    if (!client) return { ok: false, error: "Supabase is not configured." };
    const { error } = await client.from("bookings").insert({
      id: booking.id,
      customer_user_id: booking.customerUserId,
      provider_user_id: booking.providerUserId,
      provider_id: booking.providerId,
      service_id: booking.serviceId,
      saved_plan_id: booking.savedPlanId,
      plan_title: booking.planTitle,
      customer_label: booking.customerLabel,
      preferred_date: booking.preferredDate,
      note: booking.note,
      status: booking.status,
      created_at: booking.createdAt,
      updated_at: booking.updatedAt,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  async function updateBookingStatus(providerUserId, bookingId, status) {
    if (!client) return { ok: false, error: "Supabase is not configured." };
    const { error } = await client.from("bookings").update({ status, updated_at: new Date().toISOString() }).eq("id", bookingId).eq("provider_user_id", providerUserId);
    return error ? { ok: false, error: error.message } : { ok: true };
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
    loadPublishedProviderProfiles,
    hydratePublishedProviders,
    loadBookings,
    saveBooking,
    updateBookingStatus,
    hydrateUserData,
  };
})();
