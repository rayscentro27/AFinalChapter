// Centralized mapping for Nexus AI Employee visual identity
// Includes icon, accent color, badge style, and fallback initials

export type AiEmployeeKey =
  | 'Nexus Founder'
  | 'Nexus Analyst'
  | 'Nexus Underwriter'
  | 'Sentinel Scout'
  | 'Lex Ledger'
  | 'Ghost Hunter'
  | 'Nova Grant';

export interface AiEmployeeIdentity {
  key: AiEmployeeKey;
  icon: string; // Icon name (for use with icon library or custom SVG)
  accent: string; // Hex or CSS color
  fallbackInitials: string;
  semantic: string; // Short description
}

export const AI_EMPLOYEE_IDENTITIES: Record<AiEmployeeKey, AiEmployeeIdentity> = {
  'Nexus Founder': {
    key: 'Nexus Founder',
    icon: 'crown',
    accent: '#1A237E', // Deep blue
    fallbackInitials: 'NF',
    semantic: 'executive / command / overview',
  },
  'Nexus Analyst': {
    key: 'Nexus Analyst',
    icon: 'bar_chart',
    accent: '#00838F', // Teal
    fallbackInitials: 'NA',
    semantic: 'insight / analysis / review',
  },
  'Nexus Underwriter': {
    key: 'Nexus Underwriter',
    icon: 'shield_check',
    accent: '#388E3C', // Emerald
    fallbackInitials: 'NU',
    semantic: 'shield / review / approval risk',
  },
  'Sentinel Scout': {
    key: 'Sentinel Scout',
    icon: 'eye',
    accent: '#FFB300', // Amber
    fallbackInitials: 'SS',
    semantic: 'watch / alert / monitoring',
  },
  'Lex Ledger': {
    key: 'Lex Ledger',
    icon: 'scales',
    accent: '#7B1FA2', // Purple
    fallbackInitials: 'LL',
    semantic: 'compliance / credit / rules',
  },
  'Ghost Hunter': {
    key: 'Ghost Hunter',
    icon: 'target',
    accent: '#37474F', // Slate
    fallbackInitials: 'GH',
    semantic: 'pursuit / follow-up / closer energy',
  },
  'Nova Grant': {
    key: 'Nova Grant',
    icon: 'star',
    accent: '#FFD600', // Gold
    fallbackInitials: 'NG',
    semantic: 'opportunity / grant / expansion',
  },
};

export function getAiEmployeeIdentity(key: AiEmployeeKey): AiEmployeeIdentity {
  return AI_EMPLOYEE_IDENTITIES[key];
}
