import React, { useMemo, useState } from 'react';
import { ArrowRight, BriefcaseBusiness, Sparkles, Wand2 } from 'lucide-react';
import { BusinessFoundationProfileResponse } from '../../services/fundingFoundationService';
import {
  buildExistingBusinessLaunchResult,
  buildNewBusinessLaunchResult,
  ExistingBusinessLaunchInput,
  NewBusinessLaunchInput,
  readLaunchSnapshot,
} from './businessLaunchMode';
import { BusinessFoundationPath, PATH_LABELS } from './businessFoundationConfig';

type ProfilePayload = {
  legal_name?: string | null;
  entity_type?: string | null;
  ein?: string | null;
  business_address?: string | null;
  business_phone?: string | null;
  business_website?: string | null;
  naics_code?: string | null;
  business_email?: string | null;
  mission_statement?: string | null;
  business_plan_summary?: string | null;
  profile_status?: 'not_started' | 'in_progress' | 'ready' | 'completed' | null;
  metadata_patch?: Record<string, unknown> | null;
};

type Props = {
  data: BusinessFoundationProfileResponse | null;
  saving?: boolean;
  onChoosePath: (path: BusinessFoundationPath) => Promise<void> | void;
  onSaveProfile: (payload: ProfilePayload) => Promise<void> | void;
};

const inputClass = 'mt-2 w-full rounded-[1rem] border border-[#DCE5F4] bg-white px-4 py-3 text-sm text-[#17233D] outline-none focus:border-[#7FA9F9]';

export default function LaunchModeStudio(props: Props) {
  const savedSnapshot = useMemo(() => readLaunchSnapshot(props.data), [props.data]);
  const activePath = (savedSnapshot?.mode || props.data?.readiness.path || null) as BusinessFoundationPath | null;
  const [newInput, setNewInput] = useState<NewBusinessLaunchInput>({
    owner_name: '',
    business_idea: '',
    focus: '',
    target_market: '',
    state_formed: '',
  });
  const [existingInput, setExistingInput] = useState<ExistingBusinessLaunchInput>({
    business_name: '',
    entity_type: '',
    state_formed: '',
    business_start_date: '',
    industry: '',
    current_naics: '',
    website: '',
    business_email: '',
    business_phone: '',
    business_address: '',
    ein_status: '',
    entity_status: '',
    monthly_revenue_range: '',
    business_description: '',
  });

  const newResult = activePath === 'new_business'
    ? savedSnapshot?.new_business_result || null
    : null;
  const existingResult = activePath === 'existing_business_optimization'
    ? savedSnapshot?.existing_business_result || null
    : null;

  const handleGenerateNew = async () => {
    const result = buildNewBusinessLaunchResult(newInput);
    await props.onChoosePath('new_business');
    await props.onSaveProfile({
      profile_status: 'in_progress',
      metadata_patch: {
        launch_mode: {
          mode: 'new_business',
          new_business_input: newInput,
          new_business_result: result,
        },
      },
    });
  };

  const handleApplyNew = async () => {
    const result = newResult || buildNewBusinessLaunchResult(newInput);
    await props.onChoosePath('new_business');
    await props.onSaveProfile({
      legal_name: props.data?.profile?.legal_name || result.business_name,
      entity_type: props.data?.profile?.entity_type || 'LLC',
      naics_code: props.data?.profile?.naics_code || result.naics_code,
      mission_statement: result.mission_statement,
      business_plan_summary: result.business_plan_summary,
      profile_status: 'in_progress',
      metadata_patch: {
        launch_mode: {
          mode: 'new_business',
          new_business_input: newInput,
          new_business_result: result,
          applied_to_foundation_at: new Date().toISOString(),
        },
      },
    });
  };

  const handleGenerateExisting = async () => {
    const result = buildExistingBusinessLaunchResult(existingInput);
    await props.onChoosePath('existing_business_optimization');
    await props.onSaveProfile({
      legal_name: existingInput.business_name || null,
      entity_type: existingInput.entity_type || null,
      business_address: existingInput.business_address || null,
      business_phone: existingInput.business_phone || null,
      business_website: existingInput.website || null,
      naics_code: existingInput.current_naics || null,
      business_email: existingInput.business_email || null,
      ein: existingInput.ein_status.toLowerCase().includes('yes') ? props.data?.profile?.ein || 'Pending confirmation' : null,
      profile_status: 'in_progress',
      metadata_patch: {
        launch_mode: {
          mode: 'existing_business_optimization',
          existing_business_input: existingInput,
          existing_business_result: result,
        },
      },
    });
  };

  return (
    <section className="rounded-[2rem] border border-[#DFE7F4] bg-[linear-gradient(180deg,#FBFDFF_0%,#F4F8FF_100%)] p-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#607CC1]">Phase 3 • 1-click launch mode</p>
          <h2 className="mt-2 text-[2rem] font-black tracking-tight text-[#17233D]">Start A New Business Or Use Your Existing One</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#61769D]">
            Both paths converge into the same Nexus journey. Generate a staged plan first, then apply it into Business Foundation without silently overwriting the live profile.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#DCE5F4] bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#607CC1]">
          <Sparkles className="h-3.5 w-3.5" />
          Connected to live readiness
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <article className={`rounded-[1.6rem] border p-5 ${activePath === 'new_business' ? 'border-[#A7C7FF] bg-white' : 'border-[#E0E8F4] bg-white/80'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] bg-[#17233D] text-white">
              <Wand2 className="h-5 w-5" />
            </div>
            <button
              type="button"
              onClick={() => void props.onChoosePath('new_business')}
              className="rounded-full border border-[#D9E5F6] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#5677E8]"
            >
              {PATH_LABELS.new_business}
            </button>
          </div>
          <p className="mt-4 text-[1.15rem] font-black tracking-tight text-[#17233D]">Build A New Business</p>
          <p className="mt-2 text-sm leading-6 text-[#61769D]">Generate a business name, fundable category, positioning, plan summary, website preview, and next action from a lightweight prompt.</p>

          <div className="mt-5 grid gap-3">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">Owner Name</span>
              <input value={newInput.owner_name} onChange={(event) => setNewInput((current) => ({ ...current, owner_name: event.target.value }))} className={inputClass} />
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">Business Idea</span>
              <input value={newInput.business_idea} onChange={(event) => setNewInput((current) => ({ ...current, business_idea: event.target.value }))} className={inputClass} />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">Focus</span>
                <input value={newInput.focus} onChange={(event) => setNewInput((current) => ({ ...current, focus: event.target.value }))} className={inputClass} />
              </label>
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">Target Market</span>
                <input value={newInput.target_market} onChange={(event) => setNewInput((current) => ({ ...current, target_market: event.target.value }))} className={inputClass} />
              </label>
            </div>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">State</span>
              <input value={newInput.state_formed} onChange={(event) => setNewInput((current) => ({ ...current, state_formed: event.target.value }))} className={inputClass} />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleGenerateNew()}
              disabled={props.saving}
              className="rounded-[1.1rem] bg-[#17233D] px-4 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              Generate Launch Draft
            </button>
            {newResult ? (
              <button
                type="button"
                onClick={() => void handleApplyNew()}
                disabled={props.saving}
                className="rounded-[1.1rem] border border-[#D8E4F8] bg-white px-4 py-3 text-sm font-black text-[#356AE6] disabled:opacity-60"
              >
                Apply To Business Foundation
              </button>
            ) : null}
          </div>

          {newResult ? (
            <div className="mt-6 rounded-[1.5rem] border border-[#DCE5F4] bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">Generated result</p>
                  <p className="mt-2 text-[1.2rem] font-black tracking-tight text-[#17233D]">{newResult.business_name}</p>
                </div>
                <span className="rounded-full bg-[#EEF5FF] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#5677E8]">
                  {newResult.naics_code}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#61769D]">{newResult.business_description}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-[1.1rem] border border-[#E3EAF5] bg-[#FBFDFF] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Pricing Model</p>
                  <p className="mt-2 text-sm text-[#17233D]">{newResult.pricing_model}</p>
                </div>
                <div className="rounded-[1.1rem] border border-[#E3EAF5] bg-[#FBFDFF] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Funding Estimate</p>
                  <p className="mt-2 text-sm text-[#17233D]">{newResult.funding_range.helper}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <div className="rounded-[1.1rem] border border-[#E3EAF5] bg-[#FBFDFF] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Services</p>
                  <div className="mt-2 space-y-1 text-sm text-[#17233D]">
                    {newResult.services.map((service) => <p key={service}>{service}</p>)}
                  </div>
                </div>
                <div className="rounded-[1.1rem] border border-[#E3EAF5] bg-[#FBFDFF] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Domain Ideas</p>
                  <div className="mt-2 space-y-1 text-sm text-[#17233D]">
                    {newResult.domain_suggestions.map((domain) => <p key={domain}>{domain}</p>)}
                  </div>
                </div>
                <div className="rounded-[1.1rem] border border-[#E3EAF5] bg-[#FBFDFF] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Business Email</p>
                  <div className="mt-2 space-y-1 text-sm text-[#17233D]">
                    {newResult.business_email_suggestions.map((email) => <p key={email}>{email}</p>)}
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-[1.1rem] border border-[#E3EAF5] bg-[#FBFDFF] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Website Preview</p>
                <p className="mt-2 text-sm font-black text-[#17233D]">{newResult.website_preview.hero}</p>
                <p className="mt-2 text-sm text-[#61769D]">{newResult.website_preview.about}</p>
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm font-black text-[#356AE6]">
                {newResult.next_best_action}
                <ArrowRight className="h-4 w-4" />
              </div>
            </div>
          ) : null}
        </article>

        <article className={`rounded-[1.6rem] border p-5 ${activePath === 'existing_business_optimization' ? 'border-[#A7C7FF] bg-white' : 'border-[#E0E8F4] bg-white/80'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] bg-[#17233D] text-white">
              <BriefcaseBusiness className="h-5 w-5" />
            </div>
            <button
              type="button"
              onClick={() => void props.onChoosePath('existing_business_optimization')}
              className="rounded-full border border-[#D9E5F6] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#5677E8]"
            >
              {PATH_LABELS.existing_business_optimization}
            </button>
          </div>
          <p className="mt-4 text-[1.15rem] font-black tracking-tight text-[#17233D]">Use My Existing Business</p>
          <p className="mt-2 text-sm leading-6 text-[#61769D]">Capture the real operating profile, then generate a fundability review, NAICS review, missing checklist, and the next best action.</p>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {[
              ['Business Name', 'business_name'],
              ['Entity Type', 'entity_type'],
              ['State Formed', 'state_formed'],
              ['Start Date', 'business_start_date'],
              ['Industry', 'industry'],
              ['Current NAICS', 'current_naics'],
              ['Website', 'website'],
              ['Business Email', 'business_email'],
              ['Business Phone', 'business_phone'],
              ['Business Address', 'business_address'],
              ['EIN Status', 'ein_status'],
              ['Entity Status', 'entity_status'],
              ['Monthly Revenue Range', 'monthly_revenue_range'],
            ].map(([label, key]) => (
              <label key={key} className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">{label}</span>
                <input
                  value={(existingInput as any)[key]}
                  onChange={(event) => setExistingInput((current) => ({ ...current, [key]: event.target.value }))}
                  className={inputClass}
                />
              </label>
            ))}
            <label className="block md:col-span-2">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">Business Description</span>
              <textarea
                value={existingInput.business_description}
                onChange={(event) => setExistingInput((current) => ({ ...current, business_description: event.target.value }))}
                rows={4}
                className={inputClass}
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleGenerateExisting()}
              disabled={props.saving}
              className="rounded-[1.1rem] bg-[#17233D] px-4 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              Review Existing Business
            </button>
          </div>

          {existingResult ? (
            <div className="mt-6 rounded-[1.5rem] border border-[#DCE5F4] bg-white p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">Fundability review</p>
              <p className="mt-2 text-sm leading-6 text-[#61769D]">{existingResult.fundability_review}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-[1.1rem] border border-[#E3EAF5] bg-[#FBFDFF] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">NAICS Review</p>
                  <p className="mt-2 text-sm text-[#17233D]">{existingResult.naics_review}</p>
                </div>
                <div className="rounded-[1.1rem] border border-[#E3EAF5] bg-[#FBFDFF] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Funding Relevance</p>
                  <p className="mt-2 text-sm text-[#17233D]">{existingResult.funding_readiness_relevance}</p>
                </div>
              </div>
              <div className="mt-4 rounded-[1.1rem] border border-[#E3EAF5] bg-[#FBFDFF] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Missing Foundation Checklist</p>
                <div className="mt-2 space-y-1 text-sm text-[#17233D]">
                  {existingResult.missing_foundation_items.length > 0
                    ? existingResult.missing_foundation_items.map((item) => <p key={item}>{item}</p>)
                    : <p>Core profile data is present. Continue into readiness review.</p>}
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm font-black text-[#356AE6]">
                {existingResult.next_best_action}
                <ArrowRight className="h-4 w-4" />
              </div>
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}
