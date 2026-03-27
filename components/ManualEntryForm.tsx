import React, { useState } from 'react';


interface ManualEntryFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => void; // Replace 'any' with a specific type if available
}

const ManualEntryForm: React.FC<ManualEntryFormProps> = ({ open, onClose, onSave }) => {
  const [score, setScore] = useState('');
  const [model, setModel] = useState('');
  const [bureau, setBureau] = useState('');
  const [verification, setVerification] = useState('User Entered');
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md border border-[#E5EAF2]">
        <h2 className="text-lg font-semibold mb-4 text-[#0F172A]">Manual Credit Entry</h2>
        <input
          className="w-full border border-[#E5EAF2] rounded p-2 mb-2"
          placeholder="Score"
          value={score}
          onChange={e => setScore(e.target.value)}
        />
        <input
          className="w-full border border-[#E5EAF2] rounded p-2 mb-2"
          placeholder="Model (e.g. FICO 8)"
          value={model}
          onChange={e => setModel(e.target.value)}
        />
        <input
          className="w-full border border-[#E5EAF2] rounded p-2 mb-2"
          placeholder="Bureau (e.g. Experian)"
          value={bureau}
          onChange={e => setBureau(e.target.value)}
        />
        <select
          className="w-full border border-[#E5EAF2] rounded p-2 mb-2"
          value={verification}
          onChange={e => setVerification(e.target.value)}
        >
          <option>User Entered</option>
          <option>Uploaded Proof</option>
          <option>Provider Connected</option>
          <option>Needs Update</option>
        </select>
        <div className="flex gap-2 mt-4">
          <button onClick={() => onSave({ score, model, bureau, verification })} className="flex-1 px-4 py-2 rounded bg-[#2563EB] text-white">Save</button>
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded bg-[#EFF6FF] text-[#2563EB]">Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default ManualEntryForm;
