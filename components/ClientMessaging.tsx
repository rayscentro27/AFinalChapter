import React, { useState } from 'react';

type Message = { from: string; text: string };
import MessageInbox from './MessageInbox';
import MessagePanel from './MessagePanel';

const mockConversations = [
  { id: '1', title: 'Funding Application', lastMessage: 'Thank you for your submission.' },
  { id: '2', title: 'Document Upload', lastMessage: 'Please upload your ID.' },
];

const mockMessages: Record<string, Message[]> = {
  '1': [
    { from: 'user', text: 'I have submitted my application.' },
    { from: 'ai', text: 'Thank you for your submission.' },
  ],
  '2': [
    { from: 'ai', text: 'Please upload your ID.' },
  ],
};

const ClientMessaging = () => {
  const [selectedId, setSelectedId] = useState<string>(mockConversations[0]?.id || '');
  const [messages, setMessages] = useState<Message[]>(mockMessages[mockConversations[0]?.id] || []);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setMessages(mockMessages[id] || []);
  };

  const handleAIReply = () => {
    setMessages((msgs: Message[]) => [...msgs, { from: 'ai', text: 'This is an AI-generated reply.' }]);
  };

  const handleMarkDone = () => {
    setMessages((msgs: Message[]) => [...msgs, { from: 'ai', text: 'This conversation is now marked as done.' }]);
  };

  const handleNeedHelp = () => {
    setMessages((msgs: Message[]) => [...msgs, { from: 'ai', text: 'A support agent will assist you soon.' }]);
  };

  return (
    <div className="flex h-[600px] rounded-2xl overflow-hidden border border-[#E5EAF2] bg-white shadow">
      <MessageInbox conversations={mockConversations} onSelect={handleSelect} selectedId={selectedId} />
      <MessagePanel messages={messages} onAIReply={handleAIReply} onMarkDone={handleMarkDone} onNeedHelp={handleNeedHelp} />
    </div>
  );
};

export default ClientMessaging;
