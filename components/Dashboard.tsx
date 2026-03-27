
import React from 'react';
import { Contact, ViewMode } from '../types';
import { useAuth } from '../contexts/AuthContext';
import SuperAdminHomeV2 from './light/SuperAdminHomeV2';
import FounderPanel from './FounderPanel';
import AccountIntegrationsPanel from './AccountIntegrationsPanel';

interface DashboardProps {
  contacts?: Contact[];
  onFocusContact?: (contact: Contact) => void;
}


const Dashboard: React.FC<DashboardProps> = ({ contacts = [], onFocusContact }) => {
  const { user } = useAuth();
  const [view, setView] = React.useState<string>('DASHBOARD');
  const isInternalRole = Boolean(user && ['admin', 'supervisor', 'sales', 'salesperson'].includes(user.role));

  if (isInternalRole && view === 'FOUNDER_PANEL') {
    return <FounderPanel />;
  }
  if (isInternalRole && view === 'STACK_INTEGRATION_MANAGER') {
    return <AccountIntegrationsPanel />;
  }
  if (isInternalRole) {
    return <SuperAdminHomeV2 contacts={contacts} onNavigate={(v) => setView(typeof v === 'string' ? v.toUpperCase() : String(v))} />;
  }
  return <SuperAdminHomeV2 contacts={contacts} onNavigate={(v) => setView(typeof v === 'string' ? v.toUpperCase() : String(v))} />;
};

export default Dashboard;
