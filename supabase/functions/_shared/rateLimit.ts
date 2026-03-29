import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((i) => i.toString(16).padStart(2, "0")).join("");
}

export function extractClientIp(req: Request): string {
  const forwarded = String(req.headers.get("x-forwarded-for") || "").trim();
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const real = String(req.headers.get("x-real-ip") || "").trim();
  if (real) return real;

  const cf = String(req.headers.get("cf-connecting-ip") || "").trim();
  if (cf) return cf;

  return "unknown";
}

export async function hitRateLimit(params: {
  serviceClient: SupabaseClient;
  scope: string;
  keyHash: string;
  limit: number;
  windowMinutes: number;
}): Promise<boolean> {
  const now = new Date();
  const since = new Date(now.getTime() - params.windowMinutes * 60 * 1000).toISOString();

  const countRes = await params.serviceClient
    .from("lead_capture_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("scope", params.scope)
    .eq("key_hash", params.keyHash)
    .gte("created_at", since);

  const used = Number(countRes.count || 0);
  if (used >= params.limit) {
    return true;
  }

  await params.serviceClient
    .from("lead_capture_rate_limits")
    .insert({
      scope: params.scope,
      key_hash: params.keyHash,
    });

  return false;
}
