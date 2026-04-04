import React, { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, Clock3, Gift, Sparkles } from 'lucide-react';
import { ViewMode } from '../../types';
import { BusinessOpportunityMatchRow } from '../../src/services/businessOpportunityService';
import OpportunityDetailsPanel from './OpportunityDetailsPanel';

type BusinessOpportunitiesSectionProps = {
  matches: BusinessOpportunityMatchRow[];
  loading: boolean;
  error: string;
  readinessScore: number;
  estimatedFundingUnlocked: boolean;
  onNavigate?: (view: ViewMode, pathname?: string) => void;
};

type FallbackOpportunity = {
  slug: string;
  name: string;
  category: string;
  summary: string;
  difficulty: 'easy' | 'medium' | 'hard';
  startupCostMin: number;
  startupCostMax: number;
  recommendedFundingMin: number;
  recommendedFundingMax: number;
  timeToRevenue: string;
  whyMatch: string[];
};

const fallbackOpportunities: FallbackOpportunity[] = [
  {
    slug: 'online-consulting-business',
    name: 'Online Consulting Business',
    category: 'Professional Services',
    summary: 'Low-cost startup in a high-demand category with clean service-based cash flow.',
    difficulty: 'easy',
    startupCostMin: 2000,
    startupCostMax: 6000,
    recommendedFundingMin: 5000,
    recommendedFundingMax: 15000,
    timeToRevenue: '30-45 days',
    whyMatch: ['Low overhead startup path', 'Fundable and beginner-friendly', 'Can generate revenue from anywhere'],
  },
  {
    slug: 'education-and-training-studio',
    name: 'Education And Training Studio',
    category: 'Education',
    summary: 'Program-based offer with stronger grant relevance and scalable training packages.',
    difficulty: 'medium',
    startupCostMin: 3000,
    startupCostMax: 9000,
    recommendedFundingMin: 8000,
    recommendedFundingMax: 25000,
    timeToRevenue: '45-60 days',
    whyMatch: ['Knowledge-first business model', 'Grant-friendly positioning', 'Scalable digital delivery'],
  },
  {
    slug: 'digital-services-agency',
    name: 'Digital Services Agency',
    category: 'Digital Services',
    summary: 'Remote-first service business suited to recurring offers and flexible delivery.',
    difficulty: 'easy',
    startupCostMin: 2500,
    startupCostMax: 7000,
    recommendedFundingMin: 7000,
    recommendedFundingMax: 20000,
    timeToRevenue: '30-45 days',
    whyMatch: ['Recurring revenue potential', 'Remote-friendly operations', 'Pairs well with funding readiness growth'],
  },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function formatDifficulty(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatTimeToRevenue(days?: number | null, fallback?: string) {
  if (fallback) return fallback;
  if (!days) return 'Flexible';
  if (days <= 45) return '30-45 days';
  if (days <= 75) return '45-75 days';
  return `${days}+ days`;
}

function getModuleView(path?: string | null): ViewMode {
  if (path?.startsWith('/portal/funding')) return ViewMode.PORTAL_FUNDING;
  if (path?.startsWith('/portal/grants')) return ViewMode.PORTAL_GRANTS;
  return ViewMode.PORTAL_BUSINESS;
}

function buildFallbackMatch(opportunity: FallbackOpportunity, index: number): BusinessOpportunityMatchRow {
  return {
    id: `fallback-${opportunity.slug}`,
    tenant_id: 'fallback',
    user_id: 'fallback',
    opportunity_id: opportunity.slug,
    status: 'recommended',
    match_score: 92 - index * 6,
    funding_fit_score: 24 - index * 2,
    difficulty_fit_score: opportunity.difficulty === 'easy' ? 22 : 18,
    readiness_fit_score: 20 - index,
    grant_boost_score: opportunity.slug === 'education-and-training-studio' ? 12 : 6,
    startup_cost_penalty: 0,
    estimated_funding_min_cents: opportunity.recommendedFundingMin * 100,
    estimated_funding_max_cents: opportunity.recommendedFundingMax * 100,
    reasons: opportunity.whyMatch.map((detail, reasonIndex) => ({ code: `fallback_${reasonIndex}`, detail })),
    source_snapshot: { fallback: true },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    business_opportunities: {
      id: opportunity.slug,
      slug: opportunity.slug,
      name: opportunity.name,
      category: opportunity.category,
      opportunity_type: 'service_business',
      summary_md: opportunity.summary,
      difficulty_level: opportunity.difficulty,
      startup_cost_min_cents: opportunity.startupCostMin * 100,
      startup_cost_max_cents: opportunity.startupCostMax * 100,
      time_to_revenue_days: null,
      recommended_funding_min_cents: opportunity.recommendedFundingMin * 100,
      recommended_funding_max_cents: opportunity.recommendedFundingMax * 100,
      metadata: { time_to_revenue_label: opportunity.timeToRevenue, fallback: true },
      business_opportunity_requirements: [
        {
          id: `${opportunity.slug}-foundation`,
          requirement_key: 'business_foundation',
          label: 'Business Foundation',
          description: 'Complete setup, identity, and core readiness before launch.',
          is_required: true,
          sort_order: 10,
        },
        {
          id: `${opportunity.slug}-funding`,
          requirement_key: 'funding_readiness',
          label: 'Funding Readiness',
          description: 'Use credit and funding strategy to validate realistic startup capital.',
          is_required: true,
          sort_order: 20,
        },
      ],
      business_opportunity_steps: [
        {
          id: `${opportunity.slug}-business`,
          step_key: 'foundation',
          label: 'Open Business Setup',
          description: 'Finish structure, website, and identity requirements.',
          action_path: '/portal/business',
          sort_order: 10,
          is_required: true,
          metadata: { module: 'business' },
        },
        {
          id: `${opportunity.slug}-funding`,
          step_key: 'funding',
          label: 'See Funding Fit',
          description: 'Review your funding range and readiness before starting.',
          action_path: '/portal/funding',
          sort_order: 20,
          is_required: true,
          metadata: { module: 'funding' },
        },
        {
          id: `${opportunity.slug}-grants`,
          step_key: 'grants',
          label: 'Review Grants',
          description: 'Check whether this opportunity unlocks grant support.',
          action_path: '/portal/grants',
          sort_order: 30,
          is_required: false,
          metadata: { module: 'grants' },
        },
      ],
      business_opportunity_grants: [
        {
          id: `${opportunity.slug}-grant`,
          grant_id: null,
          notes_md: 'Grant fit becomes stronger after setup and readiness are completed.',
        },
      ],
    },
  };
}

export default function BusinessOpportunitiesSection(props: BusinessOpportunitiesSectionProps) {
  const normalizedMatches = useMemo(() => {
    if (props.matches.length > 0) return props.matches.slice(0, 4);
    return fallbackOpportunities.map(buildFallbackMatch);
  }, [props.matches]);

  const [selectedId, setSelectedId] = useState<string>(normalizedMatches[0]?.id || '');

  useEffect(() => {
    if (!normalizedMatches.some((item) => item.id === selectedId)) {
      setSelectedId(normalizedMatches[0]?.id || '');
    }
  }, [normalizedMatches, selectedId]);

  const selectedMatch = normalizedMatches.find((item) => item.id === selectedId) || normalizedMatches[0] || null;
  const featured = normalizedMatches[0] || null;
  const recommendations = normalizedMatches.slice(1, 4);
  const helperCopy = props.error
    ? 'Opportunity matching is still syncing, so fallback recommendations are shown while the new catalog is being connected.'
    : props.estimatedFundingUnlocked
    ? 'These matches connect your current funding range, readiness score, and business path to realistic next moves.'
    : 'Complete more readiness steps to sharpen these recommendations and unlock stronger funding fit guidance.';

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-[#DFE7F4] bg-[radial-gradient(circle_at_top_left,rgba(202,227,255,0.55),transparent_38%),linear-gradient(180deg,#FFFFFF_0%,#F8FBFF_100%)] p-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#607CC1]">Business opportunities</p>
            <h2 className="mt-2 text-[2rem] font-black tracking-tight text-[#17233D]">Top Recommendations for You</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#61769D]">{helperCopy}</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#DCE7F8] bg-white px-4 py-2 text-sm text-[#61769D]">
            <Sparkles className="h-4 w-4 text-[#46A2E7]" />
            <span className="font-black text-[#17233D]">{props.readinessScore}% readiness</span>
          </div>
        </div>

        {props.loading ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`opportunity-skeleton-${index}`} className="h-44 animate-pulse rounded-[1.6rem] border border-[#E4ECF8] bg-white/80" />
            ))}
          </div>
        ) : null}

        {!props.loading && featured ? (
          <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
            <article className="overflow-hidden rounded-[1.8rem] border border-[#DAE6FB] bg-white shadow-[0_22px_52px_rgba(78,111,212,0.10)]">
              <div className="grid gap-0 md:grid-cols-[0.9fr_1.2fr]">
                <div className="bg-[linear-gradient(145deg,#DDEBFF_0%,#F5FBFF_52%,#E9F7FF_100%)] p-6">
                  <div className="flex h-full flex-col justify-between rounded-[1.4rem] border border-[#DCE7F8] bg-[linear-gradient(180deg,rgba(255,255,255,0.92)_0%,rgba(245,250,255,0.92)_100%)] p-5">
                    <div>
                      <span className="inline-flex rounded-full bg-[#E7F4FF] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#4B78E6]">
                        Featured opportunity
                      </span>
                      <div className="mt-5 flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-[linear-gradient(180deg,#88D7F8_0%,#5C8CF3_100%)] text-white shadow-[0_18px_40px_rgba(89,127,244,0.28)]">
                        <BriefcaseBusiness className="h-8 w-8" />
                      </div>
                    </div>
                    <div className="mt-8 rounded-[1.2rem] border border-[#DCE7F8] bg-white px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Startup cost</p>
                      <p className="mt-2 text-lg font-black tracking-tight text-[#17233D]">
                        {formatCurrency((featured.business_opportunities?.startup_cost_min_cents || 0) / 100)} - {formatCurrency((featured.business_opportunities?.startup_cost_max_cents || 0) / 100)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#E7F4FF] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#4B78E6]">
                      {featured.business_opportunities?.category || 'Opportunity'}
                    </span>
                    <span className="rounded-full bg-[#FFF5E9] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#C27A24]">
                      {formatDifficulty(featured.business_opportunities?.difficulty_level || 'easy')}
                    </span>
                    <span className="rounded-full bg-[#EEF8F0] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#32946A]">
                      {featured.match_score}% match
                    </span>
                  </div>

                  <h3 className="mt-5 text-[2.2rem] font-black leading-tight tracking-tight text-[#17233D]">
                    {featured.business_opportunities?.name || 'Business Opportunity'}
                  </h3>
                  <p className="mt-3 text-base leading-7 text-[#61769D]">{featured.business_opportunities?.summary_md || 'A connected opportunity path is ready for review.'}</p>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[1.2rem] border border-[#E4ECF8] bg-[#FBFDFF] px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Time to revenue</p>
                      <p className="mt-2 text-sm font-black text-[#17233D]">
                        {formatTimeToRevenue(
                          featured.business_opportunities?.time_to_revenue_days,
                          String(featured.business_opportunities?.metadata?.time_to_revenue_label || '')
                        )}
                      </p>
                    </div>
                    <div className="rounded-[1.2rem] border border-[#E4ECF8] bg-[#FBFDFF] px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Recommended funding</p>
                      <p className="mt-2 text-sm font-black text-[#17233D]">
                        {formatCurrency((featured.business_opportunities?.recommended_funding_min_cents || 0) / 100)} - {formatCurrency((featured.business_opportunities?.recommended_funding_max_cents || 0) / 100)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-2">
                    {(featured.reasons || []).slice(0, 3).map((reason) => (
                      <p key={reason.code} className="text-sm leading-6 text-[#61769D]">• {reason.detail}</p>
                    ))}
                  </div>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => props.onNavigate?.(ViewMode.PORTAL_BUSINESS, '/portal/business')}
                      className="inline-flex items-center justify-center rounded-[1.1rem] bg-[linear-gradient(90deg,#3A67E6_0%,#4EC2F3_100%)] px-5 py-3 text-sm font-black text-white shadow-[0_18px_40px_rgba(76,125,239,0.24)]"
                    >
                      Start This Opportunity
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedId(featured.id)}
                      className="inline-flex items-center justify-center rounded-[1.1rem] border border-[#D9E4F6] bg-white px-5 py-3 text-sm font-black text-[#29417E]"
                    >
                      View Setup Path
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onNavigate?.(ViewMode.PORTAL_FUNDING, '/portal/funding')}
                      className="inline-flex items-center justify-center rounded-[1.1rem] border border-[#D9E4F6] bg-[#F8FBFF] px-5 py-3 text-sm font-black text-[#29417E]"
                    >
                      See Funding Fit
                    </button>
                  </div>
                </div>
              </div>
            </article>

            <OpportunityDetailsPanel match={selectedMatch} onNavigate={props.onNavigate} />
          </div>
        ) : null}
      </div>

      {!props.loading ? (
        <div className="grid gap-4 lg:grid-cols-3">
        {recommendations.map((match) => {
          const opportunity = match.business_opportunities;
          const grantsConnected = opportunity?.business_opportunity_grants?.length || 0;
          const topStep = opportunity?.business_opportunity_steps?.[0];
          return (
            <article
              key={match.id}
              className="rounded-[1.8rem] border border-[#DFE7F4] bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FBFF_100%)] p-5 shadow-[0_16px_44px_rgba(36,58,114,0.05)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">{opportunity?.category || 'Opportunity'}</p>
                  <h3 className="mt-2 text-[1.4rem] font-black leading-tight tracking-tight text-[#17233D]">{opportunity?.name || 'Recommendation'}</h3>
                </div>
                <span className="rounded-full bg-[#EEF8F0] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#32946A]">
                  {match.match_score}% fit
                </span>
              </div>

              <p className="mt-3 text-sm leading-6 text-[#61769D]">{opportunity?.summary_md || 'Connected opportunity path.'}</p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1rem] border border-[#E4ECF8] bg-white px-4 py-3">
                  <div className="flex items-center gap-2 text-[#61769D]">
                    <Clock3 className="h-4 w-4 text-[#46A2E7]" />
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Time to revenue</span>
                  </div>
                  <p className="mt-2 text-sm font-black text-[#17233D]">
                    {formatTimeToRevenue(opportunity?.time_to_revenue_days, String(opportunity?.metadata?.time_to_revenue_label || ''))}
                  </p>
                </div>
                <div className="rounded-[1rem] border border-[#E4ECF8] bg-white px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Startup cost</p>
                  <p className="mt-2 text-sm font-black text-[#17233D]">
                    {formatCurrency((opportunity?.startup_cost_min_cents || 0) / 100)} - {formatCurrency((opportunity?.startup_cost_max_cents || 0) / 100)}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-[#FFF5E9] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#C27A24]">
                  {formatDifficulty(opportunity?.difficulty_level || 'easy')}
                </span>
                {grantsConnected > 0 ? (
                  <span className="rounded-full bg-[#F2EFFF] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#7A67D8]">
                    {grantsConnected} grant link{grantsConnected === 1 ? '' : 's'}
                  </span>
                ) : null}
              </div>

              <div className="mt-5 space-y-2">
                {(match.reasons || []).slice(0, 2).map((reason) => (
                  <p key={reason.code} className="text-sm leading-6 text-[#61769D]">• {reason.detail}</p>
                ))}
              </div>

              <div className="mt-6 grid gap-3">
                <button
                  type="button"
                  onClick={() => props.onNavigate?.(ViewMode.PORTAL_BUSINESS, '/portal/business')}
                  className="inline-flex items-center justify-center rounded-[1.05rem] bg-[linear-gradient(90deg,#3A67E6_0%,#4EC2F3_100%)] px-4 py-3 text-sm font-black text-white"
                >
                  Start This Opportunity
                </button>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setSelectedId(match.id)}
                    className="inline-flex items-center justify-center rounded-[1.05rem] border border-[#D9E4F6] bg-white px-4 py-3 text-sm font-black text-[#29417E]"
                  >
                    View Setup Path
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onNavigate?.(getModuleView(topStep?.action_path), topStep?.action_path || '/portal/funding')}
                    className="inline-flex items-center justify-center rounded-[1.05rem] border border-[#D9E4F6] bg-[#F8FBFF] px-4 py-3 text-sm font-black text-[#29417E]"
                  >
                    See Funding Fit
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-[1.6rem] border border-[#DFE7F4] bg-white p-5 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
          <div className="flex items-center gap-2">
            <BriefcaseBusiness className="h-4 w-4 text-[#4677E6]" />
            <h3 className="text-[1.1rem] font-black tracking-tight text-[#17233D]">Browse Business Setup</h3>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#61769D]">LLC, EIN, business phone, email, website, and other setup moves stay connected to each opportunity.</p>
          <button
            type="button"
            onClick={() => props.onNavigate?.(ViewMode.PORTAL_BUSINESS, '/portal/business')}
            className="mt-5 inline-flex items-center justify-center rounded-[1rem] bg-[linear-gradient(90deg,#30BCD7_0%,#89DFA7_100%)] px-4 py-3 text-sm font-black text-white"
          >
            Continue Setup
          </button>
        </article>

        <article className="rounded-[1.6rem] border border-[#DFE7F4] bg-white p-5 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-[#5D7DAB]" />
            <h3 className="text-[1.1rem] font-black tracking-tight text-[#17233D]">Explore Grants</h3>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#61769D]">Some opportunities improve when grants, narratives, and readiness documents are handled together.</p>
          <button
            type="button"
            onClick={() => props.onNavigate?.(ViewMode.PORTAL_GRANTS, '/portal/grants')}
            className="mt-5 inline-flex items-center justify-center rounded-[1rem] bg-[linear-gradient(90deg,#52C6E8_0%,#97E4B5_100%)] px-4 py-3 text-sm font-black text-white"
          >
            See Potential Grants
          </button>
        </article>

        <article className="rounded-[1.6rem] border border-[#DFE7F4] bg-white p-5 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#4677E6]" />
            <h3 className="text-[1.1rem] font-black tracking-tight text-[#17233D]">Connected Next Steps</h3>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#61769D]">Every opportunity stays tied to a real setup, funding, or grant action so the journey keeps moving.</p>
          <button
            type="button"
            onClick={() => props.onNavigate?.(ViewMode.PORTAL_FUNDING, '/portal/funding')}
            className="mt-5 inline-flex items-center justify-center rounded-[1rem] bg-[linear-gradient(90deg,#6774F6_0%,#7FD0F5_100%)] px-4 py-3 text-sm font-black text-white"
          >
            Open Funding Path
          </button>
        </article>
      </div>
    </section>
  );
}
