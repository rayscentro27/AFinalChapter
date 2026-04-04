import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Loader2, ShieldCheck, X } from 'lucide-react';
import { BusinessFoundationProfileResponse } from '../../services/fundingFoundationService';
import {
  BusinessFoundationItem,
  BusinessFoundationPath,
  NAICS_SUGGESTIONS,
  PATH_LABELS,
  currentPath,
  naicsReview,
} from './businessFoundationConfig';

type DraftState = {
  legal_name: string;
  entity_type: string;
  ein: string;
  business_address: string;
  business_phone: string;
  business_website: string;
  naics_code: string;
  business_email: string;
  mission_statement: string;
  business_plan_summary: string;
  bank_name: string;
  account_type: string;
};

type Props = {
  open: boolean;
  item: BusinessFoundationItem | null;
  data: BusinessFoundationProfileResponse | null;
  saving?: boolean;
  error?: string;
  onClose: () => void;
  onChoosePath: (path: BusinessFoundationPath) => Promise<void> | void;
  onSaveProfile: (payload: Partial<DraftState>) => Promise<void> | void;
  onSetStepStatus: (stepKey: string, stepStatus: 'not_started' | 'in_progress' | 'completed' | 'blocked', notes?: string | null) => Promise<void> | void;
};

function buildDraft(data: BusinessFoundationProfileResponse | null): DraftState {
  return {
    legal_name: String(data?.profile?.legal_name || ''),
    entity_type: String(data?.profile?.entity_type || ''),
    ein: String(data?.profile?.ein || ''),
    business_address: String(data?.profile?.business_address || ''),
    business_phone: String(data?.profile?.business_phone || ''),
    business_website: String(data?.profile?.business_website || ''),
    naics_code: String(data?.profile?.naics_code || ''),
    business_email: String(data?.profile?.metadata?.business_email || ''),
    mission_statement: String(data?.profile?.metadata?.mission_statement || ''),
    business_plan_summary: String(data?.profile?.metadata?.business_plan_summary || ''),
    bank_name: String(data?.supporting?.banking_profile?.bank_name || ''),
    account_type: String(data?.supporting?.banking_profile?.account_type || ''),
  };
}

function fieldsForItem(itemKey: string): Array<keyof DraftState> {
  switch (itemKey) {
    case 'llc_setup':
    case 'review_current_setup':
      return ['legal_name', 'entity_type'];
    case 'ein_setup':
    case 'align_irs_ein':
      return ['ein'];
    case 'business_address':
    case 'update_business_address':
      return ['business_address'];
    case 'business_phone':
      return ['business_phone'];
    case 'business_website':
      return ['business_website'];
    case 'website_phone_consistency':
      return ['business_website', 'business_phone'];
    case 'naics_classification':
      return ['naics_code'];
    case 'business_bank_account':
    case 'update_bank_records':
      return ['bank_name', 'account_type'];
    case 'business_email':
      return ['business_email'];
    case 'mission_statement':
      return ['mission_statement'];
    case 'business_plan_summary':
      return ['business_plan_summary'];
    default:
      return [];
  }
}

const FIELD_LABELS: Record<keyof DraftState, string> = {
  legal_name: 'Legal Name',
  entity_type: 'Entity Type',
  ein: 'EIN',
  business_address: 'Business Address',
  business_phone: 'Business Phone',
  business_website: 'Website',
  naics_code: 'NAICS Code',
  business_email: 'Business Email',
  mission_statement: 'Mission Statement',
  business_plan_summary: 'Business Plan Summary',
  bank_name: 'Bank Name',
  account_type: 'Account Type',
};

export default function BusinessFoundationActionDrawer(props: Props) {
  const [draft, setDraft] = useState<DraftState>(() => buildDraft(props.data));

  useEffect(() => {
    setDraft(buildDraft(props.data));
  }, [props.data, props.item?.key, props.open]);

  if (!props.open || !props.item) return null;

  const itemFields = fieldsForItem(props.item.key);
  const activePath = currentPath(props.data);
  const naics = naicsReview(props.data);

  const handleSave = async () => {
    const payload: Partial<DraftState> = {};
    for (const key of itemFields) payload[key] = draft[key];
    if (itemFields.length > 0) {
      await props.onSaveProfile(payload);
    }
    if (props.item.required) {
      await props.onSetStepStatus(props.item.key, 'completed', `Completed from portal drawer: ${props.item.label}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#102043]/30 backdrop-blur-[2px]">
      <button type="button" className="flex-1 cursor-default" aria-label="Close drawer" onClick={props.onClose} />
      <aside className="h-full w-full max-w-[560px] overflow-y-auto border-l border-[#D9E4F6] bg-white p-6 shadow-[-24px_0_64px_rgba(22,34,63,0.16)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#607CC1]">Business foundation action</p>
            <h3 className="mt-2 text-[1.8rem] font-black tracking-tight text-[#17233D]">{props.item.label}</h3>
            <p className="mt-2 text-sm leading-6 text-[#61769D]">{props.item.description}</p>
          </div>
          <button type="button" onClick={props.onClose} className="rounded-full border border-[#DDE6F7] p-2 text-[#7083A8]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 rounded-[1.35rem] border border-[#E4ECF8] bg-[#F8FBFF] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">Why this matters</p>
          <p className="mt-2 text-sm leading-6 text-[#4F658E]">{props.item.helper}</p>
        </div>

        {props.item.key === 'select_business_path' || props.item.fieldGroup === 'path' ? (
          <div className="mt-6 grid gap-3">
            {(['new_business', 'existing_business_optimization'] as BusinessFoundationPath[]).map((path) => (
              <button
                key={path}
                type="button"
                onClick={() => void props.onChoosePath(path)}
                className={`rounded-[1.35rem] border p-4 text-left transition-all ${
                  activePath === path ? 'border-[#A8C8FF] bg-[#EEF5FF]' : 'border-[#DDE6F5] bg-white hover:border-[#BDD2F4]'
                }`}
              >
                <p className="text-[1rem] font-black tracking-tight text-[#17233D]">{PATH_LABELS[path]}</p>
                <p className="mt-2 text-sm leading-6 text-[#61769D]">
                  {path === 'new_business'
                    ? 'Start with a clean, fundable business foundation built by Nexus.'
                    : 'Review and optimize the business you already operate.'}
                </p>
              </button>
            ))}
          </div>
        ) : null}

        {itemFields.length > 0 ? (
          <div className="mt-6 space-y-4">
            {itemFields.map((field) => (
              <label key={field} className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">{FIELD_LABELS[field]}</span>
                {field === 'mission_statement' || field === 'business_plan_summary' ? (
                  <textarea
                    value={draft[field]}
                    onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))}
                    rows={field === 'business_plan_summary' ? 5 : 3}
                    className="mt-2 w-full rounded-[1rem] border border-[#DCE5F4] bg-white px-4 py-3 text-sm text-[#17233D] outline-none focus:border-[#7FA9F9]"
                  />
                ) : (
                  <input
                    value={draft[field]}
                    onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))}
                    className="mt-2 w-full rounded-[1rem] border border-[#DCE5F4] bg-white px-4 py-3 text-sm text-[#17233D] outline-none focus:border-[#7FA9F9]"
                  />
                )}
              </label>
            ))}
          </div>
        ) : null}

        {props.item.key === 'naics_classification' ? (
          <div className="mt-6 rounded-[1.4rem] border border-[#E4ECF8] bg-white p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">NAICS review</p>
            <p className={`mt-2 text-sm leading-6 ${naics.highRisk ? 'text-[#B15F1A]' : 'text-[#4F658E]'}`}>{naics.warning}</p>
            <div className="mt-4 grid gap-3">
              {NAICS_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion.code}
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, naics_code: suggestion.code }))}
                  className={`rounded-[1.1rem] border px-4 py-3 text-left ${
                    draft.naics_code === suggestion.code ? 'border-[#A9C8FF] bg-[#EEF5FF]' : 'border-[#E4EAF5] bg-[#FBFDFF]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-[#17233D]">{suggestion.label}</p>
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#5D7DAB]">{suggestion.code}</span>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-[#1A7B61]">{suggestion.fit}</p>
                  <p className="mt-1 text-sm text-[#61769D]">{suggestion.reason}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {props.error ? (
          <div className="mt-6 rounded-[1.2rem] border border-[#FFD8DF] bg-[#FFF5F7] px-4 py-3 text-sm text-[#C14E67]">
            {props.error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={props.saving}
            className="inline-flex items-center gap-2 rounded-[1.15rem] bg-[#17233D] px-4 py-3 text-sm font-black tracking-tight text-white shadow-[0_14px_28px_rgba(23,35,61,0.18)] disabled:opacity-60"
          >
            {props.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {itemFields.length > 0 ? 'Save and continue' : props.item.required ? 'Mark complete' : 'Save note'}
          </button>

          {props.item.required ? (
            <button
              type="button"
              onClick={() => void props.onSetStepStatus(props.item.key, 'in_progress', `In progress from portal drawer: ${props.item.label}`)}
              disabled={props.saving}
              className="rounded-[1.15rem] border border-[#D5E4FF] bg-[#EEF4FF] px-4 py-3 text-sm font-black tracking-tight text-[#4677E6] disabled:opacity-60"
            >
              Mark In Progress
            </button>
          ) : null}

          <div className="inline-flex items-center gap-2 text-sm text-[#61769D]">
            <ShieldCheck className="h-4 w-4 text-[#46A2E7]" />
            This step stays connected to the live business readiness profile.
          </div>
        </div>

        <div className="mt-6 rounded-[1.35rem] border border-[#E6EDF8] bg-[#FBFDFF] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">Next step</p>
          <p className="mt-2 text-sm leading-6 text-[#4F658E]">
            Completing business foundation steps unlocks deeper funding readiness, stronger opportunities, and later educational trading access.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 text-sm font-black text-[#356AE6]">
            Continue the journey
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </aside>
    </div>
  );
}
