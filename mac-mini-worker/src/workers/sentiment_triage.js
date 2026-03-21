import { supabaseAdmin } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('sentiment_triage');

function asText(value) {
  return String(value || '').trim();
}

/**
 * Sentiment Triage Handler
 * Enriches inbound messages with sentiment, intent, and urgency classification
 */
export async function handleSentimentTriage(job, context) {
  const tenantId = asText(job.tenant_id || job.payload?.tenant_id || '');
  const messageId = asText(job.payload?.message_id || '');
  const conversationId = asText(job.payload?.conversation_id || '');

  if (!tenantId || !messageId) {
    throw new Error('missing_required_fields: tenant_id or message_id');
  }

  logger.info({
    job_id: job.id,
    message_id: messageId,
    tenant_id: tenantId
  }, 'sentiment_triage_started');

  try {
    // Fetch the message
    const { data: message, error: msgErr } = await supabaseAdmin
      .from('messages')
      .select('id, body, direction, provider, conversation_id, received_at, content')
      .eq('id', messageId)
      .eq('tenant_id', tenantId)
      .single();

    if (msgErr) {
      throw new Error(`message_lookup_failed: ${msgErr.message}`);
    }

    if (!message) {
      throw new Error('message_not_found');
    }

    const body = asText(message.body);
    if (!body) {
      throw new Error('message_body_empty');
    }

    // For now, use simple heuristic enrichment
    // (In production, this would call Gemini/OpenAI API)
    const enrichment = heuristicEnrichment(body);

    // Update message with enrichment results
    const { error: updateErr } = await supabaseAdmin
      .from('messages')
      .update({
        ai_sentiment: enrichment.sentiment,
        ai_intent: enrichment.intent,
        ai_urgency: enrichment.urgency,
        ai_summary: enrichment.summary,
        ai_suggested_tags: enrichment.suggested_tags,
        ai_enrich_status: 'complete',
        ai_enriched_at: new Date().toISOString()
      })
      .eq('id', messageId)
      .eq('tenant_id', tenantId);

    if (updateErr) {
      logger.error({ err: updateErr, message_id: messageId }, 'Failed to update message enrichment');
      throw updateErr;
    }

    logger.info({
      job_id: job.id,
      message_id: messageId,
      sentiment: enrichment.sentiment
    }, 'sentiment_triage_completed');

    return {
      sentiment: enrichment.sentiment,
      intent: enrichment.intent,
      urgency: enrichment.urgency
    };
  } catch (err) {
    logger.error({
      job_id: job.id,
      message_id: messageId,
      err: err?.message || String(err)
    }, 'sentiment_triage_failed');
    throw err;
  }
}

/**
 * Simple heuristic enrichment (no API calls)
 * In production, integrate with Gemini API
 */
function heuristicEnrichment(messageText) {
  const text = messageText.toLowerCase();

  // Sentiment detection
  let sentiment = 'neutral';
  const positiveKeywords = ['great', 'excellent', 'amazing', 'thank', 'good', 'happy', 'love', 'perfect'];
  const negativeKeywords = ['bad', 'terrible', 'awful', 'hate', 'angry', 'frustrated', 'disappointed', 'problem', 'issue', 'error', 'critical', 'urgent', 'emergency'];

  const positiveCount = positiveKeywords.filter(k => text.includes(k)).length;
  const negativeCount = negativeKeywords.filter(k => text.includes(k)).length;

  if (negativeCount > positiveCount && negativeCount > 0) {
    sentiment = 'negative';
  } else if (positiveCount > negativeCount && positiveCount > 0) {
    sentiment = 'positive';
  }

  // Intent detection
  let intent = 'other';
  if (text.includes('help') || text.includes('support') || text.includes('issue') || text.includes('problem')) {
    intent = 'support';
  } else if (text.includes('buy') || text.includes('purchase') || text.includes('interested') || text.includes('price')) {
    intent = 'sales';
  } else if (text.includes('bill') || text.includes('charge') || text.includes('payment') || text.includes('invoice')) {
    intent = 'billing';
  }

  // Urgency detection
  let urgency = 'normal';
  if (text.includes('urgent') || text.includes('emergency') || text.includes('asap') || text.includes('critical') || text.includes('immediate')) {
    urgency = 'high';
  } else if (text.includes('when you get a chance') || text.includes('no rush') || text.includes('sometime')) {
    urgency = 'low';
  }

  // Summary (just first 200 chars)
  const summary = messageText.substring(0, 200);

  return {
    sentiment,
    intent,
    urgency,
    summary,
    suggested_tags: generateTags(sentiment, intent, urgency),
    suggested_reply: generateSuggestedReply(sentiment, intent)
  };
}

function generateTags(sentiment, intent, urgency) {
  const tags = [];
  if (sentiment === 'negative') tags.push('negative');
  if (sentiment === 'positive') tags.push('positive');
  tags.push(intent);
  if (urgency === 'high') tags.push('urgent');
  return tags;
}

function generateSuggestedReply(sentiment, intent) {
  if (intent === 'support') {
    return "Thank you for reaching out. We're here to help. Can you provide more details about your issue?";
  }
  if (intent === 'sales') {
    return "Thanks for your interest! I'd love to help you with more information about our service.";
  }
  if (intent === 'billing') {
    return 'I understand you have a billing question. Let me look into that for you right away.';
  }
  return 'Thank you for your message. How can I help?';
}

export default handleSentimentTriage;
