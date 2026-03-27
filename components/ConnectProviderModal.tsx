import React from 'react';

const ConnectProviderModal = ({ open, onClose, onSelect }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md border border-[#E5EAF2]">
        <h2 className="text-lg font-semibold mb-4 text-[#0F172A]">Connect Credit Provider</h2>
        <button onClick={() => onSelect('Experian')} className="w-full mb-2 px-4 py-2 rounded bg-[#EFF6FF] text-[#2563EB]">Experian (Mocked)</button>
        <button onClick={() => onSelect('Equifax')} className="w-full mb-2 px-4 py-2 rounded bg-[#EFF6FF] text-[#2563EB]">Equifax (Mocked)</button>
        <button onClick={() => onSelect('TransUnion')} className="w-full mb-2 px-4 py-2 rounded bg-[#EFF6FF] text-[#2563EB]">TransUnion (Mocked)</button>
        <button onClick={onClose} className="w-full mt-4 px-4 py-2 rounded bg-[#2563EB] text-white">Cancel</button>
      </div>
    </div>
  );
};

export default ConnectProviderModal;
