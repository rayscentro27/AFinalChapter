import React, { useEffect, useMemo, useState } from 'react';
import { Globe, Mail, PencilLine, Rocket, Sparkles } from 'lucide-react';
import { BusinessFoundationProfileResponse } from '../../services/fundingFoundationService';
import { deriveIdentityPreview, readLaunchSnapshot } from './businessLaunchMode';

type ProfilePayload = {
  business_website?: string | null;
  business_email?: string | null;
  metadata_patch?: Record<string, unknown> | null;
  profile_status?: 'not_started' | 'in_progress' | 'ready' | 'completed' | null;
};

type Props = {
  data: BusinessFoundationProfileResponse | null;
  saving?: boolean;
  onSaveProfile: (payload: ProfilePayload) => Promise<void> | void;
};

const textareaClass = 'mt-2 w-full rounded-[1rem] border border-[#DCE5F4] bg-white px-4 py-3 text-sm text-[#17233D] outline-none focus:border-[#7FA9F9]';

export default function BusinessIdentityPreviewCard(props: Props) {
  const preview = useMemo(() => deriveIdentityPreview(props.data), [props.data]);
  const snapshot = useMemo(() => readLaunchSnapshot(props.data), [props.data]);
  const identityState = snapshot?.website_identity || {};
  const [selectedDomain, setSelectedDomain] = useState('');
  const [selectedEmail, setSelectedEmail] = useState('');
  const [hero, setHero] = useState('');
  const [about, setAbout] = useState('');
  const [contact, setContact] = useState('');

  useEffect(() => {
    setSelectedDomain(String(identityState.selected_domain || props.data?.profile?.business_website || preview?.domain_suggestions[0] || ''));
    setSelectedEmail(String(identityState.selected_email || props.data?.profile?.metadata?.business_email || preview?.business_email_suggestions[0] || ''));
    setHero(String(preview?.website_preview.hero || ''));
    setAbout(String(preview?.website_preview.about || ''));
    setContact(String(preview?.website_preview.contact || ''));
  }, [identityState.selected_domain, identityState.selected_email, preview, props.data?.profile?.business_website, props.data?.profile?.metadata?.business_email]);

  if (!preview) {
    return (
      <section className="rounded-[2rem] border border-[#DFE7F4] bg-white p-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#607CC1]">Phase 4 • Website + identity preview</p>
        <h3 className="mt-2 text-[1.55rem] font-black tracking-tight text-[#17233D]">Preview Your Website And Business Identity</h3>
        <p className="mt-3 text-sm leading-6 text-[#61769D]">
          Generate or review a launch draft first. As soon as a business path is staged, Nexus will preview your website structure, domain suggestions, and business email options here.
        </p>
      </section>
    );
  }

  const handleSaveIdentity = async () => {
    await props.onSaveProfile({
      business_website: selectedDomain || null,
      business_email: selectedEmail || null,
      profile_status: 'in_progress',
      metadata_patch: {
        launch_mode: {
          ...snapshot,
          website_identity: {
            selected_domain: selectedDomain || null,
            selected_email: selectedEmail || null,
            website_preview: {
              hero,
              about,
              services: preview.website_preview.services,
              contact,
            },
            last_updated_at: new Date().toISOString(),
          },
        },
      },
    });
  };

  return (
    <section className="rounded-[2rem] border border-[#DFE7F4] bg-[linear-gradient(180deg,#FFFFFF_0%,#F6FAFF_100%)] p-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#607CC1]">Phase 4 • Website + identity preview</p>
          <h3 className="mt-2 text-[1.7rem] font-black tracking-tight text-[#17233D]">Preview First, Then Continue Setup</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#61769D]">
            This stays preview-first and connected to Business Foundation. Choose a domain, choose a business email, edit the launch copy, and carry those selections into your credibility stack.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#DCE5F4] bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#607CC1]">
          <Sparkles className="h-3.5 w-3.5" />
          Preview only • no paid deploy required
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[1.6rem] border border-[#DCE5F4] bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">Website preview</p>
              <h4 className="mt-2 text-[1.3rem] font-black tracking-tight text-[#17233D]">{preview.business_name}</h4>
            </div>
            <span className="rounded-full bg-[#EEF5FF] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#5677E8]">
              {preview.path === 'new_business' ? 'New business path' : 'Existing business path'}
            </span>
          </div>

          <div className="mt-5 rounded-[1.4rem] border border-[#E4EBF6] bg-[linear-gradient(180deg,#F7FBFF_0%,#FFFFFF_100%)] p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Hero</p>
            <textarea value={hero} onChange={(event) => setHero(event.target.value)} rows={3} className={textareaClass} />

            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">About</p>
            <textarea value={about} onChange={(event) => setAbout(event.target.value)} rows={4} className={textareaClass} />

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-[1rem] border border-[#E7EDF8] bg-white p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Services</p>
                <div className="mt-3 space-y-2 text-sm text-[#17233D]">
                  {preview.website_preview.services.map((service) => (
                    <p key={service}>{service}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-[1rem] border border-[#E7EDF8] bg-white p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Contact</p>
                <textarea value={contact} onChange={(event) => setContact(event.target.value)} rows={5} className={textareaClass} />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[1.6rem] border border-[#DCE5F4] bg-white p-5">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-[#356AE6]" />
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">Choose domain</p>
            </div>
            <div className="mt-4 space-y-3">
              {preview.domain_suggestions.map((domain) => (
                <button
                  key={domain}
                  type="button"
                  onClick={() => setSelectedDomain(domain)}
                  className={`w-full rounded-[1rem] border px-4 py-3 text-left text-sm font-black ${
                    selectedDomain === domain ? 'border-[#A7C7FF] bg-[#EEF5FF] text-[#17233D]' : 'border-[#E3EAF5] bg-[#FBFDFF] text-[#61769D]'
                  }`}
                >
                  {domain}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-[#DCE5F4] bg-white p-5">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-[#356AE6]" />
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">Business email</p>
            </div>
            <div className="mt-4 space-y-3">
              {preview.business_email_suggestions.map((email) => (
                <button
                  key={email}
                  type="button"
                  onClick={() => setSelectedEmail(email)}
                  className={`w-full rounded-[1rem] border px-4 py-3 text-left text-sm font-black ${
                    selectedEmail === email ? 'border-[#A7C7FF] bg-[#EEF5FF] text-[#17233D]' : 'border-[#E3EAF5] bg-[#FBFDFF] text-[#61769D]'
                  }`}
                >
                  {email}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-[#DCE5F4] bg-white p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">Connected next steps</p>
            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={() => void handleSaveIdentity()}
                disabled={props.saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[1.1rem] bg-[#17233D] px-4 py-3 text-sm font-black text-white disabled:opacity-60"
              >
                <Rocket className="h-4 w-4" />
                Launch My Website
              </button>
              <button
                type="button"
                onClick={() => void handleSaveIdentity()}
                disabled={props.saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[1.1rem] border border-[#D8E4F8] bg-white px-4 py-3 text-sm font-black text-[#356AE6] disabled:opacity-60"
              >
                <PencilLine className="h-4 w-4" />
                Edit Content
              </button>
              <button
                type="button"
                onClick={() => void handleSaveIdentity()}
                disabled={props.saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[1.1rem] border border-[#D8E4F8] bg-white px-4 py-3 text-sm font-black text-[#356AE6] disabled:opacity-60"
              >
                <Globe className="h-4 w-4" />
                Choose Domain
              </button>
              <button
                type="button"
                onClick={() => void handleSaveIdentity()}
                disabled={props.saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[1.1rem] border border-[#D8E4F8] bg-white px-4 py-3 text-sm font-black text-[#356AE6] disabled:opacity-60"
              >
                Continue Setup
              </button>
            </div>
            <p className="mt-4 text-sm leading-6 text-[#61769D]">
              Saving this preview updates your Business Foundation identity fields so the website, domain, and business email strengthen readiness and credibility without requiring a paid deployment yet.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
