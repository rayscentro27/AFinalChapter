export type RiskClass = 'low' | 'medium' | 'high' | 'critical';

export function routeModel(input: {
  taskType?: string | null;
  riskClass?: RiskClass | null;
  requestedModel?: string | null;
  allowRequestedModel?: boolean | null;
}) {
  const task = String(input.taskType || '').toLowerCase();
  const risk = (String(input.riskClass || 'medium').toLowerCase() as RiskClass);

  if (input.allowRequestedModel && input.requestedModel && String(input.requestedModel).trim().length > 0) {
    return String(input.requestedModel).trim();
  }

  if (risk === 'critical' || risk === 'high') return 'gemini-3-pro-preview';

  if (['compliance', 'policy', 'legal', 'contract'].some((k) => task.includes(k))) {
    return 'gemini-3-pro-preview';
  }

  if (['summary', 'format', 'rewrite', 'support', 'operations', 'ops'].some((k) => task.includes(k))) {
    return 'gemini-3-flash-preview';
  }

  return 'gemini-3-flash-preview';
}
