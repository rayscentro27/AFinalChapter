import React from 'react';

const MessageInbox = ({ conversations, onSelect, selectedId }) => (
  <div className="w-[300px] bg-white border-r border-[#E5EAF2] h-full overflow-y-auto">
    <div className="p-4 font-semibold text-[#0F172A] text-lg border-b border-[#E5EAF2]">Inbox</div>
    {conversations.length === 0 ? (
      <div className="p-4 text-[#64748B]">No conversations</div>
    ) : (
      conversations.map((c) => (
        <div
          key={c.id}
          className={`p-4 cursor-pointer border-b border-[#E5EAF2] ${selectedId === c.id ? 'bg-[#EFF6FF]' : ''}`}
          onClick={() => onSelect(c.id)}
        >
          <div className="font-semibold text-[#0F172A]">{c.title}</div>
          <div className="text-xs text-[#64748B] truncate">{c.lastMessage}</div>
        </div>
      ))
    )}
  </div>
);

export default MessageInbox;
