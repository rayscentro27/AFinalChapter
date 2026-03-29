function norm(s) {
  return String(s || '').toLowerCase().trim();
}

function includesWordOrSubstring(haystack, needle) {
  const h = norm(haystack);
  const n = norm(needle);
  if (!n) return false;
  return h.includes(n);
}

export function ruleMatches({ rule, ctx }) {
  const matchType = rule.match_type;
  const matchValue = rule.match_value;

  const tags = Array.isArray(ctx.conversation.tags) ? ctx.conversation.tags : [];
  const status = ctx.conversation.status;
  const priority = ctx.conversation.priority;
  const provider = ctx.channel.provider;
  const lastBody = ctx.lastMessage?.body || '';

  if (matchType === 'tag_or_keyword') {
    const tagHit = tags.some((tag) => includesWordOrSubstring(tag, matchValue));
    const bodyHit = includesWordOrSubstring(lastBody, matchValue);
    return tagHit || bodyHit;
  }

  if (matchType === 'channel') {
    return norm(provider) === norm(matchValue);
  }

  if (matchType === 'status') {
    return norm(status) === norm(matchValue);
  }

  if (matchType === 'priority_lte') {
    const n = Number(matchValue);
    if (!Number.isFinite(n)) return false;
    return Number(priority) <= n;
  }

  return false;
}
