
import React, { useState } from 'react';
import { Contact, Invoice } from '../types';
import { 
  DollarSign, Receipt, Clock, CheckCircle, AlertCircle, 
  Search, Filter, Send, Download, Mail, RefreshCw, 
  ArrowUpRight, ArrowDownLeft, FileText, Trash2, Smartphone, Layers
} from 'lucide-react';

interface InvoicingHubProps {
  contacts: Contact[];
  onUpdateContact: (contact: Contact) => void;
}

const InvoicingHub: React.FC<InvoicingHubProps> = ({ contacts, onUpdateContact }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'All' | 'Pending' | 'Paid' | 'Overdue'>('All');

  // Flatten all invoices from all contacts
  const allInvoices = contacts.flatMap(c => (c.invoices || []).map(i => ({ ...i, contact: c })));

  const filteredInvoices = allInvoices.filter(i => {
    const matchesSearch = i.contactName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          i.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = activeFilter === 'All' || i.status === activeFilter;
    return matchesSearch && matchesFilter;
  });

  const totalCollected = allInvoices.filter(i => i.status === 'Paid').reduce((sum, i) => sum + i.amount, 0);
  const totalPending = allInvoices.filter(i => i.status === 'Pending').reduce((sum, i) => sum + i.amount, 0);
  const totalOverdue = allInvoices.filter(i => i.status === 'Overdue').reduce((sum, i) => sum + i.amount, 0);

  // Subscriptions Calculation
  const activeSubs = contacts.filter(c => c.subscription && c.subscription.plan !== 'Free');
  const mrr = activeSubs.reduce((sum, c) => sum + (c.subscription?.price || 0), 0);

  const handleSendReminder = (invoice: Invoice, contact: Contact) => {
    const updatedInvoices = (contact.invoices || []).map(i => 
        i.id === invoice.id ? { ...i, reminderSent: true } : i
    );
    
    const newActivity = {
        id: `rem_${Date.now()}`,
        type: 'email' as const,
        description: `Automated Invoice Reminder sent for ${invoice.id} ($${invoice.amount.toLocaleString()})`,
        date: new Date().toLocaleString(),
        user: 'Nexus AI'
    };

    onUpdateContact({
        ...contact,
        invoices: updatedInvoices as Invoice[],
        activities: [...(contact.activities || []), newActivity]
    });
    
    alert(`Success fee nudge transmitted to ${contact.email}`);
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'Paid': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'Overdue': return 'bg-red-50 text-red-700 border-red-100';
      case 'Pending': return 'bg-amber-50 text-amber-700 border-amber-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-20">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-3">
            <Receipt className="text-blue-600" size={36} /> Revenue Hub
          </h1>
          <p className="text-slate-500 font-medium mt-1">Management of agency success fees and monthly recurring yields.</p>
        </div>
      </div>

      {/* Stats Deck */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-slate-950 p-8 rounded-[2rem] text-white shadow-2xl flex flex-col justify-between group">
            <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Yield (Won)</p>
                <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl"><ArrowUpRight size={20}/></div>
            </div>
            <h3 className="text-3xl font-black text-white mt-4">${totalCollected.toLocaleString()}</h3>
        </div>
        
        <div className="bg-indigo-600 p-8 rounded-[2rem] text-white shadow-xl flex flex-col justify-between group">
            <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">Monthly Recurring (MRR)</p>
                <div className="p-3 bg-white/10 text-white rounded-2xl group-hover:scale-110 transition-transform"><Layers size={20}/></div>
            </div>
            <h3 className="text-3xl font-black text-white mt-4">${mrr.toLocaleString()}</h3>
            <p className="text-[9px] font-black uppercase text-indigo-200 mt-1">{activeSubs.length} Active Subscriptions</p>
        </div>

        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-amber-500 transition-all">
            <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pending Receivables</p>
                <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl group-hover:scale-110 transition-transform"><Clock size={20}/></div>
            </div>
            <h3 className="text-3xl font-black text-slate-900 mt-4">${totalPending.toLocaleString()}</h3>
        </div>

        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-red-500 transition-all">
            <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aged Overdue</p>
                <div className="p-3 bg-red-50 text-red-600 rounded-2xl group-hover:scale-110 transition-transform"><AlertCircle size={20}/></div>
            </div>
            <h3 className="text-3xl font-black text-red-600 mt-4">${totalOverdue.toLocaleString()}</h3>
        </div>
      </div>

      {/* Controls & Table */}
      <div className="bg-white border border-slate-200 rounded-[3rem] shadow-xl overflow-hidden flex flex-col min-h-[500px]">
        <div className="p-8 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex bg-white p-1 rounded-xl shadow-inner border border-slate-200">
                {(['All', 'Pending', 'Paid', 'Overdue'] as const).map(f => (
                    <button 
                        key={f} 
                        onClick={() => setActiveFilter(f)}
                        className={`px-6 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${activeFilter === f ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-700'}`}
                    >
                        {f}
                    </button>
                ))}
            </div>
            <div className="relative w-full md:w-80">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                    type="text" 
                    placeholder="Search by Merchant..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                />
            </div>
        </div>

        <div className="overflow-x-auto">
            <table className="w-full text-left">
                <thead className="bg-white text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50">
                    <tr>
                        <th className="px-10 py-6">Identity / Entity</th>
                        <th className="px-10 py-6">Identity Level</th>
                        <th className="px-10 py-6">Protocol Magnitude</th>
                        <th className="px-10 py-6">Phase</th>
                        <th className="px-10 py-6 text-right">Escalation</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                    {filteredInvoices.map((inv, idx) => (
                        <tr key={`${inv.id}-${idx}`} className="hover:bg-slate-50/80 transition-colors group">
                            <td className="px-10 py-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs uppercase shadow-lg transform rotate-3">{inv.contact.name[0]}</div>
                                    <div>
                                        <div className="font-black text-slate-900 uppercase tracking-tight text-sm group-hover:text-blue-600 transition-colors">{inv.contact.company}</div>
                                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{inv.contact.email}</div>
                                    </div>
                                </div>
                            </td>
                            <td className="px-10 py-6">
                                <div className="flex items-center gap-2">
                                   <Layers size={14} className="text-indigo-500" />
                                   <span className="text-[10px] font-black uppercase text-slate-700">{inv.contact.subscription?.plan || 'Free'} Member</span>
                                </div>
                            </td>
                            <td className="px-10 py-6">
                                <div className="font-black text-sm tracking-tight text-slate-900">${inv.amount.toLocaleString()}</div>
                                <p className="text-[9px] text-slate-400 font-bold uppercase">{inv.description}</p>
                            </td>
                            <td className="px-10 py-6">
                                <span className={`text-[9px] uppercase font-black px-3 py-1 rounded-full border ${getStatusStyle(inv.status)}`}>
                                    {inv.status}
                                </span>
                            </td>
                            <td className="px-10 py-6 text-right">
                                <div className="flex justify-end gap-2">
                                    {inv.status !== 'Paid' && (
                                        <button 
                                            onClick={() => handleSendReminder(inv, inv.contact)}
                                            className={`p-3 bg-white border border-slate-200 rounded-xl transition-all shadow-sm ${inv.reminderSent ? 'text-emerald-500 bg-emerald-50 border-emerald-100' : 'text-slate-400 hover:text-blue-600 hover:border-blue-200'}`}
                                            title="Transmit Nudge"
                                        >
                                            {inv.reminderSent ? <CheckCircle size={16}/> : <Mail size={16}/>}
                                        </button>
                                    )}
                                    <button className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 transition-all shadow-sm"><FileText size={16}/></button>
                                </div>
                            </td>
                        </tr>
                    ))}
                    {filteredInvoices.length === 0 && (
                        <tr>
                            <td colSpan={5} className="p-20 text-center flex flex-col items-center">
                                <Receipt size={48} className="opacity-10 mb-4" />
                                <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Zero receivables found</p>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default InvoicingHub;
