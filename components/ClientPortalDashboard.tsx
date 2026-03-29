import React from 'react';
import { Contact } from '../types';
import TaskList from './TaskList';
import NotificationBell from './NotificationBell';

export default function ClientPortalDashboard(props: { contact: Contact; onUpdateContact: (c: Contact) => void }) {
  const tasks = props.contact.clientTasks || [];
  const red = tasks.filter((t) => (t as any).signal === 'red').length;
  const yellow = tasks.filter((t) => (t as any).signal === 'yellow').length;
  const green = tasks.filter((t) => (t as any).signal === 'green').length;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tight text-white">Client Portal Dashboard</h2>
          <div className="text-xs text-slate-400 mt-2 font-black uppercase tracking-widest">
            Red: <span className="text-red-300">{red}</span> · Yellow: <span className="text-amber-300">{yellow}</span> · Green:{' '}
            <span className="text-emerald-300">{green}</span>
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Signals are educational readiness indicators, not guarantees of approvals, funding amounts, timelines, or outcomes.
          </div>
        </div>
        <NotificationBell />
      </div>

      <TaskList contact={props.contact} onUpdateContact={props.onUpdateContact} />
    </div>
  );
}
