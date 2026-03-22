import { useMemo } from 'react';
import { Contact } from '../types';
import { buildDealTimelineSnapshot, DealTimelineVisibility } from '../services/dealTimelineService';

type UseDealTimelineInput = {
  contact: Contact;
  currentStage?: string | null;
  portalTasks?: {
    top_task?: any | null;
    urgent?: any[];
    recommended?: any[];
    completed?: any[];
  } | null;
  fundingHistory?: {
    applications?: any[];
    results?: any[];
    legacy_outcomes?: any[];
  } | null;
  business?: {
    profile?: any | null;
    progress?: any[];
    readiness?: {
      path?: string | null;
    } | null;
  } | null;
  credit?: {
    analysis?: {
      latest_report?: any | null;
      latest_analysis?: any | null;
    } | null;
    letters?: {
      letters?: any[];
    } | null;
  } | null;
  capital?: {
    profile?: any | null;
    allocation?: {
      selected_path?: string | null;
      selected_at?: string | null;
      current_state?: string | null;
    } | null;
    readiness?: {
      reserve_guidance?: {
        reserve_confirmed?: boolean;
        reserve_confirmed_at?: string | null;
      } | null;
      context?: {
        capital_setup_status?: string | null;
      } | null;
    } | null;
  } | null;
  loadingStates?: boolean[];
  errorStates?: Array<string | null | undefined>;
  visibility?: DealTimelineVisibility;
};

export default function useDealTimeline(input: UseDealTimelineInput) {
  const snapshot = useMemo(
    () =>
      buildDealTimelineSnapshot({
        contact: input.contact,
        currentStage: input.currentStage,
        portalTasks: input.portalTasks,
        fundingHistory: input.fundingHistory,
        business: input.business,
        credit: input.credit,
        capital: input.capital,
        visibility: input.visibility,
      }),
    [input.business, input.capital, input.contact, input.credit, input.currentStage, input.fundingHistory, input.portalTasks, input.visibility]
  );

  const loading = (input.loadingStates || []).some(Boolean);
  const error = (input.errorStates || []).find((value) => String(value || '').trim()) || '';

  return {
    ...snapshot,
    loading,
    error,
  };
}