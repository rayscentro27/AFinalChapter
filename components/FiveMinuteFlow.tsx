import React, { useState } from 'react';

const steps = [
  'Welcome',
  'Business Info',
  'Pre-Qualification',
  'Upload ID',
  'AI Message',
  'Dashboard',
];

const FiveMinuteFlow = () => {
  const [step, setStep] = useState(0);
  const [businessName, setBusinessName] = useState('');
  const [preQual, setPreQual] = useState('');
  const [idUploaded, setIdUploaded] = useState(false);

  const next = () => setStep((s) => Math.min(s + 1, steps.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="bg-white rounded-2xl p-8 border border-[#E5EAF2] shadow max-w-md mx-auto mt-8">
      <div className="flex items-center mb-6">
        {steps.map((label, i) => (
          <div key={label} className={`flex-1 flex items-center ${i < step ? 'text-[#2563EB]' : 'text-[#64748B]'}`}> 
            <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold border-2 ${i <= step ? 'border-[#2563EB] bg-[#EFF6FF]' : 'border-[#E5EAF2] bg-white'}`}>{i + 1}</div>
            {i < steps.length - 1 && <div className="flex-1 h-0.5 bg-[#E5EAF2] mx-2" />}
          </div>
        ))}
      </div>
      {step === 0 && (
        <div>
          <h2 className="text-xl font-semibold text-[#0F172A] mb-2">Welcome!</h2>
          <p className="text-[#64748B] mb-4">Let's get started. This will only take a few minutes.</p>
          <button onClick={next} className="px-4 py-2 rounded bg-[#2563EB] text-white text-xs">Begin</button>
        </div>
      )}
      {step === 1 && (
        <div>
          <h2 className="text-xl font-semibold text-[#0F172A] mb-2">Business Info</h2>
          <input
            className="w-full border border-[#E5EAF2] rounded p-2 mb-4"
            placeholder="Business Name"
            value={businessName}
            onChange={e => setBusinessName(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={prev} className="px-4 py-2 rounded bg-[#EFF6FF] text-[#2563EB] text-xs">Back</button>
            <button onClick={next} className="px-4 py-2 rounded bg-[#2563EB] text-white text-xs" disabled={!businessName}>Next</button>
          </div>
        </div>
      )}
      {step === 2 && (
        <div>
          <h2 className="text-xl font-semibold text-[#0F172A] mb-2">Pre-Qualification</h2>
          <input
            className="w-full border border-[#E5EAF2] rounded p-2 mb-4"
            placeholder="Annual Revenue (USD)"
            value={preQual}
            onChange={e => setPreQual(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={prev} className="px-4 py-2 rounded bg-[#EFF6FF] text-[#2563EB] text-xs">Back</button>
            <button onClick={next} className="px-4 py-2 rounded bg-[#2563EB] text-white text-xs" disabled={!preQual}>Next</button>
          </div>
        </div>
      )}
      {step === 3 && (
        <div>
          <h2 className="text-xl font-semibold text-[#0F172A] mb-2">Upload ID</h2>
          <input type="file" className="w-full border border-[#E5EAF2] rounded p-2 mb-4" onChange={() => setIdUploaded(true)} />
          <div className="flex gap-2">
            <button onClick={prev} className="px-4 py-2 rounded bg-[#EFF6FF] text-[#2563EB] text-xs">Back</button>
            <button onClick={next} className="px-4 py-2 rounded bg-[#2563EB] text-white text-xs" disabled={!idUploaded}>Next</button>
          </div>
        </div>
      )}
      {step === 4 && (
        <div className="text-center">
          <h2 className="text-xl font-semibold text-[#0F172A] mb-2">AI Message</h2>
          <p className="text-[#2563EB] mb-4">Welcome! Based on your info, you're ready to proceed.</p>
          <button onClick={next} className="px-4 py-2 rounded bg-[#2563EB] text-white text-xs">Go to Dashboard</button>
        </div>
      )}
      {step === 5 && (
        <div className="text-center">
          <h2 className="text-xl font-semibold text-[#0F172A] mb-2">Setup Complete!</h2>
          <p className="text-[#22C55E] mb-4">You're now ready to use the platform.</p>
        </div>
      )}
    </div>
  );
};

export default FiveMinuteFlow;
