const REQUIRED_CATEGORIES = ["makeup", "wig", "photographer", "studio"];
const CATEGORY_LABELS = {
  makeup: "妆娘",
  wig: "毛娘/假发",
  photographer: "摄影师",
  studio: "摄影棚",
  retoucher: "后期",
};

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toISO(month, day) {
  return `2026-${pad2(month)}-${pad2(day)}`;
}

function parseDateRange(text) {
  const beforeMatch = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?\s*(前|之前|以前)/);
  if (beforeMatch) {
    const end = toISO(beforeMatch[1], beforeMatch[2]);
    return { start: "2026-07-13", end, preferredDate: end, label: `${beforeMatch[1]}月${beforeMatch[2]}日前` };
  }

  const rangeMatch = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日)?\s*(?:到|至|-|~|—)\s*(?:(\d{1,2})\s*月)?\s*(\d{1,2})\s*日?/);
  if (rangeMatch) {
    const startMonth = Number(rangeMatch[1]);
    const startDay = Number(rangeMatch[2]);
    const endMonth = Number(rangeMatch[3] || rangeMatch[1]);
    const endDay = Number(rangeMatch[4]);
    return { start: toISO(startMonth, startDay), end: toISO(endMonth, endDay), preferredDate: toISO(endMonth, endDay), label: `${startMonth}月${startDay}日-${endMonth}月${endDay}日` };
  }

  const singleMatch = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (singleMatch) {
    const date = toISO(singleMatch[1], singleMatch[2]);
    return { start: date, end: date, preferredDate: date, label: `${singleMatch[1]}月${singleMatch[2]}日` };
  }

  return { start: defaultRequirement.dateStart, end: defaultRequirement.dateEnd, preferredDate: defaultRequirement.preferredDate, label: "近期可协调" };
}

function displayDateRange(requirement) {
  return requirement.dateRange.start === requirement.dateRange.end ? requirement.dateRange.start : `${requirement.dateRange.start} 至 ${requirement.dateRange.end}`;
}

function parseNeededServices(text, ownedItems) {
  const explicit = [];
  if (/妆|妆造|化妆/.test(text)) explicit.push("makeup");
  if (/假发|毛娘|发型|修毛/.test(text)) explicit.push("wig");
  if (/摄影|拍摄|摄影师/.test(text)) explicit.push("photographer");
  if (/棚|摄影棚|场地|影棚/.test(text)) explicit.push("studio");
  if (/后期|修图|精修|调色/.test(text)) explicit.push("retoucher");

  const hasExplicitServiceAsk = /需要|找|约|安排|包括/.test(text) && explicit.length;
  if (hasExplicitServiceAsk) return [...new Set(explicit)];

  return REQUIRED_CATEGORIES.filter((category) => {
    if (category === "makeup") return !ownedItems.some((item) => /妆/.test(item));
    if (category === "wig") return !ownedItems.some((item) => /假发|发型/.test(item));
    if (category === "photographer") return !ownedItems.some((item) => /摄影/.test(item));
    if (category === "studio") return !ownedItems.some((item) => /棚|场地/.test(item));
    return true;
  });
}

function parseNaturalRequirement(text) {
  const cleanText = String(text || "").trim() || defaultRequirement.rawText;
  const sourceWork = cleanText.match(/《([^》]+)》/)?.[1] || defaultRequirement.fandom;
  const cities = ["北京", "上海", "广州", "深圳", "杭州", "成都", "南京", "武汉", "重庆", "天津"];
  const districts = ["朝阳", "海淀", "东城", "西城", "通州", "丰台", "静安", "徐汇", "浦东", "天河"];
  const city = cities.find((item) => cleanText.includes(item)) || defaultRequirement.city;
  const district = districts.find((item) => cleanText.includes(item)) || null;
  const budget = Number(cleanText.match(/(?:预算|控制在|不超过|以内|大概|约|只有)?\s*(\d{2,5})\s*(?:元|块|rmb|RMB|¥)/)?.[1] || defaultRequirement.budget);
  const styleKeywords = ["电影感", "暗调", "清透", "甜系", "日系", "游戏", "自然光", "棚拍", "冷色调", "赛博", "高饱和", "哥特"];
  const styles = styleKeywords.filter((style) => cleanText.includes(style));
  const ownedMap = ["服装", "假发", "妆造", "摄影", "摄影棚", "场地", "后期"];
  const ownedItems = ownedMap.filter((item) => new RegExp(`(已有|有|只有|自备|准备了).{0,8}${item}|${item}.{0,8}(已有|有|自备|准备了)`).test(cleanText));
  const characterFromAfterBook = cleanText.match(/》\s*([\u4e00-\u9fa5A-Za-z0-9:_-]{1,12})/)?.[1];
  const characterFromShoot = cleanText.match(/(?:拍|出|cos)\s*([\u4e00-\u9fa5A-Za-z0-9:_-]{1,12})/)?.[1];
  const dateRange = parseDateRange(cleanText);
  const normalizedOwned = ownedItems.length ? [...new Set(ownedItems.map((item) => (item === "场地" ? "摄影棚" : item)))] : defaultRequirement.ownedItems;

  const requirement = {
    rawText: cleanText,
    character: characterFromAfterBook || characterFromShoot || defaultRequirement.character,
    sourceWork,
    fandom: sourceWork,
    city,
    district,
    dateRange: { start: dateRange.start, end: dateRange.end },
    dateStart: dateRange.start,
    dateEnd: dateRange.end,
    preferredDate: dateRange.preferredDate,
    budget,
    styles: styles.length ? styles : [defaultRequirement.style],
    styleTags: styles.length ? styles : [defaultRequirement.style],
    style: styles[0] || defaultRequirement.style,
    ownedItems: normalizedOwned,
    neededServices: [],
    notes: cleanText,
  };
  requirement.neededServices = parseNeededServices(cleanText, requirement.ownedItems);
  return requirement;
}

function parseRequirement(rawInput) {
  const output = typeof rawInput === "string" ? parseNaturalRequirement(rawInput) : rawInput;
  return {
    id: "parse-requirement",
    title: "需求解析",
    input: output.rawText,
    output,
    explanation: `已识别：${output.city}${output.district || ""}，${displayDateRange(output)}，预算 ¥${output.budget}，角色《${output.sourceWork}》${output.character}，偏好 ${output.styles.join("/")}。`,
  };
}

function identifyGaps(requirement) {
  const output = requirement.neededServices.map((category) => ({ role: category, category, label: CATEGORY_LABELS[category] || category }));
  return { id: "identify-gaps", title: "任务缺口识别", input: requirement.ownedItems, output, explanation: `已有 ${requirement.ownedItems.join("、") || "未明确"}；还需要 ${output.map((item) => item.label).join("、") || "暂无新增服务"}。` };
}

function checkConstraints(candidateGroups, requirement) {
  return {
    id: "check-constraints",
    title: "约束检查",
    input: "候选 Provider + Service",
    output: candidateGroups.map((group) => ({
      role: group.role,
      label: group.label,
      candidates: group.candidates.map((candidate) => ({ providerId: candidate.providerId, serviceId: candidate.serviceId, name: candidate.name, price: candidate.price, matchScore: candidate.matchScore, matchedDates: candidate.matchDates })),
    })),
    explanation: "已按类别、地点、日期、风格、服务价格、评分和响应速度进行可解释评分。",
  };
}

function budgetCheck(plans, requirement) {
  return { id: "budget-check", title: "预算检查", input: plans.map((plan) => ({ name: plan.name, total: plan.totalPrice })), output: plans.map((plan) => ({ planId: plan.id, name: plan.name, total: plan.totalPrice, budget: requirement.budget, status: plan.totalPrice <= requirement.budget ? "within-budget" : "over-budget", delta: plan.totalPrice - requirement.budget })), explanation: "总价基于具体 service.price，而不是 Provider 起步价。" };
}

function scheduleCheck(plans) {
  return { id: "schedule-check", title: "档期检查", input: "时间区间", output: plans.map((plan) => ({ planId: plan.id, name: plan.name, sharedDates: plan.sharedDates, scheduledDate: plan.scheduledDate, conflicts: plan.scheduledDate ? [] : plan.resolvedMembers.map((member) => ({ providerId: member.providerId, name: member.name })) })), explanation: "检查组合是否存在共同可约日期，并保留每个推荐服务的 matchedDate。" };
}

function resolveConflicts(plans) {
  return { id: "resolve-conflicts", title: "冲突处理", input: "预算与档期检查结果", output: plans, explanation: "无法满足全部条件时，不编造 Provider，而是在 warnings 中说明缺口。" };
}

function generateBrief(resolvedPlans, requirement) {
  const bestPlan = resolvedPlans[0] || { resolvedMembers: [], sharedDates: [], providers: [], totalPrice: 0, warnings: [] };
  const selectedDate = bestPlan.scheduledDate || requirement.preferredDate || requirement.dateRange.end;
  const timeline = [
    { time: "确认前", task: "确认服务者档期、价格和拍摄风格参考。" },
    { time: "拍摄前 1-3 天", task: "发送角色参考、服装状态、妆造要求和棚景偏好。" },
    { time: selectedDate, task: "按确认档期完成妆造、棚拍和现场确认。" },
    { time: "拍摄后", task: "筛片、确认后期方向并跟进交付。" },
  ];
  const briefs = bestPlan.resolvedMembers.map((member) => ({ providerId: member.providerId, serviceId: member.serviceId, target: `${member.roleLabel}｜${member.name}`, message: `你好，我想在 ${displayDateRange(requirement)} 期间于${requirement.city}拍摄《${requirement.sourceWork}》${requirement.character}，风格偏${requirement.styles.join("/")}。目前已有${requirement.ownedItems.join("、")}，整体预算约 ¥${requirement.budget}。想咨询「${member.serviceName}」在 ${member.matchDates?.[0] || selectedDate} 是否可约，以及准备事项。` }));
  return { id: "brief-output", title: "Brief 与计划输出", input: bestPlan, output: { selectedPlan: bestPlan, selectedDate, timeline, briefs }, explanation: "Brief 仅使用已验证的 providerId / serviceId 对应服务。" };
}

function simulateInvalidLlmPlanForTest() {
  return window.recommendationEngine.validateLlmPlanOrNull({ providers: [{ providerId: "provider-not-exist", serviceId: "svc-missing", category: "photographer" }] });
}

function runCosPilotPipeline(rawInput) {
  const step1 = parseRequirement(rawInput);
  const requirement = step1.output;
  const step2 = identifyGaps(requirement);
  const recommendation = window.recommendationEngine.recommend(requirement);
  const step3 = { id: "screen-candidates", title: "候选服务者筛选", input: { providerSource: "providerData.getAllProviders()", neededServices: requirement.neededServices }, output: recommendation.candidateGroups, explanation: "从统一 Provider 数据源读取，并按 category 分类筛选。" };
  const step4 = checkConstraints(step3.output, requirement);
  const step5 = { id: "compose-plans", title: "方案组合", input: "每类候选服务", output: recommendation.plans, explanation: "组合推荐服务，输出稳定 providerId / serviceId。" };
  const step6 = budgetCheck(step5.output, requirement);
  const step7 = scheduleCheck(step5.output);
  const step8 = resolveConflicts(step5.output);
  const step9 = generateBrief(step8.output, requirement);
  return { requirement, steps: [step1, step2, step3, step4, step5, step6, step7, step8, step9], candidates: step3.output, plans: step5.output, finalPlan: step9.output, llmValidationFallbackReady: simulateInvalidLlmPlanForTest() === null };
}

window.runCosPilotPipeline = runCosPilotPipeline;
window.parseCosPilotRequirement = parseNaturalRequirement;
