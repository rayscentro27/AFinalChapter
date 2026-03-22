import React from 'react';
import { ReviewDomain } from '../../services/adminReviewService';

export type ReviewPageFilters = {
  domain: 'all' | ReviewDomain;
  reviewStatus: 'all' | 'pending' | 'approved' | 'rejected';
  publishStatus: 'all' | 'published' | 'unpublished';
  expirationStatus: 'all' | 'active' | 'expired';
  search: string;
};

type Props = {
  filters: ReviewPageFilters;
  onChange: (next: ReviewPageFilters) => void;
};

function filterButtonClass(active: boolean) {
  return active
    ? 'border-slate-900 bg-slate-900 text-white'
    : 'border-slate-200 bg-slate-50 text-slate-600';
}

export default function ReviewFilters({ filters, onChange }: Props) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="grid gap-3 lg:grid-cols-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Search</p>
          <input
            value={filters.search}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
            placeholder="Search title, symbol, summary"
            className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
          />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Content Type</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['all', 'strategies', 'signals'] as const).map((value) => (
              <button key={value} type="button" className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-widest ${filterButtonClass(filters.domain === value)}`} onClick={() => onChange({ ...filters, domain: value })}>
                {value}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Review Status</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['all', 'pending', 'approved', 'rejected'] as const).map((value) => (
              <button key={value} type="button" className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-widest ${filterButtonClass(filters.reviewStatus === value)}`} onClick={() => onChange({ ...filters, reviewStatus: value })}>
                {value}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Published State</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['all', 'published', 'unpublished'] as const).map((value) => (
              <button key={value} type="button" className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-widest ${filterButtonClass(filters.publishStatus === value)}`} onClick={() => onChange({ ...filters, publishStatus: value })}>
                {value}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Expiration</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(['all', 'active', 'expired'] as const).map((value) => (
            <button key={value} type="button" className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-widest ${filterButtonClass(filters.expirationStatus === value)}`} onClick={() => onChange({ ...filters, expirationStatus: value })}>
              {value}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
