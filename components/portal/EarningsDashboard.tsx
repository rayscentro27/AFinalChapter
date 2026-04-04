import React from 'react';

type EarningsDashboardProps = {
  totalSignups: number;
  fundedReferrals: number;
  activeReferrals: number;
  commissionPending: number;
  commissionPaid: number;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export default function EarningsDashboard(props: EarningsDashboardProps) {
  const cards = [
    { label: 'Referrals', value: String(props.totalSignups), helper: 'Total people who joined through your link' },
    { label: 'Active', value: String(props.activeReferrals), helper: 'Still progressing through the journey' },
    { label: 'Pending', value: formatCurrency(props.commissionPending), helper: 'Estimated referral earnings still in motion' },
    { label: 'Paid', value: formatCurrency(props.commissionPaid), helper: 'Referral earnings already realized' },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <article key={card.label} className="rounded-[1.25rem] border border-[#E4ECF8] bg-white p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">{card.label}</p>
          <p className="mt-3 text-[1.7rem] font-black tracking-tight text-[#17233D]">{card.value}</p>
          <p className="mt-3 text-sm leading-6 text-[#61769D]">{card.helper}</p>
        </article>
      ))}
    </div>
  );
}
