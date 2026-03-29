import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireStaffUser } from './_shared/staff_auth';
import { YoutubeTranscript } from "youtube-transcript-plus";

const BodySchema = z.object({
  url: z.string().min(10),
  title: z.string().min(1).optional().default("YouTube Video"),
  tags: z.array(z.string()).optional().default([]),
  lang: z.string().optional().default("en"),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const actor = await requireStaffUser(event);

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return json(500, {
        error: "Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      });
    }

    const body = BodySchema.parse(JSON.parse(event.body || "{}"));

    const segments = await YoutubeTranscript.fetchTranscript(body.url, {
      lang: body.lang,
    });

    if (!segments?.length) {
      return json(422, {
        error:
          "No transcript found. Captions may be disabled/unavailable. Use manual paste fallback.",
      });
    }

    const transcript = segments
      .map((s: any) => String(s?.text || "").trim())
      .filter(Boolean)
      .join(" ");

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data, error } = await supabase
      .from("knowledge_docs")
      .upsert(
        {
          source_url: body.url,
          source_type: "youtube",
          title: body.title,
          content: transcript,
          tags: body.tags,
        },
        { onConflict: "source_url" }
      )
      .select("id")
      .single();

    if (error) throw error;

    return json(200, {
      ok: true,
      doc_id: data.id,
      chars: transcript.length,
      segments: segments.length,
    });
   } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    const msg = typeof e?.message === 'string' ? e.message : 'Bad Request';
    return json(statusCode, { error: msg });
  }
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
