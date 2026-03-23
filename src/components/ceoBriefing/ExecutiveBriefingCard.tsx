import React from 'react';
import type { ExecutiveBriefing } from '../../hooks/useCeoBriefingDashboard';

type Props = {
  briefing: ExecutiveBriefing | null;
};

export default function ExecutiveBriefingCard({ briefing }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Latest Executive Briefing</p>
      <h2 className="mt-2 text-2xl font-semibold text-slate-950">{briefing?.title || 'No briefing available yet'}</h2>
      <p className="mt-2 text-sm text-slate-500">{briefing?.createdAt ? new Date(briefing.createdAt).toLocaleString() : 'Awaiting executive summary from the backend.'}</p>
      <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_100%)] p-5 text-sm leading-7 text-slate-700">
        {briefing?.summary || 'Once executive briefings are available, this card will show the calm top-line summary for super admin review.'}
      </div>
    </section>
  );
}