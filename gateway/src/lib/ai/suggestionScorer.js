function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeEmail(value) {
  return asText(value).toLowerCase();
}

function normalizePhone(value) {
  let out = asText(value).replace(/[^\d+]/g, '');
  if (!out) return '';
  if (!out.startsWith('+') && /^\d{10}$/.test(out)) out = `+1${out}`;
  return out;
}

function normalizeIdentity(identityType, identityValue) {
  const type = asText(identityType).toLowerCase();
  const value = asText(identityValue);
  if (!type || !value) return '';
  if (type === 'email') return normalizeEmail(value);
  if (type === 'phone') return normalizePhone(value);
  return value;
}

function tokenizeName(value) {
  return asText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function nameSimilarity(a, b) {
  const left = new Set(tokenizeName(a));
  const right = new Set(tokenizeName(b));
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap / Math.max(left.size, right.size);
}

function identityList(identities, type) {
  return asArray(identities)
    .filter((row) => asText(row?.identity_type).toLowerCase() === type)
    .map((row) => normalizeIdentity(row?.identity_type, row?.identity_value))
    .filter(Boolean);
}

function extractDomain(email) {
  const parts = normalizeEmail(email).split('@');
  return parts.length === 2 ? parts[1] : '';
}

function last4Phone(phone) {
  const digits = normalizePhone(phone).replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : '';
}

export function computeSuggestionScore({ sourceContact, targetContact, sourceIdentities = [], targetIdentities = [] }) {
  const reasons = [];
  let score = 0;

  const sourceEmails = new Set(identityList(sourceIdentities, 'email'));
  const targetEmails = new Set(identityList(targetIdentities, 'email'));
  const sourcePhones = new Set(identityList(sourceIdentities, 'phone'));
  const targetPhones = new Set(identityList(targetIdentities, 'phone'));

  const sourceMetaIds = new Set(asArray(sourceIdentities)
    .filter((row) => ['psid', 'igsid'].includes(asText(row?.identity_type).toLowerCase()))
    .map((row) => normalizeIdentity(row?.identity_type, row?.identity_value))
    .filter(Boolean));

  const targetMetaIds = new Set(asArray(targetIdentities)
    .filter((row) => ['psid', 'igsid'].includes(asText(row?.identity_type).toLowerCase()))
    .map((row) => normalizeIdentity(row?.identity_type, row?.identity_value))
    .filter(Boolean));

  const exactEmail = [...sourceEmails].find((value) => targetEmails.has(value));
  if (exactEmail) {
    score = Math.max(score, 90);
    reasons.push({ signal: 'exact_email_match', weight: 90, value: exactEmail });
  }

  const exactPhone = [...sourcePhones].find((value) => targetPhones.has(value));
  if (exactPhone) {
    score = Math.max(score, 90);
    reasons.push({ signal: 'exact_phone_match', weight: 90, value: exactPhone });
  }

  const exactMeta = [...sourceMetaIds].find((value) => targetMetaIds.has(value));
  const sim = nameSimilarity(sourceContact?.display_name || sourceContact?.name, targetContact?.display_name || targetContact?.name);
  if (exactMeta && sim >= 0.25) {
    score = Math.max(score, 80);
    reasons.push({ signal: 'exact_meta_sender_plus_name_similarity', weight: 80, value: exactMeta, similarity: Number(sim.toFixed(2)) });
  }

  if (!exactEmail) {
    const srcPrimaryEmail = normalizeEmail(sourceContact?.primary_email || sourceContact?.email);
    const tgtPrimaryEmail = normalizeEmail(targetContact?.primary_email || targetContact?.email);
    const srcDomain = extractDomain(srcPrimaryEmail);
    const tgtDomain = extractDomain(tgtPrimaryEmail);
    if (srcDomain && tgtDomain && srcDomain === tgtDomain && sim >= 0.5) {
      score = Math.max(score, 60);
      reasons.push({ signal: 'same_email_domain_and_similar_name', weight: 60, value: srcDomain, similarity: Number(sim.toFixed(2)) });
    }
  }

  if (!exactPhone) {
    const srcPhone = sourceContact?.primary_phone || sourceContact?.phone || '';
    const tgtPhone = targetContact?.primary_phone || targetContact?.phone || '';
    const srcLast4 = last4Phone(srcPhone);
    const tgtLast4 = last4Phone(tgtPhone);
    if (srcLast4 && tgtLast4 && srcLast4 === tgtLast4 && sim >= 0.45) {
      score = Math.max(score, 55);
      reasons.push({ signal: 'same_last4_phone_and_similar_name', weight: 55, value: srcLast4, similarity: Number(sim.toFixed(2)) });
    }
  }

  const srcAddress = asText(sourceContact?.address || sourceContact?.metadata?.address || '');
  const tgtAddress = asText(targetContact?.address || targetContact?.metadata?.address || '');
  if (srcAddress && tgtAddress) {
    const srcTokens = new Set(srcAddress.toLowerCase().split(/\s+/).filter((t) => t.length >= 4));
    const tgtTokens = new Set(tgtAddress.toLowerCase().split(/\s+/).filter((t) => t.length >= 4));
    const overlap = [...srcTokens].some((token) => tgtTokens.has(token));
    if (overlap) {
      score = Math.max(score, 50);
      reasons.push({ signal: 'shared_address_token', weight: 50 });
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let strength = 'weak';
  if (score >= 85) strength = 'strong';
  else if (score >= 60) strength = 'medium';

  return { score, strength, reasons };
}
