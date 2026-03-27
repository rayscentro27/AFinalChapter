import React from 'react';

const MessagePanel = ({ messages, onAIReply, onMarkDone, onNeedHelp }) => (
  <div className="flex-1 flex flex-col h-full">
    <div className="flex-1 overflow-y-auto p-6 bg-[#F6F8FB]">
      {messages.length === 0 ? (
        <div className="text-[#64748B] text-center mt-20">No messages yet.</div>
      ) : (
        messages.map((m, i) => (
          <div key={i} className={`mb-4 ${m.from === 'ai' ? 'text-right' : 'text-left'}`}>
            <div className={`inline-block px-4 py-2 rounded-2xl ${m.from === 'ai' ? 'bg-[#EFF6FF] text-[#2563EB]' : 'bg-white text-[#0F172A] border border-[#E5EAF2]'}`}>{m.text}</div>
          </div>
        ))
      )}
    </div>
    <div className="p-4 border-t border-[#E5EAF2] bg-white flex gap-2">
      <button onClick={onAIReply} className="px-4 py-2 rounded bg-[#2563EB] text-white text-xs font-semibold">AI Reply</button>
      <button onClick={onMarkDone} className="px-4 py-2 rounded bg-[#EFF6FF] text-[#2563EB] text-xs font-semibold">Mark as Done</button>
      <button onClick={onNeedHelp} className="px-4 py-2 rounded bg-[#EFF6FF] text-[#2563EB] text-xs font-semibold">Need Help</button>
    </div>
  </div>
);

export default MessagePanel;
