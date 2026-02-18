export type DriftSeverity = 'none' | 'yellow' | 'orange' | 'red';

const normalize = (s: string) => (s || '').toLowerCase();

export function classifyDrift(text: string): {
  severity: DriftSeverity;
  category: string;
  message: string;
  matches: string[];
} {
  const t = normalize(text);
  const matches: string[] = [];

  const red: RegExp[] = [
    /\bfake\b/,
    /\bforge\b/,
    /\bforg(e|ery)\b/,
    /\bedit\b.*\b(bank statement|paystub|statement)\b/,
    /income\s*(inflate|inflation)/,
    /make\s+me\s+approved/,
    /guarantee(d)?\s+approval/,
    /\bbypass\b/,
    /\bhack\b/,
    /\bfraud\b/,
    /guarantee(d)?\s+deletion/,
    /will\s+be\s+removed\s+for\s+sure/,
  ];

  const orange: RegExp[] = [
    /\blegal\s+advice\b/,
    /\btax\s+advice\b/,
    /\bbankruptcy\b/,
    /\blien\b/,
    /\blawsuit\b/,
    /\bsue\b/,
  ];

  const yellow: RegExp[] = [
    /\bguarantee\b/,
    /approved\s+for\s+sure/,
    /how\s+fast\s+can\s+i\s+get\s+funded/,
    /\btimeline\b/,
  ];

  for (const r of red) if (r.test(t)) matches.push(String(r));
  if (matches.length) {
    return {
      severity: 'red',
      category: 'compliance_deception_or_guarantee',
      message: 'Request indicates deception, bypass, or guarantee-seeking behavior. Human review required.',
      matches,
    };
  }

  for (const r of orange) if (r.test(t)) matches.push(String(r));
  if (matches.length) {
    return {
      severity: 'orange',
      category: 'regulated_or_high_stakes',
      message: 'Request appears regulated/high-stakes (legal/tax/bankruptcy). Route to approval mode or human review.',
      matches,
    };
  }

  for (const r of yellow) if (r.test(t)) matches.push(String(r));
  if (matches.length) {
    return {
      severity: 'yellow',
      category: 'expectations_or_timeline',
      message: 'Request implies expectations/timeline pressure. Use educational framing and avoid guarantees.',
      matches,
    };
  }

  return { severity: 'none', category: 'none', message: 'No drift triggers detected.', matches: [] };
}
