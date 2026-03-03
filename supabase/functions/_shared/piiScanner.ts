export type PiiPatternKey =
  | 'email'
  | 'phone'
  | 'ssn'
  | 'dob'
  | 'full_address'
  | 'city_state_zip'
  | 'full_account_number'
  | 'name_labeled';

export type PiiFinding = {
  key: PiiPatternKey;
  match_preview: string;
  index: number;
};

const PATTERNS: Record<PiiPatternKey, RegExp> = {
  email: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  phone: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?){2}\d{4}\b/g,
  ssn: /\b\d{3}-?\d{2}-?\d{4}\b/g,
  dob: /\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19\d{2}|20\d{2}|\d{2})\b/g,
  full_address: /\b\d{1,6}\s+[A-Za-z0-9.'\-\s]{2,60}\s(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct)\b/gi,
  city_state_zip: /\b[A-Za-z.'\-\s]{2,40},\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g,
  full_account_number: /\b\d{8,19}\b/g,
  name_labeled: /\b(?:name|consumer|client)\s*[:\-]\s*[A-Z][a-z]{1,30}(?:\s+[A-Z][a-z]{1,30}){1,2}\b/g,
};

const REDACTION_TOKENS: Record<PiiPatternKey, string> = {
  email: '[REDACTED_EMAIL]',
  phone: '[REDACTED_PHONE]',
  ssn: '[REDACTED_SSN]',
  dob: '[REDACTED_DOB]',
  full_address: '[REDACTED_ADDRESS]',
  city_state_zip: '[REDACTED_CITY_STATE_ZIP]',
  full_account_number: '[REDACTED_ACCOUNT]',
  name_labeled: '[REDACTED_NAME]',
};

function resetRegex(regex: RegExp): RegExp {
  return new RegExp(regex.source, regex.flags);
}

function preview(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return '[REDACTED]';
  return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
}

function flattenToText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

export function scanForPII(value: unknown): PiiFinding[] {
  const text = flattenToText(value);
  const findings: PiiFinding[] = [];

  (Object.keys(PATTERNS) as PiiPatternKey[]).forEach((key) => {
    const regex = resetRegex(PATTERNS[key]);
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(text)) !== null) {
      findings.push({
        key,
        match_preview: preview(match[0] || ''),
        index: match.index,
      });

      if (findings.length >= 200) {
        return;
      }
    }
  });

  return findings.sort((a, b) => a.index - b.index);
}

export function redactPIIText(input: string): {
  redacted: string;
  counts: Record<PiiPatternKey, number>;
} {
  let redacted = String(input || '');
  const counts: Record<PiiPatternKey, number> = {
    email: 0,
    phone: 0,
    ssn: 0,
    dob: 0,
    full_address: 0,
    city_state_zip: 0,
    full_account_number: 0,
    name_labeled: 0,
  };

  (Object.keys(PATTERNS) as PiiPatternKey[]).forEach((key) => {
    const regex = resetRegex(PATTERNS[key]);
    redacted = redacted.replace(regex, () => {
      counts[key] += 1;
      return REDACTION_TOKENS[key];
    });
  });

  return { redacted, counts };
}

export function piiScanPayload(value: unknown): {
  blocked: boolean;
  findings: PiiFinding[];
} {
  const findings = scanForPII(value);
  return {
    blocked: findings.length > 0,
    findings,
  };
}

export const PII_PATTERN_KEYS: PiiPatternKey[] = Object.keys(PATTERNS) as PiiPatternKey[];
