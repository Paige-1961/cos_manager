(function () {
  const SECTIONS = [
    { id: "overview", label: "概览", title: "工作台概览", description: "查看公开主页的基础状态和关键运营指标。" },
    { id: "profile", label: "主页资料", title: "主页资料", description: "编辑公开主页的头像、名称、类别、简介、地点、风格标签和价格信息。" },
    { id: "services", label: "服务项目", title: "服务项目", description: "管理公开主页展示的服务项目、价格和时长。" },
    { id: "portfolio", label: "作品管理", title: "作品管理", description: "管理公开主页展示的作品封面、角色、出处和风格。" },
    { id: "schedule", label: "档期管理", title: "档期管理", description: "下一阶段可在这里维护可预约日期。" },
    { id: "preview", label: "预览主页", title: "预览主页", description: "查看当前服务者公开主页的展示效果。" },
  ];

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatCurrency(value) {
    return `¥${Number(value || 0).toLocaleString("zh-CN")}`;
  }

  function getProviderForUser(userId) {
    if (!userId) return null;
    if (window.providerStore?.getProviderByUserId) return window.providerStore.getProviderByUserId(userId);
    if (!window.providerData) return null;
    return window.providerData.getAllProviders().find((provider) => provider.userId === userId) || null;
  }

  function completeness(provider) {
    if (!provider) return 0;
    const hasBasicProfile = Boolean(provider.name && provider.bio && provider.location?.city && provider.styles?.length);
    const hasService = Boolean(provider.services?.length);
    const hasPortfolio = Boolean(provider.portfolioItems?.length || provider.portfolio?.length);
    const hasAvailableDate = Boolean(provider.availableDates?.length);
    const checks = [hasBasicProfile, hasService, hasPortfolio, hasAvailableDate];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }

  function navButton(section, activeSection) {
    return `<button class="provider-dashboard-nav-item ${activeSection === section.id ? "active" : ""}" data-provider-dashboard-section="${section.id}" type="button">${section.label}</button>`;
  }

  function metric(label, value) {
    return `<article class="provider-dashboard-metric"><span>${label}</span><strong>${value}</strong></article>`;
  }

  function renderOverview(provider) {
    if (!provider || !provider.isPublished) {
      return `
        <section class="provider-dashboard-empty panel interactive-surface">
          <p class="eyebrow">Profile</p>
          <h3>你的服务者主页尚未创建</h3>
          <p>当前账号还没有绑定到任何服务者公开主页。下一阶段会加入资料创建和编辑能力。</p>
          <button class="primary-action interactive-surface" data-provider-dashboard-start="true" type="button">开始完善主页</button>
        </section>
      `;
    }

    const portfolioCount = provider.portfolioItems?.length || provider.portfolio?.length || 0;
    return `
      <section class="provider-dashboard-summary panel interactive-surface">
        <div>
          <p class="eyebrow">Public Profile</p>
          <h3>${escapeHtml(provider.name)}</h3>
          <p>${escapeHtml(provider.bio)}</p>
        </div>
        <div class="provider-dashboard-metrics">
          ${metric("主页完整度", `${completeness(provider)}%`)}
          ${metric("服务项目", provider.services?.length || 0)}
          ${metric("作品数量", portfolioCount)}
          ${metric("可预约日期", provider.availableDates?.length || 0)}
          ${metric("评分", provider.rating || "暂无")}
          ${metric("已服务", provider.completedOrders || 0)}
        </div>
      </section>
    `;
  }

  function renderPlaceholder(section, provider) {
    if (section.id === "preview") {
      if (provider?.isPublished) {
        return `
          <section class="panel interactive-surface provider-dashboard-placeholder">
            <p class="eyebrow">Preview</p>
            <h3>预览公开主页</h3>
            <p>点击下方按钮进入当前服务者公开主页。</p>
            <button class="primary-action interactive-surface" data-provider-dashboard-preview="true" type="button">预览主页</button>
          </section>
        `;
      }
      return `
        <section class="panel interactive-surface provider-dashboard-placeholder">
          <p class="eyebrow">Preview</p>
          <h3>请先创建并完善服务者主页</h3>
          <p>当前账号还没有可预览的公开主页。</p>
        </section>
      `;
    }

    return `
      <section class="panel interactive-surface provider-dashboard-placeholder">
        <p class="eyebrow">Coming Next</p>
        <h3>${section.title}</h3>
        <p>${section.description}</p>
        <div class="provider-dashboard-skeleton"><span></span><span></span><span></span></div>
      </section>
    `;
  }


  function categoryOptions(currentCategory) {
    return Object.entries(CATEGORY_LABELS).map(([value, label]) => `<option value="${value}" ${currentCategory === value ? "selected" : ""}>${label}</option>`).join("");
  }

  function avatarEditor(provider) {
    if (provider?.avatar) return `<span class="avatar-placeholder large-avatar avatar-image"><img src="${escapeHtml(provider.avatar)}" alt="头像" /></span>`;
    const initial = escapeHtml(String(provider?.name || "P").slice(0, 1).toUpperCase());
    return `<span class="avatar-placeholder large-avatar">${initial}</span>`;
  }

  function renderProfileForm(provider, profileError) {
    const draft = provider || {};
    const location = draft.location || {};
    return `
      <form id="provider-profile-form" class="panel interactive-surface provider-profile-form">
        <div class="provider-form-heading">
          <p class="eyebrow">Profile</p>
          <h3>主页基础资料</h3>
          <p>保存后会同步到公开服务者主页。</p>
        </div>
        <div class="provider-avatar-editor account-summary-card">
          ${avatarEditor(draft)}
          <label>
            <span>头像</span>
            <input id="provider-avatar-input" type="file" accept="image/png,image/jpeg" />
          </label>
        </div>
        <div class="provider-profile-fields">
          <label><span>服务者名称</span><input name="name" value="${escapeHtml(draft.name || "")}" required /></label>
          <label><span>服务类别</span><select name="category" required>${categoryOptions(draft.category || "makeup")}</select></label>
          <label class="wide-field"><span>简介</span><textarea name="bio" rows="4">${escapeHtml(draft.bio || "")}</textarea></label>
          <label><span>省</span><input name="province" value="${escapeHtml(location.province || "")}" /></label>
          <label><span>市</span><input name="city" value="${escapeHtml(location.city || "")}" required /></label>
          <label><span>区</span><input name="district" value="${escapeHtml(location.district || "")}" /></label>
          <label class="wide-field"><span>风格标签</span><input name="styles" value="${escapeHtml((draft.styles || []).join("，"))}" placeholder="电影感，暗调，棚拍" /></label>
          <label><span>起步价</span><input name="priceFrom" type="number" min="0" step="1" value="${Number(draft.priceFrom || 0)}" required /></label>
          <label><span>平均回复时间</span><input name="responseTime" value="${escapeHtml(draft.responseTime || "当天回复")}" /></label>
          <label class="provider-checkbox"><input name="acceptsOnsite" type="checkbox" ${draft.acceptsOnsite ? "checked" : ""} /><span>接受上门服务</span></label>
          <label class="provider-checkbox"><input name="supportsTrialConsult" type="checkbox" ${draft.supportsTrialConsult ? "checked" : ""} /><span>支持提前试妆 / 方案沟通</span></label>
        </div>
        ${profileError ? `<p class="auth-error">${escapeHtml(profileError)}</p>` : ""}
        <div class="account-drawer-actions provider-form-actions">
          <button class="secondary-action interactive-surface" data-provider-profile-cancel="true" type="button">取消</button>
          <button class="primary-action interactive-surface" type="submit">保存主页资料</button>
        </div>
      </form>
    `;
  }

  function renderServiceCard(service) {
    return `
      <article class="provider-service-card">
        <div>
          <strong>${escapeHtml(service.title || service.name)}</strong>
          <p>${escapeHtml(service.description || "暂无简介")}</p>
          <small>${escapeHtml(service.duration || "未设置时长")}</small>
        </div>
        <b>${formatCurrency(service.price)}</b>
        <div class="provider-service-actions">
          <button class="secondary-action interactive-surface" data-provider-service-edit="${escapeHtml(service.id)}" type="button">编辑</button>
          <button class="secondary-action interactive-surface" data-provider-service-delete="${escapeHtml(service.id)}" type="button">删除</button>
        </div>
      </article>
    `;
  }

  function renderServicesManager(provider, serviceState = {}) {
    const services = provider?.services || [];
    const editingService = services.find((service) => service.id === serviceState.editingId) || null;
    const draft = serviceState.draft || editingService || { title: "", description: "", price: "", duration: "" };
    const isEditing = Boolean(editingService);
    const empty = services.length === 0;
    return `
      <section class="provider-services-manager panel interactive-surface">
        <div class="provider-form-heading">
          <p class="eyebrow">Services</p>
          <h3>服务项目</h3>
          <p>${empty ? "还没有服务项目。" : "这些服务会展示在你的公开主页中。"}</p>
        </div>
        ${empty ? `<div class="provider-service-empty"><h4>还没有服务项目</h4><p>添加第一个服务，让客户知道可以预约什么。</p></div>` : `<div class="provider-service-list">${services.map(renderServiceCard).join("")}</div>`}
        <form id="provider-service-form" class="provider-service-form" data-editing-service-id="${escapeHtml(editingService?.id || "")}">
          <div class="provider-profile-fields">
            <label><span>服务名称</span><input name="title" value="${escapeHtml(draft.title || draft.name || "")}" required /></label>
            <label><span>价格</span><input name="price" type="number" min="0" step="1" value="${draft.price === "" ? "" : Number(draft.price || 0)}" required /></label>
            <label class="wide-field"><span>简介</span><textarea name="description" rows="3">${escapeHtml(draft.description || "")}</textarea></label>
            <label><span>时长</span><input name="duration" value="${escapeHtml(draft.duration || "")}" required /></label>
          </div>
          ${serviceState.error ? `<p class="auth-error">${escapeHtml(serviceState.error)}</p>` : ""}
          <div class="account-drawer-actions provider-form-actions">
            ${isEditing ? `<button class="secondary-action interactive-surface" data-provider-service-cancel="true" type="button">取消编辑</button>` : ""}
            <button class="primary-action interactive-surface" type="submit">${isEditing ? "保存服务" : empty ? "添加第一个服务" : "新增服务"}</button>
          </div>
        </form>
      </section>
    `;
  }

  function portfolioCover(item) {
    const image = item.images?.[0];
    if (image) return `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.title)}" />`;
    return `<span>${escapeHtml(String(item.title || "作").slice(0, 1))}</span>`;
  }

  function renderPortfolioCard(item) {
    return `
      <article class="provider-portfolio-card">
        <div class="provider-portfolio-cover">${portfolioCover(item)}</div>
        <div class="provider-portfolio-body">
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.character || "未设置角色")} · ${escapeHtml(item.sourceWork || "未设置作品")}</p>
          <small>${escapeHtml(item.location || "未设置地点")} · ${(item.styles || []).map(escapeHtml).join(" / ") || "未设置风格"}</small>
          ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
          <span>${Number(item.likes || 0)} likes · ${Number(item.comments || 0)} comments</span>
        </div>
        <div class="provider-service-actions">
          <button class="secondary-action interactive-surface" data-provider-portfolio-edit="${escapeHtml(item.id)}" type="button">编辑</button>
          <button class="secondary-action interactive-surface" data-provider-portfolio-delete="${escapeHtml(item.id)}" type="button">删除</button>
        </div>
      </article>
    `;
  }

  function renderPortfolioManager(provider, portfolioState = {}) {
    const items = provider?.portfolioItems || [];
    const editingItem = items.find((item) => item.id === portfolioState.editingId) || null;
    const draft = portfolioState.draft || editingItem || { title: "", images: [], character: "", sourceWork: "", location: "", styles: [], description: "" };
    const isEditing = Boolean(editingItem);
    const empty = items.length === 0;
    return `
      <section class="provider-portfolio-manager panel interactive-surface">
        <div class="provider-form-heading">
          <p class="eyebrow">Portfolio</p>
          <h3>作品管理</h3>
          <p>${empty ? "还没有作品。" : "这些作品会展示在你的公开主页作品区。"}</p>
        </div>
        ${empty ? `<div class="provider-service-empty"><h4>还没有作品</h4><p>添加第一个作品，展示你的出片风格。</p></div>` : `<div class="provider-portfolio-grid">${items.map(renderPortfolioCard).join("")}</div>`}
        <form id="provider-portfolio-form" class="provider-service-form" data-editing-portfolio-id="${escapeHtml(editingItem?.id || "")}">
          <div class="provider-avatar-editor account-summary-card">
            <div class="provider-portfolio-cover preview-cover">${portfolioCover(draft)}</div>
            <label>
              <span>封面图</span>
              <input id="provider-portfolio-image-input" type="file" accept="image/png,image/jpeg" />
            </label>
          </div>
          <div class="provider-profile-fields">
            <label><span>作品标题</span><input name="title" value="${escapeHtml(draft.title || "")}" required /></label>
            <label><span>角色</span><input name="character" value="${escapeHtml(draft.character || "")}" /></label>
            <label><span>所属作品</span><input name="sourceWork" value="${escapeHtml(draft.sourceWork || "")}" /></label>
            <label><span>地点</span><input name="location" value="${escapeHtml(draft.location || "")}" /></label>
            <label class="wide-field"><span>风格标签</span><input name="styles" value="${escapeHtml((draft.styles || []).join("，"))}" placeholder="电影感，暗调，棚拍" /></label>
            <label class="wide-field"><span>描述</span><textarea name="description" rows="3">${escapeHtml(draft.description || "")}</textarea></label>
          </div>
          ${portfolioState.error ? `<p class="auth-error">${escapeHtml(portfolioState.error)}</p>` : ""}
          <div class="account-drawer-actions provider-form-actions">
            ${isEditing ? `<button class="secondary-action interactive-surface" data-provider-portfolio-cancel="true" type="button">取消编辑</button>` : ""}
            <button class="primary-action interactive-surface" type="submit">${isEditing ? "保存作品" : empty ? "添加第一个作品" : "新增作品"}</button>
          </div>
        </form>
      </section>
    `;
  }
  function renderContent(provider, activeSection, profileError, serviceState, portfolioState) {
    const section = SECTIONS.find((item) => item.id === activeSection) || SECTIONS[0];
    if (section.id === "overview") return renderOverview(provider);
    if (section.id === "profile") return renderProfileForm(provider, profileError);
    if (section.id === "services") return renderServicesManager(provider, serviceState);
    if (section.id === "portfolio") return renderPortfolioManager(provider, portfolioState);
    return renderPlaceholder(section, provider);
  }

  function renderDashboard({ currentUser, provider, activeSection, profileError, serviceState, portfolioState }) {
    const section = SECTIONS.find((item) => item.id === activeSection) || SECTIONS[0];
    const providerName = provider?.name || currentUser?.email || "服务者";
    return `
      <section class="provider-dashboard-page">
        <aside class="provider-dashboard-sidebar panel interactive-surface" aria-label="服务者工作台导航">
          <div>
            <p class="eyebrow">Provider</p>
            <h2>服务者工作台</h2>
            <small>${escapeHtml(providerName)}</small>
          </div>
          <nav>${SECTIONS.map((item) => navButton(item, section.id)).join("")}</nav>
        </aside>
        <section class="provider-dashboard-main">
          <header class="provider-dashboard-header panel interactive-surface">
            <p class="eyebrow">Dashboard</p>
            <h1>${section.title}</h1>
            <p>${section.description}</p>
          </header>
          ${renderContent(provider, section.id, profileError, serviceState, portfolioState)}
        </section>
      </section>
    `;
  }

  function renderForbidden() {
    return `
      <section class="provider-dashboard-page provider-dashboard-forbidden">
        <article class="panel interactive-surface">
          <p class="eyebrow">Provider Dashboard</p>
          <h1>该页面仅对服务者开放</h1>
          <p>请切换到服务者账号，或返回首页继续使用出片方案规划。</p>
          <a class="primary-action interactive-surface" href="#">返回首页</a>
        </article>
      </section>
    `;
  }

  window.providerDashboard = {
    sections: SECTIONS,
    getProviderForUser,
    renderDashboard,
    renderForbidden,
  };
})();











