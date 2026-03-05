import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireStaffUser } from './_shared/staff_auth';

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

const BodySchema = z.object({
  filename: z.string().min(1),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const actor = await requireStaffUser(event);

    if (!process.env.SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

    const body = BodySchema.parse(JSON.parse(event.body || "{}"));

    const safe = body.filename.replace(/[^\w.\-]/g, "_");
    const path = `social/${Date.now()}_${safe}`;

    const { data, error } = await supabase.storage
      .from("training_media")
      .createSignedUploadUrl(path, { upsert: false });

    if (error) throw error;

    return json(200, { ok: true, path, token: data.token });
   } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
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
