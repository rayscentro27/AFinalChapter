import React, { useRef, useState } from 'react';

const states = ['idle', 'uploading', 'processing', 'verified'] as const;
type UploadState = typeof states[number];

const DocumentUpload = () => {
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [fileName, setFileName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    setUploadState('uploading');
    setTimeout(() => {
      setUploadState('processing');
      setTimeout(() => {
        setUploadState('verified');
      }, 1200);
    }, 1200);
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const reset = () => {
    setUploadState('idle');
    setFileName('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-[#E5EAF2] shadow max-w-md mx-auto mt-8">
      <h2 className="text-lg font-semibold text-[#0F172A] mb-4">Document Upload</h2>
      {uploadState === 'idle' && (
        <div
          className="flex flex-col items-center justify-center border-2 border-dashed border-[#2563EB] rounded-xl p-8 cursor-pointer bg-[#F6F8FB] hover:bg-[#EFF6FF] transition"
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
        >
          <span className="text-[#2563EB] text-2xl mb-2">📄</span>
          <span className="text-[#64748B] mb-2">Drag & drop or click to upload</span>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={handleInput}
            accept="application/pdf,image/*"
          />
        </div>
      )}
      {uploadState === 'uploading' && (
        <div className="flex flex-col items-center justify-center p-8">
          <span className="text-[#2563EB] text-2xl mb-2 animate-spin">⏳</span>
          <span className="text-[#64748B]">Uploading {fileName}...</span>
        </div>
      )}
      {uploadState === 'processing' && (
        <div className="flex flex-col items-center justify-center p-8">
          <span className="text-[#2563EB] text-2xl mb-2 animate-pulse">🔄</span>
          <span className="text-[#64748B]">Processing {fileName}...</span>
        </div>
      )}
      {uploadState === 'verified' && (
        <div className="flex flex-col items-center justify-center p-8">
          <span className="text-[#22C55E] text-2xl mb-2">✅</span>
          <span className="text-[#0F172A] font-semibold">{fileName} uploaded and verified!</span>
          <button onClick={reset} className="mt-4 px-4 py-2 rounded bg-[#2563EB] text-white text-xs">Upload Another</button>
        </div>
      )}
    </div>
  );
};

export default DocumentUpload;
