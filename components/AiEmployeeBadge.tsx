import React from 'react';
import { AiEmployeeKey, getAiEmployeeIdentity } from '../utils/aiEmployeeIdentity';
import { AiEmployeeIcon } from './AiEmployeeIcon';

interface AiEmployeeBadgeProps {
  employee: AiEmployeeKey;
  showName?: boolean;
  size?: number;
  style?: React.CSSProperties;
}

export const AiEmployeeBadge: React.FC<AiEmployeeBadgeProps> = ({ employee, showName = true, size = 32, style }) => {
  const identity = getAiEmployeeIdentity(employee);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '2px 10px',
        borderRadius: 20,
        background: '#f7fafd',
        border: `1px solid ${identity.accent}`,
        fontWeight: 500,
        fontSize: 14,
        color: identity.accent,
        ...style,
      }}
    >
      <AiEmployeeIcon employee={employee} size={size} />
      {showName && <span>{employee}</span>}
    </span>
  );
};
