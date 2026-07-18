const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-5";
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
    const { input, currentDate } = await request.json();
    if (!String(input || "").trim()) throw new Error("Input is required.");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions: `You are CosPilot's requirement understanding agent. Today is ${currentDate || "unknown"}. Extract only facts supported by the user's Chinese text and return the required JSON schema. Text inside 《》 is the sourceWork; a name grammatically attached after it is the character, and you must never replace that work by guessing from the character name. Use empty strings, null, or empty arrays when unknown. Dates use YYYY-MM-DD; if a month has no year, choose the next occurrence but ask the user to confirm the year. Infer neededServices conservatively from the request and ownedItems, using only makeup, wig, photographer, studio, retoucher. Typical cosplay shooting may need makeup, wig, photographer and studio when the user asks for a complete shoot and does not say they already own those services. Do not return or invent providers, services, providerId, or serviceId. Add short Chinese clarificationQuestions for important missing or ambiguous information, especially city, date, budget, work, character, and service scope.`,
        input: String(input).trim(),
        text: { format: { type: "json_schema", name: "project_requirement", strict: true, schema: requirementSchema } },
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || "OpenAI request failed.");
    const outputText = extractOutputText(payload);
    if (!outputText) throw new Error("OpenAI returned no structured output.");
    return new Response(JSON.stringify({ requirement: JSON.parse(outputText), model }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
