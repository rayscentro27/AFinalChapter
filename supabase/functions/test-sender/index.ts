import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type SendTestBody = {
  to?: unknown;
  subject?: unknown;
  html?: unknown;
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (!(pathname === "/send-test" || pathname.endsWith("/send-test"))) {
      return json(404, {
        success: false,
        provider: "sender",
        error: "Not found",
      });
    }

    if (req.method !== "POST") {
      return json(405, {
        success: false,
        provider: "sender",
        error: "Method not allowed",
      });
    }

    let payload: SendTestBody;
    try {
      payload = (await req.json()) as SendTestBody;
    } catch {
      return json(400, {
        success: false,
        provider: "sender",
        error: "Invalid JSON body",
      });
    }

    const to = typeof payload.to === "string" ? payload.to.trim() : "";
    const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
    const html = typeof payload.html === "string" ? payload.html : "";

    if (!to || !subject || !html) {
      return json(400, {
        success: false,
        provider: "sender",
        error: "Missing required fields: to, subject, html",
      });
    }

    const senderApiToken = (Deno.env.get("SENDER_API_KEY") ?? Deno.env.get("SENDER_API_TOKEN") ?? "").trim();
    const defaultFromEmail = Deno.env.get("DEFAULT_FROM_EMAIL")?.trim() ?? "";
    const defaultFromName = Deno.env.get("DEFAULT_FROM_NAME")?.trim() ?? "";

    if (!senderApiToken || !defaultFromEmail || !defaultFromName) {
      return json(500, {
        success: false,
        provider: "sender",
        error: "Missing required environment configuration",
      });
    }

    const senderResponse = await fetch("https://api.sender.net/v2/message/send", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${senderApiToken}`,
      },
      body: JSON.stringify({
        from: {
          email: defaultFromEmail,
          name: defaultFromName,
        },
        to: {
          email: to,
          name: "Recipient",
        },
        subject,
        html,
      }),
    });

    const rawText = await senderResponse.text();
    let senderJson: unknown = null;

    if (rawText) {
      try {
        senderJson = JSON.parse(rawText);
      } catch {
        senderJson = { raw: rawText };
      }
    }

    if (!senderResponse.ok) {
      const errorMessage =
        (typeof senderJson === "object" && senderJson !== null && "message" in senderJson
          ? String((senderJson as Record<string, unknown>).message)
          : `Sender API error (${senderResponse.status})`) || `Sender API error (${senderResponse.status})`;

      return json(senderResponse.status >= 400 && senderResponse.status < 600 ? senderResponse.status : 502, {
        success: false,
        provider: "sender",
        error: errorMessage,
      });
    }

    return json(200, {
      success: true,
      provider: "sender",
      sender_response: senderJson,
    });
  } catch (err) {
    return json(500, {
      success: false,
      provider: "sender",
      error: err instanceof Error ? err.message : "Unexpected error",
    });
  }
});
