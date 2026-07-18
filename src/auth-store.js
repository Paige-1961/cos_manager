const AUTH_USERS_KEY = "cospilot:auth:users";
const AUTH_SESSION_KEY = "cospilot:auth:currentUserId";
const CLOUD_USER_CACHE_KEY = "cospilot:auth:cloud-user";
let cloudCurrentUser = readJson(CLOUD_USER_CACHE_KEY, null);

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

function getStoredCurrentUser() {
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
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}

function getCurrentUser() {
  return useCloudAuth() ? publicUser(cloudCurrentUser) : publicUser(getStoredCurrentUser());
}

function useCloudAuth() { return Boolean(window.cospilotSupabase?.enabled()); }
function emitAuthChange(user) { window.dispatchEvent(new CustomEvent("cospilot:auth-change", { detail: { user } })); }
function cloudUserFromSupabase(user) { return user ? { id: user.id, email: user.email || "", role: user.user_metadata?.role === "provider" ? "provider" : "customer", createdAt: user.created_at || new Date().toISOString() } : null; }
function setCloudCurrentUser(user) { cloudCurrentUser = user; if (user) writeJson(CLOUD_USER_CACHE_KEY, user); else localStorage.removeItem(CLOUD_USER_CACHE_KEY); emitAuthChange(user); }

function register({ email, password, role }) {
  if (useCloudAuth()) return registerCloud({ email, password, role });
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

async function registerCloud({ email, password, role }) {
  const cleanEmail = normalizeEmail(email);
  const cleanRole = role === "provider" ? "provider" : role === "customer" ? "customer" : "";
  if (!cleanEmail || !password || !cleanRole) return { ok: false, error: "\u8bf7\u586b\u5199\u90ae\u7bb1\u3001\u5bc6\u7801\u5e76\u9009\u62e9\u89d2\u8272\u3002" };
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return { ok: false, error: "????????" };
  if (password.length < 6) return { ok: false, error: "???? 6 ??" };
  const { data, error } = await window.cospilotSupabase.client.auth.signUp({ email: cleanEmail, password, options: { data: { role: cleanRole } } });
  if (error) return { ok: false, error: error.message };
  if (!data.session || !data.user) return { ok: false, error: "\u6ce8\u518c\u6210\u529f\uff0c\u8bf7\u5148\u5728\u90ae\u7bb1\u4e2d\u5b8c\u6210\u9a8c\u8bc1\u540e\u518d\u767b\u5f55\u3002" };
  const user = cloudUserFromSupabase(data.user);
  setCloudCurrentUser(user);
  return { ok: true, user };
}

function login({ email, password }) {
  if (useCloudAuth()) return loginCloud({ email, password });
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !password) {
    return { ok: false, error: "请填写邮箱和密码。" };
  }

  const user = getUsers().find((item) => item.email === cleanEmail && item.password === password);
  if (!user) return { ok: false, error: "邮箱或密码不正确。" };
  localStorage.setItem(AUTH_SESSION_KEY, user.id);
  return { ok: true, user: publicUser(user) };
}

async function loginCloud({ email, password }) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !password) return { ok: false, error: "\u8bf7\u586b\u5199\u90ae\u7bb1\u548c\u5bc6\u7801\u3002" };
  const { data, error } = await window.cospilotSupabase.client.auth.signInWithPassword({ email: cleanEmail, password });
  if (error || !data.user) return { ok: false, error: "\u90ae\u7bb1\u6216\u5bc6\u7801\u4e0d\u6b63\u786e\u3002" };
  const user = cloudUserFromSupabase(data.user);
  setCloudCurrentUser(user);
  return { ok: true, user };
}

function logout() {
  if (!useCloudAuth()) {
    localStorage.removeItem(AUTH_SESSION_KEY);
    emitAuthChange(null);
    return { ok: true };
  }
  return window.cospilotSupabase.client.auth.signOut().then(({ error }) => {
    if (error) return { ok: false, error: error.message };
    setCloudCurrentUser(null);
    return { ok: true };
  });
}

function changePassword({ currentPassword, newPassword }) {
  if (useCloudAuth()) return changePasswordCloud({ currentPassword, newPassword });
  const currentUser = getStoredCurrentUser();
  if (!currentUser) return { ok: false, error: "请先登录。" };
  if (!currentPassword || !newPassword) {
    return { ok: false, error: "请填写当前密码和新密码。" };
  }
  if (newPassword.length < 6) {
    return { ok: false, error: "新密码至少 6 位。" };
  }

  const users = getUsers();
  const index = users.findIndex((user) => user.id === currentUser.id);
  if (index === -1 || users[index].password !== currentPassword) {
    return { ok: false, error: "当前密码不正确。" };
  }

  users[index] = { ...users[index], password: newPassword, updatedAt: new Date().toISOString() };
  saveUsers(users);
  return { ok: true, user: publicUser(users[index]) };
}

async function changePasswordCloud({ currentPassword, newPassword }) {
  const currentUser = getCurrentUser();
  if (!currentUser) return { ok: false, error: "\u8bf7\u5148\u767b\u5f55\u3002" };
  if (!currentPassword || !newPassword) return { ok: false, error: "\u8bf7\u586b\u5199\u5f53\u524d\u5bc6\u7801\u548c\u65b0\u5bc6\u7801\u3002" };
  if (newPassword.length < 6) return { ok: false, error: "????? 6 ??" };
  const { error: reauthError } = await window.cospilotSupabase.client.auth.signInWithPassword({ email: currentUser.email, password: currentPassword });
  if (reauthError) return { ok: false, error: "\u5f53\u524d\u5bc6\u7801\u4e0d\u6b63\u786e\u3002" };
  const { error } = await window.cospilotSupabase.client.auth.updateUser({ password: newPassword });
  return error ? { ok: false, error: error.message } : { ok: true, user: currentUser };
}

function isAuthenticated() {
  return Boolean(getCurrentUser());
}

async function restoreCloudSession() {
  if (!useCloudAuth()) return;
  const { data } = await window.cospilotSupabase.client.auth.getSession();
  setCloudCurrentUser(cloudUserFromSupabase(data.session?.user));
  window.cospilotSupabase.client.auth.onAuthStateChange((_event, session) => setCloudCurrentUser(cloudUserFromSupabase(session?.user)));
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
  changePassword,
  restoreCloudSession,
};

restoreCloudSession();
