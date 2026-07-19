(function () {
  const ALLOWED_SERVICES = ["makeup", "wig", "photographer", "studio", "retoucher"];
  const CITY_NAMES = ["北京", "上海", "广州", "深圳", "杭州", "成都", "南京", "武汉", "重庆", "天津", "苏州", "西安", "长沙", "青岛"];

  function uniqueStrings(items) {
    return [...new Set((Array.isArray(items) ? items : []).map((item) => String(item || "").trim()).filter(Boolean))];
  }

  function explicitWorkAndCharacter(input) {
    const sourceWork = input.match(/《([^》]+)》/)?.[1]?.trim() || "";
    const characterSegment = input.match(/《[^》]+》\s*(?:中|里)?\s*(?:的)?\s*([^，。,.！!?\s]{1,30})/)?.[1]?.trim() || "";
    const character = characterSegment
      .split(/(?:的)?(?:角色扮演(?:写真)?|cosplay|cos|写真|正片|拍摄)/i)[0]
      .trim();
    return { sourceWork, character };
  }

  function monthOnlyRange(input) {
    const match = input.match(/(?:(20\d{2})\s*年\s*)?(\d{1,2})\s*月份?/);
    if (!match || /\d{1,2}\s*月\s*\d{1,2}\s*日?/.test(input)) return null;
    const now = new Date();
    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;
    const year = Number(match[1]) || (month < now.getMonth() + 1 ? now.getFullYear() + 1 : now.getFullYear());
    const endDay = new Date(year, month, 0).getDate();
    return {
      start: `${year}-${String(month).padStart(2, "0")}-01`,
      end: `${year}-${String(month).padStart(2, "0")}-${endDay}`,
      yearWasExplicit: Boolean(match[1]),
    };
  }

  function normalizeRequirement(input, rawRequirement, source) {
    const fallback = window.parseCosPilotRequirement(input);
    const raw = rawRequirement && typeof rawRequirement === "object" ? rawRequirement : {};
    const explicit = explicitWorkAndCharacter(input);
    const monthRange = monthOnlyRange(input);
    const isLlm = source === "llm";
    const hasDateMention = /(?:20\d{2}\s*年)?\s*\d{1,2}\s*月/.test(input);
    const rawRange = (isLlm || hasDateMention) && raw.dateRange && typeof raw.dateRange === "object" ? raw.dateRange : {};
    const cityMentioned = CITY_NAMES.some((city) => input.includes(city));
    const fallbackCharacter = input.match(/(?:拍|出|cos)\s*([\u4e00-\u9fa5A-Za-z0-9·:_-]{1,20})(?=\s|[，。,.！!?]|$)/i)?.[1] || "";
    const sourceWork = explicit.sourceWork || (isLlm ? String(raw.sourceWork || "").trim() : "");
    const character = explicit.character || (isLlm ? String(raw.character || "").trim() : fallbackCharacter);
    const city = String((isLlm ? raw.city : "") || (cityMentioned ? fallback.city : "")).trim();
    const district = raw.district ? String(raw.district).trim() : null;
    const start = String(monthRange?.start || rawRange.start || "").trim();
    const end = String(monthRange?.end || rawRange.end || start).trim();
    const fallbackBudgetMatch = input.match(/(?:预算|控制在|不超过|大概|只有)\s*[:：]?\s*(\d{2,5})(?:\s*(?:元|块|rmb|¥))?/i);
    const rawBudget = isLlm ? raw.budget : (fallbackBudgetMatch ? Number(fallbackBudgetMatch[1]) : null);
    const budgetValue = rawBudget === null || rawBudget === undefined || rawBudget === "" ? null : Number(rawBudget);
    const budget = Number.isFinite(budgetValue) && budgetValue >= 0 ? budgetValue : null;
    const styles = uniqueStrings(isLlm ? raw.styles : fallback.styles.filter((style) => input.includes(style)));
    const hasOwnedMention = /(已有|只有|自备|准备了)/.test(input);
    const ownedItems = uniqueStrings(isLlm ? raw.ownedItems : (hasOwnedMention ? fallback.ownedItems : []));
    const neededServices = uniqueStrings(raw.neededServices?.length ? raw.neededServices : fallback.neededServices).filter((item) => ALLOWED_SERVICES.includes(item));
    const clarificationQuestions = uniqueStrings(raw.clarificationQuestions);
    const missingFields = [];

    if (!sourceWork) missingFields.push("sourceWork");
    if (!character) missingFields.push("character");
    if (!city) missingFields.push("city");
    if (!start || !end) missingFields.push("dateRange");
    if (budget === null) missingFields.push("budget");
    if (!neededServices.length) missingFields.push("neededServices");

    const questionMap = {
      sourceWork: "请补充角色所属作品。",
      character: "请确认要拍摄的角色。",
      city: "为了推荐更合适的服务者，请确认拍摄城市。",
      dateRange: "请补充大致拍摄日期或日期区间。",
      budget: "请补充整体预算范围。",
      neededServices: "请确认需要妆造、假发、摄影、场地或后期中的哪些服务。",
    };
    missingFields.forEach((field) => clarificationQuestions.push(questionMap[field]));
    if (monthRange && !monthRange.yearWasExplicit) clarificationQuestions.push(`你提到的是 ${monthRange.start.slice(0, 7)}，请确认年份是否正确。`);

    const requirement = {
      rawText: input,
      sourceWork,
      fandom: sourceWork,
      character,
      city,
      district,
      dateRange: { start, end },
      dateStart: start,
      dateEnd: end,
      preferredDate: end || start,
      budget,
      styles,
      styleTags: styles,
      style: styles[0] || "未指定",
      ownedItems,
      neededServices,
      notes: input,
    };

    return {
      requirement,
      source,
      missingFields,
      clarificationQuestions: uniqueStrings(clarificationQuestions),
      canRecommend: missingFields.length === 0 && !(monthRange && !monthRange.yearWasExplicit),
    };
  }

  async function callLlm(input) {
    const config = window.COSPILOT_LLM_CONFIG || {};
    const client = window.cospilotSupabase?.client;
    if (!config.enabled || !client?.functions?.invoke) throw new Error("LLM endpoint is not configured.");
    const invocation = client.functions.invoke(config.functionName || "parse-requirement", {
      body: { input, currentDate: new Date().toISOString().slice(0, 10) },
    });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("LLM request timed out.")), config.timeoutMs || 15000));
    const { data, error } = await Promise.race([invocation, timeout]);
    if (error) {
      let message = error.message || "LLM request failed.";
      try {
        const response = error.context;
        if (response?.clone) {
          const payload = await response.clone().json();
          message = payload?.error || payload?.message || message;
        }
      } catch (parseError) {
        console.warn("Could not read Edge Function error response.", parseError);
      }
      throw new Error(message);
    }
    if (!data?.requirement) throw new Error("LLM returned no requirement.");
    return data.requirement;
  }

  async function understand(input) {
    const text = String(input || "").trim();
    if (!text) return normalizeRequirement("", {}, "fallback");
    try {
      return normalizeRequirement(text, await callLlm(text), "llm");
    } catch (error) {
      console.warn("LLM understanding unavailable; using local fallback.", error);
      return { ...normalizeRequirement(text, window.parseCosPilotRequirement(text), "fallback"), fallbackReason: error.message };
    }
  }

  window.requirementAgent = { understand, normalizeRequirement };
})();
