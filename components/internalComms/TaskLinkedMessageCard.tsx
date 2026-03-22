import React from 'react';
import { InternalCommunicationMessage, formatInternalPriority, formatInternalMessageType } from '../../services/internalCommunicationService';

type Props = {
  messages: InternalCommunicationMessage[];
  loading: boolean;
  error: string;
  onOpenTarget: (message: InternalCommunicationMessage) => void;
  onOpenThread: (message: InternalCommunicationMessage) => void;
  onDismiss: (message: InternalCommunicationMessage) => void;
};

export default function TaskLinkedMessageCard({ messages, loading, error, onOpenTarget, onOpenThread, onDismiss }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Internal Communication</p>
          <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">Task-linked guidance threads</h3>
          <p className="mt-2 text-sm text-slate-500">These portal messages are generated from current task and stage state and stay inside the Nexus portal.</p>
        </div>
      </div>

      {loading ? <p className="mt-4 text-sm text-slate-500">Loading internal messages...</p> : null}
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {!loading && !error && messages.length === 0 ? <p className="mt-4 text-sm text-slate-500">No active internal guidance right now. Keep following the Action Center and current stage workflow.</p> : null}

      <div className="mt-5 space-y-3">
        {messages.map((message) => (
          <div key={message.messageId} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-700">{formatInternalMessageType(message.messageType)}</span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-700">{formatInternalPriority(message.priority)}</span>
                </div>
                <p className="mt-3 text-sm font-black text-slate-900">{message.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{message.body}</p>
              </div>
              <div className="text-xs text-slate-500">
                <div>Stage: {message.relatedStage.replace(/_/g, ' ')}</div>
                <div className="mt-1">Thread: {message.threadTitle}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => onOpenTarget(message)} className="rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-white">
                Open Step
              </button>
              <button type="button" onClick={() => onOpenThread(message)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-700">
                Open Thread
              </button>
              <button type="button" onClick={() => onDismiss(message)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-700">
                Not Now
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}