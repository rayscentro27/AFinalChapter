import React, { useEffect, useState } from 'react';
import { ArrowRight, BadgeCheck, BriefcaseBusiness, Building2, CheckCircle2, Crown, FileCheck2, ShieldCheck, Star } from 'lucide-react';
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

  const brandName = branding?.name?.replace('OS', '').trim() || 'NexusOne';

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(93,143,255,0.24),transparent_26%),radial-gradient(circle_at_82%_82%,rgba(181,149,255,0.18),transparent_20%),linear-gradient(180deg,#ffffff_0%,#f8faff_48%,#f6f9ff_100%)] text-[#1B2A59]">
      <header className="sticky top-0 z-20 border-b border-[#E6ECF6] bg-white/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-5 lg:px-8">
          <BrandLockup brandName={brandName} compact />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate(ViewMode.LOGIN)}
              className="rounded-[1.15rem] border border-[#D7E2F5] bg-white px-6 py-3 text-[0.72rem] font-black uppercase tracking-[0.18em] text-[#5570A9] transition-all hover:border-[#AFC5ED] hover:bg-[#F8FBFF]"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => onNavigate(ViewMode.SIGNUP)}
              className="rounded-[1.15rem] bg-[linear-gradient(135deg,#3463EA,#4E8EFF)] px-7 py-3 text-[0.72rem] font-black uppercase tracking-[0.18em] text-white shadow-[0_14px_26px_rgba(52,99,234,0.22)] transition-all hover:-translate-y-0.5"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-86px)] max-w-[1180px] gap-14 px-6 py-14 lg:grid-cols-[0.96fr_1.04fr] lg:items-center lg:px-8 lg:py-16 xl:min-h-[calc(100vh-92px)] xl:gap-16 xl:py-20">
        <section className="max-w-[34rem] space-y-9 xl:space-y-10">
          <BrandLockup brandName={brandName} />

          <div className="space-y-5">
            <h1 className="max-w-[13ch] text-[3.25rem] font-black leading-[0.98] tracking-[-0.055em] text-[#21356E] sm:text-[4.15rem] xl:text-[4.45rem]">
              Fix Your Credit. Unlock Funding. Build Your Future.
            </h1>
            <p className="max-w-[30rem] text-[1.15rem] font-semibold leading-9 text-[#485F94] sm:text-[1.22rem]">
              The all-in-one platform for credit optimization, business setup, funding access, and grants discovery.
            </p>
          </div>

          <div className="space-y-4 text-[1.04rem] font-semibold text-[#365491]">
            <ValueBullet label="Increase Your Scores" />
            <ValueBullet label="Secure Business Capital" />
            <ValueBullet label="Find Grant Opportunities" />
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-1">
            <button
              type="button"
              onClick={() => onNavigate(ViewMode.SIGNUP)}
              className="inline-flex h-[4rem] items-center gap-3 rounded-[1.05rem] bg-[linear-gradient(135deg,#2E58E6,#4D8BFF)] px-10 text-[1.18rem] font-black text-white shadow-[0_18px_34px_rgba(46,88,230,0.22)] transition-all hover:-translate-y-0.5"
            >
              Get Started <ArrowRight className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate(ViewMode.PRICING)}
              className="inline-flex h-[4rem] items-center rounded-[1.05rem] border border-[#8DB2FF] bg-white px-10 text-[1.18rem] font-black text-[#3A66D3] transition-all hover:bg-[#F8FBFF]"
            >
              Learn More
            </button>
          </div>

          <div className="border-t border-[#E5ECF6] pt-8">
            <p className="text-[1.08rem] font-bold text-[#516A9B]">Trusted by Thousands of Entrepreneurs Nationwide</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <TrustPill icon={<ShieldCheck className="h-5 w-5 text-[#3B82F6]" />} title="Certified" subtitle="Experts" />
              <TrustPill icon={<Building2 className="h-5 w-5 text-[#3B82F6]" />} title="Over $100M" subtitle="Funded" />
              <TrustPill icon={<BadgeCheck className="h-5 w-5 text-[#3B82F6]" />} title="Top Rated" subtitle="Reviews" />
              <TrustPill icon={<BriefcaseBusiness className="h-5 w-5 text-[#3B82F6]" />} title="Proven" subtitle="Results" />
            </div>
          </div>
        </section>

        <section className="relative hidden min-h-[760px] lg:block xl:min-h-[820px]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_28%,rgba(110,164,255,0.34),rgba(255,255,255,0)_28%),radial-gradient(circle_at_56%_62%,rgba(177,142,255,0.24),rgba(255,255,255,0)_26%),radial-gradient(circle_at_50%_92%,rgba(255,255,255,0.95),rgba(255,255,255,0)_38%)]" />
          <div className="absolute inset-x-10 top-10 bottom-12 rounded-[3.2rem] bg-[linear-gradient(180deg,rgba(232,241,255,0.7)_0%,rgba(245,248,255,0.34)_40%,rgba(255,255,255,0)_100%)]" />
          <div className="absolute right-6 top-8 h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle_at_center,rgba(135,184,255,0.32),rgba(183,147,255,0.18)_34%,rgba(255,255,255,0)_66%)] blur-2xl" />
          <div className="absolute right-[10%] top-[7%] flex h-28 w-28 items-center justify-center rounded-[2rem] border border-white/70 bg-white/45 backdrop-blur-xl shadow-[0_18px_40px_rgba(82,122,235,0.14)]">
            <Crown className="h-14 w-14 text-[#F3FBFF] fill-[#F3FBFF]" />
          </div>

          <FloatBadge className="left-[10%] top-[30%]" icon={<ShieldCheck className="h-6 w-6 text-white" />} />
          <FloatBadge className="left-[20%] top-[58%]" icon={<Building2 className="h-6 w-6 text-white" />} />
          <FloatBadge className="right-[14%] top-[32%]" icon={<BriefcaseBusiness className="h-6 w-6 text-white" />} />
          <FloatBadge className="right-[18%] top-[60%]" icon={<FileCheck2 className="h-6 w-6 text-white" />} />

          <div className="absolute left-1/2 top-[55%] h-[430px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-[14rem_14rem_9rem_9rem] bg-[linear-gradient(180deg,rgba(189,233,255,0.28)_0%,rgba(88,160,255,0.96)_34%,rgba(112,136,255,0.95)_62%,rgba(130,105,255,0.88)_100%)] shadow-[0_42px_120px_rgba(106,142,255,0.28)]" />
          <div className="absolute left-1/2 top-[41%] h-[190px] w-[190px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.92),rgba(177,230,255,0.25)_20%,rgba(88,150,255,0.94)_65%,rgba(121,99,255,0.94)_100%)] shadow-[0_0_90px_rgba(138,182,255,0.28)]" />
          <div className="absolute left-1/2 top-[58%] h-[370px] w-[250px] -translate-x-1/2 -translate-y-1/2 rounded-[8rem_8rem_7rem_7rem] bg-[linear-gradient(180deg,rgba(227,247,255,0.24)_0%,rgba(92,157,255,0.94)_28%,rgba(88,131,255,0.92)_55%,rgba(126,95,255,0.88)_100%)] shadow-[0_36px_90px_rgba(116,149,255,0.26)]" />
          <div className="absolute left-1/2 top-[75%] h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/96 shadow-[0_0_70px_rgba(255,255,255,0.95)]" />
          <div className="absolute left-1/2 top-[78%] h-32 w-[420px] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.97),rgba(255,255,255,0.0)_72%)]" />
        </section>
      </main>
    </div>
  );
};

const BrandLockup = (props: { brandName: string; compact?: boolean }) => (
  <div className={`flex items-center gap-3 ${props.compact ? '' : ''}`}>
    <div className={`flex items-center justify-center ${props.compact ? 'h-10 w-10 rounded-[1.15rem]' : 'h-11 w-11 rounded-[1.25rem]'} bg-[linear-gradient(135deg,#5E8CFF,#6E58FF)] text-white shadow-[0_12px_24px_rgba(94,140,255,0.22)]`}>
      <Crown className={`${props.compact ? 'h-5 w-5' : 'h-5 w-5'} fill-white`} />
    </div>
    <span className={`${props.compact ? 'text-[2.15rem]' : 'text-[2.2rem]'} font-black tracking-[-0.05em] text-[#3466DA]`}>
      {props.brandName}
    </span>
  </div>
);

const ValueBullet = (props: { label: string }) => (
  <div className="flex items-center gap-3.5">
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EEF5FF] ring-1 ring-[#D8E6FF]">
      <CheckCircle2 className="h-5 w-5 text-[#3B82F6]" />
    </div>
    <span>{props.label}</span>
  </div>
);

const TrustPill = (props: { icon: React.ReactNode; title: string; subtitle: string }) => (
  <div className="flex items-center gap-3 rounded-[1.15rem] border border-[#E7EEF9] bg-white px-4 py-4 shadow-[0_8px_20px_rgba(27,42,89,0.045)]">
    <div className="flex h-11 w-11 items-center justify-center rounded-[1rem] bg-[#EEF5FF]">{props.icon}</div>
    <div>
      <p className="text-[0.8rem] font-black uppercase tracking-[0.04em] text-[#3155AA]">{props.title}</p>
      <p className="text-[0.82rem] font-bold text-[#5F75A1]">{props.subtitle}</p>
    </div>
  </div>
);

const FloatBadge = (props: { className: string; icon: React.ReactNode }) => (
  <div className={`absolute flex h-[4.4rem] w-[4.4rem] items-center justify-center rounded-[1.4rem] border border-white/75 bg-white/24 backdrop-blur-xl shadow-[0_16px_32px_rgba(82,122,235,0.14)] ${props.className}`}>
    {props.icon}
  </div>
);

export default ClientLandingPage;
