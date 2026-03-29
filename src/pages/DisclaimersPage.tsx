import React from 'react';
import DynamicLegalPage from '../../components/legal/DynamicLegalPage';
import RequiredDisclaimers from '../../components/legal/RequiredDisclaimers';

export default function DisclaimersPage() {
  return (
    <DynamicLegalPage
      docKey="disclaimers"
      fallbackTitle="Required Disclaimers"
      fallbackSubtitle="Educational-use and compliance disclaimers applicable across platform workflows."
      fallbackContent={<RequiredDisclaimers title="Educational and Compliance Disclaimers" />}
    />
  );
}
