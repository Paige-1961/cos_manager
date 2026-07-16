const defaultRequirementRef = window.defaultRequirement;
const runCosPilotPipelineRef = window.runCosPilotPipeline;
const authStore = window.authStore;
const profileStore = window.profileStore;
const profileDrawer = window.profileDrawer;
const providerData = window.providerData;
const planStore = window.planStore;

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
let activeProviderTab = "works";
let lastRouteKey = "";

const app = document.querySelector("#app");

function formatCurrency(value) {
  return `¥${Number(value).toLocaleString("zh-CN")}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  return providerData.getProviderById(id);
}

function getServiceById(providerId, serviceId) {
  return providerData.getServiceById(providerId, serviceId);
}

function displayRequirementRange(savedRequirement) {
  if (!savedRequirement) return "未设置";
  const start = savedRequirement.dateRange?.start || savedRequirement.dateStart;
  const end = savedRequirement.dateRange?.end || savedRequirement.dateEnd;
  if (!start && !end) return "未设置";
  return start === end ? start : `${start} 至 ${end}`;
}

function formatDateTime(value) {
  if (!value) return "未记录";
  return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function getCurrentSavablePlan() {
  const plan = getPlan();
  const resolvedPlan = getResolvedPlan();
  const finalOutput = result.finalPlan || {};
  return {
    ...plan,
    requirement: { ...requirement },
    resolvedMembers: resolvedPlan.resolvedMembers || plan.resolvedMembers || [],
    total: resolvedPlan.total || plan.totalPrice || plan.total || 0,
    totalPrice: plan.totalPrice || resolvedPlan.total || 0,
    sharedDates: resolvedPlan.sharedDates || plan.sharedDates || [],
    actions: resolvedPlan.actions || plan.actions || [],
    warnings: plan.warnings || [],
    adjustments: plan.adjustments || resolvedPlan.actions || [],
    selectedDate: finalOutput.selectedDate || getSelectedDate(resolvedPlan),
    timeline: finalOutput.timeline || [],
    briefs: finalOutput.briefs || createBriefs(resolvedPlan),
  };
}

function saveCurrentPlanForUser() {
  const currentUser = authStore.getCurrentUser();
  const outcome = planStore.savePlan(currentUser?.id, getCurrentSavablePlan());
  if (!outcome.ok) {
    showActionFeedback(outcome.error || "方案保存失败。");
    return;
  }
  const suffix = outcome.updatedExisting ? "已更新已保存的同一方案。" : "已保存到我的方案。";
  showActionFeedback(`${suffix} 可在「我的方案」中查看。`);
}

function getSavedPlanMembers(savedPlan) {
  const plan = savedPlan?.plan || {};
  const sourceItems = plan.providers?.length ? plan.providers : plan.resolvedMembers || [];
  return sourceItems.map((item) => {
    const providerId = item.providerId || item.id;
    const serviceId = item.serviceId;
    const provider = providerId ? getProviderById(providerId) : null;
    const service = provider && serviceId ? getServiceById(providerId, serviceId) : null;
    return { ...item, providerId, serviceId, provider, service };
  });
}

function renderLoginRequiredState(title = "请先登录") {
  return `
    <section class="saved-plan-page provider-empty-state">
      <article class="panel interactive-surface">
        <p class="eyebrow">Account</p>
        <h2>${title}</h2>
        <p>登录后可以查看你保存过的出片方案。</p>
        <button class="primary-action interactive-surface" data-auth-open="login" type="button">登录</button>
      </article>
    </section>
  `;
}

function renderSavedPlansPage() {
  const currentUser = authStore.getCurrentUser();
  if (!currentUser) return renderLoginRequiredState("查看我的方案前需要登录");
  const plans = planStore.getPlansByUser(currentUser.id);
  return `
    <section class="saved-plan-page">
      <a class="provider-back-link" href="#">← 返回规划页</a>
      <div class="section-heading slim-heading">
        <p class="eyebrow">Saved Plans</p>
        <h2>我的方案</h2>
      </div>
      ${plans.length ? `<div class="saved-plan-grid">${plans.map(renderSavedPlanCard).join("")}</div>` : `<article class="panel interactive-surface empty-saved-plan"><h3>还没有保存的方案</h3><p>生成方案后点击“保存方案”，这里会保留你的历史方案快照。</p></article>`}
    </section>
  `;
}

function renderSavedPlanCard(savedPlan) {
  const plan = savedPlan.plan || {};
  const savedRequirement = plan.requirement || {};
  const members = getSavedPlanMembers(savedPlan);
  const total = plan.totalPrice || plan.total || 0;
  return `
    <article class="saved-plan-card panel interactive-surface">
      <div>
        <p class="eyebrow">${escapeHtml(savedRequirement.city || "未设置城市")}</p>
        <h3>${escapeHtml(savedPlan.title)}</h3>
      </div>
      <dl>
        <div><dt>角色 / 作品</dt><dd>《${escapeHtml(savedRequirement.sourceWork || savedRequirement.fandom || "未设置")}》${escapeHtml(savedRequirement.character || "未设置")}</dd></div>
        <div><dt>日期</dt><dd>${escapeHtml(displayRequirementRange(savedRequirement))}</dd></div>
        <div><dt>总预算</dt><dd>${formatCurrency(total)}</dd></div>
        <div><dt>服务者</dt><dd>${members.length} 位</dd></div>
        <div><dt>创建时间</dt><dd>${escapeHtml(formatDateTime(savedPlan.createdAt))}</dd></div>
      </dl>
      <div class="saved-plan-actions">
        <a class="primary-action interactive-surface" href="#plan/${encodeURIComponent(savedPlan.id)}">查看方案</a>
        <button class="secondary-action interactive-surface" data-plan-rename="${escapeHtml(savedPlan.id)}" type="button">修改标题</button>
        <button class="secondary-action interactive-surface" data-plan-delete="${escapeHtml(savedPlan.id)}" type="button">删除</button>
      </div>
    </article>
  `;
}

function renderSavedPlanDetail(planId) {
  const currentUser = authStore.getCurrentUser();
  if (!currentUser) return renderLoginRequiredState("查看方案详情前需要登录");
  const savedPlan = planStore.getPlanById(currentUser.id, planId);
  if (!savedPlan) return renderPlanNotFoundState();
  const plan = savedPlan.plan || {};
  const savedRequirement = plan.requirement || {};
  const members = getSavedPlanMembers(savedPlan);
  const total = plan.totalPrice || plan.total || 0;
  const warnings = plan.warnings || [];
  const adjustments = plan.adjustments || plan.actions || [];
  const timeline = plan.timeline || [];
  const briefs = plan.briefs || [];
  return `
    <section class="saved-plan-page saved-plan-detail-page">
      <a class="provider-back-link" href="#plans">← 返回我的方案</a>
      <article class="panel saved-plan-detail-hero interactive-surface">
        <p class="eyebrow">Saved Plan</p>
        <h2>${escapeHtml(savedPlan.title)}</h2>
        <div class="provider-stat-grid">
          <div><span>角色</span><strong>《${escapeHtml(savedRequirement.sourceWork || savedRequirement.fandom || "未设置")}》${escapeHtml(savedRequirement.character || "未设置")}</strong></div>
          <div><span>地点</span><strong>${escapeHtml(savedRequirement.city || "未设置")}</strong></div>
          <div><span>日期</span><strong>${escapeHtml(displayRequirementRange(savedRequirement))}</strong></div>
          <div><span>总价</span><strong>${formatCurrency(total)}</strong></div>
        </div>
      </article>
      <section class="panel interactive-surface">
        <div class="detail-section-heading"><p class="eyebrow">Providers</p><h3>推荐服务者</h3></div>
        <div class="saved-provider-list">
          ${members.map(renderSavedProviderRow).join("") || `<p>该方案没有可恢复的服务者。</p>`}
        </div>
      </section>
      ${(warnings.length || adjustments.length) ? `<section class="panel interactive-surface"><div class="detail-section-heading"><p class="eyebrow">Notes</p><h3>提示与调整</h3></div><ul class="saved-note-list">${[...warnings, ...adjustments].map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>` : ""}
      ${timeline.length ? `<section class="panel interactive-surface"><div class="detail-section-heading"><p class="eyebrow">Timeline</p><h3>拍摄计划</h3></div><div class="timeline">${timeline.map((item) => `<div><span>${escapeHtml(item.time || item.label || "阶段")}</span><p>${escapeHtml(item.task || item.text || item.description || "待确认")}</p></div>`).join("")}</div></section>` : ""}
      ${briefs.length ? `<section class="brief-section"><div class="section-heading slim-heading"><p class="eyebrow">Brief</p><h2>沟通文本</h2></div><div class="brief-grid">${briefs.map((brief) => `<article class="brief-card interactive-surface"><button class="brief-target" data-provider-id="${escapeHtml(brief.providerId || "")}" type="button">${escapeHtml(brief.target || "服务者")}</button><p>${escapeHtml(brief.message || "")}</p></article>`).join("")}</div></section>` : ""}
    </section>
  `;
}

function renderSavedProviderRow(item) {
  if (!item.provider) {
    return `<article class="member-row invalid-provider"><div><span>${escapeHtml(item.category || "服务")}</span><strong>服务者数据已失效</strong><small>${escapeHtml(item.reason || "该 providerId 已无法从当前数据源解析。")}</small></div><b>${formatCurrency(item.price || 0)}</b></article>`;
  }
  return `
    <button class="member-row" data-provider-id="${escapeHtml(item.providerId)}" type="button">
      <div>
        <span>${escapeHtml(item.provider.roleLabel || item.category || "服务")}</span>
        <strong>${escapeHtml(item.provider.name)}</strong>
        <small>${escapeHtml(item.service?.name || "服务数据已失效")} · ${escapeHtml(item.matchedDate || "档期待确认")}</small>
      </div>
      <b>${formatCurrency(item.service?.price || item.price || 0)}</b>
    </button>
  `;
}

function renderPlanNotFoundState() {
  return `
    <section class="saved-plan-page provider-empty-state">
      <article class="panel interactive-surface">
        <p class="eyebrow">Saved Plan</p>
        <h2>未找到该方案</h2>
        <p>该方案不存在，或不属于当前登录用户。</p>
        <a class="primary-action interactive-surface" href="#plans">返回我的方案</a>
      </article>
    </section>
  `;
}
function getCurrentRoute() {
  const hash = window.location.hash.replace(/^#/, "");
  const providerMatch = hash.match(/^provider\/(.+)$/);
  if (providerMatch) return { name: "provider", providerId: decodeURIComponent(providerMatch[1]) };
  const planMatch = hash.match(/^plan\/(.+)$/);
  if (planMatch) return { name: "plan", planId: decodeURIComponent(planMatch[1]) };
  if (hash === "plans") return { name: "plans" };
  return { name: "home" };
}

function navigateToProvider(providerId) {
  activeProviderTab = "works";
  window.location.hash = `provider/${encodeURIComponent(providerId)}`;
}

function syncRouteState(route) {
  const routeKey = route.name === "provider" ? `${route.name}:${route.providerId}` : route.name === "plan" ? `${route.name}:${route.planId}` : route.name;
  if (routeKey === lastRouteKey) return;
  lastRouteKey = routeKey;
  if (route.name === "provider") activeProviderTab = "works";
  if ((route.name === "plans" || route.name === "plan") && !authStore.isAuthenticated()) {
    authMode = "login";
    authError = "";
    isAuthModalOpen = true;
  }
}

function createBriefs(resolvedPlan) {
  return resolvedPlan.resolvedMembers.map((member) => ({
    target: `${member.roleLabel}｜${member.name}`,
    providerId: member.providerId || member.id,
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
                <button class="member-row interactive-surface" data-provider-id="${member.providerId || member.id}" type="button">
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
              <button class="provider-card interactive-surface" data-provider-id="${provider.providerId || provider.id}" type="button">
                <div class="provider-art" style="--accent:${provider.accent}"><span>${provider.roleLabel}</span></div>
                <div class="provider-body">
                  <div class="provider-title"><h3>${provider.name}</h3><strong>${formatCurrency(provider.price)}</strong></div>
                  <p>${provider.portfolio}</p>
                  <small>${provider.city}${provider.district} · ${provider.availableDates.join(" / ")}</small>
                  <div class="provider-card-actions">
                    <span data-protected-action="favorite-card" data-provider-id="${provider.providerId || provider.id}">收藏</span>
                    <span data-protected-action="book-card" data-provider-id="${provider.providerId || provider.id}">预约</span>
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

function providerAvatar(provider, sizeClass = "provider-detail-avatar") {
  if (provider.avatar) return `<img class="${sizeClass}" src="${provider.avatar}" alt="${provider.name} 头像" />`;
  return `<span class="${sizeClass} avatar-placeholder">${provider.name.slice(0, 1).toUpperCase()}</span>`;
}

function providerTabButton(tab, label) {
  return `<button class="${activeProviderTab === tab ? "active" : ""}" data-provider-tab="${tab}" type="button">${label}</button>`;
}

function renderProviderEmptyState() {
  return `
    <section class="provider-page provider-empty-state">
      <div class="panel">
        <p class="eyebrow">Provider</p>
        <h2>未找到该服务者</h2>
        <p>该服务者可能已下架，或链接中的 providerId 不正确。</p>
        <a class="primary-action interactive-surface" href="#providers">返回服务者列表</a>
      </div>
    </section>
  `;
}

function portfolioMeta(provider, item, index) {
  const tags = item.tags || [];
  return {
    role: tags[0] || provider.roleLabel,
    work: tags[1] || provider.portfolio || provider.name,
    location: `${provider.city}${provider.district}` || "未设置",
    style: tags.join(" / ") || provider.styles.slice(0, 2).join(" / "),
    likes: 24 + index * 9 + Math.round(provider.rating),
    comments: 3 + index * 2,
  };
}

function renderProviderTabContent(provider, services, portfolioItems, reviews) {
  if (activeProviderTab === "services") {
    return `
      <section class="profile-section detail-section" id="provider-services">
        <div class="detail-section-heading"><p class="eyebrow">Services</p><h3>服务项目</h3></div>
        <div class="service-list">${services.map((service) => `<article><div><strong>${service.name}</strong><small>${service.duration}</small></div><b>${formatCurrency(service.price)}</b></article>`).join("")}</div>
      </section>
    `;
  }
  if (activeProviderTab === "reviews") {
    return `
      <section class="profile-section detail-section" id="provider-reviews">
        <div class="detail-section-heading"><p class="eyebrow">Reviews</p><h3>评价</h3></div>
        <div class="review-list">${reviews.map((review) => `<article><strong>${review.author} · ${review.rating}</strong><p>${review.content}</p></article>`).join("")}</div>
      </section>
    `;
  }
  if (activeProviderTab === "schedule") {
    return `
      <section class="profile-section detail-section" id="provider-schedule">
        <div class="detail-section-heading"><p class="eyebrow">Schedule</p><h3>档期</h3></div>
        <div class="schedule-row">${provider.availableDates.map((date) => `<span>${date}</span>`).join("")}</div>
      </section>
    `;
  }
  if (activeProviderTab === "about") {
    return `
      <section class="profile-section detail-section" id="provider-about">
        <div class="detail-section-heading"><p class="eyebrow">About</p><h3>关于我</h3></div>
        <p>${provider.bio}</p>
      </section>
    `;
  }

  return `
    <section class="profile-section detail-section" id="provider-works">
      <div class="detail-section-heading"><p class="eyebrow">Portfolio</p><h3>作品</h3></div>
      <div class="portfolio-grid">
        ${portfolioItems.map((item, index) => {
          const meta = portfolioMeta(provider, item, index);
          return `
            <article class="portfolio-card">
              <div class="portfolio-art" style="--accent:${provider.accent}"><span>${item.title.slice(0, 1)}</span></div>
              <div class="portfolio-card-body">
                <strong>${item.title}</strong>
                <dl>
                  <div><dt>角色</dt><dd>${meta.role}</dd></div>
                  <div><dt>作品</dt><dd>${meta.work}</dd></div>
                  <div><dt>地点</dt><dd>${meta.location}</dd></div>
                  <div><dt>风格</dt><dd>${meta.style}</dd></div>
                </dl>
                <small>${meta.likes} 赞 · ${meta.comments} 评论</small>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderProviderProfile(providerId) {
  const provider = getProviderById(providerId);
  if (!provider) return renderProviderEmptyState();
  const resolvedProviderId = provider.providerId || provider.id;
  const services = provider.services || [];
  const portfolioItems = provider.portfolioItems || [];
  const reviews = provider.reviews || [];
  return `
    <section class="provider-page" aria-label="${provider.name} 服务者主页">
      <a class="provider-back-link" href="#providers">← 返回服务者列表</a>
      <div class="provider-detail-shell">
          <main class="provider-detail-main">
            <section class="provider-detail-hero panel" style="--accent:${provider.accent}">
              <div class="provider-identity">
                ${providerAvatar(provider)}
                <div>
                  <div class="provider-meta-row"><span class="verified-badge">已认证</span><span>${provider.roleLabel}</span></div>
                  <h2>${provider.name}</h2>
                  <p>${provider.bio}</p>
                </div>
              </div>
              <div class="provider-stat-grid">
                <div><span>地点</span><strong>${provider.city}${provider.district}</strong></div>
                <div><span>起步价</span><strong>${formatCurrency(provider.priceFrom)}</strong></div>
                <div><span>评分</span><strong>${provider.rating}</strong></div>
                <div><span>已服务</span><strong>${provider.completedOrders}</strong></div>
              </div>
              <div class="tag-row">${provider.styles.map((style) => `<span>${style}</span>`).join("")}</div>
              <div class="profile-actions inline-actions">
                <button class="secondary-action interactive-surface" data-protected-action="favorite-provider" data-provider-id="${resolvedProviderId}" type="button">收藏</button>
                <button class="primary-action interactive-surface" data-protected-action="book-provider" data-provider-id="${resolvedProviderId}" type="button">立即预约</button>
              </div>
            </section>

            <nav class="provider-detail-tabs" aria-label="服务者详情导航">
              ${providerTabButton("works", "作品")}
              ${providerTabButton("services", "服务项目")}
              ${providerTabButton("reviews", "评价")}
              ${providerTabButton("schedule", "档期")}
              ${providerTabButton("about", "关于我")}
            </nav>

            ${renderProviderTabContent(provider, services, portfolioItems, reviews)}
          </main>

          <aside class="provider-booking-card panel">
            <p class="eyebrow">Booking</p>
            <h3>${formatCurrency(provider.priceFrom)} 起</h3>
            <p>${provider.city}${provider.district} · ${provider.reviewCount} 条评价 · 已服务 ${provider.completedOrders}</p>
            <div class="service-list compact-service-list">${services.slice(0, 2).map((service) => `<article data-service-id="${service.id}"><div><strong>${service.name}</strong><small>${service.duration}</small></div><b>${formatCurrency(service.price)}</b></article>`).join("")}</div>
            <button class="primary-action interactive-surface" data-protected-action="book-provider" data-provider-id="${resolvedProviderId}" type="button">立即预约</button>
            <button class="secondary-action interactive-surface" data-protected-action="favorite-provider" data-provider-id="${resolvedProviderId}" type="button">收藏服务者</button>
          </aside>
      </div>
    </section>
  `;
}
function bindEvents() {
  const naturalForm = document.querySelector("#natural-form");
  if (naturalForm) {
    naturalForm.addEventListener("submit", (event) => {
      event.preventDefault();
      naturalInput = new FormData(event.currentTarget).get("naturalInput").trim();
      result = runCosPilotPipelineRef(naturalInput);
      requirement = result.requirement;
      selectedPlanIndex = 0;
      activeProviderId = null;
      render();
    });
  }

  document.querySelectorAll("[data-plan-index]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPlanIndex = Number(button.dataset.planIndex);
      activeProviderId = null;
      render();
      document.querySelector("#plans")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  document.querySelectorAll("[data-provider-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeProviderTab = button.dataset.providerTab || "works";
      render();
    });
  });

  document.querySelectorAll("[data-provider-id]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.protectedAction) return;
      activeProviderId = button.dataset.providerId;
      navigateToProvider(button.dataset.providerId);
    });
  });

  document.querySelectorAll("[data-protected-action]").forEach((node) => {
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      const actionName = node.dataset.protectedAction;
      const provider = node.dataset.providerId ? getProviderById(node.dataset.providerId) : null;
      requireAuth(() => {
        if (actionName === "save-plan") {
          saveCurrentPlanForUser();
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

  document.querySelectorAll("[data-my-plans]").forEach((button) => {
    button.addEventListener("click", () => {
      isProfileDrawerOpen = false;
      resetProfileUiState();
      window.location.hash = "plans";
    });
  });

  document.querySelectorAll("[data-plan-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const currentUser = authStore.getCurrentUser();
      if (!currentUser) return;
      if (!window.confirm("确定删除这个已保存方案吗？")) return;
      planStore.deletePlan(currentUser.id, button.dataset.planDelete);
      showActionFeedback("已删除该方案。");
    });
  });

  document.querySelectorAll("[data-plan-rename]").forEach((button) => {
    button.addEventListener("click", () => {
      const currentUser = authStore.getCurrentUser();
      if (!currentUser) return;
      const savedPlan = planStore.getPlanById(currentUser.id, button.dataset.planRename);
      const nextTitle = window.prompt("修改方案标题", savedPlan?.title || "");
      if (nextTitle === null) return;
      const outcome = planStore.updatePlanTitle(currentUser.id, button.dataset.planRename, nextTitle);
      showActionFeedback(outcome.ok ? "方案标题已更新。" : outcome.error);
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
      authStore.logout();
      isProfileDrawerOpen = false;
      resetProfileUiState();
      showActionFeedback("密码已更新，请使用新密码重新登录。");
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
function renderMainContent(route) {
  if (route.name === "provider") {
    return renderProviderProfile(route.providerId);
  }
  if (route.name === "plans") {
    return renderSavedPlansPage();
  }
  if (route.name === "plan") {
    return renderSavedPlanDetail(route.planId);
  }

  return `
      ${renderComposer()}
      ${renderParsedSummary()}
      ${renderFinalPlan()}
      ${renderPlans()}
      ${renderBriefs()}
      <div id="providers">${renderProviders()}</div>
  `;
}

function render() {
  const route = getCurrentRoute();
  syncRouteState(route);
  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#"><span>CP</span><strong>CosPilot</strong></a>
      <div class="topbar-right">
        <nav aria-label="主导航"><a href="#planner">规划</a><a href="#plans">方案</a><a href="#providers">服务者</a></nav>
        ${renderAuthNav()}
      </div>
    </header>
    <main>
      ${renderMainContent(route)}
    </main>
    ${renderAuthModal()}
    ${renderMyDrawer()}
    ${renderActionFeedback()}
  `;
  bindEvents();
}

window.addEventListener("hashchange", render);
render();














