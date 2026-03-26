
import React from 'react';
import { Contact, ViewMode } from '../types';
import { useAuth } from '../contexts/AuthContext';
import SuperAdminHomeV2 from './light/SuperAdminHomeV2';

interface DashboardProps {
  contacts?: Contact[];
  onFocusContact?: (contact: Contact) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ contacts = [], onFocusContact }) => {
  const { user } = useAuth();
  const isInternalRole = Boolean(user && ['admin', 'supervisor', 'sales', 'salesperson'].includes(user.role));

  if (isInternalRole) {
    return <SuperAdminHomeV2 contacts={contacts} onNavigate={(view) => (window.location.hash = view.toLowerCase())} />;
  }

  return <SuperAdminHomeV2 contacts={contacts} onNavigate={(view) => (window.location.hash = view.toLowerCase())} />;
};

export default Dashboard;
