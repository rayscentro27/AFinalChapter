import React from 'react';

export default function TaskStatusPill(props: { signal?: 'red' | 'yellow' | 'green' }) {
  const signal = props.signal || 'yellow';

  const cfg =
    signal === 'red'
      ? { label: 'RED', cls: 'bg-red-500/15 text-red-300 border-red-500/30' }
      : signal === 'green'
        ? { label: 'GREEN', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' }
        : { label: 'YELLOW', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${cfg.cls}`}
      title={`Task signal: ${signal}`}
    >
      {cfg.label}
    </span>
  );
}
