import React from 'react';
import ProgressBar from './components/ProgressBar';
import NextActionCard from './components/NextActionCard';
import FundingStatus from './components/FundingStatus';
import CreditProfilePanel from './components/CreditProfilePanel';
import AIAdvisorCard from './components/AIAdvisorCard';
import ActivityTimeline from './components/ActivityTimeline';
import ClientMessaging from './components/ClientMessaging';
import DocumentUpload from './components/DocumentUpload';

const mockData = {
  progress: 60,
  nextAction: 'Upload your latest business documents',
  funding: { status: 'In Review', amount: 25000 },
  creditProfile: {
    status: 'Provider Connected',
    source: 'Experian',
    score: 720,
    lastUpdated: '2026-03-27',
  },
  advisor: {
    recommendation: 'Complete your onboarding to unlock funding options.',
    summary: 'Based on your profile, next steps are available in your dashboard.'
  },
  activities: [
    { time: '09:00', event: 'Submitted onboarding form' },
    { time: '09:15', event: 'Uploaded ID document' },
    { time: '09:30', event: 'AI Advisor reviewed profile' },
  ]
};

const ClientDashboard = () => (
  <div className="max-w-2xl mx-auto py-10 px-4">
    <h1 className="text-2xl font-semibold text-[#0F172A] mb-6">Client Dashboard</h1>
    <ProgressBar progress={mockData.progress} />
    <NextActionCard action={mockData.nextAction} />
    <FundingStatus status={mockData.funding.status} amount={mockData.funding.amount} />
    <CreditProfilePanel />
    <AIAdvisorCard advisor={mockData.advisor} />
    <ActivityTimeline activities={mockData.activities} />
    <div className="mt-8">
      <h2 className="text-xl font-semibold text-[#0F172A] mb-4">Messaging</h2>
      <ClientMessaging />
    </div>
    <div className="mt-8">
      <h2 className="text-xl font-semibold text-[#0F172A] mb-4">Document Upload</h2>
      <DocumentUpload />
    </div>
  </div>
);

export default ClientDashboard;
