import React, { useState } from 'react';

const ProviderDecisionModal = ({ open, onClose, onDecision }) => {
  const [reason, setReason] = useState('');
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md border border-[#E5EAF2]">
        <h2 className="text-lg font-semibold mb-4 text-[#0F172A]">Provider Decision</h2>
        <textarea
          className="w-full border border-[#E5EAF2] rounded p-2 mb-4"
          rows={3}
          placeholder="Reason for decision (optional)"
          value={reason}
          onChange={e => setReason(e.target.value)}
        />
        <div className="flex gap-2">
          <button onClick={() => onDecision('accept', reason)} className="flex-1 px-4 py-2 rounded bg-[#2563EB] text-white">Accept</button>
          <button onClick={() => onDecision('reject', reason)} className="flex-1 px-4 py-2 rounded bg-[#EFF6FF] text-[#2563EB]">Reject</button>
        </div>
        <button onClick={onClose} className="w-full mt-4 px-4 py-2 rounded bg-[#EFF6FF] text-[#2563EB]">Cancel</button>
      </div>
    </div>
  );
};

export default ProviderDecisionModal;
