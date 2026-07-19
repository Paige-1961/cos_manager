const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SERVICE_CATEGORIES = ["makeup", "wig", "photographer", "studio", "retoucher"];

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const requirementSchema = {
  type: "object",
  additionalProperties: false,
  required: ["sourceWork", "character", "city", "district", "dateRange", "budget", "styles", "ownedItems", "neededServices", "clarificationQuestions"],
  properties: {
    sourceWork: { type: "string" },
    character: { type: "string" },
    city: { type: "string" },
    district: { type: ["string", "null"] },
    dateRange: {
      type: "object",
      additionalProperties: false,
      required: ["start", "end"],
      properties: { start: { type: "string" }, end: { type: "string" } },
    },
    budget: { type: ["number", "null"] },
    styles: { type: "array", items: { type: "string" } },
    ownedItems: { type: "array", items: { type: "string" } },
    neededServices: {
      type: "array",
      items: { type: "string", enum: SERVICE_CATEGORIES },
    },
    clarificationQuestions: { type: "array", items: { type: "string" } },
  },
};

function getProviderConfig() {
  const provider = (Deno.env.get("LLM_PROVIDER") || "openai").trim().toLowerCase();
  const defaultStyle = provider === "openai" ? "responses" : "chat-completions";
  const apiStyle = Deno.env.get("LLM_API_STYLE") || defaultStyle;
  const jsonMode = Deno.env.get("LLM_JSON_MODE") || "json-schema";
  if (!["responses", "chat-completions"].includes(apiStyle)) {
    throw new HttpError(500, "invalid_llm_api_style", "LLM_API_STYLE must be responses or chat-completions.");
  }
  if (!["json-schema", "json-object", "prompt"].includes(jsonMode)) {
    throw new HttpError(500, "invalid_llm_json_mode", "LLM_JSON_MODE must be json-schema, json-object, or prompt.");
  }

  const apiKey = Deno.env.get("LLM_API_KEY") || Deno.env.get("OPENAI_API_KEY") || Deno.env.get("OPEN_API_KEY");
  const model = Deno.env.get("LLM_MODEL") || Deno.env.get("OPENAI_MODEL") || "gpt-5";
  const baseUrl = (Deno.env.get("LLM_BASE_URL") || "https://api.openai.com/v1").replace(/\/+$/, "");
  const defaultPath = apiStyle === "responses" ? "responses" : "chat/completions";
  const endpoint = Deno.env.get("LLM_ENDPOINT") || `${baseUrl}/${defaultPath}`;
  if (!apiKey) throw new HttpError(500, "missing_llm_api_key", "LLM_API_KEY is not configured.");
  return { provider, apiStyle, jsonMode, apiKey, model, endpoint };
}

function buildInstructions(currentDate) {
  return `You are CosPilot's requirement understanding agent. Today is ${currentDate || "unknown"}. Extract only facts supported by the user's Chinese text and return one JSON object matching the supplied ProjectRequirement schema. Text inside 《》 is the sourceWork; a name grammatically attached after it is the character, and you must never replace that work by guessing from the character name. Use empty strings, null, or empty arrays when unknown. Dates use YYYY-MM-DD; if a month has no year, choose the next occurrence but ask the user to confirm the year. Infer neededServices conservatively from the request and ownedItems, using only makeup, wig, photographer, studio, retoucher. Typical cosplay shooting may need makeup, wig, photographer and studio when the user asks for a complete shoot and does not say they already own those services. Do not return or invent providers, services, providerId, or serviceId. Add short Chinese clarificationQuestions for important missing or ambiguous information, especially city, date, budget, work, character, and service scope. Return JSON only, with no markdown fences or commentary.`;
}

function buildRequestBody(config, input, currentDate) {
  const instructions = buildInstructions(currentDate);
  if (config.apiStyle === "responses") {
    return {
      model: config.model,
      instructions,
      input,
      text: { format: { type: "json_schema", name: "project_requirement", strict: true, schema: requirementSchema } },
    };
  }

  const body = {
    model: config.model,
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: input },
    ],
  };
  if (config.jsonMode === "json-schema") {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: "project_requirement", strict: true, schema: requirementSchema },
    };
  } else if (config.jsonMode === "json-object") {
    body.response_format = { type: "json_object" };
  }
  return body;
}

function extractOutputText(payload, apiStyle) {
  if (apiStyle === "chat-completions") {
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.map((item) => typeof item === "string" ? item : item?.text || "").join("");
    }
    return "";
  }

  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

function parseJsonOutput(output) {
  const cleaned = output.trim()
    .replace(/^\`\`\`(?:json)?\s*/i, "")
    .replace(/\s*\`\`\`$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new HttpError(502, "invalid_structured_output", "The LLM returned invalid JSON.");
  }
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validateRequirement(value) {
  const validDateRange = value?.dateRange
    && typeof value.dateRange === "object"
    && typeof value.dateRange.start === "string"
    && typeof value.dateRange.end === "string";
  const validBudget = value?.budget === null || (typeof value?.budget === "number" && Number.isFinite(value.budget) && value.budget >= 0);
  const validServices = isStringArray(value?.neededServices)
    && value.neededServices.every((item) => SERVICE_CATEGORIES.includes(item));
  const valid = value
    && typeof value === "object"
    && typeof value.sourceWork === "string"
    && typeof value.character === "string"
    && typeof value.city === "string"
    && (value.district === null || typeof value.district === "string")
    && validDateRange
    && validBudget
    && isStringArray(value.styles)
    && isStringArray(value.ownedItems)
    && validServices
    && isStringArray(value.clarificationQuestions);
  if (!valid) throw new HttpError(502, "invalid_requirement_shape", "The LLM output does not match ProjectRequirement.");
  return value;
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

async function readProviderPayload(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(502, "invalid_llm_response", "The LLM provider returned an invalid response.");
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed.", code: "method_not_allowed" }, 405);

  try {
    const config = getProviderConfig();
    const { input, currentDate } = await readJsonBody(request);
    const normalizedInput = String(input || "").trim();
    if (!normalizedInput) throw new HttpError(400, "missing_input", "Input is required.");

    async function sendToProvider(activeConfig) {
      const response = await fetch(activeConfig.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${activeConfig.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildRequestBody(activeConfig, normalizedInput, currentDate)),
      });
      return { response, payload: await readProviderPayload(response) };
    }

    let { response, payload } = await sendToProvider(config);
    let providerMessage = payload?.error?.message || payload?.message || "";
    const rejectsResponseFormat = /response[_ -]?format|json.?schema|structured output/i.test(providerMessage)
      && /unavailable|unsupported|not support|invalid|unknown/i.test(providerMessage);
    if (!response.ok && config.apiStyle === "chat-completions" && config.jsonMode !== "prompt" && rejectsResponseFormat) {
      console.warn("Provider rejected structured response_format; retrying with prompt-only JSON.");
      ({ response, payload } = await sendToProvider({ ...config, jsonMode: "prompt" }));
      providerMessage = payload?.error?.message || payload?.message || "";
    }
    if (!response.ok) {
      throw new HttpError(502, "llm_request_failed", providerMessage || `LLM request failed with status ${response.status}.`);
    }

    const outputText = extractOutputText(payload, config.apiStyle);
    if (!outputText) throw new HttpError(502, "missing_structured_output", "The LLM returned no structured output.");
    const requirement = validateRequirement(parseJsonOutput(outputText));
    return jsonResponse({ requirement, model: config.model, provider: config.provider });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const code = error instanceof HttpError ? error.code : "internal_error";
    const message = error instanceof Error ? error.message : String(error);
    console.error("parse-requirement failed", { code, status, message });
    return jsonResponse({ error: message, code }, status);
  }
});
