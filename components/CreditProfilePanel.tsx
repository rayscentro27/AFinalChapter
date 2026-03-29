import React, { useState } from 'react';
import CreditProfileCard from './CreditProfileCard';
import ConnectProviderModal from './ConnectProviderModal';
import ProviderDecisionModal from './ProviderDecisionModal';
import ManualEntryForm from './ManualEntryForm';
import UploadProofModal from './UploadProofModal';

const initialProfile = {
  status: 'Needs Update',
  source: '—',
  score: '—',
  model: '—',
  bureau: '—',
  lastUpdated: '—',
  verification: 'Needs Update',
};

const CreditProfilePanel = () => {
  const [profile, setProfile] = useState(initialProfile);
  const [showConnect, setShowConnect] = useState(false);
  const [showDecision, setShowDecision] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const handleConnect = (provider: string) => {
    setProfile({
      ...profile,
      status: 'Provider Connected',
      source: provider,
      bureau: provider,
      model: 'FICO 8',
      score: '720',
      lastUpdated: new Date().toISOString().slice(0, 10),
      verification: 'Provider Connected',
    });
    setShowConnect(false);
    setShowDecision(true);
  };

  const handleDecision = (decision: string, reason: string) => {
    setProfile({
      ...profile,
      status: decision === 'accept' ? 'Provider Connected' : 'Needs Update',
      verification: decision === 'accept' ? 'Provider Connected' : 'Needs Update',
    });
    setShowDecision(false);
  };

  const handleManualSave = (data: any) => {
    setProfile({
      ...profile,
      ...data,
      status: data.verification,
      lastUpdated: new Date().toISOString().slice(0, 10),
    });
    setShowManual(false);
  };

  const handleUpload = (file: File) => {
    setProfile({
      ...profile,
      status: 'Uploaded Proof',
      verification: 'Uploaded Proof',
      lastUpdated: new Date().toISOString().slice(0, 10),
    });
    setShowUpload(false);
  };

  return (
    <div>
      <CreditProfileCard
        profile={profile}
        onConnect={() => setShowConnect(true)}
        onManualEntry={() => setShowManual(true)}
        onUpload={() => setShowUpload(true)}
        // @ts-ignore
        />
      <ConnectProviderModal open={showConnect} onClose={() => setShowConnect(false)} onSelect={handleConnect} />
      <ProviderDecisionModal open={showDecision} onClose={() => setShowDecision(false)} onDecision={handleDecision} />
      <ManualEntryForm open={showManual} onClose={() => setShowManual(false)} onSave={handleManualSave} />
      <UploadProofModal open={showUpload} onClose={() => setShowUpload(false)} onUpload={handleUpload} />
    </div>
  );
};

export default CreditProfilePanel;
