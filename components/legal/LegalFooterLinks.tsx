import React from 'react';

type LegalFooterLinksProps = {
  className?: string;
  compact?: boolean;
};

const links = [
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/ai-disclosure', label: 'AI Disclosure' },
  { href: '/refund-policy', label: 'Refund Policy' },
  { href: '/disclaimers', label: 'Disclaimers' },
  { href: '/membership-agreement', label: 'Membership Agreement' },
  { href: '/mailing-authorization', label: 'Mailing Authorization' },
  { href: '/mailing-approvals', label: 'Mailing Approvals' },
  { href: '/sms-terms', label: 'SMS Terms' },
  { href: '/communication-preferences', label: 'Communication Preferences' },
];

export default function LegalFooterLinks({ className = '', compact = false }: LegalFooterLinksProps) {
  return (
    <footer className={`border-t border-white/10 ${compact ? 'py-3 px-4' : 'py-6'} ${className}`.trim()}>
      <div className={`max-w-7xl mx-auto flex ${compact ? 'flex-col gap-2 md:flex-row md:justify-between md:items-center' : 'flex-col gap-4 md:flex-row md:justify-between md:items-center'}`}>
        <div className="flex flex-wrap gap-4">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="text-xs font-bold text-slate-400 hover:text-cyan-300 transition-colors">
              {link.label}
            </a>
          ))}
        </div>
        <span className="text-[11px] text-slate-500">Educational tools only. No guaranteed outcomes.</span>
      </div>
    </footer>
  );
}
