import React, { useState } from 'react';

interface UploadProofModalProps {
  open: boolean;
  onClose: () => void;
  onUpload: (file: File | null) => void;
}

const UploadProofModal: React.FC<UploadProofModalProps> = ({ open, onClose, onUpload }) => {
  const [file, setFile] = useState<File | null>(null);
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md border border-[#E5EAF2]">
        <h2 className="text-lg font-semibold mb-4 text-[#0F172A]">Upload Credit Proof</h2>
        <input
          type="file"
          className="w-full border border-[#E5EAF2] rounded p-2 mb-4"
          onChange={e => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
        />
        <div className="flex gap-2">
          <button onClick={() => file && onUpload(file)} className="flex-1 px-4 py-2 rounded bg-[#2563EB] text-white" disabled={!file}>Upload</button>
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded bg-[#EFF6FF] text-[#2563EB]">Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default UploadProofModal;
