import React from 'react';

const NextActionCard = ({ action }) => (
  <div className="bg-white rounded-2xl p-5 border border-[#E5EAF2] mb-4">
    <div className="text-[#2563EB] text-xs font-semibold mb-1">Next Action</div>
    <div className="text-[#0F172A] text-base font-semibold">{action}</div>
  </div>
);

export default NextActionCard;
