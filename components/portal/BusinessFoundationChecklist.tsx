import React, { useMemo, useState } from 'react';
import { BriefcaseBusiness, CheckCircle2, Circle, LockKeyhole, Sparkles } from 'lucide-react';
import { BusinessFoundationProfileResponse } from '../../services/fundingFoundationService';
import BusinessFoundationActionDrawer from './BusinessFoundationActionDrawer';
import {
  BusinessFoundationItem,
  BusinessFoundationPath,
  PATH_LABELS,
  currentPath,
  foundationItems,
} from './businessFoundationConfig';

type DraftPayload = {
  legal_name?: string;
  entity_type?: string;
  ein?: string;
  business_address?: string;
  business_phone?: string;
  business_website?: string;
  naics_code?: string;
  business_email?: string;
  mission_statement?: string;
  business_plan_summary?: string;
  bank_name?: string;
  account_type?: string;
};

type Props = {
  data: BusinessFoundationProfileResponse | null;
  saving?: boolean;
  error?: string;
  onChoosePath: (path: BusinessFoundationPath) => Promise<void> | void;
  onSaveProfile: (payload: DraftPayload) => Promise<void> | void;
  onSetStepStatus: (stepKey: string, stepStatus: 'not_started' | 'in_progress' | 'completed' | 'blocked', notes?: string | null) => Promise<void> | void;
};

function StepCard(props: { item: BusinessFoundationItem; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`rounded-[1.35rem] border p-4 text-left transition-all ${
        props.item.complete
          ? 'border-[#D6EBDD] bg-[linear-gradient(180deg,#FBFFFD_0%,#F3FBF6_100%)]'
          : props.item.status === 'in_progress'
            ? 'border-[#D5E4FF] bg-[linear-gradient(180deg,#F7FBFF_0%,#F0F6FF_100%)]'
            : 'border-[#E1E8F4] bg-white hover:border-[#BED1F4]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-[1rem] ${
            props.item.complete
              ? 'bg-[#E5F8EE] text-[#169E68]'
              : props.item.status === 'in_progress'
                ? 'bg-[#EAF2FF] text-[#356AE6]'
                : 'bg-[#F2F5FA] text-[#9AA9C1]'
          }`}
        >
          {props.item.complete ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
        </span>
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">
          {props.item.required ? 'Required' : 'Optional'}
        </span>
      </div>
      <p className="mt-4 text-[1rem] font-black tracking-tight text-[#17233D]">{props.item.label}</p>
      <p className="mt-2 text-sm leading-6 text-[#61769D]">{props.item.description}</p>
      <p className="mt-3 text-[11px] font-black uppercase tracking-[0.16em] text-[#6380AB]">
        {props.item.complete ? 'Completed' : props.item.status === 'in_progress' ? 'In progress' : 'Open action'}
      </p>
    </button>
  );
}

export default function BusinessFoundationChecklist(props: Props) {
  const [selectedItem, setSelectedItem] = useState<BusinessFoundationItem | null>(null);
  const { path, coreItems, credibilityItems } = useMemo(() => foundationItems(props.data), [props.data]);
  const requiredComplete = coreItems.filter((item) => item.required && item.complete).length;
  const requiredTotal = coreItems.filter((item) => item.required).length;
  const completionPercent = Math.round((requiredComplete / Math.max(1, requiredTotal)) * 100);

  const pathCards: Array<{ key: BusinessFoundationPath; title: string; body: string }> = [
    {
      key: 'new_business',
      title: PATH_LABELS.new_business,
      body: 'Generate and complete a fundable business foundation from scratch.',
    },
    {
      key: 'existing_business_optimization',
      title: PATH_LABELS.existing_business_optimization,
      body: 'Validate and optimize the business you already run before deeper funding steps.',
    },
  ];

  return (
    <>
      <section className="rounded-[2rem] border border-[#DFE7F4] bg-white p-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#607CC1]">Phase 2 • Business foundation</p>
            <h2 className="mt-2 text-[2rem] font-black tracking-tight text-[#17233D]">Build A Fundable Business Profile First</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#61769D]">
              Business Foundation is now the first real gate in the Nexus journey. Finish the essentials here before deeper funding steps fully open.
            </p>
          </div>
          <div className="rounded-[1.4rem] border border-[#DCE5F4] bg-[#F8FBFF] px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">Foundation progress</p>
            <p className="mt-2 text-[1.6rem] font-black tracking-tight text-[#17233D]">{completionPercent}%</p>
            <p className="text-sm text-[#61769D]">{requiredComplete}/{requiredTotal} required steps complete</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {pathCards.map((card) => {
            const active = path === card.key;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => void props.onChoosePath(card.key)}
                className={`rounded-[1.45rem] border p-5 text-left transition-all ${
                  active ? 'border-[#A7C7FF] bg-[linear-gradient(180deg,#F6FAFF_0%,#EEF5FF_100%)]' : 'border-[#E0E8F4] bg-white hover:border-[#C4D6F3]'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-[1rem] bg-[#17233D] text-white">
                    <BriefcaseBusiness className="h-5 w-5" />
                  </span>
                  {active ? <CheckCircle2 className="h-5 w-5 text-[#2C73E8]" /> : <LockKeyhole className="h-5 w-5 text-[#9DABC0]" />}
                </div>
                <p className="mt-4 text-[1.08rem] font-black tracking-tight text-[#17233D]">{card.title}</p>
                <p className="mt-2 text-sm leading-6 text-[#61769D]">{card.body}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="rounded-[2rem] border border-[#DFE7F4] bg-white p-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#607CC1]">Required checklist</p>
              <h3 className="mt-2 text-[1.55rem] font-black tracking-tight text-[#17233D]">Core Foundation Steps</h3>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#E0E8F5] bg-[#FBFDFF] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#7F93B5]">
              <Sparkles className="h-3.5 w-3.5" />
              {currentPath(props.data) ? PATH_LABELS[currentPath(props.data)!] : 'Choose a path'}
            </div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {coreItems.map((item) => (
              <StepCard key={item.key} item={item} onClick={() => setSelectedItem(item)} />
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-[2rem] border border-[#DFE7F4] bg-white p-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#607CC1]">Credibility layer</p>
            <h3 className="mt-2 text-[1.55rem] font-black tracking-tight text-[#17233D]">Identity Builders</h3>
            <div className="mt-5 space-y-3">
              {credibilityItems.map((item) => (
                <StepCard key={item.key} item={item} onClick={() => setSelectedItem(item)} />
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-[#DFE7F4] bg-white p-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#607CC1]">Unlock rule</p>
            <h3 className="mt-2 text-[1.3rem] font-black tracking-tight text-[#17233D]">What this unlocks next</h3>
            <p className="mt-3 text-sm leading-6 text-[#61769D]">
              Business Foundation completion is now required before funding strategy, stronger opportunity matching, and later educational trading progression can fully unlock.
            </p>
          </section>
        </div>
      </section>

      <BusinessFoundationActionDrawer
        open={Boolean(selectedItem)}
        item={selectedItem}
        data={props.data}
        saving={props.saving}
        error={props.error}
        onClose={() => setSelectedItem(null)}
        onChoosePath={props.onChoosePath}
        onSaveProfile={props.onSaveProfile}
        onSetStepStatus={props.onSetStepStatus}
      />
    </>
  );
}
