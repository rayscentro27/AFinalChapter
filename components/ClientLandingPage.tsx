import React, { useEffect, useState } from 'react';
import { ArrowRight, BadgeCheck, BriefcaseBusiness, Building2, CheckCircle2, ShieldCheck, Star } from 'lucide-react';
import { AgencyBranding, ViewMode } from '../types';
import { data } from '../adapters';

interface ClientLandingPageProps {
  onNavigate: (view: ViewMode) => void;
}

const ClientLandingPage: React.FC<ClientLandingPageProps> = ({ onNavigate }) => {
  const [branding, setBranding] = useState<AgencyBranding | null>(null);

  useEffect(() => {
    const fetchBranding = async () => {
      const nextBranding = await data.getBranding();
      setBranding(nextBranding);
    };

    void fetchBranding();
  }, []);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(81,139,255,0.22),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(190,164,255,0.18),transparent_18%),linear-gradient(180deg,#ffffff_0%,#f7faff_100%)] text-[#1B2A59]">
      <header className="sticky top-0 z-20 border-b border-[#E8EEF9] bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#5E8CFF,#6E58FF)] text-white shadow-[0_12px_24px_rgba(94,140,255,0.28)]">
              <Star className="h-5 w-5 fill-white" />
            </div>
            <span className="text-3xl font-black tracking-tight text-[#305FD2]">
              {branding?.name?.replace('OS', '').trim() || 'NexusOne'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate(ViewMode.LOGIN)}
              className="rounded-2xl border border-[#D5E3FF] bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-[#4866B1] transition-all hover:border-[#9DB9FF] hover:bg-[#F8FBFF]"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => onNavigate(ViewMode.SIGNUP)}
              className="rounded-2xl bg-[linear-gradient(135deg,#2E58E6,#4D8BFF)] px-6 py-3 text-xs font-black uppercase tracking-[0.16em] text-white shadow-[0_16px_30px_rgba(46,88,230,0.24)] transition-all hover:-translate-y-0.5"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-84px)] max-w-7xl gap-14 px-6 py-16 lg:grid-cols-[1fr_0.95fr] lg:items-center lg:py-20">
        <section className="max-w-2xl space-y-9">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#5E8CFF,#6E58FF)] text-white shadow-[0_12px_24px_rgba(94,140,255,0.28)]">
              <Star className="h-5 w-5 fill-white" />
            </div>
            <span className="text-4xl font-black tracking-tight text-[#3466DA]">{branding?.name?.replace('OS', '').trim() || 'NexusOne'}</span>
          </div>

          <div className="space-y-5">
            <h1 className="text-5xl font-black leading-[1.02] tracking-tight text-[#21356E] sm:text-6xl">
              Fix Your Credit. Unlock Funding. Build Your Future.
            </h1>
            <p className="max-w-xl text-2xl font-bold leading-tight text-[#2D437D] sm:text-[2.1rem]">
              The all-in-one platform for credit optimization, business setup, funding access, and grants discovery.
            </p>
          </div>

          <div className="space-y-4 text-[1.1rem] font-semibold text-[#33508F]">
            <div className="flex items-center gap-3"><CheckCircle2 className="h-7 w-7 text-[#3B82F6]" /> Increase Your Scores</div>
            <div className="flex items-center gap-3"><CheckCircle2 className="h-7 w-7 text-[#3B82F6]" /> Secure Business Capital</div>
            <div className="flex items-center gap-3"><CheckCircle2 className="h-7 w-7 text-[#3B82F6]" /> Find Grant Opportunities</div>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              type="button"
              onClick={() => onNavigate(ViewMode.SIGNUP)}
              className="inline-flex items-center gap-3 rounded-2xl bg-[linear-gradient(135deg,#2E58E6,#4D8BFF)] px-10 py-5 text-xl font-black text-white shadow-[0_18px_35px_rgba(46,88,230,0.24)] transition-all hover:-translate-y-0.5"
            >
              Get Started <ArrowRight className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate(ViewMode.PRICING)}
              className="rounded-2xl border border-[#8DB2FF] bg-white px-10 py-5 text-xl font-black text-[#3A66D3] transition-all hover:bg-[#F8FBFF]"
            >
              Learn More
            </button>
          </div>

          <div className="border-t border-[#E6ECF7] pt-8">
            <p className="text-[1.1rem] font-bold text-[#516A9B]">Trusted by Thousands of Entrepreneurs Nationwide</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-4">
              <TrustPill icon={<ShieldCheck className="h-6 w-6 text-[#3B82F6]" />} title="Certified" subtitle="Experts" />
              <TrustPill icon={<Building2 className="h-6 w-6 text-[#3B82F6]" />} title="Over $100M" subtitle="Funded" />
              <TrustPill icon={<BadgeCheck className="h-6 w-6 text-[#3B82F6]" />} title="Top Rated" subtitle="Reviews" />
              <TrustPill icon={<BriefcaseBusiness className="h-6 w-6 text-[#3B82F6]" />} title="Proven" subtitle="Results" />
            </div>
          </div>
        </section>

        <section className="relative hidden min-h-[760px] lg:block">
          <div className="absolute inset-0 rounded-[3rem] bg-[radial-gradient(circle_at_top,rgba(123,168,255,0.35),rgba(255,255,255,0)_45%),radial-gradient(circle_at_bottom,rgba(182,136,255,0.28),rgba(255,255,255,0)_30%)]" />
          <div className="absolute inset-x-16 top-8 bottom-16 rounded-[3rem] bg-[radial-gradient(circle_at_center,rgba(61,151,255,0.9),rgba(162,131,255,0.68)_30%,rgba(255,255,255,0)_66%)] blur-[8px] opacity-85" />
          <div className="absolute bottom-0 left-8 right-8 h-40 rounded-t-[100%] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.95),rgba(255,255,255,0.0)_70%)]" />
          <div className="absolute right-10 top-12 flex h-28 w-28 items-center justify-center rounded-[2rem] border border-white/70 bg-white/25 backdrop-blur-xl shadow-[0_18px_40px_rgba(82,122,235,0.18)]">
            <Star className="h-14 w-14 text-white fill-white" />
          </div>
          <FloatBadge className="left-12 top-48" icon={<ShieldCheck className="h-7 w-7 text-white" />} />
          <FloatBadge className="left-28 top-96" icon={<Building2 className="h-7 w-7 text-white" />} />
          <FloatBadge className="right-16 top-52" icon={<BriefcaseBusiness className="h-7 w-7 text-white" />} />
          <FloatBadge className="right-24 top-96" icon={<BadgeCheck className="h-7 w-7 text-white" />} />
          <div className="absolute left-1/2 top-[50%] h-[460px] w-[290px] -translate-x-1/2 -translate-y-1/2 rounded-[12rem_12rem_8rem_8rem] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.95),rgba(184,225,255,0.35)_12%,rgba(115,175,255,0.92)_36%,rgba(146,118,255,0.82)_72%,rgba(255,255,255,0)_100%)] shadow-[0_30px_80px_rgba(108,144,255,0.24)]" />
          <div className="absolute left-1/2 top-[58%] h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/95 shadow-[0_0_60px_rgba(255,255,255,0.98)]" />
        </section>
      </main>
    </div>
  );
};

const TrustPill = (props: { icon: React.ReactNode; title: string; subtitle: string }) => (
  <div className="flex items-center gap-3 rounded-2xl border border-[#E7EEF9] bg-white px-4 py-4 shadow-[0_10px_25px_rgba(27,42,89,0.05)]">
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF5FF]">{props.icon}</div>
    <div>
      <p className="text-sm font-black uppercase tracking-tight text-[#3155AA]">{props.title}</p>
      <p className="text-sm font-bold text-[#5F75A1]">{props.subtitle}</p>
    </div>
  </div>
);

const FloatBadge = (props: { className: string; icon: React.ReactNode }) => (
  <div className={`absolute flex h-20 w-20 items-center justify-center rounded-[1.8rem] border border-white/70 bg-white/20 backdrop-blur-xl shadow-[0_18px_35px_rgba(82,122,235,0.18)] ${props.className}`}>
    {props.icon}
  </div>
);

export default ClientLandingPage;
