import React from 'react';


type CreditProfileCardProps = {
  profile: any;
  onConnect?: () => void;
  onManualEntry?: () => void;
  onUpload?: () => void;
};

const CreditProfileCard = ({ profile, onConnect, onManualEntry, onUpload }: CreditProfileCardProps) => (
  <div className="bg-white rounded-2xl p-5 border border-[#E5EAF2] mb-4">
    <div className="text-[#2563EB] text-xs font-semibold mb-1">Credit Profile</div>
    <div className="text-[#0F172A] text-base font-semibold">{profile.status}</div>
    <div className="text-[#64748B] text-sm mt-1">Source: {profile.source}</div>
    <div className="text-[#64748B] text-sm">Score: {profile.score}</div>
    <div className="text-[#64748B] text-sm">Model: {profile.model}</div>
    <div className="text-[#64748B] text-sm">Bureau: {profile.bureau}</div>
    <div className="text-[#64748B] text-sm">Last Updated: {profile.lastUpdated}</div>
    <div className="text-[#64748B] text-sm">Verification: {profile.verification}</div>
    {(onConnect || onManualEntry || onUpload) && (
      <div className="flex gap-2 mt-4">
        {onConnect && <button onClick={onConnect} className="px-3 py-1 rounded bg-[#2563EB] text-white text-xs">Connect Provider</button>}
        {onManualEntry && <button onClick={onManualEntry} className="px-3 py-1 rounded bg-[#EFF6FF] text-[#2563EB] text-xs">Manual Entry</button>}
        {onUpload && <button onClick={onUpload} className="px-3 py-1 rounded bg-[#EFF6FF] text-[#2563EB] text-xs">Upload Proof</button>}
      </div>
    )}
  </div>
);

export default CreditProfileCard;
