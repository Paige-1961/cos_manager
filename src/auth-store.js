const AUTH_USERS_KEY = "cospilot:auth:users";
const AUTH_SESSION_KEY = "cospilot:auth:currentUserId";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn("Auth storage read failed", error);
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getUsers() {
  return readJson(AUTH_USERS_KEY, []);
}

function saveUsers(users) {
  writeJson(AUTH_USERS_KEY, users);
}

function getCurrentUser() {
  const userId = localStorage.getItem(AUTH_SESSION_KEY);
  if (!userId) return null;
  return getUsers().find((user) => user.id === userId) || null;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function createUserId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `user_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function publicUser(user) {
  return user ? { ...user } : null;
}

function register({ email, password, role }) {
  const cleanEmail = normalizeEmail(email);
  const cleanRole = role === "provider" ? "provider" : role === "customer" ? "customer" : "";

  if (!cleanEmail || !password || !cleanRole) {
    return { ok: false, error: "请填写邮箱、密码并选择角色。" };
  }
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
    return { ok: false, error: "请输入有效邮箱。" };
  }
  if (password.length < 6) {
    return { ok: false, error: "密码至少 6 位。" };
  }

  const users = getUsers();
  if (users.some((user) => user.email === cleanEmail)) {
    return { ok: false, error: "该邮箱已注册，请直接登录。" };
  }

  const user = {
    id: createUserId(),
    role: cleanRole,
    email: cleanEmail,
    // Prototype only: never store plaintext passwords in production. Supabase Auth will replace this boundary later.
    password,
    createdAt: new Date().toISOString(),
  };

  saveUsers([...users, user]);
  localStorage.setItem(AUTH_SESSION_KEY, user.id);
  return { ok: true, user: publicUser(user) };
}

function login({ email, password }) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !password) {
    return { ok: false, error: "请填写邮箱和密码。" };
  }

  const user = getUsers().find((item) => item.email === cleanEmail && item.password === password);
  if (!user) return { ok: false, error: "邮箱或密码不正确。" };
  localStorage.setItem(AUTH_SESSION_KEY, user.id);
  return { ok: true, user: publicUser(user) };
}

function logout() {
  localStorage.removeItem(AUTH_SESSION_KEY);
  return { ok: true };
}

function isAuthenticated() {
  return Boolean(getCurrentUser());
}

window.authStore = {
  get currentUser() {
    return publicUser(getCurrentUser());
  },
  getCurrentUser,
  isAuthenticated,
  register,
  login,
  logout,
};
