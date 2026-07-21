const defaultRequirementRef = window.defaultRequirement;
const runCosPilotPipelineRef = window.runCosPilotPipeline;
const authStore = window.authStore;
const profileStore = window.profileStore;
const profileDrawer = window.profileDrawer;
const providerData = window.providerData;
const planStore = window.planStore;
const bookingStore = window.bookingStore;
const providerDashboard = window.providerDashboard;
const providerStore = window.providerStore;
const requirementAgent = window.requirementAgent;

let naturalInput = defaultRequirementRef.rawText;
let result = runCosPilotPipelineRef(naturalInput);
let requirement = result.requirement;
let selectedPlanIndex = 0;
let activeProviderId = null;
let isAuthModalOpen = false;
let isProfileDrawerOpen = false;
let authMode = "login";
let authError = "";
let isAuthSubmitting = false;
let isProfileEditing = false;
let profileDraft = null;
let profileError = "";
let isPasswordModalOpen = false;
let passwordError = "";
let pendingAuthAction = null;
let actionFeedback = "";
let activeProviderTab = "works";
let activeProviderDashboardSection = "overview";
let providerProfileDraft = null;
let providerProfileError = "";
let providerServiceEditingId = null;
let providerServiceDraft = null;
let providerServiceError = "";
let providerPortfolioEditingId = null;
let providerPortfolioDraft = null;
let providerPortfolioError = "";
let providerScheduleError = "";
let isBookingModalOpen = false;
let bookingProviderId = null;
let bookingError = "";
let providerBookingError = "";
let providerDetailReturnHash = sessionStorage.getItem("cospilot.providerReturnHash") || "providers";
let lastRouteKey = "";
let agentUnderstanding = null;
let isAgentParsing = false;
let hasGeneratedPlan = true;
let providerFilters = {
  category: "all",
  city: "all",
  style: "all",
  maxPrice: "",
  availability: "",
};
const CURRENT_PLAN_BOOKING_VALUE = "__current-plan__";

const PLANNER_EXAMPLES = [
  "我想在北京拍《崩坏：星穹铁道》银狼，7月中旬，预算800元，偏电影感和暗调，需要妆造、摄影和棚。",
  "想在上海拍《原神》芙宁娜的清透外景，预算1200元，服装和假发已有，需要妆娘、摄影和后期。",
  "第一次准备 Cos 正片，角色是初音未来，希望在广州周末拍摄，预算1000元，请帮我补全需要的服务。",
];

const PLANNER_SUGGESTIONS = ["北京拍摄", "预算 800 元", "电影感", "暗调棚拍", "尽量少沟通"];

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

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "zh-CN"));
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

function createTimeline(resolvedPlan) {
  const selectedDate = getSelectedDate(resolvedPlan);
  return [
    { time: "确认前", task: "确认服务者档期、报价和拍摄风格参考。" },
    { time: "拍摄前 1-3 天", task: "发送角色参考、服装状态、妆造要求和棚景偏好。" },
    { time: selectedDate, task: "按共同档期完成妆造、棚拍和现场确认。" },
    { time: "拍摄后", task: "筛片、确认后期方向并跟进交付。" },
  ];
}

function getCurrentPlanOutput() {
  const resolvedPlan = getResolvedPlan();
  return {
    selectedDate: getSelectedDate(resolvedPlan),
    timeline: createTimeline(resolvedPlan),
    briefs: createBriefs(resolvedPlan),
  };
}

function getCurrentBookingPlanContext(providerId) {
  const plan = getPlan();
  const resolvedPlan = getResolvedPlan();
  const member = resolvedPlan?.resolvedMembers?.find((item) => (item.providerId || item.id) === providerId);
  if (!plan || !member) return null;
  return { plan, resolvedPlan, member, output: getCurrentPlanOutput() };
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
  const currentOutput = getCurrentPlanOutput();
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
    selectedDate: currentOutput.selectedDate,
    timeline: currentOutput.timeline,
    briefs: currentOutput.briefs,
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

function bookingStatusLabel(status) {
  return status === "accepted" ? "已接受" : status === "rejected" ? "已拒绝" : "待服务者确认";
}

function renderCustomerBookingsPage() {
  const currentUser = authStore.getCurrentUser();
  if (!currentUser) return renderLoginRequiredState("查看我的预约前需要登录");
  if (currentUser.role !== "customer") return `<section class="saved-plan-page"><article class="panel empty-saved-plan"><p class="eyebrow">Bookings</p><h2>客户预约中心</h2><p>当前账号是服务者，请前往服务者工作台处理收到的预约。</p><a class="primary-action interactive-surface" href="#provider-dashboard">进入服务者工作台</a></article></section>`;
  const bookings = bookingStore.getBookingsByCustomer(currentUser.id);
  return `
    <section class="saved-plan-page booking-page">
      <div class="section-heading slim-heading"><p class="eyebrow">Bookings</p><h1>我的预约</h1><p>查看预约日期和服务者处理状态。</p></div>
      ${bookings.length ? `<div class="booking-list">${bookings.map((booking) => {
        const provider = getProviderById(booking.providerId);
        const service = getServiceById(booking.providerId, booking.serviceId);
        return `<article class="booking-card panel interactive-surface">
          <div class="booking-card-heading"><div><h3>${escapeHtml(provider?.name || "服务者数据已失效")}</h3><small>创建于 ${formatDateTime(booking.createdAt)}</small></div><span class="booking-status ${escapeHtml(booking.status)}">${bookingStatusLabel(booking.status)}</span></div>
          <dl><div><dt>服务项目</dt><dd>${escapeHtml(service?.name || service?.title || "服务数据已失效")}</dd></div><div><dt>预约日期</dt><dd>${escapeHtml(booking.preferredDate)}</dd></div><div><dt>关联方案</dt><dd>${escapeHtml(booking.planTitle || "未关联")}</dd></div></dl>
          ${booking.note ? `<p>备注：${escapeHtml(booking.note)}</p>` : ""}
          ${provider ? `<a class="secondary-action interactive-surface" href="#provider/${encodeURIComponent(booking.providerId)}">查看服务者主页</a>` : ""}
        </article>`;
      }).join("")}</div>` : `<article class="panel empty-saved-plan"><h3>还没有预约</h3><p>从服务者详情页选择服务和档期，发起第一条预约。</p><a class="primary-action interactive-surface" href="#providers">浏览服务者</a></article>`}
    </section>
  `;
}

function closeBookingModal() {
  isBookingModalOpen = false;
  bookingProviderId = null;
  bookingError = "";
}

function openBookingModal(provider) {
  const currentUser = authStore.getCurrentUser();
  if (!currentUser || currentUser.role !== "customer") {
    showActionFeedback("只有客户账号可以发起预约。");
    return;
  }
  bookingProviderId = provider?.providerId || provider?.id || null;
  bookingError = "";
  isBookingModalOpen = Boolean(bookingProviderId);
  render();
}

function renderBookingModal() {
  if (!isBookingModalOpen) return "";
  const currentUser = authStore.getCurrentUser();
  const provider = getProviderById(bookingProviderId);
  if (!currentUser || !provider) return "";
  const services = provider.services || [];
  const dates = (provider.availableDates || []).filter((date) => date >= todayIso());
  const plans = planStore.getPlansByUser(currentUser.id);
  const currentPlanContext = getCurrentBookingPlanContext(provider.providerId || provider.id);
  const defaultServiceId = currentPlanContext?.member.serviceId || "";
  const defaultDateCandidates = [...(currentPlanContext?.member.matchDates || []), currentPlanContext?.output.selectedDate].filter(Boolean);
  const defaultDate = defaultDateCandidates.find((date) => dates.includes(date)) || "";
  return `
    <div class="auth-backdrop" data-booking-close="true">
      <section class="auth-modal booking-modal interactive-surface" role="dialog" aria-modal="true" aria-label="预约 ${escapeHtml(provider.name)}">
        <button class="auth-close" data-booking-close="true" type="button">×</button>
        <div class="auth-heading"><p class="eyebrow">Booking</p><h2>预约 ${escapeHtml(provider.name)}</h2><p>提交后等待服务者接受或拒绝。</p></div>
        <form id="booking-form" class="auth-form">
          <label><span>服务项目</span><select name="serviceId" required><option value="">选择服务</option>${services.map((service) => `<option value="${escapeHtml(service.id)}" ${service.id === defaultServiceId ? "selected" : ""}>${escapeHtml(service.name || service.title)} · ${formatCurrency(service.price)}</option>`).join("")}</select></label>
          <label><span>预约日期</span><select name="preferredDate" required><option value="">选择可约日期</option>${dates.map((date) => `<option value="${escapeHtml(date)}" ${date === defaultDate ? "selected" : ""}>${escapeHtml(date)}</option>`).join("")}</select></label>
          <label><span>关联方案（可选）</span><select name="savedPlanId"><option value="">不关联方案</option>${currentPlanContext ? `<option value="${CURRENT_PLAN_BOOKING_VALUE}" selected>当前方案：${escapeHtml(currentPlanContext.plan.name)}</option>` : ""}${plans.map((plan) => `<option value="${escapeHtml(plan.id)}">${escapeHtml(plan.title)}</option>`).join("")}</select></label>
          <label><span>备注</span><textarea name="note" rows="3" placeholder="补充角色、风格或沟通需求"></textarea></label>
          ${!services.length ? '<p class="auth-error">该服务者还没有可预约服务。</p>' : ""}
          ${!dates.length ? '<p class="auth-error">该服务者当前没有未来可约档期。</p>' : ""}
          ${bookingError ? `<p class="auth-error">${escapeHtml(bookingError)}</p>` : ""}
          <button class="primary-action interactive-surface" type="submit" ${!services.length || !dates.length ? "disabled" : ""}>提交预约</button>
        </form>
      </section>
    </div>
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
  if (hash === "provider-dashboard") return { name: "providerDashboard" };
  if (hash === "bookings") return { name: "bookings" };
  const providerMatch = hash.match(/^provider\/(.+)$/);
  if (providerMatch) return { name: "provider", providerId: decodeURIComponent(providerMatch[1]) };
  const planMatch = hash.match(/^plan\/(.+)$/);
  if (planMatch) return { name: "plan", planId: decodeURIComponent(planMatch[1]) };
  if (hash === "plans") return { name: "plans" };
  return { name: "home" };
}

function navigateToProvider(providerId, options = {}) {
  activeProviderTab = "works";
  providerDetailReturnHash = options.returnTo || "providers";
  sessionStorage.setItem("cospilot.providerReturnHash", providerDetailReturnHash);
  window.location.hash = `provider/${encodeURIComponent(providerId)}`;
}

function providerBackLink() {
  if (providerDetailReturnHash === "provider-dashboard" && authStore.getCurrentUser()?.role === "provider") {
    return { hash: "provider-dashboard", label: "← 返回工作台" };
  }
  return { hash: "providers", label: "← 返回服务者列表" };
}

function syncRouteState(route) {
  const routeKey = route.name === "provider" ? `${route.name}:${route.providerId}` : route.name === "plan" ? `${route.name}:${route.planId}` : route.name;
  if (routeKey === lastRouteKey) return;
  lastRouteKey = routeKey;
  if (route.name === "provider") activeProviderTab = "works";
  if (route.name === "providerDashboard") activeProviderDashboardSection = "overview";
  if ((route.name === "plans" || route.name === "plan" || route.name === "bookings" || route.name === "providerDashboard") && !authStore.isAuthenticated()) {
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


function createProviderServiceId(provider) {
  const base = provider?.providerId || provider?.id || "provider";
  return `svc-${base.replace(/^provider-/, "")}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function resetProviderServiceEditing() {
  providerServiceEditingId = null;
  providerServiceDraft = null;
  providerServiceError = "";
}

function syncProviderServiceDraftFromForm() {
  const form = document.querySelector("#provider-service-form");
  if (!form) return providerServiceDraft;
  const formData = new FormData(form);
  providerServiceDraft = {
    ...(providerServiceDraft || {}),
    title: String(formData.get("title") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    price: Number(formData.get("price")),
    duration: String(formData.get("duration") || "").trim(),
  };
  return providerServiceDraft;
}

function saveProviderServicesForUser(currentUser, services, message) {
  const outcome = providerStore.updateProviderServices(currentUser.id, services);
  if (!outcome.ok) {
    providerServiceError = outcome.error || "服务项目保存失败。";
    render();
    return false;
  }
  resetProviderServiceEditing();
  showActionFeedback(message);
  return true;
}

function createProviderPortfolioId(provider) {
  const base = provider?.providerId || provider?.id || "provider";
  return `pf-${base.replace(/^provider-/, "")}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function resetProviderPortfolioEditing() {
  providerPortfolioEditingId = null;
  providerPortfolioDraft = null;
  providerPortfolioError = "";
}

function syncProviderPortfolioDraftFromForm() {
  const form = document.querySelector("#provider-portfolio-form");
  if (!form) return providerPortfolioDraft;
  const formData = new FormData(form);
  providerPortfolioDraft = {
    ...(providerPortfolioDraft || {}),
    title: String(formData.get("title") || "").trim(),
    character: String(formData.get("character") || "").trim(),
    sourceWork: String(formData.get("sourceWork") || "").trim(),
    location: joinRegionParts(
      String(formData.get("portfolioProvince") || "").trim(),
      String(formData.get("portfolioCity") || "").trim(),
      String(formData.get("portfolioDistrict") || "").trim()
    ),
    styles: parseStyleTags(formData.get("styles")),
    description: String(formData.get("description") || "").trim(),
    images: providerPortfolioDraft?.images || [],
  };
  return providerPortfolioDraft;
}

function saveProviderPortfolioForUser(currentUser, portfolioItems, message) {
  const outcome = providerStore.updateProviderPortfolio(currentUser.id, portfolioItems);
  if (!outcome.ok) {
    providerPortfolioError = outcome.error || "作品保存失败。";
    render();
    return false;
  }
  resetProviderPortfolioEditing();
  showActionFeedback(message);
  return true;
}

function resetProviderScheduleState() {
  providerScheduleError = "";
}

function saveProviderScheduleForUser(currentUser, availableDates, message) {
  const outcome = providerStore.updateProviderSchedule(currentUser.id, availableDates);
  if (!outcome.ok) {
    providerScheduleError = outcome.error || "档期保存失败。";
    render();
    return false;
  }
  resetProviderScheduleState();
  showActionFeedback(message);
  return true;
}
function getProviderProfileForUser(user) {
  if (!user || user.role !== "provider") return null;
  return providerStore.getProviderByUserId(user.id) || providerStore.createDefaultProvider(user);
}

function parseStyleTags(value) {
  return String(value || "")
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}


function readImageFileAsOptimizedDataUrl(file, onLoad) {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const source = reader.result;
    const image = new Image();
    image.addEventListener("load", () => {
      const maxSide = 1200;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        onLoad(source);
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      onLoad(canvas.toDataURL("image/jpeg", 0.82));
    });
    image.addEventListener("error", () => onLoad(source));
    image.src = source;
  });
  reader.readAsDataURL(file);
}


function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function joinRegionParts(province, city, district) {
  return [province, city, district].filter(Boolean).join(" / ");
}
function syncProviderDraftFromForm() {
  const form = document.querySelector("#provider-profile-form");
  const currentUser = authStore.getCurrentUser();
  if (!form || !currentUser) return providerProfileDraft;
  const formData = new FormData(form);
  providerProfileDraft = {
    ...(providerProfileDraft || getProviderProfileForUser(currentUser)),
    name: String(formData.get("name") || "").trim(),
    category: formData.get("category") || "makeup",
    bio: String(formData.get("bio") || "").trim(),
    location: {
      province: String(formData.get("province") || "").trim(),
      city: String(formData.get("city") || "").trim(),
      district: String(formData.get("district") || "").trim(),
      mode: formData.get("acceptsOnsite") ? "onsite" : "remote",
    },
    styles: parseStyleTags(formData.get("styles")),
    priceFrom: Number(formData.get("priceFrom")),
    responseTime: String(formData.get("responseTime") || "当天回复").trim(),
    acceptsOnsite: Boolean(formData.get("acceptsOnsite")),
    supportsTrialConsult: Boolean(formData.get("supportsTrialConsult")),
  };
  return providerProfileDraft;
}

function resetProviderProfileEditing() {
  providerProfileDraft = null;
  providerProfileError = "";
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
  const providerProfile = currentUser.role === "provider" ? getProviderProfileForUser(currentUser) : null;
  const navLabel = profile?.nickname || providerProfile?.name || "我的";
  const navAvatar = profile
    ? profileDrawer.avatarMarkup(profile, profile.nickname, "nav-avatar")
    : providerProfile?.avatar
      ? `<span class="avatar-placeholder nav-avatar avatar-image"><img src="${escapeHtml(providerProfile.avatar)}" alt="头像" /></span>`
      : `<span class="avatar-placeholder nav-avatar">${(providerProfile?.name || currentUser.email).slice(0, 1).toUpperCase()}</span>`;

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
          ${authError ? `<p class="auth-error">${escapeHtml(authError)}</p>` : ""}
          <button class="primary-action interactive-surface" type="submit" ${isAuthSubmitting ? "disabled" : ""}>${isAuthSubmitting ? (isLogin ? "登录中..." : "注册中...") : (isLogin ? "登录" : "注册并登录")}</button>
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
    return profileDrawer.renderProviderDrawer({ currentUser, provider: getProviderProfileForUser(currentUser) });
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
        <p class="composer-intro">告诉我角色、城市、时间和预算。信息不完整也没关系，CosPilot 会先帮你整理，再组合合适的创作伙伴。</p>
      </div>
      <form id="natural-form" class="natural-form interactive-surface">
        <textarea name="naturalInput" rows="6" aria-label="自然语言需求">${escapeHtml(naturalInput)}</textarea>
        <div class="planner-guidance" aria-label="输入灵感">
          <div class="guidance-heading"><strong>不知道怎么写？试试这些例子</strong><span>点击即可填入</span></div>
          <div class="prompt-examples">
            ${PLANNER_EXAMPLES.map((example, index) => `<button class="prompt-example" data-example-prompt="${index}" type="button">${escapeHtml(example)}</button>`).join("")}
          </div>
          <div class="suggestion-row" aria-label="常用需求标签">
            ${PLANNER_SUGGESTIONS.map((suggestion) => `<button class="suggestion-chip" data-prompt-suggestion="${escapeHtml(suggestion)}" type="button">+ ${escapeHtml(suggestion)}</button>`).join("")}
          </div>
        </div>
        <div class="composer-actions">
          <button class="primary-action interactive-surface" type="submit" ${isAgentParsing ? "disabled" : ""}>${isAgentParsing ? "正在理解..." : "生成方案"}</button>
          <span>AI 负责理解需求，真实服务者由规则引擎匹配</span>
        </div>
      </form>
    </section>
  `;
}

function renderAgentUnderstanding() {
  if (!agentUnderstanding) return "";
  const current = agentUnderstanding.requirement;
  const serviceLabels = { makeup: "妆造", wig: "假发 / 发型", photographer: "摄影", studio: "摄影棚 / 场地", retoucher: "后期" };
  const dateLabel = current.dateStart ? displayDateRange(current) : "待补充";
  const fields = [
    ["作品", current.sourceWork || "待补充"],
    ["角色", current.character || "待补充"],
    ["地点", [current.city, current.district].filter(Boolean).join(" / ") || "待补充"],
    ["时间", dateLabel],
    ["预算", current.budget === null ? "待补充" : formatCurrency(current.budget)],
    ["需要服务", current.neededServices.map((item) => serviceLabels[item] || item).join("、") || "待补充"],
  ];
  return `
    <section class="agent-understanding panel" aria-live="polite">
      <div class="agent-understanding-heading">
        <div><p class="eyebrow">Requirement Agent</p><h2>我理解你的需求</h2></div>
        <div class="understanding-actions">
          <span class="understanding-source">${agentUnderstanding.source === "llm" ? "AI 理解" : "本地理解"}</span>
          <button class="text-action" data-edit-requirement="true" type="button">修改原始需求</button>
        </div>
      </div>
      <dl>${fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
      ${agentUnderstanding.clarificationQuestions.length ? `<div class="agent-clarifications"><div><strong>还需要你确认</strong><p>补充这些信息后，推荐结果会更准确。</p></div><ul>${agentUnderstanding.clarificationQuestions.map((question) => `<li>${escapeHtml(question)}</li>`).join("")}</ul><button class="secondary-action" data-edit-requirement="true" type="button">返回输入框补充</button></div>` : `<div class="understanding-ready"><strong>需求已就绪</strong><span>下一步已基于真实 Provider 数据生成方案。</span></div>`}
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
  const currentOutput = getCurrentPlanOutput();
  const overBudget = resolvedPlan.total > requirement.budget;
  const warnings = resolvedPlan.warnings || [];
  const adjustments = resolvedPlan.adjustments || [];
  return `
    <section class="result-layout">
      <article class="panel plan-hero interactive-surface">
        <div class="recommendation-heading">
          <div><div class="panel-kicker">推荐方案</div><h2>${plan.name}</h2></div>
          <span class="recommendation-status ${overBudget || warnings.length ? "needs-attention" : "ready"}">${overBudget || warnings.length ? "需要确认" : "可以开始协调"}</span>
        </div>
        <div class="plan-fact-grid">
          <div><span>方案总价</span><strong>${formatCurrency(resolvedPlan.total)}</strong><small>${overBudget ? `超出预算 ${formatCurrency(resolvedPlan.total - requirement.budget)}` : "在预算范围内"}</small></div>
          <div><span>建议日期</span><strong>${resolvedPlan.sharedDates.length ? currentOutput.selectedDate : "待协调"}</strong><small>${resolvedPlan.sharedDates.length ? "成员共同可约" : "当前没有共同档期"}</small></div>
          <div><span>创作伙伴</span><strong>${resolvedPlan.resolvedMembers.length} 位</strong><small>来自真实 Provider 数据</small></div>
        </div>
        ${warnings.length ? `<div class="recommendation-warning"><strong>开始前请确认</strong><ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul></div>` : ""}
        <div class="plan-section-heading"><div><span>推荐创作伙伴</span><small>点击可查看作品、服务和档期</small></div><button class="secondary-action interactive-surface" data-protected-action="save-plan" type="button">保存方案</button></div>
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
        <h3>为什么这样推荐</h3>
        <p class="lead">系统综合类别、地点、档期、风格和预算进行确定性匹配。</p>
        <details class="recommendation-details">
          <summary>查看匹配与调整记录</summary>
          <ul class="plain-list">${(adjustments.length ? adjustments : resolvedPlan.actions).map((action) => `<li>${escapeHtml(action)}</li>`).join("")}</ul>
        </details>
      </article>
      <article class="panel compact-panel interactive-surface">
        <div class="panel-kicker">Timeline</div>
        <h3>拍摄计划</h3>
        <div class="timeline">
          ${currentOutput.timeline.map((item) => `<div><span>${escapeHtml(item.time)}</span><p>${escapeHtml(item.task)}</p></div>`).join("")}
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
  const allProviders = providerData.getAllProviders();
  const categoryLabels = { makeup: "妆造", wig: "假发 / 发型", photographer: "摄影", studio: "摄影棚 / 场地", retoucher: "后期" };
  const categories = uniqueSorted(allProviders.map((provider) => provider.category));
  const cities = uniqueSorted(allProviders.map((provider) => provider.city || provider.location?.city));
  const styles = uniqueSorted(allProviders.flatMap((provider) => provider.styles || []));
  const maxPrice = Number(providerFilters.maxPrice || 0);
  const visibleProviders = allProviders.filter((provider) => {
    const city = provider.city || provider.location?.city || "";
    const price = Number(provider.priceFrom || provider.price || 0);
    return (providerFilters.category === "all" || provider.category === providerFilters.category)
      && (providerFilters.city === "all" || city === providerFilters.city)
      && (providerFilters.style === "all" || (provider.styles || []).includes(providerFilters.style))
      && (!maxPrice || price <= maxPrice)
      && (!providerFilters.availability || (provider.availableDates || []).includes(providerFilters.availability));
  });
  return `
    <section class="split-section">
      <div class="section-heading slim-heading">
        <p class="eyebrow">Providers</p>
        <h2>寻找创作伙伴</h2>
        <p>按你的项目条件浏览妆造、摄影、场地、假发和后期伙伴。</p>
      </div>
      <form id="provider-filter-form" class="provider-filter-panel" aria-label="创作伙伴筛选">
        <label><span>服务类型</span><select name="category"><option value="all">全部类型</option>${categories.map((category) => `<option value="${escapeHtml(category)}" ${providerFilters.category === category ? "selected" : ""}>${escapeHtml(categoryLabels[category] || category)}</option>`).join("")}</select></label>
        <label><span>城市</span><select name="city"><option value="all">全部城市</option>${cities.map((city) => `<option value="${escapeHtml(city)}" ${providerFilters.city === city ? "selected" : ""}>${escapeHtml(city)}</option>`).join("")}</select></label>
        <label><span>风格</span><select name="style"><option value="all">全部风格</option>${styles.map((style) => `<option value="${escapeHtml(style)}" ${providerFilters.style === style ? "selected" : ""}>${escapeHtml(style)}</option>`).join("")}</select></label>
        <label><span>最高起步价</span><input name="maxPrice" type="number" min="0" step="50" value="${escapeHtml(providerFilters.maxPrice)}" placeholder="不限" /></label>
        <label><span>可约日期</span><input name="availability" type="date" value="${escapeHtml(providerFilters.availability)}" /></label>
        <button class="secondary-action provider-filter-reset" data-provider-filter-reset="true" type="button">重置</button>
      </form>
      <div class="provider-results-summary" role="status"><strong>${visibleProviders.length}</strong> 位符合当前条件<span>共 ${allProviders.length} 位已发布伙伴</span></div>
      <div class="provider-grid compact-providers">
        ${visibleProviders.length ? visibleProviders
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
          .join("") : `<article class="panel provider-filter-empty"><h3>暂时没有完全匹配的伙伴</h3><p>可以放宽城市、预算、风格或日期条件后再试。</p><button class="secondary-action" data-provider-filter-reset="true" type="button">清除筛选</button></article>`}
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
  const tags = item.styles || item.tags || [];
  return {
    role: item.character || tags[0] || provider.roleLabel,
    work: item.sourceWork || tags[1] || provider.portfolio || provider.name,
    location: item.location || `${provider.city}${provider.district}` || "未设置",
    style: tags.join(" / ") || provider.styles.slice(0, 2).join(" / "),
    likes: Number(item.likes ?? 24 + index * 11),
    comments: Number(item.comments ?? 6 + index * 3),
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
              <div class="portfolio-art" style="--accent:${provider.accent}">${item.images?.[0] ? `<img src="${item.images[0]}" alt="${item.title}" />` : `<span>${item.title.slice(0, 1)}</span>`}</div>
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
      ${(() => { const back = providerBackLink(); return `<a class="provider-back-link" href="#${back.hash}">${back.label}</a>`; })()}
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
    naturalForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      naturalInput = new FormData(event.currentTarget).get("naturalInput").trim();
      isAgentParsing = true;
      render();
      agentUnderstanding = await requirementAgent.understand(naturalInput);
      requirement = agentUnderstanding.requirement;
      selectedPlanIndex = 0;
      activeProviderId = null;
      if (agentUnderstanding.canRecommend) {
        result = runCosPilotPipelineRef(requirement);
        requirement = result.requirement;
        hasGeneratedPlan = true;
      } else {
        hasGeneratedPlan = false;
      }
      isAgentParsing = false;
      render();
    });
  }

  document.querySelectorAll("[data-example-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      const textarea = document.querySelector("#natural-form textarea[name='naturalInput']");
      const example = PLANNER_EXAMPLES[Number(button.dataset.examplePrompt)] || "";
      if (!textarea || !example) return;
      textarea.value = example;
      naturalInput = example;
      textarea.focus();
    });
  });

  document.querySelectorAll("[data-prompt-suggestion]").forEach((button) => {
    button.addEventListener("click", () => {
      const textarea = document.querySelector("#natural-form textarea[name='naturalInput']");
      const suggestion = String(button.dataset.promptSuggestion || "").trim();
      if (!textarea || !suggestion) return;
      const current = textarea.value.trim();
      if (!current.includes(suggestion)) textarea.value = `${current}${current ? "，" : ""}${suggestion}`;
      naturalInput = textarea.value;
      textarea.focus();
    });
  });

  document.querySelectorAll("[data-edit-requirement]").forEach((button) => {
    button.addEventListener("click", () => {
      const textarea = document.querySelector("#natural-form textarea[name='naturalInput']");
      textarea?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => textarea?.focus(), 250);
    });
  });

  const providerFilterForm = document.querySelector("#provider-filter-form");
  if (providerFilterForm) {
    providerFilterForm.addEventListener("change", () => {
      const formData = new FormData(providerFilterForm);
      providerFilters = {
        category: String(formData.get("category") || "all"),
        city: String(formData.get("city") || "all"),
        style: String(formData.get("style") || "all"),
        maxPrice: String(formData.get("maxPrice") || ""),
        availability: String(formData.get("availability") || ""),
      };
      render();
      window.requestAnimationFrame(() => document.querySelector("#providers")?.scrollIntoView({ block: "start" }));
    });
  }

  document.querySelectorAll("[data-provider-filter-reset]").forEach((button) => {
    button.addEventListener("click", () => {
      providerFilters = { category: "all", city: "all", style: "all", maxPrice: "", availability: "" };
      render();
      window.requestAnimationFrame(() => document.querySelector("#providers")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    });
  });

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
          openBookingModal(provider);
        }
      });
    });
  });

  document.querySelectorAll("[data-booking-close]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target.dataset.bookingClose) {
        closeBookingModal();
        render();
      }
    });
  });

  const bookingForm = document.querySelector("#booking-form");
  if (bookingForm) {
    bookingForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const currentUser = authStore.getCurrentUser();
      const provider = getProviderById(bookingProviderId);
      const formData = new FormData(bookingForm);
      const selectedBookingPlanId = String(formData.get("savedPlanId") || "");
      const useCurrentPlan = selectedBookingPlanId === CURRENT_PLAN_BOOKING_VALUE;
      const savedPlanId = useCurrentPlan ? "" : selectedBookingPlanId;
      const savedPlan = savedPlanId ? planStore.getPlanById(currentUser?.id, savedPlanId) : null;
      const currentPlan = useCurrentPlan ? getPlan() : null;
      const profile = currentUser?.role === "customer" ? getCustomerProfile(currentUser) : null;
      const outcome = await bookingStore.createBooking(currentUser, provider, {
        serviceId: String(formData.get("serviceId") || ""),
        preferredDate: String(formData.get("preferredDate") || ""),
        savedPlanId: savedPlan?.id || null,
        planTitle: currentPlan?.name || savedPlan?.title || "",
        customerLabel: profile?.nickname || currentUser?.email || "客户",
        note: String(formData.get("note") || ""),
      });
      if (!outcome.ok) {
        bookingError = outcome.error;
        render();
        return;
      }
      closeBookingModal();
      actionFeedback = "预约已提交，等待服务者确认。";
      window.location.hash = "bookings";
      render();
    });
  }

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

  document.querySelectorAll("[data-my-bookings]").forEach((button) => {
    button.addEventListener("click", () => {
      isProfileDrawerOpen = false;
      resetProfileUiState();
      window.location.hash = "bookings";
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
  document.querySelectorAll("[data-provider-dashboard-open]").forEach((button) => {
    button.addEventListener("click", () => {
      isProfileDrawerOpen = false;
      resetProfileUiState();
      window.location.hash = "provider-dashboard";
    });
  });

  document.querySelectorAll("[data-provider-dashboard-section]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextSection = button.dataset.providerDashboardSection || "overview";
      const currentUser = authStore.getCurrentUser();
      const provider = providerDashboard.getProviderForUser(currentUser?.id);
      if (nextSection === "preview" && provider?.isPublished) {
        navigateToProvider(provider.providerId || provider.id, { returnTo: "provider-dashboard" });
        return;
      }
      activeProviderDashboardSection = nextSection;
      render();
    });
  });

  document.querySelectorAll("[data-booking-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      const currentUser = authStore.getCurrentUser();
      const outcome = await bookingStore.updateBookingStatus(currentUser, button.dataset.bookingId, button.dataset.bookingStatus);
      providerBookingError = outcome.ok ? "" : outcome.error;
      if (outcome.ok) actionFeedback = outcome.booking.status === "accepted" ? "已接受预约。" : "已拒绝预约。";
      render();
    });
  });

  document.querySelectorAll("[data-provider-dashboard-preview]").forEach((button) => {
    button.addEventListener("click", () => {
      const currentUser = authStore.getCurrentUser();
      const provider = providerDashboard.getProviderForUser(currentUser?.id);
      if (provider?.isPublished) navigateToProvider(provider.providerId || provider.id, { returnTo: "provider-dashboard" });
      else showActionFeedback("请先创建并完善服务者主页。");
    });
  });

  document.querySelectorAll("[data-provider-dashboard-start]").forEach((button) => {
    button.addEventListener("click", () => {
      activeProviderDashboardSection = "profile";
      render();
    });
  });
  document.querySelectorAll("[data-region-scope]").forEach((select) => {
    select.addEventListener("change", () => {
      const form = select.form;
      if (form && select.dataset.regionLevel === "province") {
        const cityName = select.dataset.regionScope === "provider-portfolio" ? "portfolioCity" : "city";
        const districtName = select.dataset.regionScope === "provider-portfolio" ? "portfolioDistrict" : "district";
        if (form.elements[cityName]) form.elements[cityName].value = "";
        if (form.elements[districtName]) form.elements[districtName].value = "";
      }
      if (form && select.dataset.regionLevel === "city") {
        const districtName = select.dataset.regionScope === "provider-portfolio" ? "portfolioDistrict" : "district";
        if (form.elements[districtName]) form.elements[districtName].value = "";
      }
      if (select.dataset.regionScope === "provider-portfolio") syncProviderPortfolioDraftFromForm();
      else syncProviderDraftFromForm();
      render();
    });
  });
  document.querySelectorAll("[data-provider-profile-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      resetProviderProfileEditing();
      activeProviderDashboardSection = "overview";
      render();
    });
  });

  const providerAvatarInput = document.querySelector("#provider-avatar-input");
  if (providerAvatarInput) {
    providerAvatarInput.addEventListener("change", () => {
      const file = providerAvatarInput.files?.[0];
      if (!file) return;
      if (!["image/png", "image/jpeg"].includes(file.type)) {
        providerProfileError = "头像只支持 png / jpg / jpeg。";
        render();
        return;
      }
      syncProviderDraftFromForm();
      readImageFileAsOptimizedDataUrl(file, (dataUrl) => {
        providerProfileDraft = { ...(providerProfileDraft || {}), avatar: dataUrl };
        providerProfileError = "";
        render();
      });
    });
  }

  const providerProfileForm = document.querySelector("#provider-profile-form");
  if (providerProfileForm) {
    providerProfileForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const currentUser = authStore.getCurrentUser();
      if (!currentUser || currentUser.role !== "provider") return;
      const draft = syncProviderDraftFromForm();
      if (!draft.name) {
        providerProfileError = "服务者名称不能为空。";
        render();
        return;
      }
      if (!draft.category) {
        providerProfileError = "请选择服务类别。";
        render();
        return;
      }
      if (!draft.location?.city) {
        providerProfileError = "城市不能为空。";
        render();
        return;
      }
      if (!Number.isFinite(draft.priceFrom) || draft.priceFrom < 0) {
        providerProfileError = "起步价必须为非负数字。";
        render();
        return;
      }
      const outcome = providerStore.updateProviderProfile(currentUser.id, { ...draft, email: currentUser.email });
      if (!outcome.ok) {
        providerProfileError = outcome.error;
        render();
        return;
      }
      resetProviderProfileEditing();
      activeProviderDashboardSection = "overview";
      showActionFeedback("主页资料已保存，并同步到公开服务者主页。");
    });
  }
  document.querySelectorAll("[data-provider-service-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const currentUser = authStore.getCurrentUser();
      const provider = getProviderProfileForUser(currentUser);
      const service = provider?.services.find((item) => item.id === button.dataset.providerServiceEdit);
      if (!service) return;
      providerServiceEditingId = service.id;
      providerServiceDraft = { ...service };
      providerServiceError = "";
      activeProviderDashboardSection = "services";
      render();
    });
  });

  document.querySelectorAll("[data-provider-service-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      resetProviderServiceEditing();
      render();
    });
  });

  document.querySelectorAll("[data-provider-service-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const currentUser = authStore.getCurrentUser();
      if (!currentUser || currentUser.role !== "provider") return;
      if (!window.confirm("确定删除这个服务项目吗？")) return;
      const provider = getProviderProfileForUser(currentUser);
      const services = (provider?.services || []).filter((service) => service.id !== button.dataset.providerServiceDelete);
      saveProviderServicesForUser(currentUser, services, "服务项目已删除，并同步到公开主页。");
    });
  });

  const providerServiceForm = document.querySelector("#provider-service-form");
  if (providerServiceForm) {
    providerServiceForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const currentUser = authStore.getCurrentUser();
      if (!currentUser || currentUser.role !== "provider") return;
      const provider = getProviderProfileForUser(currentUser);
      const draft = syncProviderServiceDraftFromForm();
      if (!draft.title) {
        providerServiceError = "服务名称不能为空。";
        render();
        return;
      }
      if (!Number.isFinite(draft.price) || draft.price < 0) {
        providerServiceError = "价格必须为非负数字。";
        render();
        return;
      }
      if (!draft.duration) {
        providerServiceError = "时长不能为空。";
        render();
        return;
      }
      const services = provider?.services || [];
      const editingId = providerServiceEditingId;
      const service = {
        id: editingId || createProviderServiceId(provider),
        title: draft.title,
        name: draft.title,
        description: draft.description,
        price: draft.price,
        duration: draft.duration,
        category: provider?.category || "makeup",
      };
      const nextServices = editingId ? services.map((item) => (item.id === editingId ? { ...item, ...service, id: item.id } : item)) : [...services, service];
      saveProviderServicesForUser(currentUser, nextServices, editingId ? "服务项目已更新，并同步到公开主页。" : "服务项目已新增，并同步到公开主页。");
    });
  }
  document.querySelectorAll("[data-provider-portfolio-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const currentUser = authStore.getCurrentUser();
      const provider = getProviderProfileForUser(currentUser);
      const item = provider?.portfolioItems.find((portfolioItem) => portfolioItem.id === button.dataset.providerPortfolioEdit);
      if (!item) return;
      providerPortfolioEditingId = item.id;
      providerPortfolioDraft = { ...item, images: [...(item.images || [])] };
      providerPortfolioError = "";
      activeProviderDashboardSection = "portfolio";
      render();
    });
  });

  document.querySelectorAll("[data-provider-portfolio-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      resetProviderPortfolioEditing();
      render();
    });
  });

  document.querySelectorAll("[data-provider-portfolio-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const currentUser = authStore.getCurrentUser();
      if (!currentUser || currentUser.role !== "provider") return;
      if (!window.confirm("确定删除这个作品吗？")) return;
      const provider = getProviderProfileForUser(currentUser);
      const items = (provider?.portfolioItems || []).filter((item) => item.id !== button.dataset.providerPortfolioDelete);
      saveProviderPortfolioForUser(currentUser, items, "作品已删除，并同步到公开主页。");
    });
  });

  const providerPortfolioImageInput = document.querySelector("#provider-portfolio-image-input");
  if (providerPortfolioImageInput) {
    providerPortfolioImageInput.addEventListener("change", () => {
      const file = providerPortfolioImageInput.files?.[0];
      if (!file) return;
      if (!["image/png", "image/jpeg"].includes(file.type)) {
        providerPortfolioError = "封面图只支持 png / jpg / jpeg。";
        render();
        return;
      }
      syncProviderPortfolioDraftFromForm();
      readImageFileAsOptimizedDataUrl(file, (dataUrl) => {
        providerPortfolioDraft = { ...(providerPortfolioDraft || {}), images: [dataUrl] };
        providerPortfolioError = "";
        render();
      });
    });
  }

  const providerPortfolioForm = document.querySelector("#provider-portfolio-form");
  if (providerPortfolioForm) {
    providerPortfolioForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const currentUser = authStore.getCurrentUser();
      if (!currentUser || currentUser.role !== "provider") return;
      const provider = getProviderProfileForUser(currentUser);
      const draft = syncProviderPortfolioDraftFromForm();
      if (!draft.title) {
        providerPortfolioError = "作品标题不能为空。";
        render();
        return;
      }
      const items = provider?.portfolioItems || [];
      const editingId = providerPortfolioEditingId;
      const item = {
        id: editingId || createProviderPortfolioId(provider),
        title: draft.title,
        images: draft.images || [],
        character: draft.character,
        sourceWork: draft.sourceWork,
        location: draft.location,
        styles: draft.styles || [],
        tags: draft.styles || [],
        description: draft.description,
        likes: Number(draft.likes || 0),
        comments: Number(draft.comments || 0),
      };
      const nextItems = editingId ? items.map((existing) => (existing.id === editingId ? { ...existing, ...item, id: existing.id } : existing)) : [...items, item];
      saveProviderPortfolioForUser(currentUser, nextItems, editingId ? "作品已更新，并同步到公开主页。" : "作品已新增，并同步到公开主页。");
    });
  }

  document.querySelectorAll("[data-provider-schedule-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const currentUser = authStore.getCurrentUser();
      if (!currentUser || currentUser.role !== "provider") return;
      const provider = getProviderProfileForUser(currentUser);
      const dates = (provider?.availableDates || []).filter((date) => date !== button.dataset.providerScheduleDelete);
      saveProviderScheduleForUser(currentUser, dates, "档期已删除，并同步到公开主页与推荐匹配。");
    });
  });

  const providerScheduleForm = document.querySelector("#provider-schedule-form");
  if (providerScheduleForm) {
    providerScheduleForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const currentUser = authStore.getCurrentUser();
      if (!currentUser || currentUser.role !== "provider") return;
      const provider = getProviderProfileForUser(currentUser);
      const formData = new FormData(providerScheduleForm);
      const date = String(formData.get("availableDate") || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        providerScheduleError = "请选择有效日期。";
        render();
        return;
      }
      if (date < todayIso()) {
        providerScheduleError = "不能添加今天之前的过去日期。";
        render();
        return;
      }
      const dates = provider?.availableDates || [];
      if (dates.includes(date)) {
        providerScheduleError = "这个日期已经在档期中。";
        render();
        return;
      }
      saveProviderScheduleForUser(currentUser, [...dates, date], "档期已新增，并同步到公开主页与推荐匹配。");
    });
  }

  document.querySelectorAll("[data-auth-logout]").forEach((button) => {
    button.addEventListener("click", () => {
      authStore.logout();
      isProfileDrawerOpen = false;
      resetProfileUiState();
      render();
    });
  });

  document.onkeydown = (event) => {
    if (event.key === "Escape" && isBookingModalOpen) {
      closeBookingModal();
      render();
      return;
    }
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
    passwordForm.addEventListener("submit", async (event) => {
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
      const outcome = await authStore.changePassword({ currentPassword, newPassword });
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
    authForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (isAuthSubmitting) return;
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
      }

      isAuthSubmitting = true;
      authError = "";
      render();
      try {
        outcome = authMode === "register"
          ? await authStore.register({ email, password, role: formData.get("role") })
          : await authStore.login({ email, password });
      } catch (error) {
        console.error("Auth request failed", error);
        outcome = { ok: false, error: "网络请求失败，请检查连接后重试。" };
      } finally {
        isAuthSubmitting = false;
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
function renderProviderDashboardPage() {
  const currentUser = authStore.getCurrentUser();
  if (!currentUser) return renderLoginRequiredState("进入服务者工作台前需要登录");
  if (currentUser.role !== "provider") return providerDashboard.renderForbidden();
  const provider = getProviderProfileForUser(currentUser);
  const bookings = bookingStore.getBookingsByProvider(provider?.providerId || provider?.id, currentUser.id).map((booking) => ({ ...booking, serviceName: getServiceById(booking.providerId, booking.serviceId)?.name || getServiceById(booking.providerId, booking.serviceId)?.title || "服务项目已失效" }));
  return providerDashboard.renderDashboard({ currentUser, provider: providerProfileDraft || provider, activeSection: activeProviderDashboardSection, profileError: providerProfileError, serviceState: { editingId: providerServiceEditingId, draft: providerServiceDraft, error: providerServiceError }, portfolioState: { editingId: providerPortfolioEditingId, draft: providerPortfolioDraft, error: providerPortfolioError }, scheduleError: providerScheduleError, bookingState: { bookings, error: providerBookingError } });
}
function renderMainContent(route) {
  if (route.name === "provider") {
    return renderProviderProfile(route.providerId);
  }
  if (route.name === "providerDashboard") {
    return renderProviderDashboardPage();
  }
  if (route.name === "bookings") {
    return renderCustomerBookingsPage();
  }
  if (route.name === "plans") {
    return renderSavedPlansPage();
  }
  if (route.name === "plan") {
    return renderSavedPlanDetail(route.planId);
  }

  return `
      ${renderComposer()}
      ${renderAgentUnderstanding()}
      ${hasGeneratedPlan ? renderParsedSummary() : ""}
      ${hasGeneratedPlan ? renderFinalPlan() : ""}
      ${hasGeneratedPlan ? renderPlans() : ""}
      ${hasGeneratedPlan ? renderBriefs() : ""}
      <div id="providers">${renderProviders()}</div>
  `;
}

function renderPrimaryNav(route) {
  const hash = window.location.hash.replace(/^#/, "");
  const active = route.name === "plans" || route.name === "plan"
    ? "plans"
    : route.name === "bookings"
      ? "bookings"
      : route.name === "provider" || hash === "providers"
        ? "providers"
        : "planner";
  const items = [
    ["planner", "#planner", "开始规划"],
    ["providers", "#providers", "找创作伙伴"],
    ["plans", "#plans", "我的方案"],
    ["bookings", "#bookings", "我的预约"],
  ];
  return `<nav aria-label="主导航">${items.map(([id, href, label]) => `<a href="${href}" ${active === id ? 'class="active" aria-current="page"' : ""}>${label}</a>`).join("")}</nav>`;
}

function render() {
  const route = getCurrentRoute();
  syncRouteState(route);
  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#"><span>CP</span><strong>CosPilot</strong></a>
      <div class="topbar-right">
        ${renderPrimaryNav(route)}
        ${renderAuthNav()}
      </div>
    </header>
    <main>
      ${renderMainContent(route)}
    </main>
    ${renderAuthModal()}
    ${renderBookingModal()}
    ${renderMyDrawer()}
    ${renderActionFeedback()}
  `;
  bindEvents();
}

window.addEventListener("hashchange", render);
render();













































async function hydrateBookingsForCurrentUser() {
  const currentUser = authStore.getCurrentUser();
  if (!currentUser) return;
  await bookingStore.hydrateForUser(currentUser.id);
}

async function refreshPublishedProviderData() {
  if (!window.cospilotSupabase?.enabled()) return;
  await window.cospilotSupabase.hydratePublishedProviders();
  result = runCosPilotPipelineRef(naturalInput);
  requirement = result.requirement;
  selectedPlanIndex = Math.min(selectedPlanIndex, Math.max(result.plans.length - 1, 0));
}

window.addEventListener("cospilot:auth-change", async (event) => {
  const user = event.detail?.user;
  if (user) {
    await window.cospilotSupabase?.hydrateUserData(user);
  }
  await Promise.all([refreshPublishedProviderData(), hydrateBookingsForCurrentUser()]);
  render();
});

Promise.all([refreshPublishedProviderData(), hydrateBookingsForCurrentUser()]).then(render);
