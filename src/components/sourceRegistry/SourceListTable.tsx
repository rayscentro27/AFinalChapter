import React from 'react';
import type { SourceRegistryRecord } from '../../hooks/useSourceRegistry';
import SourceActionMenu from './SourceActionMenu';
import ScheduleStatusBadge from './ScheduleStatusBadge';
import SourceStatusBadge from './SourceStatusBadge';

type Props = {
  items: SourceRegistryRecord[];
  disabled?: boolean;
  selectedSourceId?: string;
  onSelect?: (sourceId: string) => void;
  onAction: (payload: { source_id: string; action: 'activate' | 'deactivate' | 'scan_now' | 'set_priority' | 'pause' | 'resume' | 'pause_schedule' | 'resume_schedule'; priority?: number }) => void;
};

export default function SourceListTable({ items, disabled, selectedSourceId, onSelect, onAction }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Source Registry</p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm text-slate-700">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Label</th>
              <th className="px-3 py-3">Domain</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Schedule</th>
              <th className="px-3 py-3">Priority</th>
              <th className="px-3 py-3">Run Window</th>
              <th className="px-3 py-3">Created</th>
              <th className="px-3 py-3">Warnings</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-slate-500">No sources matched the current filters.</td>
              </tr>
            ) : null}
            {items.map((item) => {
              const isSelected = item.id === selectedSourceId;

              return (
              <tr key={item.id} className={`border-t align-top ${isSelected ? 'border-sky-200 bg-sky-50/50' : 'border-slate-100'}`}>
                <td className="px-3 py-4 font-semibold text-slate-900">{item.sourceType}</td>
                <td className="px-3 py-4">
                  <button type="button" onClick={() => onSelect?.(item.id)} className="text-left font-semibold text-slate-900 underline-offset-4 hover:underline">{item.label}</button>
                  <a href={item.url} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-sky-700 underline">{item.url}</a>
                </td>
                <td className="px-3 py-4">{item.domain || 'Unknown domain'}</td>
                <td className="px-3 py-4"><SourceStatusBadge status={item.status} /></td>
                <td className="px-3 py-4">
                  <div className="space-y-2">
                    <ScheduleStatusBadge status={item.scheduleStatus} />
                    <div className="text-xs text-slate-500">Last run: {item.lastRunStatus || 'unknown'}</div>
                  </div>
                </td>
                <td className="px-3 py-4">{item.priority}</td>
                <td className="px-3 py-4 text-xs text-slate-600">
                  <div>Last: {item.lastRunAt ? new Date(item.lastRunAt).toLocaleString() : 'n/a'}</div>
                  <div className="mt-1">Next: {item.nextRunAt ? new Date(item.nextRunAt).toLocaleString() : 'n/a'}</div>
                </td>
                <td className="px-3 py-4">{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'n/a'}</td>
                <td className="px-3 py-4">
                  <div className="space-y-2">
                    {item.warnings.length === 0 ? <span className="text-xs text-slate-400">None</span> : null}
                    {item.warnings.map((warning) => (
                      <div key={warning} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{warning}</div>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-4"><SourceActionMenu item={item} onAction={onAction} disabled={disabled} /></td>
              </tr>
            );})}
          </tbody>
        </table>
      </div>
    </section>
  );
}