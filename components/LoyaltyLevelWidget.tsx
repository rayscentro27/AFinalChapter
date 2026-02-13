
import React from 'react';
import { Contact } from '../types';
import { Award, Zap, Users, TrendingUp, Lock, CheckCircle, Crown, Star } from 'lucide-react';

interface LoyaltyLevelWidgetProps {
  contact: Contact;
}

type Level = 'Member' | 'Insider' | 'Elite' | 'Partner';

const LEVELS: Record<Level, { minXP: number; color: string; icon: any; perks: string[] }> = {
  Member: {
    minXP: 0,
    color: 'text-slate-400',
    icon: Users,
    perks: ['Standard Support', 'Access to Portal']
  },
  Insider: {
    minXP: 500,
    color: 'text-blue-400',
    icon: Star,
    perks: ['Priority Support', 'Weekly Market Updates']
  },
  Elite: {
    minXP: 2000,
    color: 'text-amber-400',
    icon: Crown,
    perks: ['10% Success Fee Discount', 'Dedicated Advisor']
  },
  Partner: {
    minXP: 5000,
    color: 'text-indigo-400',
    icon: Award,
    perks: ['Direct Lender Access', 'Revenue Share on Referrals']
  }
};

const LoyaltyLevelWidget: React.FC<LoyaltyLevelWidgetProps> = ({ contact }) => {
  const dealsXP = (contact.fundedDeals?.length || 0) * 1000;
  const referralsXP = (contact.referralData?.totalSignups || 0) * 250;
  const activityXP = (contact.activities?.length || 0) * 10;
  
  const totalXP = dealsXP + referralsXP + activityXP;

  let currentLevel: Level = 'Member';
  let nextLevel: Level | null = 'Insider';

  if (totalXP >= 5000) { currentLevel = 'Partner'; nextLevel = null; }
  else if (totalXP >= 2000) { currentLevel = 'Elite'; nextLevel = 'Partner'; }
  else if (totalXP >= 500) { currentLevel = 'Insider'; nextLevel = 'Elite'; }

  const currInfo = LEVELS[currentLevel];
  const nextInfo = nextLevel ? LEVELS[nextLevel] : null;

  let progress = 100;
  if (nextInfo) {
    const gap = nextInfo.minXP - currInfo.minXP;
    const currentProgress = totalXP - currInfo.minXP;
    progress = (currentProgress / gap) * 100;
  }

  return (
    <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-2xl border border-white/5 relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
        <currInfo.icon size={180} />
      </div>

      <div className="relative z-10">
        <div className="flex justify-between items-center mb-8">
          <div>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Rewards Status</p>
            <h3 className={`text-3xl font-black flex items-center gap-3 ${currInfo.color}`}>
              <currInfo.icon size={28} className="fill-current" />
              {currentLevel}
            </h3>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black font-mono tracking-tighter text-white">{totalXP.toLocaleString()}</p>
            <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Total System XP</p>
          </div>
        </div>

        <div className="mb-3 flex justify-between text-[10px] font-black uppercase text-slate-500 tracking-widest">
          <span>{currentLevel}</span>
          {nextLevel && <span>Next: {nextLevel} ({nextInfo?.minXP.toLocaleString()} XP)</span>}
        </div>
        <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden mb-10 border border-white/5">
          <div 
            className={`h-full transition-all duration-1000 shadow-[0_0_15px_rgba(255,255,255,0.1)] ${currInfo.color.replace('text-', 'bg-')}`} 
            style={{ width: `${progress}%` }}
          ></div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-10">
           <div className="bg-white/5 p-4 rounded-2xl text-center border border-white/5">
              <p className="text-[9px] text-slate-500 uppercase font-black mb-1">Deals</p>
              <p className="text-lg font-black text-emerald-400">{contact.fundedDeals?.length || 0}</p>
           </div>
           <div className="bg-white/5 p-4 rounded-2xl text-center border border-white/5">
              <p className="text-[9px] text-slate-500 uppercase font-black mb-1">Referrals</p>
              <p className="text-lg font-black text-blue-400">{contact.referralData?.totalSignups || 0}</p>
           </div>
           <div className="bg-white/5 p-4 rounded-2xl text-center border border-white/5">
              <p className="text-[9px] text-slate-500 uppercase font-black mb-1">Activity</p>
              <p className="text-lg font-black text-purple-400">{contact.activities?.length || 0}</p>
           </div>
        </div>

        <div className="bg-white/5 rounded-[2rem] p-6 border border-white/10 backdrop-blur-md">
           <p className="text-[10px] font-black text-slate-400 mb-4 uppercase tracking-[0.2em] flex items-center gap-2">
             <Zap size={12} className="text-yellow-400 fill-current" /> Level Privileges
           </p>
           <ul className="space-y-3">
             {currInfo.perks.map((perk, i) => (
               <li key={i} className="text-xs text-slate-300 font-medium flex items-center gap-3">
                 <CheckCircle size={14} className="text-emerald-500" /> {perk}
               </li>
             ))}
           </ul>
        </div>
      </div>
    </div>
  );
};

export default LoyaltyLevelWidget;
