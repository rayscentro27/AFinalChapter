import React from 'react';
import { DollarSign } from 'lucide-react';

const ClientCreditProfilePanel: React.FC = () => {
  return (
    <div className="rounded-2xl bg-white p-6 shadow border border-slate-200">
      <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2"><DollarSign /> Credit Profile</h2>
      <ul className="text-slate-700 text-sm list-disc ml-5">
        <li>Score, source, model, bureau</li>
        <li>Verification status (User Entered, Uploaded Proof, Provider Connected, Needs Update)</li>
        <li>Updated date</li>
        <li>Upload credit report</li>
        <li>Enter score manually</li>
        <li>Connect provider</li>
        <li>Update score</li>
      </ul>
    </div>
  );
};

export default ClientCreditProfilePanel;
