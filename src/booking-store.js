(function () {
  const STORAGE_KEY = "cospilot.bookings.v1";
  const VALID_STATUSES = ["pending", "accepted", "rejected"];

  function readBookings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("Booking storage read failed", error);
      return [];
    }
  }

  function writeBookings(bookings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
  }

  function createId() {
    if (window.crypto?.randomUUID) return `booking-${window.crypto.randomUUID()}`;
    return `booking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeBooking(booking) {
    return {
      id: booking.id,
      customerUserId: booking.customerUserId || booking.customer_user_id,
      providerUserId: booking.providerUserId || booking.provider_user_id || null,
      providerId: booking.providerId || booking.provider_id,
      serviceId: booking.serviceId || booking.service_id,
      savedPlanId: booking.savedPlanId || booking.saved_plan_id || null,
      planTitle: booking.planTitle || booking.plan_title || "",
      customerLabel: booking.customerLabel || booking.customer_label || "客户",
      preferredDate: booking.preferredDate || booking.preferred_date,
      note: booking.note || "",
      status: VALID_STATUSES.includes(booking.status) ? booking.status : "pending",
      createdAt: booking.createdAt || booking.created_at || new Date().toISOString(),
      updatedAt: booking.updatedAt || booking.updated_at || new Date().toISOString(),
    };
  }

  function mergeBookings(incoming) {
    const byId = new Map(readBookings().map((booking) => [booking.id, booking]));
    (Array.isArray(incoming) ? incoming : []).map(normalizeBooking).forEach((booking) => byId.set(booking.id, booking));
    const merged = [...byId.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    writeBookings(merged);
    return merged;
  }

  async function hydrateForUser(userId) {
    if (!userId || !window.cospilotSupabase?.enabled()) return [];
    try {
      const bookings = await window.cospilotSupabase.loadBookings(userId);
      mergeBookings(bookings);
      return bookings;
    } catch (error) {
      console.warn("Booking cloud hydration failed; using local cache.", error);
      return [];
    }
  }

  async function createBooking(customerUser, provider, input) {
    if (!customerUser?.id || customerUser.role !== "customer") return { ok: false, error: "只有客户账号可以发起预约。" };
    if (!provider?.providerId && !provider?.id) return { ok: false, error: "未找到服务者。" };
    if (!input?.serviceId) return { ok: false, error: "请选择服务项目。" };
    if (!input?.preferredDate) return { ok: false, error: "请选择预约日期。" };
    const service = window.providerData?.getServiceById(provider.providerId || provider.id, input.serviceId);
    if (!service) return { ok: false, error: "所选服务已失效。" };
    if (!(provider.availableDates || []).includes(input.preferredDate)) return { ok: false, error: "所选日期已不可预约。" };

    if (window.cospilotSupabase?.enabled() && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(provider.userId || "")) {
      return { ok: false, error: "该服务者暂未绑定可接收预约的平台账号。" };
    }

    const now = new Date().toISOString();
    const booking = normalizeBooking({
      id: createId(),
      customerUserId: customerUser.id,
      providerUserId: provider.userId || null,
      providerId: provider.providerId || provider.id,
      serviceId: input.serviceId,
      savedPlanId: input.savedPlanId || null,
      planTitle: input.planTitle || "",
      customerLabel: input.customerLabel || customerUser.email || "客户",
      preferredDate: input.preferredDate,
      note: String(input.note || "").trim(),
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    if (window.cospilotSupabase?.enabled()) {
      const outcome = await window.cospilotSupabase.saveBooking(booking);
      if (!outcome.ok) return outcome;
    }
    mergeBookings([booking]);
    return { ok: true, booking };
  }

  function getBookingsByCustomer(userId) {
    return readBookings().filter((booking) => booking.customerUserId === userId).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  function getBookingsByProvider(providerId, providerUserId) {
    return readBookings()
      .filter((booking) => booking.providerId === providerId || (providerUserId && booking.providerUserId === providerUserId))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async function updateBookingStatus(providerUser, bookingId, status) {
    if (!providerUser?.id || providerUser.role !== "provider") return { ok: false, error: "只有服务者账号可以处理预约。" };
    if (!VALID_STATUSES.includes(status) || status === "pending") return { ok: false, error: "预约状态无效。" };
    const bookings = readBookings();
    const index = bookings.findIndex((booking) => booking.id === bookingId && booking.providerUserId === providerUser.id);
    if (index < 0) return { ok: false, error: "未找到该预约或没有处理权限。" };
    const updated = { ...bookings[index], status, updatedAt: new Date().toISOString() };
    if (window.cospilotSupabase?.enabled()) {
      const outcome = await window.cospilotSupabase.updateBookingStatus(providerUser.id, bookingId, status);
      if (!outcome.ok) return outcome;
    }
    bookings[index] = updated;
    writeBookings(bookings);
    return { ok: true, booking: updated };
  }

  window.bookingStore = {
    hydrateForUser,
    createBooking,
    getBookingsByCustomer,
    getBookingsByProvider,
    updateBookingStatus,
    replaceBookings: mergeBookings,
  };
})();
