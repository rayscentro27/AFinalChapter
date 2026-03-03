import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, User } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { encryptJson } from "../_shared/encryption.ts";
import { redactPIIText, piiScanPayload } from "../_shared/piiScanner.ts";

type Bureau = "experian" | "equifax" | "transunion";

type RunBody = {
  upload_id?: unknown;
  bureau?: unknown;
};

type SignedUploadBody = {
  filename?: unknown;
};

type DisputeFactItem = {
  creditor_furnisher: string;
  account_last4: string | null;
  date_opened: string | null;
  balance: string | null;
  reason_code: string;
  narrative: string;
};

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

function isBureau(value: string): value is Bureau {
  return value === "experian" || value === "equifax" || value === "transunion";
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned || "credit-report.pdf";
}

function parseRoute(pathname: string): "create-upload-url" | "run" | null {
  const normalized = pathname.replace(/\/+$/, "");
  if (normalized.endsWith("/create-upload-url")) return "create-upload-url";
  if (normalized.endsWith("/run")) return "run";
  if (normalized.endsWith("/credit-extract-sanitize")) return "run";
  return null;
}

function parseUploadId(uploadId: string): { bucket: string; objectPath: string; normalized: string } | null {
  const raw = normalizeString(uploadId).replace(/^\/+/, "");
  if (!raw) return null;

  if (raw.startsWith("clients/")) {
    return {
      bucket: "documents",
      objectPath: raw,
      normalized: `documents/${raw}`,
    };
  }

  const split = raw.indexOf("/");
  if (split <= 0) return null;

  const bucket = raw.slice(0, split).trim();
  const objectPath = raw.slice(split + 1).trim();
  if (!bucket || !objectPath) return null;

  return {
    bucket,
    objectPath,
    normalized: `${bucket}/${objectPath}`,
  };
}

async function resolveTenantId(serviceClient: ReturnType<typeof createClient>, userId: string): Promise<string | null> {
  const preferred = await serviceClient
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!preferred.error && preferred.data?.tenant_id) {
    return String(preferred.data.tenant_id);
  }

  const fallback = await serviceClient
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!fallback.error && (fallback.data as any)?.tenant_id) {
    return String((fallback.data as any).tenant_id);
  }

  return null;
}

async function getAuthContext(req: Request): Promise<{
  user: User;
  userClient: ReturnType<typeof createClient>;
  serviceClient: ReturnType<typeof createClient>;
} | { error: Response }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return { error: json(500, { error: "Supabase environment is not configured." }) };
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return { error: json(401, { error: "Missing bearer token." }) };
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const authRes = await userClient.auth.getUser();
  if (authRes.error || !authRes.data.user?.id) {
    return { error: json(401, { error: "Unauthorized." }) };
  }

  return {
    user: authRes.data.user,
    userClient,
    serviceClient,
  };
}

function extractPdfText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  const directTextMatches: string[] = [];
  const latin = new TextDecoder("latin1").decode(bytes);
  for (const match of latin.matchAll(/\(([^()\r\n]{2,240})\)\s*T[Jj]/g)) {
    const candidate = String(match[1] || "").trim();
    if (candidate.length > 1) {
      directTextMatches.push(candidate);
    }

    if (directTextMatches.length >= 400) break;
  }

  if (directTextMatches.length > 0) {
    return directTextMatches.join("\n");
  }

  const ascii = latin.replace(/[^\x20-\x7E\r\n]/g, " ");
  const lines = ascii
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter((line) => line.length >= 4)
    .slice(0, 1200);

  return lines.join("\n");
}

function findFirst(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  if (!match || !match[1]) return null;
  const value = String(match[1] || "").trim();
  return value || null;
}

function parseReasonCode(line: string): string {
  const lower = line.toLowerCase();
  if (lower.includes("collection")) return "collection_account";
  if (lower.includes("charge") && lower.includes("off")) return "charge_off";
  if (lower.includes("late")) return "late_payment";
  if (lower.includes("inquiry")) return "hard_inquiry";
  if (lower.includes("bankrupt")) return "bankruptcy";
  if (lower.includes("repossession")) return "repossession";
  if (lower.includes("foreclosure")) return "foreclosure";
  return "accuracy_verification";
}

function buildDisputes(text: string, manualExtractionRequired: boolean): {
  disputes: DisputeFactItem[];
  redactionCounts: Record<string, number>;
} {
  const redactionCounts: Record<string, number> = {};

  if (manualExtractionRequired) {
    return {
      disputes: [
        {
          creditor_furnisher: "Manual review required",
          account_last4: null,
          date_opened: null,
          balance: null,
          reason_code: "manual_review_required",
          narrative: "Automatic PDF text extraction was limited. Review your report and enter educational dispute facts manually before drafting.",
        },
      ],
      redactionCounts,
    };
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2000);

  const keyLinePattern = /(late|collection|charge\s*off|inquiry|bankrupt|repossession|foreclosure|delinquent|dispute)/i;
  const candidateLines = lines.filter((line) => keyLinePattern.test(line)).slice(0, 40);

  const disputes: DisputeFactItem[] = candidateLines.map((line) => {
    const accountMatch = line.match(/\b\d{4,19}\b/);
    const accountLast4 = accountMatch?.[0] ? accountMatch[0].slice(-4) : null;
    const dateOpenedMatch = line.match(/\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19\d{2}|20\d{2}|\d{2})\b/);
    const balanceMatch = line.match(/\$\s?\d[\d,]*(?:\.\d{2})?/);

    const creditorSeed = line.split(/[-|:]/)[0] || line;
    const creditorRedacted = redactPIIText(creditorSeed);
    const narrativeRedacted = redactPIIText(line);

    Object.entries(creditorRedacted.counts).forEach(([key, count]) => {
      redactionCounts[key] = (redactionCounts[key] || 0) + Number(count || 0);
    });

    Object.entries(narrativeRedacted.counts).forEach(([key, count]) => {
      redactionCounts[key] = (redactionCounts[key] || 0) + Number(count || 0);
    });

    return {
      creditor_furnisher: creditorRedacted.redacted.slice(0, 120),
      account_last4: accountLast4,
      date_opened: dateOpenedMatch?.[0] || null,
      balance: balanceMatch?.[0] || null,
      reason_code: parseReasonCode(line),
      narrative: narrativeRedacted.redacted.slice(0, 800),
    };
  });

  if (disputes.length === 0) {
    return {
      disputes: [
        {
          creditor_furnisher: "Needs client review",
          account_last4: null,
          date_opened: null,
          balance: null,
          reason_code: "client_review_needed",
          narrative: "No clear tradeline dispute markers were extracted. Add educational dispute facts manually before drafting.",
        },
      ],
      redactionCounts,
    };
  }

  return { disputes, redactionCounts };
}

function buildPiiPayload(params: {
  text: string;
  user: User;
  bureau: Bureau;
  uploadId: string;
}) {
  const { text, user, bureau, uploadId } = params;

  const meta = user.user_metadata || {};
  const derivedName = normalizeString((meta as Record<string, unknown>).name);
  const emailName = normalizeString(user.email).split("@")[0]?.replace(/[._-]/g, " ").trim();

  const clientName =
    findFirst(text, /(?:name|consumer|client)\s*[:\-]\s*([^\n,]{3,80})/i)
    || derivedName
    || emailName
    || "Client";

  const address1 =
    findFirst(text, /(\d{1,6}\s+[A-Za-z0-9.'\-\s]{2,60}\s(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct))/i)
    || "";

  const cityStateZip =
    findFirst(text, /([A-Za-z.'\-\s]{2,40},\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)/)
    || "";

  const dob = findFirst(text, /(?:dob|date of birth)\s*[:\-]?\s*((?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19\d{2}|20\d{2}|\d{2}))/i);
  const ssn = findFirst(text, /(?:ssn|social(?:\s+security)?(?:\s+number)?)\s*[:\-]?\s*(\d{3}-?\d{2}-?\d{4})/i);

  const accountNumbers = Array.from(text.matchAll(/\b\d{8,19}\b/g))
    .map((m) => String(m[0] || ""))
    .filter(Boolean)
    .slice(0, 20);

  const placeholders: Record<string, string> = {
    "{{CLIENT_NAME}}": clientName,
    "{{CLIENT_ADDRESS1}}": address1,
    "{{CLIENT_CITY_STATE_ZIP}}": cityStateZip,
    "{{DATE}}": new Date().toLocaleDateString("en-US"),
  };

  return {
    placeholders,
    pii_source: {
      upload_id: uploadId,
      bureau,
      extracted_at: new Date().toISOString(),
    },
    extracted: {
      dob: dob || null,
      ssn: ssn || null,
      account_numbers: accountNumbers,
    },
  };
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

async function handleCreateUploadUrl(req: Request) {
  const auth = await getAuthContext(req);
  if ("error" in auth) return auth.error;

  let body: SignedUploadBody = {};
  try {
    body = (await req.json()) as SignedUploadBody;
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const filename = safeFileName(normalizeString(body.filename) || "credit-report.pdf");
  const objectPath = `credit-reports/${auth.user.id}/${Date.now()}_${filename}`;

  const uploadRes = await auth.serviceClient.storage
    .from("documents")
    .createSignedUploadUrl(objectPath, { upsert: false });

  if (uploadRes.error || !uploadRes.data?.token) {
    return json(400, { error: uploadRes.error?.message || "Unable to prepare upload URL." });
  }

  return json(200, {
    upload_id: `documents/${objectPath}`,
    bucket: "documents",
    object_path: objectPath,
    token: uploadRes.data.token,
  });
}

async function handleRun(req: Request) {
  const auth = await getAuthContext(req);
  if ("error" in auth) return auth.error;

  const encryptionKey = Deno.env.get("PII_ENCRYPTION_KEY") || "";
  if (!encryptionKey) {
    return json(500, { error: "PII_ENCRYPTION_KEY is required for credit sanitization." });
  }

  let body: RunBody = {};
  try {
    body = (await req.json()) as RunBody;
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const uploadId = normalizeString(body.upload_id);
  const bureauValue = normalizeString(body.bureau).toLowerCase();

  if (!uploadId) return json(400, { error: "upload_id is required." });
  if (!isBureau(bureauValue)) return json(400, { error: "bureau must be one of: experian, equifax, transunion." });

  const parsedUpload = parseUploadId(uploadId);
  if (!parsedUpload) {
    return json(400, { error: "Invalid upload_id. Expected format: <bucket>/<object_path>." });
  }

  const tenantId = await resolveTenantId(auth.serviceClient, auth.user.id);
  if (!tenantId) {
    return json(400, { error: "Unable to resolve tenant context for current user." });
  }

  const downloadRes = await auth.serviceClient.storage
    .from(parsedUpload.bucket)
    .download(parsedUpload.objectPath);

  if (downloadRes.error || !downloadRes.data) {
    return json(400, { error: downloadRes.error?.message || "Unable to download uploaded credit report." });
  }

  const fileBytes = await downloadRes.data.arrayBuffer();
  const extractedText = extractPdfText(fileBytes);
  const manualExtractionRequired = extractedText.replace(/\s+/g, "").length < 120;

  const piiPayload = buildPiiPayload({
    text: extractedText,
    user: auth.user,
    bureau: bureauValue,
    uploadId: parsedUpload.normalized,
  });

  const encryptedPii = await encryptJson(piiPayload, encryptionKey);

  const piiInsert = await auth.serviceClient
    .from("client_pii")
    .insert({
      tenant_id: tenantId,
      user_id: auth.user.id,
      encrypted_pii: encryptedPii,
      pii_version: "v1",
    })
    .select("id")
    .single();

  if (piiInsert.error || !piiInsert.data?.id) {
    return json(400, { error: piiInsert.error?.message || "Unable to store encrypted PII bundle." });
  }

  const disputesBuild = buildDisputes(extractedText, manualExtractionRequired);

  const scannerResult = piiScanPayload({
    bureau: bureauValue,
    disputes: disputesBuild.disputes,
  });

  const redactionReport = {
    client_pii_id: piiInsert.data.id,
    manual_extraction_required: manualExtractionRequired,
    removed_fields_counts: disputesBuild.redactionCounts,
    pii_findings_after_redaction: scannerResult.findings.slice(0, 30),
    extracted_text_char_count: extractedText.length,
  };

  const factsInsert = await auth.serviceClient
    .from("sanitized_dispute_facts")
    .insert({
      tenant_id: tenantId,
      user_id: auth.user.id,
      bureau: bureauValue,
      disputes: disputesBuild.disputes,
      redaction_report: redactionReport,
    })
    .select("id")
    .single();

  if (factsInsert.error || !factsInsert.data?.id) {
    return json(400, { error: factsInsert.error?.message || "Unable to store sanitized dispute facts." });
  }

  await writeAuditEvent(auth.serviceClient, {
    tenantId,
    userId: auth.user.id,
    eventType: "CREDIT_SANITIZED",
    metadata: {
      sanitized_facts_id: factsInsert.data.id,
      client_pii_id: piiInsert.data.id,
      bureau: bureauValue,
      manual_extraction_required: manualExtractionRequired,
      dispute_count: disputesBuild.disputes.length,
      upload_bucket: parsedUpload.bucket,
    },
  });

  return json(200, {
    sanitized_facts_id: factsInsert.data.id,
    manual_extraction_required: manualExtractionRequired,
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
  if (route === "create-upload-url") {
    return handleCreateUploadUrl(req);
  }

  if (route === "run") {
    return handleRun(req);
  }

  return json(404, { error: "Not found." });
});
