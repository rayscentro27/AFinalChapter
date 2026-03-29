import React from 'react';
import PublicLeadCaptureCard from '../components/funnel/PublicLeadCaptureCard';

export default function FreeScorePage() {
  return (
    <PublicLeadCaptureCard
      landingKey="free-score"
      title="Free Credit Readiness Score"
      subtitle="Get an educational readiness snapshot to help you plan your next steps."
      points={[
        'Educational scorecard for readiness factors',
        'Template-driven action checklist',
        'No guaranteed outcomes or approvals',
      ]}
    />
  );
}
