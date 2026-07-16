(function () {
  const STORAGE_KEY = "cospilot.savedPlans.v1";

  function readPlans() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function writePlans(plans) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  }

  function clonePlan(plan) {
    return JSON.parse(JSON.stringify(plan));
  }

  function planKey(userId, plan) {
    return `${userId}:${plan?.id || "draft"}`;
  }

  function defaultTitle(plan) {
    const requirement = plan?.requirement || {};
    const work = requirement.sourceWork || requirement.fandom || "Cos 出片";
    const character = requirement.character || "方案";
    return `《${work}》${character} 出片方案`;
  }

  function savePlan(userId, plan) {
    if (!userId) return { ok: false, error: "请先登录。" };
    if (!plan || !plan.id) return { ok: false, error: "当前方案不可保存。" };

    const plans = readPlans();
    const key = planKey(userId, plan);
    const now = new Date().toISOString();
    const existingIndex = plans.findIndex((item) => item.userId === userId && item.planKey === key);
    const existing = existingIndex >= 0 ? plans[existingIndex] : null;
    const savedPlan = {
      id: existing?.id || `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      planKey: key,
      plan: clonePlan(plan),
      title: existing?.title || defaultTitle(plan),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    if (existingIndex >= 0) plans[existingIndex] = savedPlan;
    else plans.unshift(savedPlan);
    writePlans(plans);
    return { ok: true, plan: savedPlan, updatedExisting: existingIndex >= 0 };
  }

  function getPlansByUser(userId) {
    if (!userId) return [];
    return readPlans()
      .filter((item) => item.userId === userId)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  function getPlanById(userId, planId) {
    if (!userId || !planId) return null;
    return readPlans().find((item) => item.userId === userId && item.id === planId) || null;
  }

  function deletePlan(userId, planId) {
    const plans = readPlans();
    const nextPlans = plans.filter((item) => !(item.userId === userId && item.id === planId));
    writePlans(nextPlans);
    return nextPlans.length !== plans.length;
  }

  function updatePlanTitle(userId, planId, title) {
    const nextTitle = String(title || "").trim();
    if (!nextTitle) return { ok: false, error: "标题不能为空。" };
    const plans = readPlans();
    const index = plans.findIndex((item) => item.userId === userId && item.id === planId);
    if (index < 0) return { ok: false, error: "未找到该方案。" };
    plans[index] = { ...plans[index], title: nextTitle, updatedAt: new Date().toISOString() };
    writePlans(plans);
    return { ok: true, plan: plans[index] };
  }

  window.planStore = {
    savePlan,
    getPlansByUser,
    getPlanById,
    deletePlan,
    updatePlanTitle,
  };
})();
