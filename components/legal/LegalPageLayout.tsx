import React from 'react';
import LegalFooterLinks from './LegalFooterLinks';

type LegalPageLayoutProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

export default function LegalPageLayout({ title, subtitle, children }: LegalPageLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-4xl mx-auto px-6 py-14">
        <div className="mb-10">
          <p className="text-xs uppercase tracking-widest text-cyan-400 font-black">Legal Policy</p>
          <h1 className="text-4xl font-black tracking-tight mt-2">{title}</h1>
          <p className="text-slate-400 mt-4 text-sm leading-relaxed">{subtitle}</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm p-8 space-y-8">
          {children}
        </div>

        <LegalFooterLinks className="mt-10" />
      </div>
    </div>
  );
}
