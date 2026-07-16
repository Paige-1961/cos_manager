(function () {
  const CATEGORY_LABELS = {
    makeup: "妆娘",
    wig: "毛娘/假发",
    photographer: "摄影师",
    studio: "摄影棚",
    retoucher: "后期",
  };

  function dateList(start, end) {
    if (!start || !end) return [];
    const dates = [];
    const [startYear, startMonth, startDay] = start.split("-").map(Number);
    const [endYear, endMonth, endDay] = end.split("-").map(Number);
    const current = new Date(Date.UTC(startYear, startMonth - 1, startDay));
    const last = new Date(Date.UTC(endYear, endMonth - 1, endDay));
    while (current <= last) {
      dates.push(current.toISOString().slice(0, 10));
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return dates;
  }

  function intersect(a = [], b = []) {
    return a.filter((item) => b.includes(item));
  }

  function responseScore(responseTime) {
    if (/1小时/.test(responseTime || "")) return 3;
    if (/2小时/.test(responseTime || "")) return 2;
    if (/4小时/.test(responseTime || "")) return 1;
    return 0.5;
  }

  function getServiceForCategory(provider, category) {
    return provider.services.find((service) => service.category === category) || provider.services[0];
  }

  function scoreProvider(provider, service, requirement) {
    const possibleDates = dateList(requirement.dateRange.start, requirement.dateRange.end);
    const matchedDates = intersect(provider.availableDates, possibleDates);
    const matchedStyles = intersect(provider.styles, requirement.styles);
    const sameCity = provider.location.city === requirement.city || provider.location.mode === "remote";
    const sameDistrict = requirement.district && provider.location.district === requirement.district;
    const categoryScore = provider.category === service.category ? 20 : 0;
    const locationScore = sameCity ? 10 + (sameDistrict ? 4 : 0) : -10;
    const dateScore = matchedDates.length ? 12 : -100;
    const styleScore = matchedStyles.length * 4;
    const ratingScore = Math.round(provider.rating * 1.5) + Math.min(provider.reviewCount, 80) / 20;
    const priceScore = Math.max(0, 10 - service.price / 80);
    const response = responseScore(provider.responseTime);
    return {
      score: Math.round((categoryScore + locationScore + dateScore + styleScore + ratingScore + priceScore + response) * 10) / 10,
      matchedDate: matchedDates[0] || null,
      matchedStyles,
      sameCity,
      sameDistrict,
    };
  }

  function recommendForCategory(requirement, category) {
    const providers = window.providerData.getAllProviders().filter((provider) => provider.category === category);
    const scored = providers
      .map((provider) => {
        const service = getServiceForCategory(provider, category);
        if (!service) return null;
        const scoring = scoreProvider(provider, service, requirement);
        if (!scoring.matchedDate) return null;
        return {
          providerId: provider.providerId,
          serviceId: service.id,
          category,
          price: service.price,
          score: scoring.score,
          matchedStyles: scoring.matchedStyles,
          matchedDate: scoring.matchedDate,
          reason: [
            scoring.sameCity ? `地点匹配：${provider.location.city}${provider.location.district}` : `非同城：${provider.location.city}${provider.location.district}`,
            `档期匹配：${scoring.matchedDate}`,
            scoring.matchedStyles.length ? `风格匹配：${scoring.matchedStyles.join("、")}` : "风格匹配较弱",
            `服务价格：¥${service.price}`,
          ].join("；"),
          provider,
          service,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.price - b.price);
    return scored;
  }

  function validateRecommendedService(item) {
    const provider = window.providerData.getProviderById(item.providerId);
    const service = provider ? window.providerData.getServiceById(item.providerId, item.serviceId) : null;
    return Boolean(provider && service && service.category === item.category);
  }

  function buildPlan(id, name, requirement, selected, candidateMap) {
    const providers = selected.filter(Boolean).filter(validateRecommendedService);
    const totalPrice = providers.reduce((sum, item) => sum + item.price, 0);
    const sharedDates = providers.length
      ? providers.reduce((dates, item) => dates.filter((date) => item.provider.availableDates.includes(date)), dateList(requirement.dateRange.start, requirement.dateRange.end))
      : [];
    const scheduledDate = sharedDates[0] || null;
    const warnings = [];
    const adjustments = [];

    requirement.neededServices.forEach((category) => {
      if (!providers.some((item) => item.category === category)) warnings.push(`未找到目标日期可约的${CATEGORY_LABELS[category] || category}`);
    });
    if (totalPrice > requirement.budget) warnings.push(`完整方案最低预算为 ¥${totalPrice}，超出当前预算 ¥${totalPrice - requirement.budget}`);
    if (!sharedDates.length && providers.length) warnings.push("当前组合没有共同可约日期，需要扩大时间区间或拆分拍摄。");
    Object.entries(candidateMap).forEach(([category, list]) => {
      if (!list.some((item) => item.provider.location.city === requirement.city || item.provider.location.mode === "remote")) {
        warnings.push(`当前仅找到跨城${CATEGORY_LABELS[category] || category}`);
      }
    });
    if (!warnings.length) adjustments.push("已通过类别、地点、日期、风格和预算校验。");
    if (warnings.length) adjustments.push("已保留可匹配部分，并标记缺口供人工确认。以下方案不编造不存在的服务者。",
    );

    return {
      id,
      name,
      requirement,
      providers,
      totalPrice,
      total: totalPrice,
      scheduledDate,
      sharedDates,
      reasons: providers.map((item) => item.reason),
      warnings,
      adjustments,
      actions: [...warnings, ...adjustments],
      resolvedMembers: providers.map((item) => ({
        ...item.provider,
        providerId: item.providerId,
        serviceId: item.serviceId,
        role: item.category,
        roleLabel: CATEGORY_LABELS[item.category] || item.category,
        price: item.price,
        matchScore: item.score,
        matchDates: item.matchedDate ? [item.matchedDate] : [],
        reasons: [item.reason],
        serviceName: item.service.name,
      })),
    };
  }

  function cartesianProduct(lists) {
    return lists.reduce((acc, list) => acc.flatMap((items) => list.map((item) => [...items, item])), [[]]);
  }

  function bestCompleteCombination(requirement, candidateMap, predicate) {
    const lists = requirement.neededServices.map((category) => (candidateMap[category] || []).slice(0, 5));
    if (!lists.length || lists.some((list) => !list.length)) return null;
    const combos = cartesianProduct(lists)
      .map((items) => ({ items, total: items.reduce((sum, item) => sum + item.price, 0), score: items.reduce((sum, item) => sum + item.score, 0) }))
      .filter((combo) => !predicate || predicate(combo))
      .sort((a, b) => b.score - a.score || a.total - b.total);
    return combos[0]?.items || null;
  }

  function buildCandidateGroups(requirement, candidateMap) {
    return requirement.neededServices.map((category) => ({
      role: category,
      category,
      label: CATEGORY_LABELS[category] || category,
      candidates: (candidateMap[category] || []).map((item) => ({
        ...item.provider,
        providerId: item.providerId,
        serviceId: item.serviceId,
        role: category,
        roleLabel: CATEGORY_LABELS[category] || category,
        price: item.price,
        matchScore: item.score,
        matchDates: item.matchedDate ? [item.matchedDate] : [],
        reasons: [item.reason],
        serviceName: item.service.name,
      })),
    }));
  }

  function recommend(requirement) {
    const candidateMap = Object.fromEntries(requirement.neededServices.map((category) => [category, recommendForCategory(requirement, category)]));
    const primary = requirement.neededServices.map((category) => candidateMap[category]?.[0]).filter(Boolean);
    const bestWithinBudget = bestCompleteCombination(requirement, candidateMap, (combo) => combo.total <= requirement.budget);
    const bestComplete = bestCompleteCombination(requirement, candidateMap);
    const budgetAware = bestWithinBudget || (primary[0] ? [primary[0]] : []);
    const styleAware = requirement.neededServices.map((category) => {
      const list = candidateMap[category] || [];
      return list.find((item) => item.matchedStyles.length) || list[0];
    }).filter(Boolean);

    const plans = [
      buildPlan("plan-recommended", "推荐组合", requirement, bestWithinBudget || primary, candidateMap),
      buildPlan("plan-budget", "预算优先", requirement, budgetAware, candidateMap),
      buildPlan("plan-style", "风格备选", requirement, styleAware.length === requirement.neededServices.length ? styleAware : bestComplete || styleAware, candidateMap),
    ].filter((plan, index, arr) => index === arr.findIndex((item) => item.providers.map((p) => p.providerId + p.serviceId).join("|") === plan.providers.map((p) => p.providerId + p.serviceId).join("|")));

    plans.sort((a, b) => {
      const aFullBudget = a.providers.length === requirement.neededServices.length && a.totalPrice <= requirement.budget;
      const bFullBudget = b.providers.length === requirement.neededServices.length && b.totalPrice <= requirement.budget;
      if (aFullBudget !== bFullBudget) return aFullBudget ? -1 : 1;
      return b.providers.reduce((sum, item) => sum + item.score, 0) - a.providers.reduce((sum, item) => sum + item.score, 0);
    });
    return { plans, candidateGroups: buildCandidateGroups(requirement, candidateMap) };
  }

  function validatePlan(plan) {
    return plan.providers.every(validateRecommendedService);
  }

  function validateLlmPlanOrNull(plan) {
    if (!plan || !Array.isArray(plan.providers)) return null;
    return validatePlan(plan) ? plan : null;
  }

  window.recommendationEngine = {
    recommend,
    validateRecommendedService,
    validatePlan,
    validateLlmPlanOrNull,
  };
})();

