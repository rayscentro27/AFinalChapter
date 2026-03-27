import React from 'react';
import { getAiEmployeeIdentity, AiEmployeeKey } from '../utils/aiEmployeeIdentity';

// Replace with your icon system or SVGs as needed
const ICONS: Record<string, React.ReactNode> = {
  crown: <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M3 15l2-8 5 5 5-5 2 8H3z"/></svg>,
  bar_chart: <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><rect x="3" y="10" width="2" height="7"/><rect x="8" y="6" width="2" height="11"/><rect x="13" y="2" width="2" height="15"/></svg>,
  shield_check: <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2l7 3v5c0 5-3.5 9-7 9s-7-4-7-9V5l7-3zm-1 11l5-5-1.4-1.4L9 10.2 7.4 8.6 6 10l3 3z"/></svg>,
  eye: <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><circle cx="10" cy="10" r="3"/><path d="M1 10c2.7-5 15.3-5 18 0-2.7 5-15.3 5-18 0z"/></svg>,
  scales: <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2v2m0 0l6 2-6 12-6-12 6-2zm-6 2h12"/></svg>,
  target: <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" fill="none"/><circle cx="10" cy="10" r="4"/></svg>,
  star: <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><polygon points="10,2 12,7 17,7.5 13.5,11 14.5,16 10,13.5 5.5,16 6.5,11 3,7.5 8,7"/></svg>,
};

interface AiEmployeeIconProps {
  employee: AiEmployeeKey;
  size?: number;
  style?: React.CSSProperties;
}

export const AiEmployeeIcon: React.FC<AiEmployeeIconProps> = ({ employee, size = 32, style }) => {
  const identity = getAiEmployeeIdentity(employee);
  const icon = ICONS[identity.icon] || null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: identity.accent,
        color: '#fff',
        ...style,
      }}
      title={employee}
    >
      {icon}
    </span>
  );
};
