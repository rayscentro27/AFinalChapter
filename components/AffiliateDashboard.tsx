import React, { useState } from 'react';

const mockAffiliate = {
  referralLink: 'https://nexus.app/signup?ref=USER123',
  totalReferrals: 8,
  earnings: 3200,
  activeDeals: 3,
  commissionPercent: 10,
};

const AffiliateDashboard = () => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(mockAffiliate.referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="bg-white rounded-2xl p-8 border border-[#E5EAF2] shadow max-w-2xl mx-auto mt-8">
      <h2 className="text-xl font-semibold text-[#0F172A] mb-6">Affiliate Dashboard</h2>
      <div className="mb-6">
        <div className="text-[#64748B] text-xs mb-1">Your Referral Link</div>
        <div className="flex items-center gap-2">
          <input
            className="w-full border border-[#E5EAF2] rounded p-2 text-sm"
            value={mockAffiliate.referralLink}
            readOnly
          />
          <button onClick={handleCopy} className="px-3 py-1 rounded bg-[#2563EB] text-white text-xs">
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
      <div className="flex gap-8 mb-8">
        <div>
          <div className="text-[#64748B] text-xs">Total Referrals</div>
          <div className="text-2xl font-bold text-[#2563EB]">{mockAffiliate.totalReferrals}</div>
        </div>
        <div>
          <div className="text-[#64748B] text-xs">Earnings</div>
          <div className="text-2xl font-bold text-[#22C55E]">${mockAffiliate.earnings.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[#64748B] text-xs">Active Deals</div>
          <div className="text-2xl font-bold text-[#F59E42]">{mockAffiliate.activeDeals}</div>
        </div>
      </div>
      <div className="text-[#64748B] text-xs mb-1">Commission Percentage</div>
      <div className="text-lg font-semibold text-[#0F172A]">{mockAffiliate.commissionPercent}%</div>
    </div>
  );
};

export default AffiliateDashboard;
