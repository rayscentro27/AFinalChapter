import React from 'react';

const SecuritySettingsPage: React.FC = () => {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">Security Settings</h1>
      <p className="mt-3 text-sm text-slate-700">
        Security controls are managed by workspace policy and authentication settings. Additional self-service controls will be added in a later pass.
      </p>
    </div>
  );
};

export default SecuritySettingsPage;
