import React from 'react';
import { FileText } from 'lucide-react';

const ClientDocumentsPanel: React.FC = () => {
  return (
    <div className="rounded-2xl bg-white p-6 shadow border border-slate-200">
      <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2"><FileText /> Documents</h2>
      <ul className="text-slate-700 text-sm list-disc ml-5">
        <li>Uploaded docs</li>
        <li>Needs review</li>
        <li>Approved docs</li>
        <li>Generated docs</li>
        <li>Linked workflow usage</li>
        <li>Funding, grants, credit profile, compliance links</li>
      </ul>
    </div>
  );
};

export default ClientDocumentsPanel;
