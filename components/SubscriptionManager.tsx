import React, { useState } from 'react';
import { Contact, Subscription, AgencyBranding } from '../types';
import { 
  CheckCircle, Star, Zap, Crown, CreditCard, AlertCircle, 
  RefreshCw, Layers, ShieldCheck, DollarSign, Smartphone, Sparkles, X, Gift
} from 'lucide-react';
import { BACKEND_CONFIG } from '../adapters/config';

interface SubscriptionManagerProps {
  contact: Contact;
  onUpdateContact: (contact: Contact) => void;
  branding: AgencyBranding;
}

const SubscriptionManager: React.FC<SubscriptionManagerProps> = ({ contact, onUpdateContact, branding }) => {
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  const prices = branding.tierPrices || { Bronze: 50, Silver: 100, Gold: 497 };

  const PLANS = [
    {
      id: 'Bronze',
      name: 'Accelerate Plan',
      price: 50,
      icon: <Zap className="text-amber-600" />,
      color: 'border-amber-200 bg-amber-50/30',
      features: ['Credit Report Analysis', 'Dispute Letter Templates', 'Formation Checklist', 'Portal Access']
    },
    {
      id: 'Silver',
      name: 'Full Access Protocol',
      price: 100,
      icon: <Star className="text-slate-400" />,
      color: 'border-slate-200 bg-slate-50/50',
      features: ['0% Interest Card Matcher', 'Grant Writing Bot', 'SBA Underwriting Prep', 'Investment Lab']
    }
  ];

  const currentPlan = contact.subscription || {
    plan: 'Free',
    status: 'Active',
    renewalDate: 'N/A',
    price: 0,
    features: ['Basic Credit Analysis', 'AnnualCreditReport Guide']
  };

  const handleUpgrade = (plan: any) => {
    if (contact.feesWaived || plan.price === 0) {
        processUpgrade(plan);
        return;
    }

    const stripeKey = BACKEND_CONFIG.stripe.publicKey;
    if (!stripeKey || stripeKey === 'YOUR_STRIPE_PUBLIC_KEY') {
        alert("Payment Infrastructure Misconfigured. Link Stripe in Settings.");
        return;
    }

    setIsProcessing(plan.id);
    setTimeout(() => {
        processUpgrade(plan);
    }, 2000);
  };

  const processUpgrade = (plan: any) => {
    const newSub: Subscription = {
        plan: plan.id,
        status: 'Active',
        renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        price: contact.feesWaived ? 0 : plan.price,
        features: plan.features
    };
    
    const newActivity = {
        id: `sub_${Date.now()}`,
        type: 'system' as const,
        description: `Upgraded to ${plan.id} Membership Tier.`,
        date: new Date().toLocaleString(),
        user: 'Borrower'
    };

    onUpdateContact({
        ...contact,
        subscription: newSub,
        activities: [...(contact.activities || []), newActivity],
        notifications: [...(contact.notifications || []), {
            id: `sub_notif_${Date.now()}`,
            title: `Tier Elevated: ${plan.id}`,
            message: 'Welcome to your new capital infrastructure level.',
            date: 'Just now',
            read: false,
            type: 'success'
        }]
    });
    setIsProcessing(null);
    alert(`Success. Plan activated: ${plan.id}`);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      
      <div className="bg-slate-950 rounded-[2.5rem] p-12 text-white shadow-2xl relative overflow-hidden border border-white/5">
        <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><Crown size={280} /></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="max-w-xl">
             <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-emerald-500/20">
                Membership Hub
             </div>
             <h2 className="text-5xl font-black mb-6 tracking-tighter uppercase leading-none">
                {currentPlan.plan} <span className="text-emerald-500">Tier</span>
             </h2>
             <p className="text-slate-400 text-lg leading-relaxed font-medium">
                Current Level: <span className="text-white font-bold">{currentPlan.plan}</span>. 
                {currentPlan.plan === 'Free' ? " Upgrade to unlock the 0% card marketplace and AI Grant Writer." : ` Protocol active until ${currentPlan.renewalDate}.`}
             </p>
          </div>
          {currentPlan.plan !== 'Free' && (
              <div className="bg-white/5 backdrop-blur-xl p-8 rounded-3xl border border-white/10 text-center shadow-inner min-w-[240px]">
                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Monthly Commitment</p>
                 <p className="text-4xl font-black text-white">
                    {contact.feesWaived ? '$0' : `$${currentPlan.price}`}
                    <span className="text-sm opacity-40">/mo</span>
                 </p>
                 <button className="mt-6 w-full py-2 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors">Manage Billing</button>
              </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {PLANS.map(plan => {
            const isCurrent = currentPlan.plan === plan.id;
            const isUpgradable = !isCurrent;

            return (
                <div key={plan.id} className={`p-10 rounded-[3rem] border-2 flex flex-col justify-between transition-all group ${plan.color} ${isCurrent ? 'border-emerald-500 ring-4 ring-emerald-500/10' : 'border-slate-100 hover:border-blue-400'}`}>
                    <div>
                        <div className="flex justify-between items-start mb-8">
                            <div className="p-5 bg-white rounded-2xl shadow-xl group-hover:scale-110 transition-transform">
                                {plan.icon}
                            </div>
                            <div className="text-right">
                                <p className="text-3xl font-black text-slate-900 tracking-tighter">
                                    ${plan.price}
                                </p>
                                <p className="text-[9px] font-black text-slate-400 uppercase">Monthly</p>
                            </div>
                        </div>
                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-6">{plan.name}</h3>
                        <ul className="space-y-4 mb-10">
                            {plan.features.map((f, i) => (
                                <li key={i} className="flex items-start gap-3 text-sm font-medium text-slate-600">
                                    <CheckCircle size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                                    {f}
                                </li>
                            ))}
                        </ul>
                    </div>
                    
                    <button 
                        onClick={() => handleUpgrade(plan)}
                        disabled={isProcessing !== null || isCurrent}
                        className={`w-full py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-xl flex items-center justify-center gap-3 active:scale-95 ${
                            isCurrent ? 'bg-emerald-50 text-white cursor-default' : 
                            'bg-slate-950 text-white hover:bg-blue-600'
                        }`}
                    >
                        {isProcessing === plan.id ? <RefreshCw className="animate-spin" size={16}/> : isCurrent ? <CheckCircle size={16}/> : <Smartphone size={16}/>}
                        {isCurrent ? 'Current Protocol' : 'Activate Tier'}
                    </button>
                </div>
            );
        })}
      </div>
    </div>
  );
};

export default SubscriptionManager;