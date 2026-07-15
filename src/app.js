const defaultRequirementRef = window.defaultRequirement;
const runCosPilotPipelineRef = window.runCosPilotPipeline;
const authStore = window.authStore;
const profileStore = window.profileStore;
const profileDrawer = window.profileDrawer;

let naturalInput = defaultRequirementRef.rawText;
let result = runCosPilotPipelineRef(naturalInput);
let requirement = result.requirement;
let selectedPlanIndex = 0;
let activeProviderId = null;
let isAuthModalOpen = false;
let isProfileDrawerOpen = false;
let authMode = "login";
let authError = "";
let isProfileEditing = false;
let profileDraft = null;
let profileError = "";
let isPasswordModalOpen = false;
let passwordError = "";
let pendingAuthAction = null;
let actionFeedback = "";

const app = document.querySelector("#app");

function formatCurrency(value) {
  return `¥${Number(value).toLocaleString("zh-CN")}`;
}

function displayDateRange(item) {
  return item.dateStart === item.dateEnd ? item.dateStart : `${item.dateStart} 至 ${item.dateEnd}`;
}

function getResolvedPlan(index = selectedPlanIndex) {
  return result.steps[7].output[index] || result.steps[7].output[0];
}

function getPlan(index = selectedPlanIndex) {
  return result.plans[index] || result.plans[0];
}

function getSelectedDate(resolvedPlan) {
  return resolvedPlan.sharedDates?.[0] || requirement.preferredDate || requirement.dateEnd;
}

function getProviderById(id) {
  return window.serviceProviders.find((provider) => provider.id === id);
}

function createBriefs(resolvedPlan) {
  return resolvedPlan.resolvedMembers.map((member) => ({
    target: `${member.roleLabel}｜${member.name}`,
    providerId: member.id,
    message: `你好，我想在 ${displayDateRange(requirement)} 期间于${requirement.city}拍摄《${requirement.fandom}》${requirement.character}，风格偏${requirement.styleTags.join("/")}。目前已有${requirement.ownedItems.join("、")}，整体预算约 ${formatCurrency(requirement.budget)}。看到你的方向是「${member.portfolio}」，想确认区间内是否可约、价格和准备事项。`,
  }));
}

function roleLabel(role) {
  return role === "provider" ? "服务者" : "Coser";
}

function getCustomerProfile(user) {
  if (!user || user.role !== "customer") return null;
  return profileStore.getProfile(user.id) || profileStore.createDefaultProfile(user);
}

function resetProfileEditing() {
  isProfileEditing = false;
  profileDraft = null;
  profileError = "";
}

function resetPasswordModal() {
  isPasswordModalOpen = false;
  passwordError = "";
}

function resetProfileUiState() {
  resetProfileEditing();
  resetPasswordModal();
}

function syncProfileDraftFromForm() {
  const form = document.querySelector("#customer-profile-form");
  const currentUser = authStore.getCurrentUser();
  if (!form || !currentUser) return profileDraft;
  const formData = new FormData(form);
  profileDraft = {
    ...(profileDraft || getCustomerProfile(currentUser)),
    nickname: String(formData.get("nickname") || "").trim(),
    gender: formData.get("gender") || "hidden",
    province: String(formData.get("province") || "").trim(),
    city: String(formData.get("city") || "").trim(),
    district: String(formData.get("district") || "").trim(),
    locationMode: formData.get("locationMode") === "precise" ? "precise" : "fuzzy",
  };
  return profileDraft;
}
function showActionFeedback(message) {
  actionFeedback = message;
  render();
}

function requireAuth(actionCallback) {
  if (!authStore.isAuthenticated()) {
    pendingAuthAction = actionCallback;
    authMode = "login";
    authError = "";
    isAuthModalOpen = true;
    render();
    return;
  }
  actionCallback();
}

function runPendingAuthAction() {
  if (!pendingAuthAction) return;
  const action = pendingAuthAction;
  pendingAuthAction = null;
  action();
}

function renderActionFeedback() {
  if (!actionFeedback) return "";
  return `<div class="action-feedback" role="status">${actionFeedback}</div>`;
}

function renderAuthNav() {
  const currentUser = authStore.getCurrentUser();
  if (!currentUser) {
    return `<button class="login-entry interactive-surface" data-auth-open="login" type="button">登录</button>`;
  }

  const profile = currentUser.role === "customer" ? getCustomerProfile(currentUser) : null;
  const navLabel = profile?.nickname || "我的";
  const navAvatar = profile
    ? profileDrawer.avatarMarkup(profile, profile.nickname, "nav-avatar")
    : `<span class="avatar-placeholder nav-avatar">${currentUser.email.slice(0, 1).toUpperCase()}</span>`;

  return `
    <button class="my-entry" data-profile-open="true" data-action="open-profile-drawer" onclick="window.openProfileDrawer()" type="button" aria-label="我的账户">
      ${navAvatar}
      <span>${navLabel}</span>
    </button>
  `;
}
function renderAuthModal() {
  if (!isAuthModalOpen) return "";
  const isLogin = authMode === "login";

  return `
    <div class="auth-backdrop" data-auth-close="true">
      <section class="auth-modal interactive-surface" role="dialog" aria-modal="true" aria-label="${isLogin ? "登录" : "注册"}">
        <button class="auth-close" data-auth-close="true" type="button">×</button>
        <div class="auth-heading">
          <p class="eyebrow">Account</p>
          <h2>${isLogin ? "登录 CosPilot" : "创建账户"}</h2>
        </div>
        <div class="auth-tabs" role="tablist">
          <button class="${isLogin ? "active" : ""}" data-auth-mode="login" type="button">登录</button>
          <button class="${!isLogin ? "active" : ""}" data-auth-mode="register" type="button">注册</button>
        </div>
        <form id="auth-form" class="auth-form" data-mode="${authMode}">
          <label>
            <span>邮箱</span>
            <input name="email" type="email" autocomplete="email" required />
          </label>
          <label>
            <span>密码</span>
            <input name="password" type="password" autocomplete="${isLogin ? "current-password" : "new-password"}" required />
          </label>
          ${
            isLogin
              ? ""
              : `
                <label>
                  <span>确认密码</span>
                  <input name="confirmPassword" type="password" autocomplete="new-password" required />
                </label>
                <fieldset class="role-picker">
                  <legend>选择角色</legend>
                  <label><input type="radio" name="role" value="customer" checked /><span>我是 Coser</span></label>
                  <label><input type="radio" name="role" value="provider" /><span>我是服务者</span></label>
                </fieldset>
              `
          }
          ${authError ? `<p class="auth-error">${authError}</p>` : ""}
          <button class="primary-action interactive-surface" type="submit">${isLogin ? "登录" : "注册并登录"}</button>
        </form>
        <button class="auth-switch" data-auth-mode="${isLogin ? "register" : "login"}" type="button">
          ${isLogin ? "还没有账户？前往注册" : "已有账户？前往登录"}
        </button>
      </section>
    </div>
  `;
}



function renderMyDrawer() {
  if (!isProfileDrawerOpen) return "";
  const currentUser = authStore.getCurrentUser();
  if (!currentUser) return "";

  if (currentUser.role === "provider") {
    return profileDrawer.renderProviderDrawer({ currentUser });
  }

  const profile = getCustomerProfile(currentUser);
  if (isProfileEditing) {
    return profileDrawer.renderCustomerEdit({
      currentUser,
      profileDraft: profileDraft || profile,
      profileError,
    });
  }

  return profileDrawer.renderCustomerView({
    currentUser,
    profile,
    publicLocation: profileStore.getPublicLocation(profile),
    isPasswordModalOpen,
    passwordError,
  });
}
function renderComposer() {
  return `
    <section class="composer" id="planner">
      <div class="composer-copy">
        <p class="eyebrow">CosPilot</p>
        <h1>一句话生成出片方案</h1>
      </div>
      <form id="natural-form" class="natural-form interactive-surface">
        <textarea name="naturalInput" rows="6" aria-label="自然语言需求">${naturalInput}</textarea>
        <div class="composer-actions">
          <button class="primary-action interactive-surface" type="submit">生成方案</button>
          <span>LLM 需求理解层 · 本地规则 fallback</span>
        </div>
      </form>
    </section>
  `;
}

function renderParsedSummary() {
  const items = [
    ["角色", `《${requirement.fandom}》${requirement.character}`],
    ["地点", requirement.city],
    ["时间", displayDateRange(requirement)],
    ["预算", formatCurrency(requirement.budget)],
    ["风格", requirement.styleTags.join(" / ")],
    ["已有", requirement.ownedItems.join("、")],
  ];
  return `<section class="summary-strip" aria-label="AI 解析结果">${items.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("")}</section>`;
}

function renderFinalPlan() {
  const plan = getPlan();
  const resolvedPlan = getResolvedPlan();
  const selectedDate = getSelectedDate(resolvedPlan);
  return `
    <section class="result-layout">
      <article class="panel plan-hero interactive-surface">
        <div class="panel-kicker">当前方案</div>
        <h2>${plan.name}</h2>
        <p class="lead">${resolvedPlan.sharedDates.length ? `建议日期：${selectedDate}` : "需要进一步协调共同档期"}</p>
        <div class="big-number">${formatCurrency(resolvedPlan.total)}</div>
        <div class="plan-actions"><button class="secondary-action interactive-surface" data-protected-action="save-plan" type="button">保存方案</button></div>
        <div class="member-list clickable-members">
          ${resolvedPlan.resolvedMembers
            .map(
              (member) => `
                <button class="member-row interactive-surface" data-provider-id="${member.id}" type="button">
                  <span>${member.roleLabel}</span>
                  <strong>${member.name}</strong>
                  <small>${member.reasons?.join(" · ") || member.note}</small>
                </button>
              `
            )
            .join("")}
        </div>
      </article>
      <article class="panel compact-panel interactive-surface">
        <div class="panel-kicker">Coordination</div>
        <h3>调整记录</h3>
        <ul class="plain-list">${resolvedPlan.actions.map((action) => `<li>${action}</li>`).join("")}</ul>
      </article>
      <article class="panel compact-panel interactive-surface">
        <div class="panel-kicker">Timeline</div>
        <h3>拍摄计划</h3>
        <div class="timeline">
          <div><span>确认前</span><p>确认服务者档期、报价和拍摄风格参考。</p></div>
          <div><span>拍摄前 1-3 天</span><p>发送角色参考、服装状态、妆造要求和棚景偏好。</p></div>
          <div><span>${selectedDate}</span><p>按共同档期完成妆造、棚拍和现场确认。</p></div>
          <div><span>拍摄后</span><p>筛片、确认后期方向并跟进交付。</p></div>
        </div>
      </article>
    </section>
  `;
}

function renderPlans() {
  return `
    <section class="plans-section" id="plans">
      <div class="section-heading slim-heading">
        <p class="eyebrow">Plans</p>
        <h2>备选组合</h2>
      </div>
      <div class="plans-grid" role="listbox" aria-label="方案选择">
        ${result.plans
          .map((plan, index) => {
            const resolvedPlan = getResolvedPlan(index);
            const overBudget = resolvedPlan.total > requirement.budget;
            return `
              <button class="plan-card interactive-surface ${index === selectedPlanIndex ? "selected" : ""}" data-plan-index="${index}" type="button" role="option" aria-selected="${index === selectedPlanIndex}">
                <div class="plan-header"><span>${plan.name}</span><strong>${formatCurrency(resolvedPlan.total)}</strong></div>
                <p>${resolvedPlan.sharedDates.length ? `共同可约：${resolvedPlan.sharedDates.join("、")}` : "需要协调共同档期"}</p>
                <div class="plan-status ${overBudget ? "warning" : "ok"}">${overBudget ? `超预算 ${formatCurrency(resolvedPlan.total - requirement.budget)}` : "预算内"}</div>
                <ul>${resolvedPlan.resolvedMembers.map((member) => `<li><span>${member.roleLabel}</span><strong>${member.name}</strong></li>`).join("")}</ul>
              </button>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderBriefs() {
  const briefs = createBriefs(getResolvedPlan());
  return `
    <section class="brief-section">
      <div class="section-heading slim-heading">
        <p class="eyebrow">Brief</p>
        <h2>可发送沟通文本</h2>
      </div>
      <div class="brief-grid">
        ${briefs
          .map(
            (brief) => `
              <article class="brief-card interactive-surface">
                <button class="brief-target" data-provider-id="${brief.providerId}" type="button">${brief.target}</button>
                <p>${brief.message}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderProviders() {
  const visibleProviders = result.candidates.flatMap((group) => group.candidates.slice(0, 2));
  return `
    <section class="split-section">
      <div class="section-heading slim-heading">
        <p class="eyebrow">Providers</p>
        <h2>服务者主页</h2>
      </div>
      <div class="provider-grid compact-providers">
        ${visibleProviders
          .map(
            (provider) => `
              <button class="provider-card interactive-surface" data-provider-id="${provider.id}" type="button">
                <div class="provider-art" style="--accent:${provider.accent}"><span>${provider.roleLabel}</span></div>
                <div class="provider-body">
                  <div class="provider-title"><h3>${provider.name}</h3><strong>${formatCurrency(provider.price)}</strong></div>
                  <p>${provider.portfolio}</p>
                  <small>${provider.city}${provider.district} · ${provider.availableDates.join(" / ")}</small>
                  <div class="provider-card-actions">
                    <span data-protected-action="favorite-card" data-provider-id="${provider.id}">收藏</span>
                    <span data-protected-action="book-card" data-provider-id="${provider.id}">预约</span>
                  </div>
                </div>
              </button>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderProviderProfile() {
  if (!activeProviderId) return "";
  const provider = getProviderById(activeProviderId);
  if (!provider) return "";
  return `
    <div class="profile-backdrop" data-close-profile="true">
      <aside class="provider-profile interactive-surface" role="dialog" aria-label="${provider.name} 服务者主页">
        <button class="profile-close" data-close-profile="true" type="button">×</button>
        <div class="profile-hero" style="--accent:${provider.accent}">
          <span>${provider.roleLabel}</span>
          <h2>${provider.name}</h2>
          <p>${provider.city}${provider.district} · ${formatCurrency(provider.price)} 起 · 评分 ${provider.rating}</p>
        </div>
        <div class="profile-section">
          <h3>主页简介</h3>
          <p>${provider.note}</p>
        </div>
        <div class="profile-section">
          <h3>作品方向</h3>
          <div class="tag-row">${provider.portfolio.split(" / ").map((item) => `<span>${item}</span>`).join("")}</div>
        </div>
        <div class="profile-section">
          <h3>风格标签</h3>
          <div class="tag-row">${provider.styles.map((style) => `<span>${style}</span>`).join("")}</div>
        </div>
        <div class="profile-section">
          <h3>可约时间</h3>
          <p>${provider.availableDates.join("、")}</p>
        </div>
        <div class="profile-actions">
          <button class="secondary-action interactive-surface" data-protected-action="favorite-provider" data-provider-id="${provider.id}" type="button">收藏服务者</button>
          <button class="primary-action interactive-surface" data-protected-action="book-provider" data-provider-id="${provider.id}" type="button">立即预约</button>
          <button class="secondary-action interactive-surface" type="button">生成沟通 Brief</button>
          <button class="secondary-action interactive-surface" data-close-profile="true" type="button">返回</button>
        </div>
      </aside>
    </div>
  `;
}

function bindEvents() {
  document.querySelector("#natural-form").addEventListener("submit", (event) => {
    event.preventDefault();
    naturalInput = new FormData(event.currentTarget).get("naturalInput").trim();
    result = runCosPilotPipelineRef(naturalInput);
    requirement = result.requirement;
    selectedPlanIndex = 0;
    activeProviderId = null;
    render();
  });

  document.querySelectorAll("[data-plan-index]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPlanIndex = Number(button.dataset.planIndex);
      activeProviderId = null;
      render();
      document.querySelector("#plans")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  document.querySelectorAll("[data-provider-id]").forEach((button) => {
    button.addEventListener("click", () => {
      activeProviderId = button.dataset.providerId;
      render();
    });
  });

  document.querySelectorAll("[data-close-profile]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target.dataset.closeProfile) {
        activeProviderId = null;
        render();
      }
    });
  });


  document.querySelectorAll("[data-protected-action]").forEach((node) => {
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      const actionName = node.dataset.protectedAction;
      const provider = node.dataset.providerId ? getProviderById(node.dataset.providerId) : null;
      requireAuth(() => {
        if (actionName === "save-plan") {
          showActionFeedback(`已为你保留「${getPlan().name}」方案入口。`);
          return;
        }
        if (actionName === "favorite-provider" || actionName === "favorite-card") {
          showActionFeedback(`已收藏 ${provider?.name || "该服务者"}。`);
          return;
        }
        if (actionName === "book-provider" || actionName === "book-card") {
          showActionFeedback(`已进入 ${provider?.name || "该服务者"} 的预约确认入口。`);
        }
      });
    });
  });

  document.querySelectorAll("[data-auth-open]").forEach((button) => {
    button.addEventListener("click", () => {
      authMode = button.dataset.authOpen || "login";
      authError = "";
      isAuthModalOpen = true;
      render();
    });
  });

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      authMode = button.dataset.authMode;
      authError = "";
      render();
    });
  });

  document.querySelectorAll("[data-auth-close]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target.dataset.authClose) {
        isAuthModalOpen = false;
        authError = "";
        pendingAuthAction = null;
        render();
      }
    });
  });



  document.querySelectorAll("[data-profile-open]").forEach((button) => {
    button.addEventListener("click", () => {
      resetProfileUiState();
      isProfileDrawerOpen = true;
      render();
    });
  });

  document.querySelectorAll("[data-profile-close]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target.dataset.profileClose) {
        isProfileDrawerOpen = false;
        resetProfileUiState();
        render();
      }
    });
  });

  document.querySelectorAll("[data-auth-logout]").forEach((button) => {
    button.addEventListener("click", () => {
      authStore.logout();
      isProfileDrawerOpen = false;
      resetProfileUiState();
      render();
    });
  });

  document.onkeydown = (event) => {
    if (event.key === "Escape" && isProfileDrawerOpen) {
      isProfileDrawerOpen = false;
      resetProfileUiState();
      render();
    }
  };

  document.querySelectorAll("[data-password-open]").forEach((button) => {
    button.addEventListener("click", () => {
      isPasswordModalOpen = true;
      passwordError = "";
      render();
    });
  });

  document.querySelectorAll("[data-password-close]").forEach((button) => {
    button.addEventListener("click", () => {
      resetPasswordModal();
      render();
    });
  });

  const passwordForm = document.querySelector("#password-form");
  if (passwordForm) {
    passwordForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(passwordForm);
      const currentPassword = formData.get("currentPassword");
      const newPassword = formData.get("newPassword");
      const confirmPassword = formData.get("confirmPassword");
      if (newPassword !== confirmPassword) {
        passwordError = "两次输入的新密码不一致。";
        render();
        return;
      }
      const outcome = authStore.changePassword({ currentPassword, newPassword });
      if (!outcome.ok) {
        passwordError = outcome.error;
        render();
        return;
      }
      resetPasswordModal();
      showActionFeedback("密码已更新。");
    });
  }
  document.querySelectorAll("[data-profile-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const currentUser = authStore.getCurrentUser();
      const profile = getCustomerProfile(currentUser);
      profileDraft = profile ? { ...profile } : null;
      profileError = "";
      isProfileEditing = true;
      render();
    });
  });

  document.querySelectorAll("[data-profile-cancel-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      resetProfileEditing();
      render();
    });
  });

  const avatarInput = document.querySelector("#profile-avatar-input");
  if (avatarInput) {
    avatarInput.addEventListener("change", () => {
      const file = avatarInput.files?.[0];
      if (!file) return;
      if (!["image/png", "image/jpeg"].includes(file.type)) {
        profileError = "头像只支持 png / jpg / jpeg。";
        render();
        return;
      }
      syncProfileDraftFromForm();
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        const currentUser = authStore.getCurrentUser();
        profileDraft = { ...(profileDraft || getCustomerProfile(currentUser)), avatar: reader.result };
        profileError = "";
        render();
      });
      reader.readAsDataURL(file);
    });
  }

  const profileForm = document.querySelector("#customer-profile-form");
  if (profileForm) {
    profileForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const currentUser = authStore.getCurrentUser();
      if (!currentUser || currentUser.role !== "customer") return;
      const formData = new FormData(profileForm);
      const nickname = String(formData.get("nickname") || "").trim();
      if (!nickname) {
        profileError = "昵称不能为空。";
        render();
        return;
      }
      profileStore.updateProfile(currentUser.id, {
        ...(profileDraft || {}),
        avatar: profileDraft?.avatar || null,
        nickname,
        gender: formData.get("gender") || "hidden",
        province: String(formData.get("province") || "").trim(),
        city: String(formData.get("city") || "").trim(),
        district: String(formData.get("district") || "").trim(),
        locationMode: formData.get("locationMode") === "precise" ? "precise" : "fuzzy",
      });
      resetProfileEditing();
      render();
    });
  }
  const authForm = document.querySelector("#auth-form");
  if (authForm) {
    authForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(authForm);
      const email = formData.get("email");
      const password = formData.get("password");
      let outcome;

      if (authMode === "register") {
        const confirmPassword = formData.get("confirmPassword");
        const role = formData.get("role");
        if (password !== confirmPassword) {
          authError = "两次输入的密码不一致。";
          render();
          return;
        }
        outcome = authStore.register({ email, password, role });
      } else {
        outcome = authStore.login({ email, password });
      }

      if (!outcome.ok) {
        authError = outcome.error;
        render();
        return;
      }

      if (outcome.user?.role === "customer") {
        profileStore.createDefaultProfile(outcome.user);
      }
      isAuthModalOpen = false;
      authError = "";
      runPendingAuthAction();
      render();
    });
  }
}


window.openProfileDrawer = function openProfileDrawer() {
  resetProfileUiState();
  isProfileDrawerOpen = true;
  render();
};

window.closeProfileDrawer = function closeProfileDrawer() {
  isProfileDrawerOpen = false;
  resetProfileUiState();
  render();
};
function render() {
  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#"><span>CP</span><strong>CosPilot</strong></a>
      <div class="topbar-right">
        <nav aria-label="主导航"><a href="#planner">规划</a><a href="#plans">方案</a><a href="#providers">服务者</a></nav>
        ${renderAuthNav()}
      </div>
    </header>
    <main>
      ${renderComposer()}
      ${renderParsedSummary()}
      ${renderFinalPlan()}
      ${renderPlans()}
      ${renderBriefs()}
      <div id="providers">${renderProviders()}</div>
    </main>
    ${renderProviderProfile()}
    ${renderAuthModal()}
    ${renderMyDrawer()}
    ${renderActionFeedback()}
  `;
  bindEvents();
}

render();







