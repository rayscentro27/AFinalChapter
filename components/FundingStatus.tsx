import React from 'react';

const FundingStatus = ({ status, amount }) => (
  <div className="bg-white rounded-2xl p-5 border border-[#E5EAF2] mb-4">
    <div className="text-[#2563EB] text-xs font-semibold mb-1">Funding Status</div>
    <div className="text-[#0F172A] text-base font-semibold">{status}</div>
    {amount && <div className="text-[#64748B] text-sm mt-1">${amount}</div>}
  </div>
);

export default FundingStatus;
