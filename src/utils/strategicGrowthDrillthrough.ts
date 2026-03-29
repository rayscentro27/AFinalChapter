import type { ExpansionRecommendation } from '../hooks/useAutonomousExpansion';
import type { MonetizationInputSignal, MonetizationOpportunity } from '../hooks/useMonetizationOpportunities';

function navigate(path: string, hash: string) {
  window.history.pushState({}, '', path);
  window.location.hash = hash;
}

function normalizedText(value: string) {
  return String(value || '').trim().toLowerCase();
}

function openCommandCenterWithDraft(draft: string) {
  const params = new URLSearchParams();
  if (draft.trim()) params.set('draft', draft.trim());
  navigate(params.toString() ? `/admin/ai-command-center?${params.toString()}` : '/admin/ai-command-center', 'admin_super_admin_command_center');
}

export function openMonetizationOpportunity(item: MonetizationOpportunity) {
  const type = normalizedText(item.opportunityType);
  const domain = item.domain || item.title;
  const scopedQuery = item.title || domain;

  if (type.includes('grant')) {
    const params = new URLSearchParams();
    if (scopedQuery) params.set('query', scopedQuery);
    navigate(params.toString() ? `/admin/grants/catalog?${params.toString()}` : '/admin/grants/catalog', 'admin_grants_catalog');
    return;
  }

  if (type.includes('fund') || type.includes('capital') || type.includes('lender')) {
    const params = new URLSearchParams();
    if (scopedQuery) params.set('query', scopedQuery);
    navigate(params.toString() ? `/admin/funding/catalog?${params.toString()}` : '/admin/funding/catalog', 'admin_funding_catalog');
    return;
  }

  if (type.includes('strategy') || type.includes('education') || type.includes('training')) {
    const params = new URLSearchParams();
    params.set('domain', 'strategies');
    params.set('reviewStatus', 'approved');
    if (item.title) params.set('search', item.title);
    navigate(`/admin/content-review?${params.toString()}`, 'admin_research_approvals');
    return;
  }

  openCommandCenterWithDraft(`Evaluate monetization opportunity for ${domain}: ${item.title}. Source: ${item.sourceLabel}. Estimated value: ${item.estimatedValue}. Return the fastest internal go-to-market plan.`);
}

export function openExpansionRecommendation(item: ExpansionRecommendation) {
  if (item.category === 'source') {
    const params = new URLSearchParams();
    if (item.title) params.set('query', item.title);
    if (item.domain) params.set('type', 'all');
    navigate(`/admin/source-registry?${params.toString()}`, 'admin_source_registry');
    return;
  }

  openCommandCenterWithDraft(`Create a strategic expansion plan for ${item.category} "${item.title}" in domain "${item.domain}". Rationale: ${item.rationale || item.summary || 'No rationale provided'}. Return actions, sources needed, and approval requirements.`);
}

export function openMonetizationSignal(item: MonetizationInputSignal) {
  const category = normalizedText(item.category);
  const label = item.label || 'signal';

  if (category.includes('source') || category.includes('domain') || normalizedText(label).includes('cross')) {
    const params = new URLSearchParams();
    params.set('query', label);
    navigate(`/admin/source-registry?${params.toString()}`, 'admin_source_registry');
    return;
  }

  if (category.includes('strategy') || normalizedText(label).includes('strategy')) {
    const params = new URLSearchParams();
    params.set('domain', 'strategies');
    params.set('reviewStatus', 'approved');
    params.set('search', label);
    navigate(`/admin/content-review?${params.toString()}`, 'admin_research_approvals');
    return;
  }

  if (category.includes('fund') || normalizedText(label).includes('fund')) {
    const params = new URLSearchParams();
    params.set('query', label);
    navigate(`/admin/funding/catalog?${params.toString()}`, 'admin_funding_catalog');
    return;
  }

  openCommandCenterWithDraft(`Investigate monetization signal "${label}" in category "${item.category}". Count: ${item.count}. Return the best operational follow-up and the internal surface to use next.`);
}