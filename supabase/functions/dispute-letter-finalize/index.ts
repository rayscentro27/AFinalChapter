import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { decryptJson, EncryptedJsonBundle } from "../_shared/encryption.ts";

type FinalizeBody = {
  ai_draft_id?: unknown;
  dispute_packet_id?: unknown;
};

type DraftRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  bureau: "experian" | "equifax" | "transunion";
  sanitized_facts_id: string;
  model_info: Record<string, unknown>;
  draft_md: string;
};

type PacketRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  bureau: "experian" | "equifax" | "transunion";
  letter_version: string;
};

type PiiPayload = {
  placeholders?: Record<string, string>;
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

function parseRoute(pathname: string): "finalize" | null {
  const normalized = pathname.replace(/\/+$/, "");
  if (normalized.endsWith("/finalize")) return "finalize";
  if (normalized.endsWith("/dispute-letter-finalize")) return "finalize";
  return null;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function markdownToHtml(md: string): string {
  const lines = String(md || "").split(/\r?\n/);
  const output: string[] = [];
  let inList = false;

  for (const lineRaw of lines) {
    const line = lineRaw.trimEnd();

    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) {
        output.push("<ul>");
        inList = true;
      }
      output.push(`<li>${escapeHtml(line.slice(2).trim())}</li>`);
      continue;
    }

    if (inList) {
      output.push("</ul>");
      inList = false;
    }

    if (!line.trim()) {
      output.push("<p></p>");
      continue;
    }

    if (line.startsWith("### ")) {
      output.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
      continue;
    }

    if (line.startsWith("## ")) {
      output.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
      continue;
    }

    if (line.startsWith("# ")) {
      output.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
      continue;
    }

    output.push(`<p>${escapeHtml(line)}</p>`);
  }

  if (inList) {
    output.push("</ul>");
  }

  return [
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head>",
    "<meta charset=\"utf-8\" />",
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" />",
    "<title>Dispute Letter</title>",
    "<style>",
    "body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.5;padding:36px;max-width:880px;margin:0 auto}",
    "h1,h2,h3{margin:0.2rem 0 0.5rem}",
    "p{margin:0.2rem 0}",
    "ul{padding-left:22px}",
    "</style>",
    "</head>",
    "<body>",
    ...output,
    "</body>",
    "</html>",
  ].join("\n");
}

function applyPlaceholders(template: string, placeholders: Record<string, string>): string {
  let output = String(template || "");
  Object.entries(placeholders).forEach(([key, value]) => {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(escapedKey, "g"), String(value || ""));
  });
  return output;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
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
  if (route !== "finalize") {
    return json(404, { error: "Not found." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const encryptionKey = Deno.env.get("PII_ENCRYPTION_KEY") || "";

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return json(500, { error: "Supabase environment is not configured." });
  }

  if (!encryptionKey) {
    return json(500, { error: "PII_ENCRYPTION_KEY is required for finalize step." });
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

  let body: FinalizeBody = {};
  try {
    body = (await req.json()) as FinalizeBody;
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const aiDraftId = normalizeString(body.ai_draft_id);
  const disputePacketId = normalizeString(body.dispute_packet_id);

  if (!aiDraftId || !disputePacketId) {
    return json(400, { error: "ai_draft_id and dispute_packet_id are required." });
  }

  const draftRes = await serviceClient
    .from("ai_letter_drafts")
    .select("id,tenant_id,user_id,bureau,sanitized_facts_id,model_info,draft_md")
    .eq("id", aiDraftId)
    .eq("user_id", authRes.data.user.id)
    .maybeSingle();

  if (draftRes.error) {
    return json(400, { error: draftRes.error.message || "Unable to load AI draft." });
  }

  const draft = draftRes.data as DraftRow | null;
  if (!draft) {
    return json(404, { error: "AI draft not found." });
  }

  const packetRes = await serviceClient
    .from("dispute_packets")
    .select("id,tenant_id,user_id,bureau,letter_version")
    .eq("id", disputePacketId)
    .eq("user_id", authRes.data.user.id)
    .maybeSingle();

  if (packetRes.error) {
    return json(400, { error: packetRes.error.message || "Unable to load dispute packet." });
  }

  const packet = packetRes.data as PacketRow | null;
  if (!packet) {
    return json(404, { error: "Dispute packet not found." });
  }

  if (packet.tenant_id !== draft.tenant_id) {
    return json(409, { error: "Draft and dispute packet tenant mismatch." });
  }

  const factsRes = await serviceClient
    .from("sanitized_dispute_facts")
    .select("id,redaction_report")
    .eq("id", draft.sanitized_facts_id)
    .eq("user_id", authRes.data.user.id)
    .maybeSingle();

  if (factsRes.error) {
    return json(400, { error: factsRes.error.message || "Unable to load sanitized facts context." });
  }

  const piiIdFromFacts = normalizeString((factsRes.data as any)?.redaction_report?.client_pii_id);

  let piiQuery = serviceClient
    .from("client_pii")
    .select("id,encrypted_pii,created_at")
    .eq("tenant_id", draft.tenant_id)
    .eq("user_id", authRes.data.user.id);

  if (piiIdFromFacts) {
    piiQuery = piiQuery.eq("id", piiIdFromFacts);
  } else {
    piiQuery = piiQuery.order("created_at", { ascending: false }).limit(1);
  }

  const piiRes = await piiQuery.maybeSingle();

  if (piiRes.error) {
    return json(400, { error: piiRes.error.message || "Unable to load encrypted PII bundle." });
  }

  if (!piiRes.data?.encrypted_pii) {
    return json(412, { error: "No encrypted PII bundle found. Run extract/sanitize first." });
  }

  let piiPayload: PiiPayload = {};
  try {
    piiPayload = (await decryptJson(piiRes.data.encrypted_pii as EncryptedJsonBundle, encryptionKey)) as PiiPayload;
  } catch {
    return json(500, { error: "Unable to decrypt PII bundle." });
  }

  const placeholders = {
    "{{DATE}}": new Date().toLocaleDateString("en-US"),
    "{{CLIENT_NAME}}": "Client",
    "{{CLIENT_ADDRESS1}}": "",
    "{{CLIENT_CITY_STATE_ZIP}}": "",
    ...(piiPayload.placeholders || {}),
  };

  const mergedMarkdown = applyPlaceholders(draft.draft_md, placeholders);
  const finalHtml = markdownToHtml(mergedMarkdown);
  const finalHash = await sha256Hex(finalHtml);

  const objectPath = `finalized-letters/${authRes.data.user.id}/${packet.id}/${Date.now()}_${draft.id}.html`;

  const uploadRes = await serviceClient.storage
    .from("documents")
    .upload(objectPath, new Blob([finalHtml], { type: "text/html" }), {
      upsert: true,
      contentType: "text/html; charset=utf-8",
    });

  if (uploadRes.error) {
    return json(400, { error: uploadRes.error.message || "Unable to store finalized letter artifact." });
  }

  const storagePath = `documents/${objectPath}`;

  const finalizedInsert = await serviceClient
    .from("finalized_letters")
    .insert({
      tenant_id: draft.tenant_id,
      user_id: authRes.data.user.id,
      bureau: draft.bureau,
      ai_draft_id: draft.id,
      dispute_packet_id: packet.id,
      final_html: finalHtml,
      final_pdf_path: storagePath,
      final_doc_hash: finalHash,
    })
    .select("id")
    .single();

  if (finalizedInsert.error || !finalizedInsert.data?.id) {
    return json(400, { error: finalizedInsert.error?.message || "Unable to store finalized letter row." });
  }

  const letterVersion = normalizeString((draft.model_info || {}).prompt_version) || packet.letter_version || "v1";

  const packetUpdate = await serviceClient
    .from("dispute_packets")
    .update({
      status: "finalized",
      letter_version: letterVersion,
      final_doc_storage_path: storagePath,
      final_doc_hash: finalHash,
    })
    .eq("id", packet.id)
    .eq("user_id", authRes.data.user.id);

  if (packetUpdate.error) {
    return json(400, { error: packetUpdate.error.message || "Unable to update dispute packet final artifact." });
  }

  const signedRes = await serviceClient.storage
    .from("documents")
    .createSignedUrl(objectPath, 60 * 60);

  const signedUrl = signedRes.error ? null : signedRes.data?.signedUrl || null;

  await writeAuditEvent(serviceClient, {
    tenantId: draft.tenant_id,
    userId: authRes.data.user.id,
    eventType: "LETTER_FINALIZED",
    metadata: {
      finalized_letter_id: finalizedInsert.data.id,
      ai_draft_id: draft.id,
      dispute_packet_id: packet.id,
      storage_path: storagePath,
      final_doc_hash: finalHash,
    },
  });

  return json(200, {
    finalized_letter_id: finalizedInsert.data.id,
    dispute_packet_id: packet.id,
    final_pdf_signed_url: signedUrl,
    final_storage_path: storagePath,
    final_doc_hash: finalHash,
  });
});
