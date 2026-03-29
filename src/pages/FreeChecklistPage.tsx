import React from 'react';
import PublicLeadCaptureCard from '../components/funnel/PublicLeadCaptureCard';

export default function FreeChecklistPage() {
  return (
    <PublicLeadCaptureCard
      landingKey="free-checklist"
      title="Free Funding Checklist"
      subtitle="Access the educational checklist for preparing business documents and workflow steps."
      points={[
        'Educational checklist for documentation readiness',
        'Clear sequence of client-driven steps',
        'No guarantees of offers, amounts, or timelines',
      ]}
    />
  );
}
