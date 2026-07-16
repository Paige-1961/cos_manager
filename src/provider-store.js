(function () {
  const STORAGE_KEY = "cospilot.providerProfiles.v1";
  const CATEGORY_LABELS = {
    makeup: "妆娘",
    wig: "毛娘/假发",
    photographer: "摄影师",
    studio: "摄影棚",
    retoucher: "后期",
  };
  const originalProviderData = window.providerData;

  function readProfiles() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function writeProfiles(profiles) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  }

  function slug(value) {
    return String(value || "provider")
      .toLowerCase()
      .replace(/@.*/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "provider";
  }

  function createProviderId(user) {
    const suffix = String(user?.id || Date.now()).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || Date.now();
    return `provider-${slug(user?.email)}-${suffix}`;
  }

  function portfolioLabel(provider) {
    const items = provider.portfolioItems || provider.portfolio || [];
    return Array.isArray(items) ? items.map((item) => item.title).filter(Boolean).join(" / ") : "";
  }


  function normalizeService(service, provider) {
    return {
      ...service,
      id: service.id,
      title: service.title || service.name || "未命名服务",
      name: service.name || service.title || "未命名服务",
      description: service.description || "",
      price: Number(service.price || 0),
      duration: service.duration || "",
      category: service.category || provider.category,
    };
  }

  function normalizePortfolioItem(item) {
    const styles = Array.isArray(item.styles) ? item.styles : Array.isArray(item.tags) ? item.tags : [];
    return {
      ...item,
      id: item.id,
      title: item.title || item.character || "未命名作品",
      images: Array.isArray(item.images) ? item.images : item.image ? [item.image] : [],
      character: item.character || item.title || "",
      sourceWork: item.sourceWork || item.work || "",
      location: item.location || "",
      styles,
      tags: styles,
      description: item.description || "",
      likes: Number(item.likes || 0),
      comments: Number(item.comments || 0),
    };
  }
  function normalizeProvider(profile) {
    const location = profile.location || {};
    const portfolioItems = profile.portfolioItems || profile.portfolio || [];
    return {
      ...profile,
      id: profile.providerId || profile.id,
      providerId: profile.providerId || profile.id,
      legacyId: profile.legacyId || profile.providerId || profile.id,
      role: profile.category,
      roleLabel: CATEGORY_LABELS[profile.category] || profile.category,
      location: {
        province: location.province || profile.province || "",
        city: location.city || profile.city || "",
        district: location.district || profile.district || "",
        mode: location.mode || (profile.acceptsOnsite ? "onsite" : "remote"),
      },
      city: location.city || profile.city || "",
      district: location.district || profile.district || "",
      price: Number(profile.priceFrom || 0),
      priceFrom: Number(profile.priceFrom || 0),
      styles: Array.isArray(profile.styles) ? profile.styles : [],
      services: Array.isArray(profile.services) ? profile.services.map((service) => normalizeService(service, profile)) : [],
      portfolioItems: Array.isArray(portfolioItems) ? portfolioItems.map(normalizePortfolioItem) : [],
      portfolio: portfolioLabel({ ...profile, portfolioItems: Array.isArray(portfolioItems) ? portfolioItems.map(normalizePortfolioItem) : [] }),
      reviews: Array.isArray(profile.reviews) ? profile.reviews : [],
      availableDates: Array.isArray(profile.availableDates) ? profile.availableDates : [],
      note: profile.bio || "",
      accent: profile.accent || "#202124",
    };
  }

  function defaultProvider(user) {
    const providerId = createProviderId(user);
    return {
      id: providerId,
      providerId,
      userId: user.id,
      avatar: null,
      name: "",
      category: "makeup",
      bio: "",
      location: { province: "", city: "", district: "", mode: "onsite" },
      styles: [],
      priceFrom: 0,
      responseTime: "当天回复",
      acceptsOnsite: false,
      supportsTrialConsult: false,
      verified: false,
      rating: 0,
      reviewCount: 0,
      completedOrders: 0,
      services: [],
      portfolio: [],
      portfolioItems: [],
      reviews: [],
      availableDates: [],
      isPublished: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function getStoredProfileByUserId(userId) {
    return readProfiles().find((profile) => profile.userId === userId) || null;
  }

  function getStoredProfileByProviderId(providerId) {
    return readProfiles().find((profile) => profile.providerId === providerId || profile.id === providerId) || null;
  }

  function createDefaultProvider(user) {
    if (!user?.id) return null;
    const existing = getStoredProfileByUserId(user.id);
    if (existing) return normalizeProvider(existing);
    const profile = defaultProvider(user);
    writeProfiles([...readProfiles(), profile]);
    return normalizeProvider(profile);
  }

  function getProviderByUserId(userId) {
    const stored = getStoredProfileByUserId(userId);
    return stored ? normalizeProvider(stored) : null;
  }

  function getProviderById(providerId) {
    const stored = getStoredProfileByProviderId(providerId);
    if (stored?.isPublished) return normalizeProvider(stored);
    return originalProviderData.getProviderById(providerId);
  }

  function updateProviderProfile(userId, updates) {
    if (!userId) return { ok: false, error: "请先登录。" };
    const profiles = readProfiles();
    let index = profiles.findIndex((profile) => profile.userId === userId);
    const current = index >= 0 ? profiles[index] : defaultProvider({ id: userId, email: updates.email });
    const next = {
      ...current,
      ...updates,
      providerId: current.providerId || current.id || createProviderId({ id: userId, email: updates.email }),
      id: current.providerId || current.id || createProviderId({ id: userId, email: updates.email }),
      location: {
        ...(current.location || {}),
        ...(updates.location || {}),
      },
      styles: Array.isArray(updates.styles) ? updates.styles : current.styles || [],
      isPublished: true,
      updatedAt: new Date().toISOString(),
    };
    if (index >= 0) profiles[index] = next;
    else profiles.push(next);
    writeProfiles(profiles);
    return { ok: true, provider: normalizeProvider(next) };
  }


  function updateProviderServices(userId, services) {
    if (!Array.isArray(services)) return { ok: false, error: "服务项目数据无效。" };
    return updateProviderProfile(userId, { services });
  }

  function updateProviderPortfolio(userId, portfolioItems) {
    if (!Array.isArray(portfolioItems)) return { ok: false, error: "作品数据无效。" };
    const normalizedItems = portfolioItems.map(normalizePortfolioItem);
    return updateProviderProfile(userId, { portfolio: normalizedItems, portfolioItems: normalizedItems });
  }
  function getPublishedEditableProviders() {
    return readProfiles().filter((profile) => profile.isPublished).map(normalizeProvider);
  }

  function getAllProviders() {
    const editableProviders = getPublishedEditableProviders();
    const editableIds = new Set(editableProviders.map((provider) => provider.providerId));
    const mockProviders = originalProviderData.getAllProviders().filter((provider) => !editableIds.has(provider.providerId));
    return [...mockProviders, ...editableProviders];
  }

  function getProvidersByCategory(category) {
    return getAllProviders().filter((provider) => provider.category === category || provider.role === category);
  }

  function getServiceById(providerId, serviceId) {
    const provider = getAllProviders().find((item) => item.id === providerId || item.providerId === providerId);
    return provider?.services.find((service) => service.id === serviceId) || null;
  }

  window.providerStore = {
    getProviderByUserId,
    getProviderById,
    createDefaultProvider,
    updateProviderProfile,
    updateProviderServices,
    updateProviderPortfolio,
    getAllProviders,
  };

  window.providerData = {
    ...originalProviderData,
    getAllProviders,
    getProviderById,
    getProvidersByCategory,
    getServiceById,
  };
  window.serviceProviders = getAllProviders();
})();




