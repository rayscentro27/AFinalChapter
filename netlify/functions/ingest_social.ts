import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

const BodySchema = z.object({
  source_url: z.string().optional().default(""),
  source_platform: z.string().min(2),
  title: z.string().min(1),
  caption: z.string().optional().default(""),
  transcript: z.string().optional().default(""),
  tags: z.array(z.string()).optional().default([]),
  media_path: z.string().optional(),
  media_mime: z.string().optional(),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    if (!process.env.SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

    const body = BodySchema.parse(JSON.parse(event.body || "{}"));

    const content = [body.caption, body.transcript].filter(Boolean).join("\n\n---\n\n");
    if (!content.trim()) return json(422, { error: "Provide caption or transcript text." });

    // NOTE: Requires knowledge_docs table and columns (source_platform/media_path/media_mime).
    const { data, error } = await supabase
      .from("knowledge_docs")
      .insert({
        source_url: body.source_url || `social:${body.source_platform}`,
        source_type: "social",
        source_platform: body.source_platform,
        title: body.title,
        content,
        tags: body.tags,
        media_path: body.media_path ?? null,
        media_mime: body.media_mime ?? null,
      })
      .select("id")
      .single();

    if (error) throw error;

    return json(200, { ok: true, doc_id: data.id });
  } catch (e: any) {
    return json(400, { error: e?.message || "Bad Request" });
  }
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}
