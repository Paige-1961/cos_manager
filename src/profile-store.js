const CUSTOMER_PROFILES_KEY = "cospilot:profiles:customers";

function readCustomerProfiles() {
  try {
    const raw = localStorage.getItem(CUSTOMER_PROFILES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.warn("Profile storage read failed", error);
    return [];
  }
}

function saveCustomerProfiles(profiles) {
  localStorage.setItem(CUSTOMER_PROFILES_KEY, JSON.stringify(profiles));
}

function nicknameFromEmail(email) {
  const prefix = String(email || "").split("@")[0].trim();
  return prefix || "Coser";
}

function getProfile(userId) {
  if (!userId) return null;
  return readCustomerProfiles().find((profile) => profile.userId === userId) || null;
}

function createDefaultProfile(user) {
  if (!user?.id) return null;
  const existing = getProfile(user.id);
  if (existing) return existing;

  const profile = {
    userId: user.id,
    avatar: null,
    nickname: nicknameFromEmail(user.email),
    gender: "hidden",
    locationMode: "fuzzy",
    province: "",
    city: "",
    district: "",
    updatedAt: new Date().toISOString(),
  };

  saveCustomerProfiles([...readCustomerProfiles(), profile]);
  return profile;
}

function updateProfile(userId, updates) {
  const profiles = readCustomerProfiles();
  const index = profiles.findIndex((profile) => profile.userId === userId);
  if (index === -1) return null;

  const updated = {
    ...profiles[index],
    ...updates,
    userId,
    updatedAt: new Date().toISOString(),
  };

  profiles[index] = updated;
  saveCustomerProfiles(profiles);
  return updated;
}

function getPublicLocation(profile) {
  if (!profile) return "未设置";
  const province = String(profile.province || "").trim();
  const city = String(profile.city || "").trim();
  const district = String(profile.district || "").trim();
  const cityLabel = city || province;

  if (profile.locationMode === "precise") {
    return [cityLabel, district].filter(Boolean).join(" · ") || "未设置";
  }

  return cityLabel || "未设置";
}

window.profileStore = {
  getProfile,
  createDefaultProfile,
  updateProfile,
  getPublicLocation,
};
