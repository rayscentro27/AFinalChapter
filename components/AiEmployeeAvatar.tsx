import React from 'react';
import { AiEmployeeKey, getAiEmployeeIdentity } from '../utils/aiEmployeeIdentity';

interface AiEmployeeAvatarProps {
  employee: AiEmployeeKey;
  size?: number;
  style?: React.CSSProperties;
}

export const AiEmployeeAvatar: React.FC<AiEmployeeAvatarProps> = ({ employee, size = 32, style }) => {
  const identity = getAiEmployeeIdentity(employee);
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
        fontWeight: 700,
        fontSize: size * 0.45,
        textTransform: 'uppercase',
        letterSpacing: 1,
        ...style,
      }}
      title={employee}
    >
      {identity.fallbackInitials}
    </span>
  );
};
