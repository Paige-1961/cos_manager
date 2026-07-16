(function () {
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function genderLabel(gender) {
    const labels = { female: "女", male: "男", other: "其他", hidden: "不公开" };
    return labels[gender] || labels.hidden;
  }

  function locationModeLabel(mode) {
    return mode === "precise" ? "精确定位" : "模糊定位";
  }

  function avatarMarkup(profile, fallbackText, sizeClass = "large-avatar") {
    const initial = escapeHtml(String(fallbackText || "C").slice(0, 1).toUpperCase());
    if (profile?.avatar) {
      return `<span class="avatar-placeholder ${sizeClass} avatar-image"><img src="${escapeHtml(profile.avatar)}" alt="头像" /></span>`;
    }
    return `<span class="avatar-placeholder ${sizeClass}">${initial}</span>`;
  }

  function renderProviderDrawer({ currentUser, provider }) {
    return `
      <div class="account-drawer-backdrop" data-profile-close="true">
        <aside class="account-drawer interactive-surface" role="dialog" aria-modal="true" aria-label="我的资料">
          <button class="account-drawer-close" data-profile-close="true" type="button">×</button>
          <div class="account-drawer-header">
            <p class="eyebrow">Account</p>
            <h2>我的资料</h2>
            <div class="account-summary account-summary-card">
              ${provider?.avatar ? `<span class="avatar-placeholder large-avatar avatar-image"><img src="${escapeHtml(provider.avatar)}" alt="头像" /></span>` : `<span class="avatar-placeholder large-avatar">${escapeHtml(String(provider?.name || currentUser.email).slice(0, 1).toUpperCase())}</span>`}
              <div>
                <strong>${escapeHtml(provider?.name || currentUser.email)}</strong>
                <small>服务者账号</small>
              </div>
            </div>
          </div>
          <dl class="account-details">
            <div><dt>Email</dt><dd>${escapeHtml(currentUser.email)}</dd></div>
            <div><dt>Role</dt><dd>${escapeHtml(currentUser.role)}</dd></div>
            <div><dt>说明</dt><dd>服务者资料将在下一阶段实现</dd></div>
            <div class="muted-account-id"><dt>User ID</dt><dd>${escapeHtml(currentUser.id)}</dd></div>
          </dl>
          <div class="account-drawer-actions">
            <button class="secondary-action interactive-surface" data-provider-dashboard-open="true" type="button">服务者工作台</button>
            <button class="primary-action interactive-surface" data-auth-logout="true" type="button">退出登录</button>
          </div>
        </aside>
      </div>
    `;
  }

  function renderCustomerView({ currentUser, profile, publicLocation, isPasswordModalOpen, passwordError }) {
    return `
      <div class="account-drawer-backdrop" data-profile-close="true">
        <aside class="account-drawer interactive-surface" role="dialog" aria-modal="true" aria-label="我的资料">
          <button class="account-drawer-close" data-profile-close="true" type="button">×</button>
          <div class="account-drawer-header">
            <p class="eyebrow">Account</p>
            <h2>我的资料</h2>
            <div class="account-summary account-summary-card">
              ${avatarMarkup(profile, profile.nickname)}
              <div>
                <strong>${escapeHtml(profile.nickname)}</strong>
                <small>客户账号 ID：${escapeHtml(currentUser.id)}</small>
              </div>
            </div>
          </div>
          <dl class="account-details profile-info-list">
            <div><dt>头像</dt><dd>${avatarMarkup(profile, profile.nickname, "small-avatar")}</dd></div>
            <div><dt>昵称</dt><dd>${escapeHtml(profile.nickname)}</dd></div>
            <div><dt>性别</dt><dd>${genderLabel(profile.gender)}</dd></div>
            <div><dt>当前定位</dt><dd>${escapeHtml(publicLocation)}</dd></div>
            <div><dt>公开范围</dt><dd>${locationModeLabel(profile.locationMode)}</dd></div>
            <div><dt>密码</dt><dd><span class="password-mask">••••••••</span><button class="text-action" data-password-open="true" type="button">修改密码</button></dd></div>
          </dl>
          <div class="account-drawer-actions">
            <button class="secondary-action interactive-surface" data-my-plans="true" type="button">我的方案</button>
            <button class="secondary-action interactive-surface" data-profile-edit="true" type="button">编辑</button>
            <button class="primary-action interactive-surface" data-auth-logout="true" type="button">退出登录</button>
          </div>
        </aside>
        ${isPasswordModalOpen ? renderPasswordModal(passwordError) : ""}
      </div>
    `;
  }

  function renderCustomerEdit({ profileDraft, profileError }) {
    const draft = profileDraft;
    return `
      <div class="account-drawer-backdrop" data-profile-close="true">
        <aside class="account-drawer interactive-surface" role="dialog" aria-modal="true" aria-label="编辑资料">
          <button class="account-drawer-close" data-profile-close="true" type="button">×</button>
          <form id="customer-profile-form">
            <div class="account-drawer-header">
              <p class="eyebrow">Coser Profile</p>
              <h2>编辑资料</h2>
              <div class="profile-avatar-editor account-summary-card">
                ${avatarMarkup(draft, draft.nickname)}
                <label>
                  <span>头像</span>
                  <input id="profile-avatar-input" type="file" accept="image/png,image/jpeg" />
                </label>
              </div>
            </div>
            <div class="profile-edit-fields">
              <label><span>昵称</span><input name="nickname" value="${escapeHtml(draft.nickname || "")}" required /></label>
              <label>
                <span>性别</span>
                <select name="gender">
                  <option value="female" ${draft.gender === "female" ? "selected" : ""}>女</option>
                  <option value="male" ${draft.gender === "male" ? "selected" : ""}>男</option>
                  <option value="other" ${draft.gender === "other" ? "selected" : ""}>其他</option>
                  <option value="hidden" ${draft.gender === "hidden" ? "selected" : ""}>不公开</option>
                </select>
              </label>
              <label><span>省</span><input name="province" value="${escapeHtml(draft.province || "")}" /></label>
              <label><span>市</span><input name="city" value="${escapeHtml(draft.city || "")}" /></label>
              <label><span>区</span><input name="district" value="${escapeHtml(draft.district || "")}" /></label>
              <fieldset class="location-mode-picker">
                <legend>定位公开方式</legend>
                <label><input type="radio" name="locationMode" value="precise" ${draft.locationMode === "precise" ? "checked" : ""} /><span>精确定位</span></label>
                <label><input type="radio" name="locationMode" value="fuzzy" ${draft.locationMode !== "precise" ? "checked" : ""} /><span>模糊定位</span></label>
              </fieldset>
              ${profileError ? `<p class="auth-error">${escapeHtml(profileError)}</p>` : ""}
            </div>
            <div class="account-drawer-actions">
              <button class="secondary-action interactive-surface" data-profile-cancel-edit="true" type="button">取消</button>
              <button class="primary-action interactive-surface" type="submit">保存</button>
            </div>
          </form>
        </aside>
      </div>
    `;
  }

  function renderPasswordModal(passwordError) {
    return `
      <section class="password-modal interactive-surface" role="dialog" aria-modal="true" aria-label="修改密码">
        <button class="auth-close" data-password-close="true" type="button">×</button>
        <div class="auth-heading">
          <p class="eyebrow">Password</p>
          <h2>修改密码</h2>
        </div>
        <form id="password-form" class="auth-form">
          <label><span>当前密码</span><input name="currentPassword" type="password" autocomplete="current-password" required /></label>
          <label><span>新密码</span><input name="newPassword" type="password" autocomplete="new-password" required /></label>
          <label><span>确认新密码</span><input name="confirmPassword" type="password" autocomplete="new-password" required /></label>
          ${passwordError ? `<p class="auth-error">${escapeHtml(passwordError)}</p>` : ""}
          <button class="primary-action interactive-surface" type="submit">保存新密码</button>
        </form>
      </section>
    `;
  }

  window.profileDrawer = {
    avatarMarkup,
    renderProviderDrawer,
    renderCustomerView,
    renderCustomerEdit,
  };
})();






