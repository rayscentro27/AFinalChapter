import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { AgencyBranding, Contact, Course } from '../types';
import OnboardingWizard from './OnboardingWizard';
import FundingJourneyWorkspace from './FundingJourneyWorkspace';
import { supabase } from '../lib/supabaseClient';

interface PortalViewProps {
  contact: Contact;
  onUpdateContact: (contact: Contact) => void;
  branding: AgencyBranding;
  onLogout: () => void;
  isAdminPreview?: boolean;
  availableCourses?: Course[];
}

const PortalView: React.FC<PortalViewProps> = ({
  contact,
  onUpdateContact,
  branding,
  onLogout,
  isAdminPreview = false,
}) => {
  const [profileState, setProfileState] = useState<'unknown' | 'has_profile' | 'missing_profile'>('unknown');

  useEffect(() => {
    let cancelled = false;

    const timeout = window.setTimeout(() => {
      if (!cancelled) {
        setProfileState('has_profile');
      }
    }, 6000);

    const check = async () => {
      try {
        if (isAdminPreview) {
          if (!cancelled) setProfileState('has_profile');
          return;
        }

        const { data, error } = await supabase
          .from('tenant_profiles')
          .select('tenant_id')
          .eq('tenant_id', contact.id)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          setProfileState('has_profile');
          return;
        }

        setProfileState(data?.tenant_id ? 'has_profile' : 'missing_profile');
      } catch {
        if (!cancelled) setProfileState('has_profile');
      } finally {
        window.clearTimeout(timeout);
      }
    };

    void check();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [contact.id, isAdminPreview]);

  if (profileState === 'unknown') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-slate-500">
          <RefreshCw className="animate-spin" size={16} /> Loading portal...
        </div>
      </div>
    );
  }

  if (profileState === 'missing_profile') {
    return <OnboardingWizard contact={contact} onComplete={onUpdateContact} />;
  }

  return (
    <FundingJourneyWorkspace
      contact={contact}
      onUpdateContact={onUpdateContact}
      branding={branding}
      onLogout={onLogout}
    />
  );
};

export default PortalView;
