import React from 'react';
import { Server, AlertTriangle, Settings, BarChart3 } from 'lucide-react';

const PlatformPanel: React.FC = () => {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-black text-blue-900 mb-6 flex items-center gap-2">
        <Server className="text-blue-600" /> Platform
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="rounded-2xl bg-white p-6 shadow border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2"><BarChart3 /> System Health</h2>
          <ul className="text-slate-700 text-sm list-disc ml-5">
            <li>All providers healthy</li>
            <li>Spend below threshold</li>
            <li>No open alerts</li>
          </ul>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2"><AlertTriangle /> Thresholds</h2>
          <ul className="text-slate-700 text-sm list-disc ml-5">
            <li>Budget: $2,000 / $10,000</li>
            <li>Provider Utilization: 45%</li>
            <li>No issues detected</li>
          </ul>
        </div>
      </div>
      <div className="rounded-2xl bg-white p-6 shadow border border-slate-200 mb-8">
        <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2"><Settings /> Controls</h2>
        <ul className="text-slate-700 text-sm list-disc ml-5">
          <li>Feature flags: All enabled</li>
          <li>Emergency stop: Ready</li>
          <li>Provider config: Up to date</li>
        </ul>
      </div>
      <div className="rounded-2xl bg-white p-6 shadow border border-slate-200">
        <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2"><Settings /> Config</h2>
        <ul className="text-slate-700 text-sm list-disc ml-5">
          <li>Organization</li>
          <li>Notifications</li>
          <li>Provider Preferences</li>
          <li>Roles / Policy</li>
          <li>Branding</li>
          <li>Feature Controls</li>
        </ul>
      </div>
    </div>
  );
};

export default PlatformPanel;
