import React from 'react';
import {
  getAiEmployeeIdentity,
  getWorkforceIdentity,
  AiEmployeeKey,
} from '../utils/aiEmployeeIdentity';
import {
  Activity,
  Banknote,
  BarChart3,
  Bot,
  CalendarClock,
  Clapperboard,
  Crown,
  FileScan,
  Ghost,
  GitBranch,
  GraduationCap,
  MessageSquare,
  Microscope,
  Radar,
  Scale,
  Server,
  Shield,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';

// Replace with your icon system or SVGs as needed
const ICONS: Record<string, React.ElementType> = {
  crown: Crown,
  analytics: BarChart3,
  shield: ShieldCheck,
  radar: Radar,
  scales: Scale,
  ghost: Ghost,
  sparkles: Sparkles,
  clapperboard: Clapperboard,
  microscope: Microscope,
  'graduation-cap': GraduationCap,
  banknote: Banknote,
  'shield-stack': Shield,
  server: Server,
  'calendar-clock': CalendarClock,
  'git-branch': GitBranch,
  messages: MessageSquare,
  bot: Bot,
  activity: Activity,
  'file-scan': FileScan,
  target: Target,
};

interface AiEmployeeIconProps {
  employee: AiEmployeeKey | string;
  size?: number;
  style?: React.CSSProperties;
}

export const AiEmployeeIcon: React.FC<AiEmployeeIconProps> = ({ employee, size = 32, style }) => {
  const workforceIdentity = getWorkforceIdentity(String(employee));
  const aiIdentity = workforceIdentity?.category === 'employee' ? getAiEmployeeIdentity(workforceIdentity.employee_key as AiEmployeeKey) : undefined;
  const iconKey = workforceIdentity?.icon_key || aiIdentity?.icon || 'crown';
  const Icon = ICONS[iconKey] || Crown;
  const accent = workforceIdentity?.accent_color || aiIdentity?.accent || '#4A7AE8';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: accent,
        color: '#fff',
        fontWeight: 700,
        fontSize: Math.max(10, size * 0.34),
        ...style,
      }}
      title={String(employee)}
    >
      <Icon width={Math.max(12, Math.round(size * 0.55))} height={Math.max(12, Math.round(size * 0.55))} strokeWidth={2.2} />
    </span>
  );
};
