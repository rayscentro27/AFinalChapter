import React, { useEffect, useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { BarChart3, CheckCircle2, Crown, Handshake, Loader2, ShieldCheck, Star } from 'lucide-react';
import { AgencyBranding, ViewMode } from '../types';
import { data } from '../adapters';

interface ClientLandingPageProps {
  onNavigate: (view: ViewMode) => void;
}

const ClientLandingPage: React.FC<ClientLandingPageProps> = ({ onNavigate }) => {
  const [branding, setBranding] = useState<AgencyBranding | null>(null);
  const [heroImage, setHeroImage] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(true);

  useEffect(() => {
    const fetchBranding = async () => {
      const nextBranding = await data.getBranding();
      setBranding(nextBranding);
    };

    void fetchBranding();
  }, []);

  useEffect(() => {
    const fetchHeroImage = async () => {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

      if (!apiKey) {
        setLoadingImage(false);
        return;
      }

      try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              {
                text: 'A glowing, ethereal human figure in a meditative pose, radiating intense blue and white light, with a brilliant crown of light on their head. Floating around the figure are clean, modern 3D icons: a credit score gauge, a modern glass office building, a professional briefcase, and a document with a blue checkmark. The background is a soft, dreamy blue and purple nebula with white clouds and sparkling stars. High-tech, futuristic, financial success theme.',
              },
            ],
          },
        });

        const parts = response.candidates?.[0]?.content?.parts ?? [];
        const imagePart = parts.find((part) => 'inlineData' in part && part.inlineData?.data);
        if (imagePart && 'inlineData' in imagePart && imagePart.inlineData?.data) {
          setHeroImage(`data:image/png;base64,${imagePart.inlineData.data}`);
        }
      } catch (error) {
        console.error('Failed to generate hero image:', error);
      } finally {
        setLoadingImage(false);
      }
    };

    void fetchHeroImage();
  }, []);

  const brandName = branding?.name?.replace('OS', '').trim() || 'NexusOne';

  return (
    <div className="min-h-screen overflow-x-hidden bg-white font-sans text-slate-900 selection:bg-blue-100">
      <header className="relative z-20 mx-auto flex w-full max-w-[1240px] items-center justify-between px-6 py-8 lg:px-8">
        <BrandLockup brandName={brandName} />
        <nav className="hidden items-center gap-8 text-sm font-bold text-slate-600 md:flex">
          <button type="button" onClick={() => onNavigate(ViewMode.PRICING)} className="transition-colors hover:text-blue-600">Pricing</button>
          <button type="button" onClick={() => onNavigate(ViewMode.LOGIN)} className="transition-colors hover:text-blue-600">Sign In</button>
          <button
            type="button"
            onClick={() => onNavigate(ViewMode.DASHBOARD)}
            className="rounded-xl bg-[#2563EB] px-8 py-2.5 text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-700 active:scale-95"
          >
            SuperAdmin Portal
          </button>
        </nav>
      </header>

      <main className="relative mx-auto w-full max-w-[1240px] px-6 pb-24 pt-8 lg:px-8 lg:pt-12">
        <div className="pointer-events-none absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-blue-50/50 to-transparent" />

        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-16">
          <section className="relative z-10 space-y-12">
            <div className="space-y-6">
              <h1 className="text-[56px] font-black leading-[1.05] tracking-[-0.07em] text-[#1E293B] lg:text-[72px]">
                Fix Your Credit. <br />
                Unlock Funding. <br />
                Build Your Future.
              </h1>

              <p className="max-w-lg text-xl font-medium leading-relaxed text-slate-500">
                The all-in-one platform for credit optimization, business setup, funding access, and grants discovery.
              </p>
            </div>

            <ul className="space-y-6">
              <ValueBullet label="Increase Your Scores" />
              <ValueBullet label="Secure Business Capital" />
              <ValueBullet label="Find Grant Opportunities" />
            </ul>

            <div className="flex flex-wrap gap-6 pt-4">
              <button
                type="button"
                onClick={() => onNavigate(ViewMode.SIGNUP)}
                className="rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#3B82F6] px-14 py-5 text-xl font-black text-white shadow-2xl shadow-blue-200 transition-all hover:scale-[1.02] active:scale-95"
              >
                Get Started
              </button>
              <button
                type="button"
                onClick={() => onNavigate(ViewMode.PRICING)}
                className="rounded-2xl border-2 border-blue-100 bg-white px-14 py-5 text-xl font-black text-blue-600 transition-all hover:bg-blue-50 active:scale-95"
              >
                Learn More
              </button>
            </div>

            <div className="pt-16">
              <p className="mb-8 text-sm font-black uppercase tracking-[0.2em] text-slate-400">
                Trusted by Thousands of Entrepreneurs Nationwide
              </p>
              <div className="flex flex-wrap gap-x-12 gap-y-8">
                <TrustMark icon={<ShieldCheck className="h-7 w-7 text-blue-600" />} title="CERTIFIED" subtitle="EXPERTS" />
                <TrustMark icon={<BarChart3 className="h-7 w-7 text-blue-600" />} title="OVER $100M" subtitle="FUNDED" />
                <TrustMark icon={<Star className="h-7 w-7 text-blue-600" />} title="TOP RATED" subtitle="REVIEWS" />
                <TrustMark icon={<Handshake className="h-7 w-7 text-blue-600" />} title="PROVEN" subtitle="RESULTS" />
              </div>
            </div>
          </section>

          <section className="relative flex min-h-[540px] items-center justify-center lg:h-[800px]">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-[600px] w-[600px] rounded-full bg-blue-500/40 blur-[140px]" />
              <div className="absolute h-[500px] w-[500px] rounded-full bg-indigo-500/30 blur-[120px]" />
              <div className="absolute h-[400px] w-[400px] rounded-full bg-purple-500/20 blur-[100px]" />
            </div>

            <div className="relative z-10 w-full max-w-2xl">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[80px] border border-white/30 bg-blue-50/20 shadow-[0_0_100px_rgba(59,130,246,0.3)] backdrop-blur-sm">
                {loadingImage ? (
                  <div className="flex h-full flex-col items-center justify-center gap-4">
                    <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-blue-600">Generating Vision</p>
                  </div>
                ) : heroImage ? (
                  <>
                    <div className="absolute inset-0 z-10 bg-gradient-to-t from-blue-900/20 via-transparent to-blue-500/10" />
                    <img src={heroImage} alt="NexusOne Visionary" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  </>
                ) : (
                  <HeroArtwork />
                )}
              </div>

              <div className="absolute -top-10 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/30 bg-white/20 p-6 shadow-2xl backdrop-blur-xl">
                <Crown className="h-16 w-16 text-blue-400 drop-shadow-[0_0_15px_rgba(96,165,250,0.8)]" />
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

const BrandLockup = (props: { brandName: string }) => (
  <div className="flex items-center gap-2">
    <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-400 shadow-lg shadow-blue-200">
      <Crown className="h-6 w-6 text-white" />
    </div>
    <span className="flex items-center gap-1 text-2xl font-black tracking-tighter text-[#1A365D]">
      {props.brandName}
    </span>
  </div>
);

const ValueBullet = (props: { label: string }) => (
  <li className="flex items-center gap-4 text-xl font-bold text-[#334155]">
    <div className="text-blue-600">
      <CheckCircle2 className="h-7 w-7" />
    </div>
    {props.label}
  </li>
);

const TrustMark = (props: { icon: React.ReactNode; title: string; subtitle: string }) => (
  <div className="flex items-center gap-4">
    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">{props.icon}</div>
    <div>
      <p className="text-sm font-black text-slate-900">{props.title}</p>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{props.subtitle}</p>
    </div>
  </div>
);

const HeroArtwork = () => (
  <div className="relative h-full w-full bg-[radial-gradient(circle_at_58%_24%,rgba(161,229,255,0.65),rgba(255,255,255,0)_18%),radial-gradient(circle_at_55%_42%,rgba(86,154,255,0.62),rgba(255,255,255,0)_30%),radial-gradient(circle_at_64%_46%,rgba(149,105,255,0.36),rgba(255,255,255,0)_34%),linear-gradient(180deg,rgba(239,247,255,0.92)_0%,rgba(255,255,255,0.9)_100%)]">
    <svg viewBox="0 0 640 760" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <radialGradient id="heroGlow" cx="58%" cy="36%" r="42%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
          <stop offset="18%" stopColor="#b3ecff" stopOpacity="0.7" />
          <stop offset="42%" stopColor="#68b0ff" stopOpacity="0.66" />
          <stop offset="68%" stopColor="#8e72ff" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="orbGlow" cx="50%" cy="44%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="20%" stopColor="#d7f4ff" stopOpacity="0.88" />
          <stop offset="55%" stopColor="#57a1ff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#835eff" stopOpacity="0.9" />
        </radialGradient>
        <linearGradient id="bodyFill" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#b8f3ff" stopOpacity="0.2" />
          <stop offset="28%" stopColor="#59a8ff" stopOpacity="0.96" />
          <stop offset="64%" stopColor="#587dff" stopOpacity="0.94" />
          <stop offset="100%" stopColor="#8a61ff" stopOpacity="0.88" />
        </linearGradient>
        <linearGradient id="panelStroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#dbe8ff" stopOpacity="0.55" />
        </linearGradient>
        <filter id="softBlur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
        <filter id="panelShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="16" stdDeviation="18" floodColor="#6f94ff" floodOpacity="0.18" />
        </filter>
      </defs>

      <ellipse cx="388" cy="170" rx="196" ry="112" fill="#92d7ff" opacity="0.26" filter="url(#softBlur)" />
      <ellipse cx="412" cy="244" rx="232" ry="188" fill="url(#heroGlow)" />
      <ellipse cx="414" cy="525" rx="190" ry="64" fill="#ffffff" opacity="0.92" filter="url(#softBlur)" />
      <ellipse cx="330" cy="560" rx="124" ry="44" fill="#ffffff" opacity="0.88" filter="url(#softBlur)" />
      <ellipse cx="500" cy="566" rx="130" ry="48" fill="#ffffff" opacity="0.84" filter="url(#softBlur)" />

      <g filter="url(#panelShadow)">
        <rect x="250" y="108" rx="24" ry="24" width="96" height="78" fill="#ffffff" fillOpacity="0.26" stroke="url(#panelStroke)" strokeWidth="2" />
        <rect x="472" y="194" rx="24" ry="24" width="88" height="88" fill="#ffffff" fillOpacity="0.22" stroke="url(#panelStroke)" strokeWidth="2" />
        <rect x="462" y="340" rx="24" ry="24" width="88" height="88" fill="#ffffff" fillOpacity="0.22" stroke="url(#panelStroke)" strokeWidth="2" />
        <rect x="182" y="282" rx="24" ry="24" width="86" height="86" fill="#ffffff" fillOpacity="0.22" stroke="url(#panelStroke)" strokeWidth="2" />
        <rect x="210" y="182" rx="20" ry="20" width="102" height="72" fill="#ffffff" fillOpacity="0.42" stroke="url(#panelStroke)" strokeWidth="2" />
      </g>

      <g transform="translate(240 122)">
        <path d="M18 26 52 8l34 18-8 8-26-12-26 12-8-8Z" fill="#ddf8ff" opacity="0.95" />
        <path d="M32 40h40l-2 10H34l-2-10Z" fill="#ddf8ff" opacity="0.88" />
      </g>

      <g transform="translate(228 196)">
        <rect x="0" y="26" width="68" height="12" rx="6" fill="#e8f2ff" />
        <rect x="6" y="16" width="56" height="14" rx="7" fill="#5d8cff" />
        <path d="M20 16c6-10 10-14 14-14 5 0 8 3 14 14" fill="none" stroke="#5d8cff" strokeWidth="5" strokeLinecap="round" />
        <text x="34" y="56" textAnchor="middle" fontSize="10" fontWeight="800" fill="#8b9dc3">CREDIT SCORE</text>
      </g>

      <g transform="translate(194 294)">
        <rect x="20" y="16" width="16" height="36" rx="3" fill="#65d8ff" />
        <rect x="40" y="6" width="20" height="46" rx="3" fill="#5fb0ff" />
        <rect x="64" y="26" width="14" height="26" rx="3" fill="#7ee1ff" />
        <rect x="12" y="52" width="74" height="8" rx="4" fill="#d6ebff" />
      </g>

      <g transform="translate(492 222)">
        <rect x="18" y="24" width="34" height="24" rx="4" fill="#eaf3ff" />
        <path d="M26 24c4-8 8-12 9-12 2 0 5 4 9 12" fill="none" stroke="#eaf3ff" strokeWidth="4" strokeLinecap="round" />
      </g>

      <g transform="translate(485 363)">
        <rect x="14" y="16" width="42" height="48" rx="4" fill="#eef5ff" />
        <path d="M22 32h24M22 42h24M22 52h18" stroke="#85a1d8" strokeWidth="4" strokeLinecap="round" />
        <circle cx="56" cy="54" r="14" fill="#79b5ff" />
        <path d="M49 54l5 5 9-11" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      <g>
        <ellipse cx="392" cy="290" rx="170" ry="150" fill="url(#heroGlow)" opacity="0.92" />
        <circle cx="392" cy="272" r="68" fill="url(#orbGlow)" />
        <path d="M314 358c0-62 35-110 78-110s78 48 78 110v34c0 89-35 170-78 170s-78-81-78-170v-34Z" fill="url(#bodyFill)" />
        <path d="M328 342c18-18 38-28 64-28 28 0 48 10 66 28" fill="none" stroke="#d7f3ff" strokeOpacity="0.48" strokeWidth="14" strokeLinecap="round" />
        <circle cx="392" cy="440" r="28" fill="#ffffff" opacity="0.95" filter="url(#softBlur)" />
        <circle cx="392" cy="440" r="10" fill="#ffffff" opacity="1" />
      </g>

      <g opacity="0.58" stroke="#dbe6ff" strokeWidth="2.5">
        <path d="M265 250 348 300" />
        <path d="M220 380 326 414" />
        <path d="M500 274 438 314" />
        <path d="M536 424 454 428" />
        <path d="M326 170 380 228" />
        <path d="M452 170 418 228" />
      </g>

      <g fill="#ffffff" opacity="0.95">
        <circle cx="286" cy="142" r="2.3" />
        <circle cx="320" cy="116" r="1.8" />
        <circle cx="376" cy="98" r="2.5" />
        <circle cx="422" cy="104" r="1.9" />
        <circle cx="468" cy="136" r="2.4" />
        <circle cx="248" cy="238" r="2" />
        <circle cx="532" cy="286" r="2.2" />
        <circle cx="262" cy="448" r="1.9" />
        <circle cx="524" cy="468" r="2.1" />
        <circle cx="320" cy="518" r="2.2" />
        <circle cx="446" cy="536" r="2.5" />
      </g>
    </svg>
  </div>
);

export default ClientLandingPage;
