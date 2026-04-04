import React from 'react';
import { ArrowRight, BriefcaseBusiness, Gift, ShieldCheck, Sparkles } from 'lucide-react';
import { ViewMode } from '../../types';
import { BusinessOpportunityMatchRow } from '../../src/services/businessOpportunityService';

type OpportunityDetailsPanelProps = {
  match: BusinessOpportunityMatchRow | null;
  onNavigate?: (view: ViewMode, pathname?: string) => void;
};

function formatCurrencyRange(minCents?: number | null, maxCents?: number | null) {
  const format = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value / 100);

  if (!minCents && !maxCents) return 'Varies by readiness';
  if (minCents && maxCents) return `${format(minCents)} - ${format(maxCents)}`;
  return format((minCents || maxCents) as number);
}

function sentenceCase(value: string) {
  return value
    .split(/[_-]/g)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function getModuleView(path?: string | null): ViewMode {
  if (path?.startsWith('/portal/funding')) return ViewMode.PORTAL_FUNDING;
  if (path?.startsWith('/portal/grants')) return ViewMode.PORTAL_GRANTS;
  return ViewMode.PORTAL_BUSINESS;
}

export default function OpportunityDetailsPanel(props: OpportunityDetailsPanelProps) {
  if (!props.match?.business_opportunities) {
    return (
      <aside className="rounded-[2rem] border border-[#DFE7F4] bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FBFF_100%)] p-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#607CC1]">Opportunity details</p>
        <h3 className="mt-2 text-[1.6rem] font-black tracking-tight text-[#17233D]">Choose a recommendation</h3>
        <p className="mt-3 text-sm leading-6 text-[#61769D]">
          Select a business opportunity card to see why it matches, what it requires, and which module should be opened next.
        </p>
      </aside>
    );
  }

  const opportunity = props.match.business_opportunities;
  const requirements = [...(opportunity.business_opportunity_requirements || [])].sort((a, b) => a.sort_order - b.sort_order);
  const steps = [...(opportunity.business_opportunity_steps || [])].sort((a, b) => a.sort_order - b.sort_order);
  const grants = opportunity.business_opportunity_grants || [];
  const reasons = props.match.reasons || [];
  const bestFor = sentenceCase(opportunity.opportunity_type);
  const risks: string[] = [];

  if (props.match.startup_cost_penalty > 0) {
    risks.push('Startup cost is still aggressive relative to current readiness.');
  }
  if (props.match.readiness_fit_score < 18) {
    risks.push('Readiness is still developing, so execution may take longer.');
  }
  if (props.match.funding_fit_score < 18) {
    risks.push('Funding fit improves after more profile and analysis data is completed.');
  }
  if (risks.length === 0) {
    risks.push('Execution still depends on consistent setup, credit, and funding follow-through.');
  }

  return (
    <aside className="rounded-[2rem] border border-[#DFE7F4] bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FBFF_100%)] p-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#607CC1]">Opportunity details</p>
          <h3 className="mt-2 text-[1.6rem] font-black tracking-tight text-[#17233D]">{opportunity.name}</h3>
          <p className="mt-2 text-sm leading-6 text-[#61769D]">{opportunity.summary_md}</p>
        </div>
        <div className="rounded-full border border-[#DCE7F8] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#4B78E6]">
          {props.match.match_score}% match
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[1.2rem] border border-[#E4ECF8] bg-white px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Best for</p>
          <p className="mt-2 text-sm font-black text-[#17233D]">{bestFor}</p>
        </div>
        <div className="rounded-[1.2rem] border border-[#E4ECF8] bg-white px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Funding fit</p>
          <p className="mt-2 text-sm font-black text-[#17233D]">{formatCurrencyRange(opportunity.recommended_funding_min_cents, opportunity.recommended_funding_max_cents)}</p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <section className="rounded-[1.4rem] border border-[#E7EFFA] bg-white px-4 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#46A2E7]" />
            <p className="text-sm font-black tracking-tight text-[#17233D]">Why it works</p>
          </div>
          <div className="mt-3 space-y-2">
            {reasons.slice(0, 3).map((reason) => (
              <p key={reason.code} className="text-sm leading-6 text-[#61769D]">• {reason.detail}</p>
            ))}
          </div>
        </section>

        <section className="rounded-[1.4rem] border border-[#E7EFFA] bg-white px-4 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#4FA8F5]" />
            <p className="text-sm font-black tracking-tight text-[#17233D]">Setup requirements</p>
          </div>
          <div className="mt-3 space-y-2">
            {requirements.length > 0 ? requirements.map((item) => (
              <p key={item.id} className="text-sm leading-6 text-[#61769D]">• {item.label}: {item.description}</p>
            )) : <p className="text-sm leading-6 text-[#61769D]">• Business foundation, identity, and funding readiness should be completed first.</p>}
          </div>
        </section>

        <section className="rounded-[1.4rem] border border-[#E7EFFA] bg-white px-4 py-4">
          <div className="flex items-center gap-2">
            <BriefcaseBusiness className="h-4 w-4 text-[#607CC1]" />
            <p className="text-sm font-black tracking-tight text-[#17233D]">Risks</p>
          </div>
          <div className="mt-3 space-y-2">
            {risks.map((risk) => (
              <p key={risk} className="text-sm leading-6 text-[#61769D]">• {risk}</p>
            ))}
          </div>
        </section>

        <section className="rounded-[1.4rem] border border-[#E7EFFA] bg-white px-4 py-4">
          <div className="flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-[#4677E6]" />
            <p className="text-sm font-black tracking-tight text-[#17233D]">Connected next steps</p>
          </div>
          <div className="mt-3 space-y-2">
            {steps.length > 0 ? steps.map((step) => (
              <button
                key={step.id}
                type="button"
                onClick={() => props.onNavigate?.(getModuleView(step.action_path), step.action_path || undefined)}
                className="flex w-full items-start justify-between gap-3 rounded-[1rem] border border-[#E4ECF8] bg-[#FBFDFF] px-3 py-3 text-left hover:border-[#C8D8F4]"
              >
                <div>
                  <p className="text-sm font-black tracking-tight text-[#17233D]">{step.label}</p>
                  <p className="mt-1 text-sm leading-6 text-[#61769D]">{step.description}</p>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#4677E6]" />
              </button>
            )) : <p className="text-sm leading-6 text-[#61769D]">Continue through business setup, funding readiness, and grants to make this opportunity executable.</p>}
          </div>
        </section>

        <section className="rounded-[1.4rem] border border-[#E7EFFA] bg-white px-4 py-4">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-[#5D7DAB]" />
            <p className="text-sm font-black tracking-tight text-[#17233D]">Grant connection points</p>
          </div>
          <div className="mt-3 space-y-2">
            {grants.length > 0 ? grants.map((grant) => (
              <p key={grant.id} className="text-sm leading-6 text-[#61769D]">• {grant.notes_md || 'Related grant path is available once this opportunity is started.'}</p>
            )) : <p className="text-sm leading-6 text-[#61769D]">• Grant relevance increases once business setup and funding readiness are stronger.</p>}
          </div>
        </section>
      </div>
    </aside>
  );
}
