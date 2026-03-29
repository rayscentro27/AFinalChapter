import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type PolicyDocumentRow = {
  id: string;
  key: string;
  title: string;
  is_active: boolean;
  require_reaccept_on_publish: boolean;
  created_at: string;
  updated_at: string;
};

type PolicyVersionRow = {
  id: string;
  document_id: string;
  version: string;
  content_md: string;
  content_hash: string;
  published_at: string | null;
  published_by: string | null;
  is_published: boolean;
  created_at: string;
};

type DraftBody = {
  version?: unknown;
  content_md?: unknown;
  title?: unknown;
  require_reaccept_on_publish?: unknown;
  is_active?: unknown;
};

type PublishBody = {
  version?: unknown;
  require_reaccept_on_publish?: unknown;
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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

function normalizeString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function normalizeBoolean(input: unknown): boolean | null {
  if (typeof input === "boolean") return input;
  if (typeof input === "string") {
    const value = input.trim().toLowerCase();
    if (value === "true" || value === "1" || value === "yes") return true;
    if (value === "false" || value === "0" || value === "no") return false;
  }
  return null;
}

function normalizePolicyKey(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "_");
}

function splitPath(pathname: string): string[] {
  return pathname
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
}

function parseVersionNumber(version: string): number | null {
  const match = version.trim().match(/^v(\d+)$/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function suggestNextVersion(versions: string[]): string {
  let maxVersion = 0;
  for (const raw of versions) {
    const parsed = parseVersionNumber(raw);
    if (parsed && parsed > maxVersion) {
      maxVersion = parsed;
    }
  }
  return `v${maxVersion + 1}`;
}

async function assertAuthHeader(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authHeader;
}

async function isSuperAdmin(userClient: ReturnType<typeof createClient>): Promise<boolean> {
  const accessRes = await userClient.rpc("nexus_is_master_admin_compat");
  if (accessRes.error) return false;
  return Boolean(accessRes.data);
}

async function loadDocumentByKey(
  serviceClient: ReturnType<typeof createClient>,
  policyKey: string,
): Promise<PolicyDocumentRow | null> {
  const docRes = await serviceClient
    .from("policy_documents")
    .select("id,key,title,is_active,require_reaccept_on_publish,created_at,updated_at")
    .eq("key", policyKey)
    .maybeSingle();

  if (docRes.error) {
    throw new Error(docRes.error.message || "Unable to load policy document.");
  }

  return (docRes.data || null) as PolicyDocumentRow | null;
}

async function loadPublishedVersion(
  serviceClient: ReturnType<typeof createClient>,
  documentId: string,
): Promise<PolicyVersionRow | null> {
  const versionRes = await serviceClient
    .from("policy_versions")
    .select("id,document_id,version,content_md,content_hash,published_at,published_by,is_published,created_at")
    .eq("document_id", documentId)
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (versionRes.error) {
    throw new Error(versionRes.error.message || "Unable to load latest published policy version.");
  }

  return (versionRes.data || null) as PolicyVersionRow | null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return json(500, { error: "Supabase environment is not configured." });
  }

  const authHeader = await assertAuthHeader(req);
  if (!authHeader) {
    return json(401, { error: "Missing bearer token." });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const authRes = await userClient.auth.getUser();
  const authUserId = authRes.data.user?.id || null;
  if (authRes.error || !authUserId) {
    return json(401, { error: "Unauthorized." });
  }

  const url = new URL(req.url);
  const parts = splitPath(url.pathname);

  let routeStart = parts.findIndex((part) => part === "policy-admin");
  if (routeStart < 0) {
    routeStart = 0;
  } else {
    routeStart += 1;
  }

  const route = parts.slice(routeStart);

  try {
    // GET /policies
    if (req.method === "GET" && route.length === 1 && route[0] === "policies") {
      const superAdmin = await isSuperAdmin(userClient);
      if (!superAdmin) {
        return json(403, { error: "Super admin access required." });
      }

      const [docsRes, versionsRes] = await Promise.all([
        serviceClient
          .from("policy_documents")
          .select("id,key,title,is_active,require_reaccept_on_publish,created_at,updated_at")
          .order("key", { ascending: true }),
        serviceClient
          .from("policy_versions")
          .select("id,document_id,version,content_hash,published_at,published_by,is_published,created_at")
          .order("created_at", { ascending: false }),
      ]);

      if (docsRes.error) {
        return json(400, { error: docsRes.error.message || "Unable to load policy documents." });
      }

      if (versionsRes.error) {
        return json(400, { error: versionsRes.error.message || "Unable to load policy versions." });
      }

      const versionsByDocument = new Map<string, Array<Record<string, unknown>>>();
      for (const row of versionsRes.data || []) {
        const list = versionsByDocument.get(row.document_id) || [];
        list.push(row);
        versionsByDocument.set(row.document_id, list);
      }

      const policies = (docsRes.data || []).map((doc) => {
        const versions = versionsByDocument.get(doc.id) || [];
        const latestPublished = versions.find((item) => item.is_published) || null;
        return {
          ...doc,
          latest_published: latestPublished,
          versions,
        };
      });

      return json(200, { policies });
    }

    // GET /policies/:key/latest
    if (req.method === "GET" && route.length === 3 && route[0] === "policies" && route[2] === "latest") {
      const policyKey = normalizePolicyKey(route[1]);
      if (!policyKey) {
        return json(400, { error: "Policy key is required." });
      }

      const doc = await loadDocumentByKey(serviceClient, policyKey);
      if (!doc || !doc.is_active) {
        return json(404, { error: "Policy document not found." });
      }

      const latest = await loadPublishedVersion(serviceClient, doc.id);
      if (!latest) {
        return json(404, { error: "Published policy version not found." });
      }

      return json(200, {
        policy_key: doc.key,
        title: doc.title,
        document_id: doc.id,
        policy_version_id: latest.id,
        version: latest.version,
        content_md: latest.content_md,
        content_hash: latest.content_hash,
        published_at: latest.published_at,
        published_by: latest.published_by,
      });
    }

    // POST /policies/:key/draft
    if (req.method === "POST" && route.length === 3 && route[0] === "policies" && route[2] === "draft") {
      const superAdmin = await isSuperAdmin(userClient);
      if (!superAdmin) {
        return json(403, { error: "Super admin access required." });
      }

      const policyKey = normalizePolicyKey(route[1]);
      if (!policyKey) {
        return json(400, { error: "Policy key is required." });
      }

      let body: DraftBody = {};
      try {
        body = (await req.json()) as DraftBody;
      } catch {
        return json(400, { error: "Invalid JSON body." });
      }

      const contentMd = normalizeString(body.content_md);
      if (!contentMd) {
        return json(400, { error: "content_md is required." });
      }

      const requestedTitle = normalizeString(body.title);
      const requestedVersion = normalizeString(body.version);
      const requestedRequireReaccept = normalizeBoolean(body.require_reaccept_on_publish);
      const requestedIsActive = normalizeBoolean(body.is_active);

      let doc = await loadDocumentByKey(serviceClient, policyKey);
      if (!doc) {
        const insertDocRes = await serviceClient
          .from("policy_documents")
          .insert({
            key: policyKey,
            title: requestedTitle || policyKey,
            is_active: requestedIsActive ?? true,
            require_reaccept_on_publish: requestedRequireReaccept ?? false,
          })
          .select("id,key,title,is_active,require_reaccept_on_publish,created_at,updated_at")
          .single();

        if (insertDocRes.error) {
          return json(400, { error: insertDocRes.error.message || "Unable to create policy document." });
        }

        doc = insertDocRes.data as PolicyDocumentRow;
      } else {
        const patch: Record<string, unknown> = {};
        if (requestedTitle) patch.title = requestedTitle;
        if (requestedRequireReaccept !== null) patch.require_reaccept_on_publish = requestedRequireReaccept;
        if (requestedIsActive !== null) patch.is_active = requestedIsActive;

        if (Object.keys(patch).length > 0) {
          const updateDocRes = await serviceClient
            .from("policy_documents")
            .update(patch)
            .eq("id", doc.id)
            .select("id,key,title,is_active,require_reaccept_on_publish,created_at,updated_at")
            .single();

          if (updateDocRes.error) {
            return json(400, { error: updateDocRes.error.message || "Unable to update policy document." });
          }

          doc = updateDocRes.data as PolicyDocumentRow;
        }
      }

      const versionsRes = await serviceClient
        .from("policy_versions")
        .select("version")
        .eq("document_id", doc.id);

      if (versionsRes.error) {
        return json(400, { error: versionsRes.error.message || "Unable to load policy versions." });
      }

      const allVersions = (versionsRes.data || []).map((item) => String(item.version || "")).filter(Boolean);
      const nextVersion = requestedVersion || suggestNextVersion(allVersions);

      const draftInsertRes = await serviceClient
        .from("policy_versions")
        .insert({
          document_id: doc.id,
          version: nextVersion,
          content_md: contentMd,
          is_published: false,
          published_at: null,
          published_by: null,
        })
        .select("id,document_id,version,content_md,content_hash,published_at,published_by,is_published,created_at")
        .single();

      if (draftInsertRes.error) {
        return json(400, { error: draftInsertRes.error.message || "Unable to create policy draft." });
      }

      return json(200, {
        document: doc,
        draft: draftInsertRes.data,
      });
    }

    // POST /policies/:key/publish
    if (req.method === "POST" && route.length === 3 && route[0] === "policies" && route[2] === "publish") {
      const superAdmin = await isSuperAdmin(userClient);
      if (!superAdmin) {
        return json(403, { error: "Super admin access required." });
      }

      const policyKey = normalizePolicyKey(route[1]);
      if (!policyKey) {
        return json(400, { error: "Policy key is required." });
      }

      let body: PublishBody = {};
      try {
        body = (await req.json()) as PublishBody;
      } catch {
        return json(400, { error: "Invalid JSON body." });
      }

      const version = normalizeString(body.version);
      if (!version) {
        return json(400, { error: "version is required." });
      }

      const requestedRequireReaccept = normalizeBoolean(body.require_reaccept_on_publish);
      if (requestedRequireReaccept !== null) {
        const doc = await loadDocumentByKey(serviceClient, policyKey);
        if (!doc) {
          return json(404, { error: "Policy document not found." });
        }

        const patchRes = await serviceClient
          .from("policy_documents")
          .update({ require_reaccept_on_publish: requestedRequireReaccept })
          .eq("id", doc.id);

        if (patchRes.error) {
          return json(400, { error: patchRes.error.message || "Unable to update policy publish behavior." });
        }
      }

      const publishRes = await userClient.rpc("admin_publish_policy_version", {
        p_policy_key: policyKey,
        p_version: version,
      });

      if (publishRes.error) {
        return json(400, { error: publishRes.error.message || "Unable to publish policy version." });
      }

      const payload = Array.isArray(publishRes.data) ? publishRes.data[0] : publishRes.data;

      return json(200, {
        published: payload || null,
      });
    }

    return json(404, { error: "Not found." });
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
});
