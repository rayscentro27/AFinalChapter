import {
  getConversationContext,
  getActiveRoutingRules,
  applyAssignment,
  logRoutingRun,
} from '../db_routing.js';
import { ruleMatches } from './routing_match.js';

function buildContextPayload(conversation, channel, lastMessage) {
  return {
    provider: channel.provider,
    status: conversation.status,
    priority: conversation.priority,
    tags: conversation.tags || [],
    last_message_body: lastMessage?.body || null,
  };
}

export async function runRouting({ tenant_id, conversation_id, dry_run = false, force = false }) {
  const { conversation, channel, lastMessage } = await getConversationContext({
    tenant_id,
    conversation_id,
  });

  const context = buildContextPayload(conversation, channel, lastMessage);

  // Guard: prevent reassignment churn unless explicitly forced.
  if (!force && (conversation.assignee_user_id || conversation.assignee_type === 'ai')) {
    await logRoutingRun({
      tenant_id,
      conversation_id,
      rule_id: null,
      applied: false,
      notes: 'Skipped: conversation already assigned',
    });

    return {
      ok: true,
      applied: false,
      skipped: true,
      reason: 'already_assigned',
      assignment: {
        assignee_type: conversation.assignee_type,
        assignee_user_id: conversation.assignee_user_id,
        assignee_ai_key: conversation.assignee_ai_key || null,
      },
      context,
      statusCode: 200,
    };
  }

  const rules = await getActiveRoutingRules({ tenant_id });

  let matched = null;
  for (const rule of rules) {
    if (ruleMatches({ rule, ctx: { conversation, channel, lastMessage } })) {
      matched = rule;
      break;
    }
  }

  if (!matched) {
    await logRoutingRun({
      tenant_id,
      conversation_id,
      rule_id: null,
      applied: false,
      notes: 'No matching rule',
    });

    return {
      ok: true,
      applied: false,
      matched_rule: null,
      context,
      statusCode: 200,
    };
  }

  if (matched.target_type === 'agent' && !matched.target_user_id) {
    await logRoutingRun({
      tenant_id,
      conversation_id,
      rule_id: matched.id,
      applied: false,
      notes: 'Matched rule but missing target_user_id',
    });

    return {
      ok: false,
      applied: false,
      error: 'Matched rule is invalid (missing target_user_id)',
      matched_rule: matched,
      context,
      statusCode: 422,
    };
  }

  if (dry_run) {
    await logRoutingRun({
      tenant_id,
      conversation_id,
      rule_id: matched.id,
      applied: false,
      notes: `Dry run matched: ${matched.name}`,
    });

    return {
      ok: true,
      applied: false,
      dry_run: true,
      matched_rule: matched,
      context,
      statusCode: 200,
    };
  }

  await applyAssignment({
    tenant_id,
    conversation_id,
    target_type: matched.target_type,
    target_user_id: matched.target_type === 'agent' ? matched.target_user_id : null,
    target_ai_key: matched.target_type === 'ai' ? matched.target_ai_key : null,
  });

  const targetDesc =
    matched.target_type === 'agent'
      ? `agent:${matched.target_user_id}`
      : `ai:${matched.target_ai_key || 'UNKNOWN_AI'}`;

  await logRoutingRun({
    tenant_id,
    conversation_id,
    rule_id: matched.id,
    applied: true,
    notes: `Applied rule "${matched.name}" -> ${targetDesc}`,
  });

  return {
    ok: true,
    applied: true,
    matched_rule: matched,
    assigned: {
      assignee_type: matched.target_type,
      assignee_user_id: matched.target_type === 'agent' ? matched.target_user_id : null,
      assignee_ai_key: matched.target_type === 'ai' ? matched.target_ai_key : null,
    },
    context,
    statusCode: 200,
  };
}
