import React from 'react';
import { DollarSign } from 'lucide-react';

const ClientFundingPanel: React.FC = () => {
  return (
    <div className="rounded-2xl bg-white p-6 shadow border border-slate-200">
      <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2"><DollarSign /> Funding</h2>
      <ul className="text-slate-700 text-sm list-disc ml-5">
        <li>Current funding stage</li>
        <li>Readiness %</li>
        <li>Active applications</li>
        <li>Missing requirements</li>
        <li>Linked required docs</li>
        <li>Next recommended action</li>
        <li>Recent outcome or status note</li>
      </ul>
    </div>
  );
};

export default ClientFundingPanel;
