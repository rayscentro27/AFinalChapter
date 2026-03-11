
import React, { useState } from 'react';
import { Contact, Invoice, ClientDocument } from '../types';
import { 
    CreditCard, CheckCircle, Clock, Download, ArrowRight, 
    ShieldCheck, Smartphone, DollarSign, RefreshCw, Zap,
    FileText, Lock, Building2, Receipt
} from 'lucide-react';
import { BACKEND_CONFIG } from '../adapters/config';

interface ClientInvoicesProps {
  contact: Contact;
  onUpdateContact: (contact: Contact) => void;
}

const ClientInvoices: React.FC<ClientInvoicesProps> = ({ contact, onUpdateContact }) => {
  const [isPaying, setIsPaying] = useState<string | null>(null);
  const invoices = contact.invoices || [];

  const handlePay = (invoice: Invoice) => {
    const stripePk = BACKEND_CONFIG.stripe.publicKey;
    
    if (!stripePk || stripePk === 'YOUR_STRIPE_PUBLIC_KEY') {
        alert("Payment Infrastructure Misconfigured. Contact Support.");
        return;
    }

    setIsPaying(invoice.id);
    
    // Stripe Logic Simulation
    setTimeout(() => {
        const updatedInvoices = invoices.map(i => 
            i.id === invoice.id ? { 
                ...i, 
                status: 'Paid' as const, 
                paidAt: new Date().toLocaleDateString(),
                paymentMethod: 'Stripe Credit'
            } : i
        );

        const receiptDoc: ClientDocument = {
            id: `rec_${Date.now()}`,
            name: `Receipt_Nexus_${invoice.id}.pdf`,
            type: 'Receipt',
            status: 'Verified',
            uploadDate: new Date().toLocaleDateString(),
            fileUrl: 'internal://receipt'
        };

        const newActivity = {
            id: `pay_${Date.now()}`,
            type: 'system' as const,
            description: `Invoice Paid: $${invoice.amount.toLocaleString()} for ${invoice.description}`,
            date: new Date().toLocaleString(),
            user: 'Borrower'
        };

        onUpdateContact({
            ...contact,
            invoices: updatedInvoices as Invoice[],
            documents: [...(contact.documents || []), receiptDoc],
            activities: [...(contact.activities || []), newActivity],
            notifications: [
                ...(contact.notifications || []),
                { id: `pay_notif_${Date.now()}`, title: 'Payment Confirmed', message: `Your success fee payment of $${invoice.amount.toLocaleString()} was processed.`, date: 'Just now', read: false, type: 'success' }
            ]
        });

        setIsPaying(null);
        alert(`Capital Settlement Success. Receipt deposited in Vault.`);
    }, 2500);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="bg-slate-900 rounded-[2.5rem] p-12 text-white shadow-2xl relative overflow-hidden border border-white/5">
         <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><DollarSign size={280} /></div>
         <div className="relative z-10 max-w-2xl">
            <div className="bg-emerald-500/10 text-emerald-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-emerald-500/20 w-fit">Account Ledger</div>
            <h2 className="text-5xl font-black mb-6 tracking-tighter uppercase leading-none">Capital <span className="text-emerald-500">Settlement</span></h2>
            <p className="text-slate-400 text-xl leading-relaxed font-medium">
               Review and fulfill success fee invoices via our encrypted Stripe payment protocol.
            </p>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         <div className="lg:col-span-2 space-y-4">
            {invoices.length === 0 ? (
                <div className="bg-white p-16 rounded-[2.5rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-slate-400">
                    <Receipt size={64} className="opacity-10 mb-4" />
                    <p className="text-sm font-black uppercase tracking-widest">No Active Invoices</p>
                </div>
            ) : (
                invoices.map(inv => (
                    <div key={inv.id} className={`bg-white p-8 rounded-[2.5rem] border shadow-sm transition-all flex flex-col md:flex-row items-center justify-between gap-8 ${inv.status === 'Paid' ? 'border-emerald-100 opacity-60' : 'border-slate-200 hover:border-blue-300'}`}>
                        <div className="flex items-center gap-6">
                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner ${inv.status === 'Paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                                {inv.status === 'Paid' ? <CheckCircle size={32}/> : <CreditCard size={32}/>}
                            </div>
                            <div>
                                <h4 className="font-black text-slate-900 text-lg uppercase tracking-tight">{inv.description}</h4>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Invoice #{inv.id} • Due {inv.dueDate}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-10 w-full md:w-auto">
                            <div className="text-right">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Fee Magnitude</p>
                                <p className={`text-3xl font-black tracking-tighter ${inv.status === 'Paid' ? 'text-slate-400' : 'text-slate-900'}`}>${inv.amount.toLocaleString()}</p>
                            </div>

                            {inv.status !== 'Paid' ? (
                                <button 
                                    onClick={() => handlePay(inv)}
                                    disabled={isPaying !== null}
                                    className="bg-slate-950 text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-600 shadow-2xl transition-all flex items-center gap-3 transform active:scale-95 disabled:opacity-50"
                                >
                                    {isPaying === inv.id ? <RefreshCw className="animate-spin" size={16}/> : <Smartphone size={16}/>}
                                    Pay with Stripe
                                </button>
                            ) : (
                                <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100">
                                    <CheckCircle size={16}/>
                                    <span className="text-[10px] font-black uppercase">Settled</span>
                                </div>
                            )}
                        </div>
                    </div>
                ))
            )}
         </div>

         <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <ShieldCheck size={16} className="text-emerald-500" /> Transaction Trust
                </h3>
                <div className="space-y-6">
                    <div className="flex items-start gap-4">
                        <Lock size={20} className="text-slate-300 shrink-0" />
                        <div>
                            <p className="text-xs font-black text-slate-900 uppercase">Bank-Grade Security</p>
                            <p className="text-[10px] text-slate-500 font-medium leading-relaxed mt-1">Processed via Stripe with AES-256 encryption. We never store credit card data on our servers.</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-4">
                        <FileText size={20} className="text-slate-300 shrink-0" />
                        <div>
                            <p className="text-xs font-black text-slate-900 uppercase">Automatic Receipting</p>
                            <p className="text-[10px] text-slate-500 font-medium leading-relaxed mt-1">A verifiable PDF receipt is automatically deposited in your Subject Vault upon successful settlement.</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-4">
                        <Zap size={20} className="text-slate-300 shrink-0" />
                        <div>
                            <p className="text-xs font-black text-slate-900 uppercase">Fast Liquidity</p>
                            <p className="text-[10px] text-slate-500 font-medium leading-relaxed mt-1">Settling fees promptly ensures your account remains in good standing for future renewal offers.</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-blue-600 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><Building2 size={120} /></div>
                <h3 className="text-xs font-black uppercase tracking-[0.2em] opacity-60 mb-2">Billing Support</h3>
                <p className="text-sm font-bold leading-relaxed mb-8">Need an invoice modification or want to pay via Wire?</p>
                <button className="w-full py-4 bg-white text-blue-600 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl transform active:scale-95 transition-all">
                    Message Billing Team
                </button>
            </div>
         </div>
      </div>
    </div>
  );
};

export default ClientInvoices;
