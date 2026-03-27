import React from 'react';
import { User, FileText, DollarSign, AlertTriangle, Layers } from 'lucide-react';

const ClientDetailPanel: React.FC = () => {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-black text-blue-900 mb-6 flex items-center gap-2">
        <User className="text-blue-600" /> Client Detail
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="rounded-2xl bg-white p-6 shadow border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2"><Layers /> Overview</h2>
          <ul className="text-slate-700 text-sm list-disc ml-5">
            <li>Client identity and profile</li>
            <li>Readiness summary</li>
            <li>Current stage</li>
            <li>Next action</li>
            <li>Blockers</li>
            <li>Assigned workflow state</li>
          </ul>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2"><DollarSign /> Funding</h2>
          <ul className="text-slate-700 text-sm list-disc ml-5">
            <li>Current funding stage</li>
            <li>Readiness %</li>
            <li>Active applications</li>
            <li>Missing requirements</li>
            <li>Linked required docs</li>
            <li>Next recommended action</li>
          </ul>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="rounded-2xl bg-white p-6 shadow border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2"><FileText /> Documents</h2>
          <ul className="text-slate-700 text-sm list-disc ml-5">
            <li>Uploaded docs</li>
            <li>Needs review</li>
            <li>Approved docs</li>
            <li>Generated docs</li>
            <li>Linked workflow usage</li>
          </ul>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2"><DollarSign /> Credit Profile</h2>
          <ul className="text-slate-700 text-sm list-disc ml-5">
            <li>Score, source, model, bureau</li>
            <li>Verification status</li>
            <li>Updated date</li>
            <li>Upload credit report</li>
            <li>Enter score manually</li>
            <li>Connect provider</li>
            <li>Update score</li>
          </ul>
        </div>
      </div>
      <div className="rounded-2xl bg-white p-6 shadow border border-slate-200 mb-8">
        <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2"><AlertTriangle /> Next Actions & Blockers</h2>
        <ul className="text-slate-700 text-sm list-disc ml-5">
          <li>Primary next action</li>
          <li>Blockers</li>
          <li>Pending approvals</li>
          <li>Missing documents</li>
          <li>Workflow warnings</li>
        </ul>
      </div>
    </div>
  );
};

export default ClientDetailPanel;
