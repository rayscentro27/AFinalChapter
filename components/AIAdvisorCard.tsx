import React from 'react';

interface AIAdvisorCardProps {
  advisor: {
    recommendation: string;
    summary: string;
    // Add more fields if needed
  };
}

const AIAdvisorCard: React.FC<AIAdvisorCardProps> = ({ advisor }) => (
  <div className="bg-white rounded-2xl p-5 border border-[#E5EAF2] mb-4">
    <div className="text-[#2563EB] text-xs font-semibold mb-1">AI Advisor</div>
    <div className="text-[#0F172A] text-base font-semibold">{advisor.recommendation}</div>
    <div className="text-[#64748B] text-sm mt-1">{advisor.summary}</div>
  </div>
);

export default AIAdvisorCard;
