import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import crypto from "node:crypto";
import { GoogleGenAI } from "@google/genai";

const BodySchema = z.object({
  model: z.string().min(1),
  // The @google/genai SDK accepts either a string or an array of multimodal parts.
  contents: z.any(),
  config: z.any().optional(),

  // Optional: let the caller group cache entries by feature.
  cache_namespace: z.string().optional().default("gemini_generate"),
});

type CachedResponse = {
  text: string;
  candidates?: any;
  // Surface cache hits to the client.
  cached?: boolean;
};

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const geminiApiKey = process.env.API_KEY;

    if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");
    if (!supabaseServiceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    if (!geminiApiKey) throw new Error("Missing API_KEY (Gemini)");

    const body = BodySchema.parse(JSON.parse(event.body || "{}"));

    const ttlHours = safeInt(process.env.AGENT_CACHE_TTL_HOURS, 72);

    const cacheKey = sha256(
      JSON.stringify({
        ns: body.cache_namespace,
        model: body.model,
        contents: body.contents,
        config: body.config ?? null,
      })
    );

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Cache lookup
    const { data: hit, error: hitErr } = await supabase
      .from("agent_cache")
      .select("response, created_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (hitErr) {
      // Don't fail the request because of cache issues.
      console.warn("agent_cache lookup failed:", hitErr.message);
    }

    if (hit?.response) {
      const createdAt = hit.created_at ? new Date(hit.created_at) : null;
      const fresh = createdAt ? Date.now() - createdAt.getTime() < ttlHours * 3600_000 : false;

      if (fresh) {
        return json(200, { ...(hit.response as any), cached: true } satisfies CachedResponse);
      }
    }

    // Cache miss: call Gemini
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const resp = await ai.models.generateContent({
      model: body.model,
      contents: body.contents,
      config: body.config,
    } as any);

    const payload: CachedResponse = {
      text: resp.text || "",
      candidates: (resp as any).candidates,
      cached: false,
    };

    // Cache store (best-effort)
    const insertRes = await supabase.from("agent_cache").insert({
      cache_key: cacheKey,
      employee: `gemini:${body.model}`,
      user_message: summarizeUserMessage(body.contents),
      context_hash: sha256(JSON.stringify(body.config ?? {})),
      response: payload,
    });

    if (insertRes.error) {
      // Unique violations are OK in races.
      if (!String(insertRes.error.code || "").includes("23505")) {
        console.warn("agent_cache insert failed:", insertRes.error.message);
      }
    }

    return json(200, payload);
  } catch (e: any) {
    return json(400, { error: e?.message || "Bad Request" });
  }
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      // Keep this locked down; callers are your own site.
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function sha256(s: string) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function safeInt(v: any, fallback: number) {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function summarizeUserMessage(contents: any) {
  try {
    const s = typeof contents === "string" ? contents : JSON.stringify(contents);
    // Avoid storing megabytes for image uploads.
    return s.slice(0, 4000);
  } catch {
    return "[unserializable contents]";
  }
}
