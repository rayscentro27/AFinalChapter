import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireStaffUser } from './_shared/staff_auth';
import { YoutubeTranscript } from "youtube-transcript-plus";

const BodySchema = z.object({
  urls: z.array(z.string().min(10)).min(1).max(300),
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
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const urls = body.urls
      .map((u) => String(u || "").trim())
      .filter(Boolean);

    const results: Array<{
      url: string;
      ok: boolean;
      doc_id?: string;
      chars?: number;
      error?: string;
    }> = [];

    for (const url of urls) {
      try {
        const segments = await YoutubeTranscript.fetchTranscript(url, { lang: body.lang });
        if (!segments?.length) {
          results.push({ url, ok: false, error: "No transcript" });
          continue;
        }

        const transcript = segments
          .map((s: any) => String(s?.text || "").trim())
          .filter(Boolean)
          .join(" ");

        const title = buildTitle(url);

        const { data, error } = await supabase
          .from("knowledge_docs")
          .upsert(
            {
              source_url: url,
              source_type: "youtube",
              title,
              content: transcript,
              tags: body.tags,
            },
            { onConflict: "source_url" }
          )
          .select("id")
          .single();

        if (error) throw error;

        results.push({ url, ok: true, doc_id: data.id, chars: transcript.length });
      } catch (e: any) {
        results.push({ url, ok: false, error: e?.message || "Failed" });
      }
    }

    const success = results.filter((r) => r.ok).length;

    return json(200, {
      ok: true,
      total: results.length,
      success,
      failed: results.length - success,
      results,
    });
   } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

function buildTitle(url: string) {
  try {
    const u = new URL(url);
    const vid = u.searchParams.get("v");
    if (vid) return `YouTube Ingest: ${vid}`;
  } catch {
    // ignore
  }
  return "YouTube Ingest";
}

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
