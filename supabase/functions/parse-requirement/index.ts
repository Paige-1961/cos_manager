const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
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
      items: { type: "string", enum: ["makeup", "wig", "photographer", "studio", "retoucher"] },
    },
    clarificationQuestions: { type: "array", items: { type: "string" } },
  },
};

function extractOutputText(response: any) {
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

async function readOpenAiPayload(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(502, "invalid_openai_response", "OpenAI returned an invalid response.");
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed.", code: "method_not_allowed" }, 405);
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY") || Deno.env.get("OPEN_API_KEY");
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-5";
    if (!apiKey) throw new HttpError(500, "missing_openai_api_key", "OPENAI_API_KEY is not configured.");
    const { input, currentDate } = await readJsonBody(request);
    const normalizedInput = String(input || "").trim();
    if (!normalizedInput) throw new HttpError(400, "missing_input", "Input is required.");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions: `You are CosPilot's requirement understanding agent. Today is ${currentDate || "unknown"}. Extract only facts supported by the user's Chinese text and return the required JSON schema. Text inside 《》 is the sourceWork; a name grammatically attached after it is the character, and you must never replace that work by guessing from the character name. Use empty strings, null, or empty arrays when unknown. Dates use YYYY-MM-DD; if a month has no year, choose the next occurrence but ask the user to confirm the year. Infer neededServices conservatively from the request and ownedItems, using only makeup, wig, photographer, studio, retoucher. Typical cosplay shooting may need makeup, wig, photographer and studio when the user asks for a complete shoot and does not say they already own those services. Do not return or invent providers, services, providerId, or serviceId. Add short Chinese clarificationQuestions for important missing or ambiguous information, especially city, date, budget, work, character, and service scope.`,
        input: normalizedInput,
        text: { format: { type: "json_schema", name: "project_requirement", strict: true, schema: requirementSchema } },
      }),
    });
    const payload = await readOpenAiPayload(response);
    if (!response.ok) {
      throw new HttpError(502, "openai_request_failed", payload?.error?.message || `OpenAI request failed with status ${response.status}.`);
    }
    const outputText = extractOutputText(payload);
    if (!outputText) throw new HttpError(502, "missing_structured_output", "OpenAI returned no structured output.");
    let requirement;
    try {
      requirement = JSON.parse(outputText);
    } catch {
      throw new HttpError(502, "invalid_structured_output", "OpenAI returned invalid structured output.");
    }
    return jsonResponse({ requirement, model });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const code = error instanceof HttpError ? error.code : "internal_error";
    const message = error instanceof Error ? error.message : String(error);
    console.error("parse-requirement failed", { code, status, message });
    return jsonResponse({ error: message, code }, status);
  }
});
