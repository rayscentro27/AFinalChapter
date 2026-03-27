
import React, { useState } from 'react';
import { MessageSquare, Smartphone, Zap, ShieldCheck, Globe, RefreshCw, Smartphone as PhoneIcon, X, Plus, Copy, Link, Shield, MessageCircle } from 'lucide-react';
import { MessagingChannel } from '../types';

const MessagingBridge: React.FC = () => {
    const [channels, setChannels] = useState<MessagingChannel[]>([
        { id: 'ch_1', platform: 'WhatsApp', status: 'Connected', autoReplyCount: 142, lastSync: '12m ago', webhookUrl: 'https://nexus.api/v2/wh/wa_9942' },
        { id: 'ch_2', platform: 'SMS', status: 'Connected', autoReplyCount: 89, lastSync: 'Just now', webhookUrl: 'https://nexus.api/v2/wh/sms_1042' }
    ]);

    // Empty state for messaging
    const [selectedConversation, setSelectedConversation] = useState(null);

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-20">
            {/* Activity indicator */}
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 mb-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                System Active • AI Monitoring Conversations
            </div>

            {/* Empty state if no conversation selected */}
            {!selectedConversation && (
                <div className="rounded-[1.5rem] border border-slate-200 bg-white p-8 flex flex-col items-center justify-center text-center mb-8" style={{ minHeight: 220 }}>
                    <div className="text-2xl font-bold text-slate-700 mb-2">No conversation selected</div>
                    <div className="text-slate-500 mb-4">Select a conversation from the left or start a new action</div>
                    <div className="flex gap-3">
                        <button className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold">+ New Message</button>
                        <button className="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 font-semibold">Assign AI Task</button>
                        <button className="px-4 py-2 rounded-lg bg-slate-100 text-blue-700 font-semibold">View Pending Approvals</button>
                    </div>
                </div>
            )}
                <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><MessageSquare size={320} /></div>
                <div className="relative z-10 max-w-2xl">
                    <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-indigo-500/20">
                        Shadow Concierge Protocol
                    </div>
                    <h1 className="text-6xl font-black mb-8 tracking-tighter uppercase leading-[0.9]">
                        Mobile <span className="text-indigo-400">Bridge.</span>
                    </h1>
                    <p className="text-slate-300 text-xl leading-relaxed mb-0 font-medium">
                        Autonomous lead nurturing outside the portal. Link your Twilio or WhatsApp Business accounts to enable 24/7 shadow support via neural SMS.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8" style={{ maxWidth: 320 }}>
                {channels.map(ch => (
                    <div key={ch.id} className="bg-white border border-slate-200 p-10 rounded-[3rem] shadow-sm relative overflow-hidden group hover:border-blue-500 transition-all">
                        <div className="flex justify-between items-start mb-10">
                            <div className="flex items-center gap-6">
                                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-xl transform rotate-3 transition-transform group-hover:rotate-0 ${ch.platform === 'WhatsApp' ? 'bg-emerald-500 text-white' : 'bg-slate-950 text-white'}`}>
                                    {ch.platform === 'WhatsApp' ? <MessageCircle size={32} /> : <PhoneIcon size={32} />}
                                </div>
                                <div>
                                    <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">{ch.platform}</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{ch.status} • Sync: {ch.lastSync}</span>
                                    </div>
                                </div>
                            </div>
                            <button className="p-3 bg-slate-50 text-slate-300 hover:text-red-500 transition-all rounded-xl"><X size={20}/></button>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-8">
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-inner">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Neural Replies</p>
                                <p className="text-xl font-black text-slate-800">{ch.autoReplyCount}</p>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-inner">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Session Fidelity</p>
                                <p className="text-xl font-black text-blue-600">HIGH</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="p-4 bg-slate-100/50 rounded-2xl border border-slate-200 flex items-center justify-between group/link">
                                <div className="min-w-0 pr-4">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Webhook Node</p>
                                    <p className="text-[10px] font-mono text-slate-600 truncate">{ch.webhookUrl}</p>
                                </div>
                                <button className="p-2 text-slate-300 hover:text-blue-600 transition-all"><Copy size={16}/></button>
                            </div>
                            <button className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-600 transition-all shadow-xl active:scale-95">
                                Protocol Settings
                            </button>
                        </div>
                    </div>
                ))}

                <div className="border-2 border-dashed border-slate-200 rounded-[3rem] flex flex-col items-center justify-center p-20 text-slate-300 cursor-pointer hover:border-indigo-500 hover:bg-indigo-50/30 transition-all group">
                    <Plus size={64} className="mb-6 opacity-20 group-hover:scale-110 transition-transform" />
                    <p className="text-sm font-black uppercase tracking-[0.4em]">Link New Communication Channel</p>
                </div>
            </div>

            <div className="bg-slate-50 rounded-[3rem] p-10 border border-slate-200 flex items-start gap-8">
                <div className="p-4 bg-white rounded-3xl shadow-xl"><Shield size={32} className="text-blue-600"/></div>
                <div>
                    <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">Neural Shadow Encryption</h4>
                    <p className="text-sm text-slate-500 leading-relaxed font-medium">
                        Every message transmitted via the Shadow Concierge is recorded in the Global Ledger for compliance. Nexus AI masks sensitive data (SSN, EIN, Account Numbers) automatically before replying via SMS to ensure SOC2 Type II standard alignment.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default MessagingBridge;
