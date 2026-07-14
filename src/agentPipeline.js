const REQUIRED_ROLES = ["makeup", "wig", "photographer", "studio"];

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
    return { dateStart: "2026-07-13", dateEnd: end, preferredDate: end, label: `${beforeMatch[1]}月${beforeMatch[2]}日前` };
  }

  const rangeMatch = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日)?\s*(?:到|至|-|~|—)\s*(?:(\d{1,2})\s*月)?\s*(\d{1,2})\s*日?/);
  if (rangeMatch) {
    const startMonth = Number(rangeMatch[1]);
    const startDay = Number(rangeMatch[2]);
    const endMonth = Number(rangeMatch[3] || rangeMatch[1]);
    const endDay = Number(rangeMatch[4]);
    return {
      dateStart: toISO(startMonth, startDay),
      dateEnd: toISO(endMonth, endDay),
      preferredDate: toISO(endMonth, endDay),
      label: `${startMonth}月${startDay}日-${endMonth}月${endDay}日`,
    };
  }

  const singleMatch = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (singleMatch) {
    const date = toISO(singleMatch[1], singleMatch[2]);
    return { dateStart: date, dateEnd: date, preferredDate: date, label: `${singleMatch[1]}月${singleMatch[2]}日` };
  }

  return {
    dateStart: defaultRequirement.dateStart,
    dateEnd: defaultRequirement.dateEnd,
    preferredDate: defaultRequirement.preferredDate,
    label: "近期可协调",
  };
}

function parseNaturalRequirement(text) {
  const cleanText = text.trim() || defaultRequirement.rawText;
  const fandom = cleanText.match(/《([^》]+)》/)?.[1] || defaultRequirement.fandom;
  const cities = ["北京", "上海", "广州", "深圳", "杭州", "成都", "南京", "武汉", "重庆", "天津"];
  const city = cities.find((item) => cleanText.includes(item)) || defaultRequirement.city;
  const budget = Number(cleanText.match(/(?:预算|控制在|不超过|以内|大概|约)?\s*(\d{3,5})\s*(?:元|块|rmb|RMB|¥)/)?.[1] || defaultRequirement.budget);
  const styleKeywords = ["电影感", "暗调", "清透", "甜系", "日系", "游戏", "自然光", "棚拍"];
  const foundStyles = styleKeywords.filter((style) => cleanText.includes(style));
  const style = foundStyles[0] || defaultRequirement.style;
  const ownedMap = ["服装", "假发", "妆造", "摄影", "摄影棚", "场地", "后期"];
  const ownedItems = ownedMap.filter((item) => new RegExp(`(已有|有|只有|自备|准备了).{0,8}${item}|${item}.{0,8}(已有|有|自备|准备了)`).test(cleanText));
  const characterFromAfterBook = cleanText.match(/》\s*([\u4e00-\u9fa5A-Za-z0-9:_-]{1,12})/)?.[1];
  const characterFromShoot = cleanText.match(/(?:拍|出|cos)\s*([\u4e00-\u9fa5A-Za-z0-9:_-]{1,12})/)?.[1];
  const character = characterFromAfterBook || characterFromShoot || defaultRequirement.character;
  const dateRange = parseDateRange(cleanText);

  return {
    rawText: cleanText,
    character,
    fandom,
    city,
    ...dateRange,
    budget,
    style,
    styleTags: foundStyles.length ? foundStyles : [style],
    ownedItems: ownedItems.length ? [...new Set(ownedItems.map((item) => (item === "场地" ? "摄影棚" : item)))] : defaultRequirement.ownedItems,
    notes: cleanText,
  };
}

function hasOwnedItem(requirement, keyword) {
  return requirement.ownedItems.some((item) => item.includes(keyword));
}

function isWithinRange(date, start, end) {
  return date >= start && date <= end;
}

function matchingDates(provider, requirement) {
  return provider.availableDates.filter((date) => isWithinRange(date, requirement.dateStart, requirement.dateEnd));
}

function displayDateRange(requirement) {
  return requirement.dateStart === requirement.dateEnd ? requirement.dateStart : `${requirement.dateStart} 至 ${requirement.dateEnd}`;
}

function styleScore(provider, requirement) {
  const tags = requirement.styleTags?.length ? requirement.styleTags : [requirement.style];
  return tags.reduce((score, style) => {
    if (provider.styles.includes(style)) return score + 3;
    if (provider.styles.some((tag) => style.includes(tag) || tag.includes(style))) return score + 1;
    return score;
  }, 0);
}

function providerScore(provider, requirement) {
  const city = provider.city === requirement.city || provider.district === "远程" ? 3 : 0;
  const date = matchingDates(provider, requirement).length ? 3 : -2;
  const style = styleScore(provider, requirement);
  const rating = Math.round(provider.rating);
  return city + date + style + rating;
}

function explainProvider(provider, requirement) {
  const reasons = [];
  const dates = matchingDates(provider, requirement);
  if (provider.city === requirement.city || provider.district === "远程") reasons.push(provider.district === "远程" ? "远程可交付" : `同城：${provider.city}${provider.district}`);
  if (dates.length) reasons.push(`区间内可约：${dates.join("、")}`);
  if (styleScore(provider, requirement) > 0) reasons.push(`风格相关：${provider.styles.filter((tag) => requirement.styleTags.includes(tag) || tag === requirement.style).join("、") || requirement.style}`);
  reasons.push(`¥${provider.price}`);
  return reasons;
}

function parseRequirement(rawInput) {
  const output = typeof rawInput === "string" ? parseNaturalRequirement(rawInput) : rawInput;
  return {
    id: "parse-requirement",
    title: "需求解析",
    input: output.rawText,
    output,
    explanation: `已识别：${output.city}，${displayDateRange(output)}，预算 ¥${output.budget}，角色《${output.fandom}》${output.character}，偏好 ${output.styleTags.join("/")}。`,
  };
}

function identifyGaps(requirement) {
  const missingRoles = REQUIRED_ROLES.filter((role) => {
    if (role === "makeup") return !hasOwnedItem(requirement, "妆");
    if (role === "wig") return !hasOwnedItem(requirement, "假发") && !hasOwnedItem(requirement, "发型");
    if (role === "photographer") return !hasOwnedItem(requirement, "摄影");
    if (role === "studio") return !hasOwnedItem(requirement, "棚") && !hasOwnedItem(requirement, "场地");
    return true;
  });
  const output = roleRequirements.filter((item) => missingRoles.includes(item.role)).map((item) => ({ role: item.role, label: item.label, optional: Boolean(item.optional) }));
  return {
    id: "identify-gaps",
    title: "任务缺口识别",
    input: requirement.ownedItems,
    output,
    explanation: `已有 ${requirement.ownedItems.join("、")}；还需要 ${output.map((item) => item.label).join("、")}。`,
  };
}

function screenCandidates(requirement, gaps) {
  const output = gaps.map((gap) => ({
    role: gap.role,
    label: gap.label,
    candidates: serviceProviders
      .filter((provider) => provider.role === gap.role)
      .map((provider) => ({ ...provider, matchScore: providerScore(provider, requirement), matchDates: matchingDates(provider, requirement), reasons: explainProvider(provider, requirement) }))
      .sort((a, b) => b.matchScore - a.matchScore),
  }));
  return { id: "screen-candidates", title: "候选服务者筛选", input: { city: requirement.city, dateRange: displayDateRange(requirement), style: requirement.styleTags }, output, explanation: "按地点、时间区间、风格标签、评分和价格筛选。" };
}

function checkConstraints(candidateGroups, requirement) {
  const output = candidateGroups.map((group) => ({
    role: group.role,
    label: group.label,
    candidates: group.candidates.map((candidate) => ({ id: candidate.id, name: candidate.name, passCity: candidate.city === requirement.city || candidate.district === "远程", passDate: candidate.matchDates.length > 0, passStyle: styleScore(candidate, requirement) > 0, price: candidate.price, matchScore: candidate.matchScore })),
  }));
  return { id: "check-constraints", title: "约束检查", input: "候选服务者列表", output, explanation: "检查地点、区间档期、风格和价格，保留可解释结果。" };
}

function buildCombinations(candidateGroups) {
  const topCandidates = candidateGroups.filter((group) => REQUIRED_ROLES.includes(group.role)).map((group) => group.candidates.slice(0, 2));
  const combinations = [];
  function walk(index, selected) {
    if (index === topCandidates.length) return combinations.push(selected);
    topCandidates[index].forEach((candidate) => walk(index + 1, [...selected, candidate]));
  }
  walk(0, []);
  return combinations;
}

function composePlans(candidateGroups, requirement) {
  const plans = buildCombinations(candidateGroups)
    .map((members) => {
      const total = members.reduce((sum, item) => sum + item.price, 0);
      const score = members.reduce((sum, item) => sum + item.matchScore, 0) - Math.max(total - requirement.budget, 0) / 50;
      const sharedDates = members.reduce((dates, member) => dates.filter((date) => member.availableDates.includes(date)), members[0]?.availableDates.filter((date) => isWithinRange(date, requirement.dateStart, requirement.dateEnd)) || []);
      return { id: members.map((item) => item.id).join("-"), members, total, score, sharedDates };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((plan, index) => ({ ...plan, name: ["推荐组合", "预算优先", "风格备选"][index] || `方案 ${index + 1}`, summary: plan.sharedDates.length ? `共同可约：${plan.sharedDates.join("、")}` : "成员无法在同一天全部到位，需要拆分或替换。" }));
  return { id: "compose-plans", title: "方案组合", input: "每类服务者 Top 候选", output: plans, explanation: "组合不同角色，并优先选择预算、风格和共同可约日期更稳的方案。" };
}

function budgetCheck(plans, requirement) {
  return { id: "budget-check", title: "预算检查", input: plans.map((plan) => ({ name: plan.name, total: plan.total })), output: plans.map((plan) => ({ planId: plan.id, name: plan.name, total: plan.total, budget: requirement.budget, status: plan.total <= requirement.budget ? "within-budget" : "over-budget", delta: plan.total - requirement.budget })), explanation: "标记预算压力，必要时触发低价替换。" };
}

function scheduleCheck(plans) {
  return { id: "schedule-check", title: "档期检查", input: "时间区间", output: plans.map((plan) => ({ planId: plan.id, name: plan.name, sharedDates: plan.sharedDates, conflicts: plan.sharedDates.length ? [] : plan.members.map((member) => ({ id: member.id, name: member.name, roleLabel: member.roleLabel })) })), explanation: "检查组合是否存在共同可约日期。" };
}

function resolveConflicts(plans, candidateGroups, requirement) {
  const output = plans.map((plan) => {
    let resolvedMembers = [...plan.members];
    const actions = [];
    let sharedDates = plan.sharedDates;

    if (!sharedDates.length) {
      for (const member of [...resolvedMembers]) {
        const group = candidateGroups.find((item) => item.role === member.role);
        const replacement = group?.candidates.find((candidate) => candidate.id !== member.id && candidate.matchDates.length);
        if (!replacement) continue;
        const attemptMembers = resolvedMembers.map((item) => (item.id === member.id ? replacement : item));
        const attemptDates = attemptMembers.reduce((dates, item) => dates.filter((date) => item.availableDates.includes(date)), attemptMembers[0].availableDates.filter((date) => isWithinRange(date, requirement.dateStart, requirement.dateEnd)));
        if (attemptDates.length) {
          actions.push(`为形成共同档期，将 ${member.roleLabel} ${member.name} 替换为 ${replacement.name}。`);
          resolvedMembers = attemptMembers;
          sharedDates = attemptDates;
          break;
        }
      }
    }

    let total = resolvedMembers.reduce((sum, item) => sum + item.price, 0);
    if (total > requirement.budget) {
      for (const member of [...resolvedMembers].sort((a, b) => b.price - a.price)) {
        const group = candidateGroups.find((item) => item.role === member.role);
        const replacement = group?.candidates.find((candidate) => candidate.id !== member.id && candidate.price < member.price && candidate.matchDates.length);
        if (!replacement) continue;
        resolvedMembers = resolvedMembers.map((item) => (item.id === member.id ? replacement : item));
        total = resolvedMembers.reduce((sum, item) => sum + item.price, 0);
        sharedDates = resolvedMembers.reduce((dates, item) => dates.filter((date) => item.availableDates.includes(date)), resolvedMembers[0].availableDates.filter((date) => isWithinRange(date, requirement.dateStart, requirement.dateEnd)));
        actions.push(`为控制预算，将 ${member.roleLabel} ${member.name} 替换为 ${replacement.name}。`);
        if (total <= requirement.budget) break;
      }
    }

    if (!actions.length) actions.push("无明显冲突，可进入沟通确认。");
    if (total > requirement.budget) actions.push(`仍超预算 ¥${total - requirement.budget}，建议扩大时间区间或调整预算。`);
    if (!sharedDates.length) actions.push("当前组合没有共同可约日期，需要人工确认或扩大时间区间。");

    return { planId: plan.id, name: plan.name, actions, resolvedMembers, total, sharedDates };
  });
  return { id: "resolve-conflicts", title: "冲突处理", input: "预算与档期检查结果", output, explanation: "先尝试统一档期，再处理预算压力，保留每次替换原因。" };
}

function generateBrief(resolvedPlans, requirement) {
  const bestPlan = resolvedPlans[0];
  const selectedDate = bestPlan.sharedDates[0] || requirement.preferredDate || requirement.dateEnd;
  const timeline = [
    { time: "确认前", task: "确认服务者档期、价格和拍摄风格参考。" },
    { time: "拍摄前 1-3 天", task: "发送角色参考、服装状态、妆造要求和棚景偏好。" },
    { time: selectedDate, task: "按共同档期完成妆造、棚拍和现场确认。" },
    { time: "拍摄后", task: "筛片、确认后期方向并跟进交付。" },
  ];
  const briefs = bestPlan.resolvedMembers.map((member) => ({ target: `${member.roleLabel}｜${member.name}`, message: `你好，我想在 ${displayDateRange(requirement)} 期间于${requirement.city}拍摄《${requirement.fandom}》${requirement.character}，风格偏${requirement.styleTags.join("/")}。目前已有${requirement.ownedItems.join("、")}，整体预算约 ¥${requirement.budget}。你的作品方向参考：${member.portfolio}。请问区间内是否可约，以及价格和准备事项？` }));
  return { id: "brief-output", title: "Brief 与计划输出", input: bestPlan, output: { selectedPlan: bestPlan, selectedDate, timeline, briefs }, explanation: "输出可直接沟通的 brief、预算和时间安排。" };
}

function runCosPilotPipeline(rawInput) {
  const step1 = parseRequirement(rawInput);
  const requirement = step1.output;
  const step2 = identifyGaps(requirement);
  const step3 = screenCandidates(requirement, step2.output);
  const step4 = checkConstraints(step3.output, requirement);
  const step5 = composePlans(step3.output, requirement);
  const step6 = budgetCheck(step5.output, requirement);
  const step7 = scheduleCheck(step5.output, requirement);
  const step8 = resolveConflicts(step5.output, step3.output, requirement);
  const step9 = generateBrief(step8.output, requirement);
  return { requirement, steps: [step1, step2, step3, step4, step5, step6, step7, step8, step9], candidates: step3.output, plans: step5.output, finalPlan: step9.output };
}

window.runCosPilotPipeline = runCosPilotPipeline;

