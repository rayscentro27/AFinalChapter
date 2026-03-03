import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type MailingStatus = "queued" | "submitted" | "sent" | "failed" | "canceled";

type AuthorizeAndSendBody = {
  dispute_packet_id?: unknown;
  to_name?: unknown;
  to_address_1?: unknown;
  to_address_2?: unknown;
  to_city?: unknown;
  to_state?: unknown;
  to_zip?: unknown;
  action?: unknown;
};

type RecipientAddress = {
  to_name: string;
  to_address_1: string;
  to_address_2?: string;
  to_city: string;
  to_state: string;
  to_zip: string;
};

type ProviderSubmitInput = {
  mailingEventId: string;
  disputePacketId: string;
  documentHash: string;
} & RecipientAddress;

type ProviderSubmitResult = {
  status: Extract<MailingStatus, "submitted" | "sent" | "failed">;
  providerReferenceId: string | null;
  costCents: number | null;
  errorMessage?: string;
};

type DisputePacketRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  status: "draft" | "finalized" | "mailed" | "mail_failed";
  bureau: "experian" | "equifax" | "transunion";
  letter_version: string;
  final_doc_storage_path: string | null;
  final_doc_hash: string | null;
};

type MailingEventRow = {
  id: string;
  tenant_id: string;
  dispute_packet_id: string;
  provider_reference_id: string | null;
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-docupost-signature",
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

function parseBoolean(input: string | undefined, fallback = false): boolean {
  if (!input) return fallback;
  const normalized = input.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseInteger(input: string | undefined, fallback: number): number {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.trunc(n));
}

function getRoute(pathname: string, action: string): "authorize-and-send" | "webhook" | null {
  const normalizedPath = pathname.replace(/\/+$/, "");
  if (normalizedPath.endsWith("/authorize-and-send")) return "authorize-and-send";
  if (normalizedPath.endsWith("/webhook")) return "webhook";

  if (action === "authorize-and-send") return "authorize-and-send";
  if (action === "webhook") return "webhook";

  return null;
}

function parseStoragePath(input: string): { bucket: string; objectPath: string } | null {
  const raw = normalizeString(input).replace(/^\/+/, "");
  if (!raw) return null;

  const split = raw.indexOf("/");
  if (split <= 0) return null;

  const bucket = raw.slice(0, split).trim();
  const objectPath = raw.slice(split + 1).trim();

  if (!bucket || !objectPath) return null;
  return { bucket, objectPath };
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function mapProviderStatus(input: string): MailingStatus {
  const value = normalizeString(input).toLowerCase();
  if (value === "submitted") return "submitted";
  if (value === "sent" || value === "delivered") return "sent";
  if (value === "canceled" || value === "cancelled") return "canceled";
  if (value === "queued" || value === "pending") return "queued";
  if (value === "failed" || value === "error") return "failed";
  return "failed";
}

function parseAuthorizeBody(body: AuthorizeAndSendBody): {
  disputePacketId: string;
  addressInput: Partial<RecipientAddress>;
} {
  const disputePacketId = normalizeString(body.dispute_packet_id);
  if (!disputePacketId) throw new Error("dispute_packet_id is required.");

  const addressInput: Partial<RecipientAddress> = {
    to_name: normalizeString(body.to_name) || undefined,
    to_address_1: normalizeString(body.to_address_1) || undefined,
    to_address_2: normalizeString(body.to_address_2) || undefined,
    to_city: normalizeString(body.to_city) || undefined,
    to_state: normalizeString(body.to_state) || undefined,
    to_zip: normalizeString(body.to_zip) || undefined,
  };

  return { disputePacketId, addressInput };
}

function isRecipientComplete(input: Partial<RecipientAddress>): input is RecipientAddress {
  return Boolean(
    input.to_name
    && input.to_address_1
    && input.to_city
    && input.to_state
    && input.to_zip,
  );
}

class DocuPostAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly testMode: boolean,
  ) {}

  // TODO(docupost): confirm production endpoint path and request schema.
  // TODO(docupost): confirm synchronous vs asynchronous status behavior and webhook event map.
  async submitMail(input: ProviderSubmitInput): Promise<ProviderSubmitResult> {
    if (this.testMode) {
      return {
        status: "submitted",
        providerReferenceId: `docupost_test_${crypto.randomUUID()}`,
        costCents: null,
      };
    }

    if (!this.apiKey || !this.baseUrl) {
      return {
        status: "failed",
        providerReferenceId: null,
        costCents: null,
        errorMessage: "DocuPost API is not fully configured.",
      };
    }

    const endpoint = `${this.baseUrl.replace(/\/+$/, "")}/mailings`;
    const payload = {
      external_id: input.mailingEventId,
      dispute_packet_id: input.disputePacketId,
      recipient: {
        name: input.to_name,
        address_1: input.to_address_1,
        address_2: input.to_address_2 || null,
        city: input.to_city,
        state: input.to_state,
        zip: input.to_zip,
      },
      document: {
        hash_sha256: input.documentHash,
      },
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const raw = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = normalizeString((raw as Record<string, unknown>)?.message)
        || normalizeString((raw as Record<string, unknown>)?.error)
        || `DocuPost request failed (${response.status}).`;

      return {
        status: "failed",
        providerReferenceId: null,
        costCents: null,
        errorMessage: message,
      };
    }

    const obj = raw as Record<string, unknown>;
    const providerReferenceId = normalizeString(obj.provider_reference_id)
      || normalizeString(obj.reference_id)
      || normalizeString(obj.id)
      || null;

    const mappedStatus = mapProviderStatus(normalizeString(obj.status) || "submitted");
    const normalizedStatus: Extract<MailingStatus, "submitted" | "sent" | "failed"> =
      mappedStatus === "sent"
        ? "sent"
        : mappedStatus === "failed" || mappedStatus === "canceled"
          ? "failed"
          : "submitted";

    const costCents = Number.isFinite(Number(obj.cost_cents)) ? Number(obj.cost_cents) : null;

    return {
      status: normalizedStatus,
      providerReferenceId,
      costCents,
    };
  }
}

async function writeAuditEvent(serviceClient: SupabaseClient, input: {
  tenantId: string;
  userId: string | null;
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

async function resolveRecipientAddress(
  serviceClient: SupabaseClient,
  disputePacketId: string,
  bodyAddress: Partial<RecipientAddress>,
): Promise<RecipientAddress | null> {
  if (isRecipientComplete(bodyAddress)) {
    return bodyAddress;
  }

  const latestEventRes = await serviceClient
    .from("mailing_events")
    .select("to_name,to_address_1,to_address_2,to_city,to_state,to_zip")
    .eq("dispute_packet_id", disputePacketId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestEventRes.error && latestEventRes.data) {
    const fallback: Partial<RecipientAddress> = {
      to_name: normalizeString(bodyAddress.to_name || latestEventRes.data.to_name),
      to_address_1: normalizeString(bodyAddress.to_address_1 || latestEventRes.data.to_address_1),
      to_address_2: normalizeString(bodyAddress.to_address_2 || latestEventRes.data.to_address_2) || undefined,
      to_city: normalizeString(bodyAddress.to_city || latestEventRes.data.to_city),
      to_state: normalizeString(bodyAddress.to_state || latestEventRes.data.to_state),
      to_zip: normalizeString(bodyAddress.to_zip || latestEventRes.data.to_zip),
    };

    if (isRecipientComplete(fallback)) {
      return fallback;
    }
  }

  return null;
}

async function handleAuthorizeAndSend(req: Request): Promise<Response> {
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

  const userId = authRes.data.user.id;

  let body: AuthorizeAndSendBody = {};
  try {
    body = (await req.json()) as AuthorizeAndSendBody;
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  let parsed: ReturnType<typeof parseAuthorizeBody>;
  try {
    parsed = parseAuthorizeBody(body);
  } catch (e: unknown) {
    return json(400, { error: e instanceof Error ? e.message : "Invalid request payload." });
  }

  const packetRes = await serviceClient
    .from("dispute_packets")
    .select("id,tenant_id,user_id,status,bureau,letter_version,final_doc_storage_path,final_doc_hash")
    .eq("id", parsed.disputePacketId)
    .maybeSingle();

  if (packetRes.error) {
    return json(400, { error: packetRes.error.message || "Unable to read dispute packet." });
  }

  const packet = packetRes.data as DisputePacketRow | null;
  if (!packet) {
    return json(404, { error: "Dispute packet not found." });
  }

  if (packet.user_id !== userId) {
    return json(403, { error: "You do not own this dispute packet." });
  }

  if (packet.status === "draft") {
    return json(409, { error: "Dispute packet must be finalized before mailing." });
  }

  if (!packet.final_doc_storage_path || !packet.final_doc_hash) {
    return json(409, { error: "Dispute packet is missing finalized storage hash data." });
  }

  const recipientAddress = await resolveRecipientAddress(serviceClient, packet.id, parsed.addressInput);
  if (!recipientAddress) {
    return json(400, {
      error: "Recipient address is required for the first mailing event. Provide to_name, to_address_1, to_city, to_state, and to_zip.",
    });
  }

  const consentWindowDays = parseInteger(Deno.env.get("DOCUPOST_CONSENT_MAX_AGE_DAYS"), 30);
  const consentRes = await serviceClient.rpc("nexus_docupost_recent_consent_id", {
    p_user_id: userId,
    p_dispute_packet_id: packet.id,
    p_max_age_days: consentWindowDays,
  });

  if (consentRes.error) {
    return json(400, { error: consentRes.error.message || "Unable to validate mailing authorization consent." });
  }

  const consentId = typeof consentRes.data === "string" && consentRes.data ? consentRes.data : null;
  if (!consentId) {
    return json(412, {
      error: `Missing required docupost_mailing_auth consent for this packet within the last ${consentWindowDays} days.`,
    });
  }

  const parsedPath = parseStoragePath(packet.final_doc_storage_path);
  if (!parsedPath) {
    return json(409, { error: "Invalid final_doc_storage_path format." });
  }

  const fileRes = await serviceClient.storage
    .from(parsedPath.bucket)
    .download(parsedPath.objectPath);

  if (fileRes.error || !fileRes.data) {
    return json(400, { error: fileRes.error?.message || "Unable to read finalized letter from storage." });
  }

  const fileHash = await sha256Hex(await fileRes.data.arrayBuffer());
  if (fileHash.toLowerCase() !== packet.final_doc_hash.toLowerCase()) {
    return json(409, { error: "Finalized document hash mismatch; packet integrity check failed." });
  }

  const queuedRes = await serviceClient
    .from("mailing_events")
    .insert({
      tenant_id: packet.tenant_id,
      user_id: userId,
      dispute_packet_id: packet.id,
      provider: "docupost",
      status: "queued",
      to_name: recipientAddress.to_name,
      to_address_1: recipientAddress.to_address_1,
      to_address_2: recipientAddress.to_address_2 || null,
      to_city: recipientAddress.to_city,
      to_state: recipientAddress.to_state,
      to_zip: recipientAddress.to_zip,
      document_hash: fileHash,
      authorized_consent_id: consentId,
    })
    .select("id,status")
    .single();

  if (queuedRes.error || !queuedRes.data?.id) {
    return json(400, { error: queuedRes.error?.message || "Unable to queue mailing event." });
  }

  const mailingEventId = String(queuedRes.data.id);

  const adapter = new DocuPostAdapter(
    Deno.env.get("DOCUPOST_API_KEY") || "",
    Deno.env.get("DOCUPOST_BASE_URL") || "",
    parseBoolean(Deno.env.get("DOCUPOST_TEST_MODE"), true),
  );

  const submitResult = await adapter.submitMail({
    mailingEventId,
    disputePacketId: packet.id,
    documentHash: fileHash,
    ...recipientAddress,
  });

  const finalStatus = submitResult.status;

  await serviceClient
    .from("mailing_events")
    .update({
      status: finalStatus,
      provider_reference_id: submitResult.providerReferenceId,
      cost_cents: submitResult.costCents,
    })
    .eq("id", mailingEventId);

  await serviceClient
    .from("dispute_packets")
    .update({
      status: finalStatus === "sent" || finalStatus === "submitted" ? "mailed" : "mail_failed",
    })
    .eq("id", packet.id);

  await writeAuditEvent(serviceClient, {
    tenantId: packet.tenant_id,
    userId,
    eventType: "DOCUPOST_SUBMIT",
    metadata: {
      mailing_event_id: mailingEventId,
      dispute_packet_id: packet.id,
      provider_reference_id: submitResult.providerReferenceId,
      status: finalStatus,
    },
  });

  if (finalStatus === "failed") {
    return json(502, {
      error: submitResult.errorMessage || "DocuPost submission failed.",
      mailing_event_id: mailingEventId,
      status: finalStatus,
    });
  }

  return json(200, {
    success: true,
    mailing_event_id: mailingEventId,
    status: finalStatus,
    provider_reference_id: submitResult.providerReferenceId,
  });
}

async function handleWebhook(req: Request): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "Supabase environment is not configured." });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  // TODO(docupost): validate webhook signature once provider contract is finalized.
  const providerReferenceId = normalizeString(payload.provider_reference_id)
    || normalizeString(payload.reference_id)
    || normalizeString(payload.id);

  if (!providerReferenceId) {
    return json(400, { error: "provider_reference_id is required." });
  }

  const nextStatus = mapProviderStatus(normalizeString(payload.status) || normalizeString(payload.event));

  if (!["submitted", "sent", "failed", "canceled"].includes(nextStatus)) {
    return json(400, { error: "Unsupported webhook status." });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const eventRes = await serviceClient
    .from("mailing_events")
    .select("id,tenant_id,dispute_packet_id,provider_reference_id")
    .eq("provider", "docupost")
    .eq("provider_reference_id", providerReferenceId)
    .limit(1)
    .maybeSingle();

  if (eventRes.error) {
    return json(400, { error: eventRes.error.message || "Unable to resolve mailing event." });
  }

  const mailingEvent = eventRes.data as MailingEventRow | null;
  if (!mailingEvent) {
    return json(404, { error: "Mailing event not found for provider reference." });
  }

  await serviceClient
    .from("mailing_events")
    .update({ status: nextStatus })
    .eq("id", mailingEvent.id);

  await serviceClient
    .from("dispute_packets")
    .update({ status: nextStatus === "sent" || nextStatus === "submitted" ? "mailed" : "mail_failed" })
    .eq("id", mailingEvent.dispute_packet_id);

  await writeAuditEvent(serviceClient, {
    tenantId: mailingEvent.tenant_id,
    userId: null,
    eventType: "DOCUPOST_WEBHOOK",
    metadata: {
      mailing_event_id: mailingEvent.id,
      dispute_packet_id: mailingEvent.dispute_packet_id,
      provider_reference_id: providerReferenceId,
      status: nextStatus,
    },
  });

  return json(200, {
    success: true,
    mailing_event_id: mailingEvent.id,
    status: nextStatus,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  let bodyAction = "";
  try {
    const clone = req.clone();
    const body = (await clone.json()) as Record<string, unknown>;
    bodyAction = normalizeString(body.action).toLowerCase();
  } catch {
    bodyAction = "";
  }

  const route = getRoute(new URL(req.url).pathname, bodyAction);

  if (route === "authorize-and-send") {
    return handleAuthorizeAndSend(req);
  }

  if (route === "webhook") {
    return handleWebhook(req);
  }

  return json(404, { error: "Route not found." });
});
