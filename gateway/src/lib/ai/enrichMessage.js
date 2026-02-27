import { ENV } from '../../env.js';
import { supabaseAdmin as defaultSupabaseAdmin } from '../../supabase.js';
import { redactText } from '../../util/redact.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

function extractMessageBody(row) {
  const direct = asText(row?.body || row?.body_text);
  if (direct) return direct;

  const content = asObject(row?.content);
  return asText(content.text || content.body || content.message || content.caption || '');
}

function normalizeSentiment(value) {
  const v = asText(value).toLowerCase();
  if (v === 'positive' || v === 'neutral' || v === 'negative') return v;
  return 'neutral';
}

function normalizeIntent(value) {
  const v = asText(value).toLowerCase();
  if (v === 'sales' || v === 'support' || v === 'billing' || v === 'other') return v;
  return 'other';
}

function normalizeUrgency(value) {
  const v = asText(value).toLowerCase();
  if (v === 'low' || v === 'normal' || v === 'high') return v;
  return 'normal';
}

function parseJsonFromText(input) {
  const text = asText(input);
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function maskPii(text) {
  const input = asText(text);
  if (!input) return '';

  return input
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[phone]');
}

function heuristicEnrichment(messageText) {
  const text = asText(messageText);
  const lower = text.toLowerCase();

  let sentiment = 'neutral';
  if (/\b(thanks|great|awesome|perfect|love|appreciate)\b/.test(lower)) sentiment = 'positive';
  if (/\b(angry|upset|bad|terrible|hate|frustrat|not happy|cancel)\b/.test(lower)) sentiment = 'negative';

  let intent = 'other';
  if (/\b(price|quote|buy|purchase|plan|interested|demo|call me)\b/.test(lower)) intent = 'sales';
  if (/\b(help|issue|broken|problem|error|support|can.?t|cannot|stuck)\b/.test(lower)) intent = 'support';
  if (/\b(invoice|billing|charge|charged|refund|payment|autopay)\b/.test(lower)) intent = 'billing';

  let urgency = 'normal';
  if (/\b(urgent|asap|immediately|right now|today|emergency)\b/.test(lower)) urgency = 'high';
  if (/\b(whenever|no rush|later|next week)\b/.test(lower)) urgency = 'low';

  const summary = text.length <= 180 ? text : `${text.slice(0, 177)}...`;

  const suggested_tags = Array.from(new Set([
    intent,
    urgency === 'high' ? 'urgent' : null,
    sentiment === 'negative' ? 'at_risk' : null,
  ].filter(Boolean)));

  let suggested_reply = '';
  if (intent === 'support') suggested_reply = 'Thanks for flagging this. I can help resolve it now. Can you confirm the best callback number and any error details?';
  if (intent === 'sales') suggested_reply = 'Thanks for your message. I can help with next funding options and timing. What amount and timeline are you targeting?';
  if (intent === 'billing') suggested_reply = 'Thanks for reaching out on billing. I can review this with you now and confirm the next step.';
  if (!suggested_reply) suggested_reply = 'Thanks for the update. I reviewed your message and can help with the next step when you are ready.';

  return {
    sentiment,
    intent,
    urgency,
    summary,
    suggested_tags,
    suggested_reply,
  };
}

async function callOpenAI({ apiKey, contextText }) {
  const model = asText(process.env.AI_OPENAI_MODEL) || 'gpt-4.1-mini';

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: 'Classify customer inbound message. Return strict JSON only with keys: sentiment, intent, urgency, summary, suggested_tags, suggested_reply. sentiment: positive|neutral|negative. intent: sales|support|billing|other. urgency: low|normal|high. suggested_tags must be array of short strings.'
            },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: contextText },
          ],
        },
      ],
    }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`openai_enrich_failed_${response.status}`);

  const parsed = parseJsonFromText(text);
  if (!parsed) throw new Error('openai_enrich_invalid_json');
  return parsed;
}

async function callGemini({ apiKey, contextText }) {
  const model = asText(process.env.AI_GEMINI_MODEL) || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [{
          text: 'Classify customer inbound message. Return strict JSON only with keys: sentiment, intent, urgency, summary, suggested_tags, suggested_reply. sentiment: positive|neutral|negative. intent: sales|support|billing|other. urgency: low|normal|high. suggested_tags must be array of short strings.\n\n' + contextText,
        }],
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 600,
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`gemini_enrich_failed_${response.status}`);

  const text = asText(payload?.candidates?.[0]?.content?.parts?.[0]?.text);
  const parsed = parseJsonFromText(text);
  if (!parsed) throw new Error('gemini_enrich_invalid_json');
  return parsed;
}

export async function enrichMessage({
  supabaseAdmin = defaultSupabaseAdmin,
  tenant_id,
  message_id,
  includeSuggestedReply = true,
}) {
  const tenantId = asText(tenant_id);
  const messageId = asText(message_id);
  if (!tenantId || !messageId) throw new Error('missing_required_fields');

  const messageRes = await supabaseAdmin
    .from('messages')
    .select('id,tenant_id,conversation_id,contact_id,body,direction,provider,received_at,metadata,content')
    .eq('tenant_id', tenantId)
    .eq('id', messageId)
    .maybeSingle();

  if (messageRes.error) throw new Error(`message lookup failed: ${messageRes.error.message}`);
  if (!messageRes.data) throw new Error('message_not_found');

  const message = messageRes.data;
  const body = extractMessageBody(message);
  if (!body) throw new Error('message_body_missing');

  const contextRes = await supabaseAdmin
    .from('messages')
    .select('id,direction,provider,body,received_at,content')
    .eq('tenant_id', tenantId)
    .eq('conversation_id', message.conversation_id)
    .order('received_at', { ascending: false })
    .limit(10);

  if (contextRes.error && !isMissingSchema(contextRes.error)) {
    throw new Error(`message context lookup failed: ${contextRes.error.message}`);
  }

  const contextRows = (contextRes.data || []).slice().reverse();
  const promptContext = contextRows.map((row) => {
    const text = extractMessageBody(row);
    return `[${asText(row.direction || 'unknown')}/${asText(row.provider || 'unknown')}] ${text}`;
  }).filter(Boolean).join('\n');

  const maskEnabled = String(process.env.AI_MASK_PII || 'true').toLowerCase() !== 'false';
  const contextText = maskEnabled ? maskPii(promptContext) : promptContext;

  const provider = asText(process.env.AI_PROVIDER || 'heuristic').toLowerCase();
  const apiKey = asText(process.env.AI_API_KEY || '');

  let raw = null;
  if (apiKey && provider === 'openai') {
    raw = await callOpenAI({ apiKey, contextText });
  } else if (apiKey && provider === 'gemini') {
    raw = await callGemini({ apiKey, contextText });
  } else {
    raw = heuristicEnrichment(body);
  }

  const suggestedTags = asArray(raw?.suggested_tags).map((tag) => asText(tag)).filter(Boolean).slice(0, 12);

  return {
    sentiment: normalizeSentiment(raw?.sentiment),
    intent: normalizeIntent(raw?.intent),
    urgency: normalizeUrgency(raw?.urgency),
    summary: asText(raw?.summary).slice(0, 1000),
    suggested_tags: suggestedTags,
    suggested_reply: includeSuggestedReply ? asText(raw?.suggested_reply).slice(0, 2000) : null,
  };
}

export async function applyMessageEnrichment({
  supabaseAdmin = defaultSupabaseAdmin,
  tenant_id,
  message_id,
  enrichment,
}) {
  const tenantId = asText(tenant_id);
  const messageId = asText(message_id);
  if (!tenantId || !messageId) throw new Error('missing_required_fields');

  const patch = {
    ai_sentiment: enrichment.sentiment,
    ai_intent: enrichment.intent,
    ai_urgency: enrichment.urgency,
    ai_summary: enrichment.summary,
    ai_suggested_tags: enrichment.suggested_tags,
    ai_suggested_reply: enrichment.suggested_reply,
    ai_enriched_at: new Date().toISOString(),
    ai_enrich_status: 'done',
    ai_last_error: null,
  };

  const update = await supabaseAdmin
    .from('messages')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('id', messageId);

  if (update.error) {
    if (isMissingSchema(update.error)) throw new Error('ai_enrichment_columns_missing');
    throw new Error(`message enrichment update failed: ${update.error.message}`);
  }

  return { ok: true };
}

export async function markMessageEnrichmentFailed({
  supabaseAdmin = defaultSupabaseAdmin,
  tenant_id,
  message_id,
  error,
}) {
  const update = await supabaseAdmin
    .from('messages')
    .update({
      ai_enrich_status: 'failed',
      ai_last_error: redactText(String(error || '')).slice(0, 1000),
    })
    .eq('tenant_id', tenant_id)
    .eq('id', message_id);

  if (update.error && !isMissingSchema(update.error)) {
    throw new Error(`message enrichment failed marker update failed: ${update.error.message}`);
  }
}
