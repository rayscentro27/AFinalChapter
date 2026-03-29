import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { piiScanPayload } from "../_shared/piiScanner.ts";

type Bureau = "experian" | "equifax" | "transunion";

type GenerateBody = {
  sanitized_facts_id?: unknown;
};

type SanitizedFactsRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  bureau: Bureau;
  disputes: Array<{
    creditor_furnisher?: string;
    account_last4?: string | null;
    date_opened?: string | null;
    balance?: string | null;
    reason_code?: string;
    narrative?: string;
  }>;
  redaction_report: Record<string, unknown>;
};

type ModelOutput = {
  draftMd: string;
  modelInfo: Record<string, unknown>;
};

interface LetterModelAdapter {
  generateDraft(input: {
    bureau: Bureau;
    disputes: SanitizedFactsRow["disputes"];
    prompt: string;
  }): Promise<ModelOutput>;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseRoute(pathname: string): "generate" | null {
  const normalized = pathname.replace(/\/+$/, "");
  if (normalized.endsWith("/generate")) return "generate";
  if (normalized.endsWith("/dispute-letter-generate")) return "generate";
  return null;
}

function buildPrompt(row: SanitizedFactsRow): string {
  return [
    "You create educational-only dispute letter templates.",
    "Do not provide legal advice and do not claim guaranteed outcomes.",
    "Output markdown only.",
    "Never insert personal details. Keep placeholders exactly as written.",
    "Required placeholders: {{DATE}}, {{CLIENT_NAME}}, {{CLIENT_ADDRESS1}}, {{CLIENT_CITY_STATE_ZIP}}.",
    "Include a concise request to investigate and correct unverifiable or inaccurate reporting under FCRA educational context.",
    "Use this sanitized dispute JSON payload:",
    JSON.stringify({ bureau: row.bureau, disputes: row.disputes }),
  ].join("\n\n");
}

function fallbackDraft(row: SanitizedFactsRow): string {
  const lines = row.disputes.map((item, index) => {
    const creditor = normalizeString(item.creditor_furnisher) || `Creditor ${index + 1}`;
    const accountSuffix = normalizeString(item.account_last4);
    const reason = normalizeString(item.reason_code) || "accuracy_verification";
    const narrative = normalizeString(item.narrative) || "Please investigate this tradeline for accuracy and verifiability.";

    return `${index + 1}. ${creditor}${accountSuffix ? ` (Acct ending ${accountSuffix})` : ""} - ${reason}: ${narrative}`;
  });

  return [
    "{{DATE}}",
    "",
    "{{CLIENT_NAME}}",
    "{{CLIENT_ADDRESS1}}",
    "{{CLIENT_CITY_STATE_ZIP}}",
    "",
    `Re: Educational Dispute Template - ${row.bureau.toUpperCase()} File`,
    "",
    "To Whom It May Concern,",
    "",
    "I am submitting this educational dispute template to request a reinvestigation of potentially inaccurate or unverifiable information listed in my consumer file.",
    "",
    "Disputed Items:",
    ...lines,
    "",
    "Please investigate each entry, verify with the furnisher, and update the file as required by applicable consumer reporting standards.",
    "",
    "This request is submitted for educational workflow purposes. Results vary and no outcome is guaranteed.",
    "",
    "Sincerely,",
    "{{CLIENT_NAME}}",
  ].join("\n");
}

function ensureRequiredPlaceholders(input: string): string {
  const draft = String(input || "").trim();
  const required = ["{{DATE}}", "{{CLIENT_NAME}}", "{{CLIENT_ADDRESS1}}", "{{CLIENT_CITY_STATE_ZIP}}"];
  const missing = required.filter((tag) => !draft.includes(tag));

  if (missing.length === 0) return draft;

  const prefix = [
    "{{DATE}}",
    "",
    "{{CLIENT_NAME}}",
    "{{CLIENT_ADDRESS1}}",
    "{{CLIENT_CITY_STATE_ZIP}}",
    "",
  ].join("\n");

  return `${prefix}${draft}`;
}

class GeminiAdapter implements LetterModelAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generateDraft(input: {
    bureau: Bureau;
    disputes: SanitizedFactsRow["disputes"];
    prompt: string;
  }): Promise<ModelOutput> {
    if (!this.apiKey) {
      return {
        draftMd: ensureRequiredPlaceholders(fallbackDraft({
          id: "fallback",
          tenant_id: "",
          user_id: "",
          bureau: input.bureau,
          disputes: input.disputes,
          redaction_report: {},
        })),
        modelInfo: {
          provider: "gemini",
          model: this.model,
          mode: "fallback_no_api_key",
        },
      };
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: input.prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
        },
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = normalizeString((payload as Record<string, unknown>)?.error?.toString()) || `Gemini request failed (${response.status}).`;
      return {
        draftMd: ensureRequiredPlaceholders(fallbackDraft({
          id: "fallback",
          tenant_id: "",
          user_id: "",
          bureau: input.bureau,
          disputes: input.disputes,
          redaction_report: {},
        })),
        modelInfo: {
          provider: "gemini",
          model: this.model,
          mode: "fallback_error",
          provider_error: message,
        },
      };
    }

    const candidates = Array.isArray((payload as any).candidates) ? (payload as any).candidates : [];
    const text = String(candidates?.[0]?.content?.parts?.[0]?.text || "").trim();

    const safeText = ensureRequiredPlaceholders(text || fallbackDraft({
      id: "fallback",
      tenant_id: "",
      user_id: "",
      bureau: input.bureau,
      disputes: input.disputes,
      redaction_report: {},
    }));

    return {
      draftMd: safeText,
      modelInfo: {
        provider: "gemini",
        model: this.model,
        mode: "live",
      },
    };
  }
}

async function writeAuditEvent(serviceClient: ReturnType<typeof createClient>, input: {
  tenantId: string;
  userId: string;
  eventType: string;
  metadata: Record<string, unknown>;
}) {
  await serviceClient.from("audit_events").insert({
    tenant_id: input.tenantId,
    actor_user_id: input.userId,
    event_type: input.eventType,
    metadata: input.metadata,
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  const route = parseRoute(new URL(req.url).pathname);
  if (route !== "generate") {
    return json(404, { error: "Not found." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return json(500, { error: "Supabase environment is not configured." });
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json(401, { error: "Missing bearer token." });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const authRes = await userClient.auth.getUser();
  if (authRes.error || !authRes.data.user?.id) {
    return json(401, { error: "Unauthorized." });
  }

  let body: GenerateBody = {};
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const sanitizedFactsId = normalizeString(body.sanitized_facts_id);
  if (!sanitizedFactsId) {
    return json(400, { error: "sanitized_facts_id is required." });
  }

  const factsRes = await serviceClient
    .from("sanitized_dispute_facts")
    .select("id,tenant_id,user_id,bureau,disputes,redaction_report")
    .eq("id", sanitizedFactsId)
    .eq("user_id", authRes.data.user.id)
    .maybeSingle();

  if (factsRes.error) {
    return json(400, { error: factsRes.error.message || "Unable to load sanitized facts." });
  }

  const facts = factsRes.data as SanitizedFactsRow | null;
  if (!facts) {
    return json(404, { error: "Sanitized facts not found." });
  }

  const sanitizedPayload = {
    bureau: facts.bureau,
    disputes: facts.disputes,
  };

  const scan = piiScanPayload(sanitizedPayload);
  if (scan.blocked) {
    return json(412, {
      error: "PII scanner blocked AI generation payload. Remove direct identifiers before drafting.",
      findings: scan.findings.slice(0, 50),
    });
  }

  const prompt = buildPrompt(facts);
  const provider = normalizeString(Deno.env.get("AI_PROVIDER") || "gemini") || "gemini";
  const model = normalizeString(Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash") || "gemini-2.0-flash";

  let adapter: LetterModelAdapter;
  if (provider === "gemini") {
    adapter = new GeminiAdapter(Deno.env.get("GEMINI_API_KEY") || "", model);
  } else {
    adapter = new GeminiAdapter("", model);
  }

  const generated = await adapter.generateDraft({
    bureau: facts.bureau,
    disputes: facts.disputes,
    prompt,
  });

  const draftJson = {
    placeholders_required: ["{{DATE}}", "{{CLIENT_NAME}}", "{{CLIENT_ADDRESS1}}", "{{CLIENT_CITY_STATE_ZIP}}"],
    bureau: facts.bureau,
    dispute_count: Array.isArray(facts.disputes) ? facts.disputes.length : 0,
  };

  const insertRes = await serviceClient
    .from("ai_letter_drafts")
    .insert({
      tenant_id: facts.tenant_id,
      user_id: authRes.data.user.id,
      bureau: facts.bureau,
      sanitized_facts_id: facts.id,
      model_info: {
        ...generated.modelInfo,
        provider_requested: provider,
        prompt_version: "v1",
        scanner_status: "clean",
        sanitized_payload: sanitizedPayload,
      },
      draft_md: generated.draftMd,
      draft_json: draftJson,
    })
    .select("id")
    .single();

  if (insertRes.error || !insertRes.data?.id) {
    return json(400, { error: insertRes.error?.message || "Unable to store AI draft." });
  }

  await writeAuditEvent(serviceClient, {
    tenantId: facts.tenant_id,
    userId: authRes.data.user.id,
    eventType: "AI_LETTER_DRAFTED",
    metadata: {
      ai_draft_id: insertRes.data.id,
      sanitized_facts_id: facts.id,
      provider,
      model,
      dispute_count: Array.isArray(facts.disputes) ? facts.disputes.length : 0,
    },
  });

  return json(200, {
    ai_draft_id: insertRes.data.id,
    preview_md: generated.draftMd,
    privacy_proof: sanitizedPayload,
  });
});
