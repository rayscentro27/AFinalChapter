import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Activity, Clock3, Crown, FileText, Server, ShieldAlert, Sparkles, Users } from 'lucide-react';
import { AiEmployeeIcon } from '../../components/AiEmployeeIcon';
import { useAdminActivationCenter } from '../hooks/useAdminActivationCenter';
import { AgentSummaryHighlight, ExecutiveBriefing, useCeoBriefingDashboard } from '../hooks/useCeoBriefingDashboard';
import {
  AI_EMPLOYEE_REGISTRY,
  AI_RUNTIME_SERVICE_REGISTRY,
  type AiEmployeeKey,
  type WorkforceIdentity,
  type WorkforceStatus,
} from '../../utils/aiEmployeeIdentity';

type SelectedEntity = {
  kind: 'employee' | 'runtime_service';
  key: string;
};

type DependencyStatus = {
  name: string;
  status: WorkforceStatus;
  affected: boolean;
};

type EmployeeCard = {
  identity: WorkforceIdentity;
  status: WorkforceStatus;
  currentActivity: string;
  lastActivityAt: string;
  latestReportTitle: string;
  latestReportSummary: string;
  issueSummary: string;
  recommendedAction: string;
  dependencies: DependencyStatus[];
  recentReports: ReportCard[];
};

type ServiceCard = {
  identity: WorkforceIdentity;
  status: WorkforceStatus;
  purpose: string;
  lastHeartbeat: string;
  authState: string;
  lastError: string;
  issueSummary: string;
  recommendedAction: string;
  dependencyImpact: string[];
  dependencyNames: string[];
};

type ReportCard = {
  id: string;
  sourceLabel: string;
  sourceKey: string;
  title: string;
  summary: string;
  severity: WorkforceStatus;
  timestamp: string;
  linkedEntity: SelectedEntity;
  recommendedAction: string;
};

const EMPLOYEE_DEPENDENCIES: Record<string, string[]> = {
  'Nexus Founder': ['Supabase', 'AI provider', 'OpenClaw', 'Dashboard Health'],
  'Nexus Analyst': ['AI provider', 'OpenClaw', 'Signal Router'],
  'Nexus Underwriter': ['Supabase', 'OpenClaw', 'Dashboard Health'],
  'Sentinel Scout': ['Signal Router', 'Telegram', 'OpenClaw'],
  'Lex Ledger': ['Supabase', 'Storage', 'Dashboard Health'],
  'Ghost Hunter': ['Scheduler', 'Signal Router', 'Dashboard Health'],
  'Nova Grant': ['Storage', 'OpenClaw', 'Dashboard Health'],
  'Nova Media': ['Content Pipeline', 'Storage', 'OpenClaw'],
  'Forensic Bot': ['Supabase', 'Dashboard Health'],
  'Sales Trainer': ['Content Pipeline', 'Storage'],
  'Yield Harvester': ['Supabase', 'Dashboard Health'],
  'Stacking Shield': ['Supabase', 'OpenClaw'],
};

const EMPLOYEE_FOCUS: Record<string, string> = {
  'Nexus Founder': 'Review AI-prepared summaries, blockers, approvals, and next actions.',
  'Nexus Analyst': 'Turn stored summaries into a concise operating view.',
  'Nexus Underwriter': 'Check readiness, risk posture, and approval criteria.',
  'Sentinel Scout': 'Surface new signals, opportunities, and alerts early.',
  'Lex Ledger': 'Keep documents, compliance, and funding logic in bounds.',
  'Ghost Hunter': 'Recover stalled context and hidden follow-up work.',
  'Nova Grant': 'Track grants, fit, and review-ready packets.',
  'Nova Media': 'Prepare approved educational content and training media.',
  'Forensic Bot': 'Audit evidence quality, integrity, and data gaps.',
  'Sales Trainer': 'Support sales playbooks and guided client motion.',
  'Yield Harvester': 'Watch revenue, retention, and monetization signals.',
  'Stacking Shield': 'Track reserve discipline and post-funding protection.',
};

const EMPLOYEE_DOES_NOT_DO: Record<string, string> = {
  'Nexus Founder': 'Does not run raw worker tasks or chat with live AI to make routine decisions.',
  'Nexus Analyst': 'Does not approve exceptions or author policy on its own.',
  'Nexus Underwriter': 'Does not execute outreach or content production.',
  'Sentinel Scout': 'Does not finalize funding decisions or human approvals.',
  'Lex Ledger': 'Does not override human confirmation steps.',
  'Ghost Hunter': 'Does not replace the decision queue; it only surfaces missing context.',
  'Nova Grant': 'Does not submit grant applications without review.',
  'Nova Media': 'Does not approve funding or compliance decisions.',
  'Forensic Bot': 'Does not make client-facing commitments.',
  'Sales Trainer': 'Does not manage live financial operations.',
  'Yield Harvester': 'Does not become a revenue control plane.',
  'Stacking Shield': 'Does not replace the billing or compliance system.',
};

const SERVICE_PURPOSES: Record<string, string> = {
  'mac-mini-worker': 'Mac Mini host for local jobs, background workers, and runtime execution.',
  scheduler: 'Schedules jobs, retries, and deferred workflows.',
  'signal-router': 'Routes alerts, messages, and service signals across systems.',
  'telegram-bridge': 'Connects bot, chat, and routing state for operator messaging.',
  openclaw: 'Local assistant runtime and fallback operator surface.',
  'dashboard-health': 'Aggregates safe health metadata and dashboard readiness signals.',
  'content-pipeline': 'Prepares approved training, content, and summary artifacts.',
};

const SERVICE_IMPACTS: Record<string, string[]> = {
  'mac-mini-worker': ['Nexus Analyst', 'Nexus Underwriter', 'Ghost Hunter', 'Nova Media'],
  scheduler: ['Ghost Hunter', 'Nova Grant', 'Yield Harvester', 'Stacking Shield'],
  'signal-router': ['Sentinel Scout', 'Ghost Hunter', 'Nexus Founder'],
  'telegram-bridge': ['Sentinel Scout', 'Ghost Hunter', 'Nova Grant'],
  openclaw: ['Nexus Analyst', 'Nexus Underwriter', 'Sentinel Scout', 'Nova Grant', 'Nova Media'],
  'dashboard-health': ['Nexus Founder', 'Lex Ledger', 'Forensic Bot'],
  'content-pipeline': ['Nova Media', 'Sales Trainer', 'Nova Grant'],
};

function formatTimestamp(value?: string | null) {
  if (!value) return 'Not reported yet';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not reported yet';
  return parsed.toLocaleString();
}

function toStatusLabel(status: WorkforceStatus) {
  switch (status) {
    case 'active':
      return 'Healthy';
    case 'warning':
      return 'Warning';
    case 'issue':
      return 'Issue';
    case 'inactive':
      return 'Inactive';
    default:
      return 'Unknown';
  }
}

function statusClass(status: WorkforceStatus) {
  switch (status) {
    case 'active':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'issue':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'inactive':
      return 'border-slate-200 bg-slate-50 text-slate-500';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-500';
  }
}

function dotClass(status: WorkforceStatus) {
  switch (status) {
    case 'active':
      return 'bg-emerald-500';
    case 'warning':
      return 'bg-amber-500';
    case 'issue':
      return 'bg-rose-500';
    case 'inactive':
      return 'bg-slate-400';
    default:
      return 'bg-slate-400';
  }
}

function severityClass(status: WorkforceStatus) {
  switch (status) {
    case 'active':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'issue':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
}

function selectPath(path: string, hash: string) {
  window.history.pushState({}, '', path);
  window.location.hash = hash;
}

function matchEmployeeKey(agentName: string): string | null {
  const lowered = agentName.toLowerCase();
  const exact = AI_EMPLOYEE_REGISTRY.find((identity) => lowered.includes(identity.display_name.toLowerCase()) || lowered.includes(identity.short_label.toLowerCase()));
  if (exact) return exact.employee_key;
  if (lowered.includes('founder')) return 'Nexus Founder';
  if (lowered.includes('analyst')) return 'Nexus Analyst';
  if (lowered.includes('underwriter')) return 'Nexus Underwriter';
  if (lowered.includes('sentinel')) return 'Sentinel Scout';
  if (lowered.includes('ledger')) return 'Lex Ledger';
  if (lowered.includes('ghost')) return 'Ghost Hunter';
  if (lowered.includes('grant')) return 'Nova Grant';
  if (lowered.includes('media')) return 'Nova Media';
  if (lowered.includes('forensic')) return 'Forensic Bot';
  if (lowered.includes('trainer')) return 'Sales Trainer';
  if (lowered.includes('yield')) return 'Yield Harvester';
  if (lowered.includes('stacking')) return 'Stacking Shield';
  return null;
}

function currentActivityFor(identity: WorkforceIdentity, latestReportTitle: string, latestReportSummary: string, nextStep: string) {
  if (latestReportTitle || latestReportSummary) {
    return latestReportTitle || latestReportSummary;
  }
  return EMPLOYEE_FOCUS[identity.employee_key] || nextStep || identity.short_role_description;
}

function doesNotDoFor(identity: WorkforceIdentity) {
  return EMPLOYEE_DOES_NOT_DO[identity.employee_key] || 'Does not take on human approval, policy, or final decision responsibility.';
}

function recommendedActionForEmployee(identity: WorkforceIdentity, status: WorkforceStatus, nextStep: string, briefing: ExecutiveBriefing | null) {
  if (identity.employee_key === 'Nexus Founder') {
    return briefing?.recommendedActions[0] || nextStep || 'Review the latest briefing.';
  }
  if (status === 'issue') {
    return 'Open the detail panel and resolve the blocked dependency first.';
  }
  if (status === 'warning') {
    return 'Review the latest report and confirm the dependency path.';
  }
  return 'Open detail view for the latest summary and next action.';
}

function deriveEmployeeStatus(identity: WorkforceIdentity, dependencyStatuses: Record<string, WorkforceStatus>, activation: ReturnType<typeof useAdminActivationCenter>, briefing: ReturnType<typeof useCeoBriefingDashboard>) {
  const baseWarnings = [
    ...(activation.warnings || []),
    ...(activation.missingTables || []),
    ...(activation.summary?.blocking_issues || []),
    ...(activation.launchSummary?.readiness_checks || []).flatMap((entry) => {
      const record = entry as Record<string, unknown>;
      const status = String(record.status || record.state || '').toLowerCase();
      return status === 'blocked' || status === 'warning' ? [String(record.label || record.name || '')] : [];
    }),
  ].filter(Boolean).map((value) => String(value).toLowerCase());

  const hasDependencyIssue = (name: string) => dependencyStatuses[name] === 'issue';
  const hasDependencyWarning = (name: string) => dependencyStatuses[name] === 'warning';

  if (!identity.active) return 'inactive';

  if (identity.employee_key === 'Nexus Founder') {
    if ((activation.summary?.blocked_domains || 0) > 0 || (activation.launchSummary?.blocked_checks || 0) > 0) return 'issue';
    if ((activation.summary?.warning_domains || 0) > 0 || (briefing.briefing?.criticalAlerts?.length || 0) > 0) return 'warning';
    return 'active';
  }

  if (identity.employee_key === 'Nexus Analyst' && (hasDependencyIssue('OpenClaw') || hasDependencyWarning('OpenClaw'))) {
    return hasDependencyIssue('OpenClaw') ? 'issue' : 'warning';
  }

  if (identity.employee_key === 'Nexus Underwriter' && (baseWarnings.some((warning) => warning.includes('credential')) || baseWarnings.some((warning) => warning.includes('table')))) {
    return 'warning';
  }

  if (identity.employee_key === 'Sentinel Scout' && (hasDependencyIssue('Signal Router') || hasDependencyWarning('Signal Router') || hasDependencyIssue('Telegram'))) {
    return hasDependencyIssue('Signal Router') || hasDependencyIssue('Telegram') ? 'issue' : 'warning';
  }

  if (identity.employee_key === 'Lex Ledger' && (baseWarnings.some((warning) => warning.includes('compliance')) || baseWarnings.some((warning) => warning.includes('document')))) {
    return 'warning';
  }

  if (identity.employee_key === 'Ghost Hunter' && ((activation.summary?.active_incidents || 0) > 0 || (activation.summary?.blocking_issues || []).length > 0)) {
    return 'warning';
  }

  if (identity.employee_key === 'Nova Grant' && (baseWarnings.some((warning) => warning.includes('grant')) || baseWarnings.some((warning) => warning.includes('funding')))) {
    return 'warning';
  }

  if (identity.employee_key === 'Nova Media' && hasDependencyWarning('Content Pipeline')) {
    return 'warning';
  }

  if (identity.employee_key === 'Forensic Bot' && (baseWarnings.some((warning) => warning.includes('evidence')) || baseWarnings.some((warning) => warning.includes('table')))) {
    return 'warning';
  }

  if (identity.employee_key === 'Sales Trainer' && hasDependencyWarning('Content Pipeline')) {
    return 'warning';
  }

  if (identity.employee_key === 'Yield Harvester' || identity.employee_key === 'Stacking Shield') {
    return 'inactive';
  }

  if (identity.employee_key === 'Stacking Shield' && hasDependencyWarning('Supabase')) {
    return 'warning';
  }

  return 'active';
}

function deriveServiceStatus(identity: WorkforceIdentity, activation: ReturnType<typeof useAdminActivationCenter>, briefing: ReturnType<typeof useCeoBriefingDashboard>, dependencyStatuses: Record<string, WorkforceStatus>): WorkforceStatus {
  const summary = activation.summary;
  const controlPlane = activation.controlPlane;
  const nexusOne = activation.nexusOne;
  const launchSummary = activation.launchSummary;
  const warnings = activation.warnings || [];
  const missingTables = activation.missingTables || [];
  const briefingData = briefing.briefing;
  const highlights = briefing.recentHighlights;

  switch (identity.employee_key) {
    case 'mac-mini-worker':
      if ((nexusOne?.fresh_workers || 0) === 0 && (nexusOne?.stale_workers || 0) > 0) return 'issue';
      if ((nexusOne?.stale_workers || 0) > 0) return 'warning';
      return (nexusOne?.fresh_workers || 0) > 0 ? 'active' : 'inactive';
    case 'scheduler':
      if (controlPlane?.queue_enabled === false) return 'issue';
      if ((launchSummary?.warning_checks || 0) > 0) return 'warning';
      return 'active';
    case 'signal-router':
      if (controlPlane?.notifications_enabled === false) return 'issue';
      if ((summary?.warning_domains || 0) > 0) return 'warning';
      return 'active';
    case 'telegram-bridge':
      if (controlPlane?.notifications_enabled === false) return 'warning';
      if (warnings.some((entry) => entry.toLowerCase().includes('telegram'))) return 'issue';
      return 'active';
    case 'openclaw':
      if (warnings.some((entry) => entry.toLowerCase().includes('openclaw')) || (launchSummary?.blocked_checks || 0) > 0) return 'issue';
      if (controlPlane?.ai_jobs_enabled === false || (launchSummary?.warning_checks || 0) > 0) return 'warning';
      return 'active';
    case 'dashboard-health':
      if ((summary?.blocked_domains || 0) > 0 || (launchSummary?.blocked_checks || 0) > 0 || missingTables.length > 0) return 'issue';
      if ((summary?.warning_domains || 0) > 0 || (launchSummary?.warning_checks || 0) > 0 || warnings.length > 0) return 'warning';
      return 'active';
    case 'content-pipeline':
      if (controlPlane?.research_jobs_enabled === false) return 'warning';
      if (briefingData && highlights.length > 0) return 'active';
      return 'inactive';
    default:
      return dependencyStatuses['Dashboard Health'] === 'issue' ? 'warning' : 'active';
  }
}

function statusIndicator(status: WorkforceStatus) {
  return <span className={`inline-flex h-2.5 w-2.5 rounded-full ${dotClass(status)}`} />;
}

function authTone(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes('healthy')) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (normalized.includes('re-auth') || normalized.includes('reauth') || normalized.includes('missing')) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (normalized.includes('offline') || normalized.includes('failed')) return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export default function AdminSuperAdminCommandCenterPage() {
  const activation = useAdminActivationCenter();
  const briefing = useCeoBriefingDashboard();
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);

  const combinedLoading = activation.checkingAccess || briefing.checkingAccess;
  const isAuthorized = activation.isAuthorized && briefing.isAuthorized;

  const derivedData = useMemo(() => {
    const latestBriefing = briefing.briefing || briefing.briefings[0] || null;
    const reportFeed: ReportCard[] = [];

    if (latestBriefing) {
      reportFeed.push({
        id: latestBriefing.id,
        sourceLabel: 'Nexus Founder',
        sourceKey: 'Nexus Founder',
        title: latestBriefing.title,
        summary: latestBriefing.summary,
        severity: latestBriefing.urgency === 'critical' ? 'issue' : latestBriefing.urgency === 'high' ? 'warning' : 'active',
        timestamp: latestBriefing.createdAt,
        linkedEntity: { kind: 'employee', key: 'Nexus Founder' },
        recommendedAction: latestBriefing.recommendedActions[0] || 'Review the founder summary.',
      });
    }

    briefing.recentHighlights.slice(0, 8).forEach((highlight: AgentSummaryHighlight) => {
      const key = matchEmployeeKey(highlight.agentName) || 'Nexus Founder';
      reportFeed.push({
        id: highlight.id,
        sourceLabel: highlight.agentName,
        sourceKey: key,
        title: highlight.headline,
        summary: highlight.summary,
        severity: highlight.riskLevel === 'critical' ? 'issue' : highlight.riskLevel === 'high' ? 'warning' : highlight.status === 'failed' ? 'issue' : 'active',
        timestamp: highlight.createdAt,
        linkedEntity: { kind: 'employee', key },
        recommendedAction: highlight.status === 'failed' ? 'Open the related detail panel and review the failure.' : 'Review the latest summary and confirm the next step.',
      });
    });

    briefing.briefings.slice(0, 3).forEach((item) => {
      reportFeed.push({
        id: item.id,
        sourceLabel: 'Founder Briefing Archive',
        sourceKey: 'Nexus Founder',
        title: item.title,
        summary: item.summary,
        severity: item.urgency === 'critical' ? 'issue' : item.urgency === 'high' ? 'warning' : 'active',
        timestamp: item.createdAt,
        linkedEntity: { kind: 'employee', key: 'Nexus Founder' },
        recommendedAction: item.recommendedActions[0] || 'Review archived briefing context.',
      });
    });

    reportFeed.sort((left, right) => {
      const leftTime = new Date(left.timestamp).getTime();
      const rightTime = new Date(right.timestamp).getTime();
      return rightTime - leftTime;
    });

    const dependencyStatuses: Record<string, WorkforceStatus> = {
      Supabase: activation.summary?.blocked_domains ? 'warning' : activation.missingTables.length > 0 ? 'issue' : 'active',
      'AI provider': briefing.recentHighlights.length > 0 || briefing.briefing ? 'active' : 'warning',
      OpenClaw: 'active',
      Telegram: activation.controlPlane?.notifications_enabled === false ? 'warning' : 'active',
      Storage: activation.missingTables.length > 0 ? 'issue' : 'active',
      Scheduler: activation.controlPlane?.queue_enabled === false ? 'issue' : 'active',
      'Signal Router': activation.controlPlane?.notifications_enabled === false ? 'issue' : 'active',
      'Dashboard Health': 'active',
      'Content Pipeline': activation.controlPlane?.research_jobs_enabled === false ? 'warning' : 'active',
    };

    dependencyStatuses.OpenClaw = deriveServiceStatus(
      AI_RUNTIME_SERVICE_REGISTRY.find((entry) => entry.employee_key === 'openclaw') || AI_RUNTIME_SERVICE_REGISTRY[0],
      activation,
      briefing,
      dependencyStatuses,
    );
    dependencyStatuses['Dashboard Health'] = deriveServiceStatus(
      AI_RUNTIME_SERVICE_REGISTRY.find((entry) => entry.employee_key === 'dashboard-health') || AI_RUNTIME_SERVICE_REGISTRY[0],
      activation,
      briefing,
      dependencyStatuses,
    );
    dependencyStatuses['Signal Router'] = deriveServiceStatus(
      AI_RUNTIME_SERVICE_REGISTRY.find((entry) => entry.employee_key === 'signal-router') || AI_RUNTIME_SERVICE_REGISTRY[0],
      activation,
      briefing,
      dependencyStatuses,
    );
    dependencyStatuses.Telegram = deriveServiceStatus(
      AI_RUNTIME_SERVICE_REGISTRY.find((entry) => entry.employee_key === 'telegram-bridge') || AI_RUNTIME_SERVICE_REGISTRY[0],
      activation,
      briefing,
      dependencyStatuses,
    );
    dependencyStatuses.Scheduler = deriveServiceStatus(
      AI_RUNTIME_SERVICE_REGISTRY.find((entry) => entry.employee_key === 'scheduler') || AI_RUNTIME_SERVICE_REGISTRY[0],
      activation,
      briefing,
      dependencyStatuses,
    );
    dependencyStatuses['Content Pipeline'] = deriveServiceStatus(
      AI_RUNTIME_SERVICE_REGISTRY.find((entry) => entry.employee_key === 'content-pipeline') || AI_RUNTIME_SERVICE_REGISTRY[0],
      activation,
      briefing,
      dependencyStatuses,
    );

    const employees: EmployeeCard[] = AI_EMPLOYEE_REGISTRY.slice().sort((a, b) => a.sort_order - b.sort_order).map((identity) => {
      const latestReport = reportFeed.find((item) => item.sourceKey === identity.employee_key || item.linkedEntity.key === identity.employee_key);
      const dependencies = (EMPLOYEE_DEPENDENCIES[identity.employee_key] || []).map((name) => ({
        name,
        status: dependencyStatuses[name] || 'active',
        affected: dependencyStatuses[name] === 'issue' || dependencyStatuses[name] === 'warning',
      }));
      const status = deriveEmployeeStatus(identity, dependencyStatuses, activation, briefing);
      const currentActivity = currentActivityFor(identity, latestReport?.title || '', latestReport?.summary || '', activation.summary?.next_step || '');
      const issueSummary = status === 'active'
        ? (latestReport?.severity === 'warning' ? latestReport.summary : '')
        : identity.short_role_description;
      const recommendedAction = recommendedActionForEmployee(identity, status, activation.summary?.next_step || '', briefing.briefing || latestBriefing);
      return {
        identity,
        status,
        currentActivity,
        lastActivityAt: latestReport?.timestamp || briefing.generatedAt || activation.controlPlane?.updated_at || latestBriefing?.createdAt || '',
        latestReportTitle: latestReport?.title || 'No report yet',
        latestReportSummary: latestReport?.summary || identity.short_role_description,
        issueSummary,
        recommendedAction,
        dependencies,
        recentReports: reportFeed.filter((item) => item.linkedEntity.key === identity.employee_key).slice(0, 3),
      };
    });

    const services: ServiceCard[] = AI_RUNTIME_SERVICE_REGISTRY.slice().sort((a, b) => a.sort_order - b.sort_order).map((identity) => {
      const status = deriveServiceStatus(identity, activation, briefing, dependencyStatuses);
      const openClawAuthState =
        identity.employee_key === 'openclaw'
          ? activation.controlPlane?.ai_jobs_enabled === false || (activation.warnings || []).some((entry) => entry.toLowerCase().includes('openclaw') || entry.toLowerCase().includes('auth'))
            ? 're-auth needed'
            : status === 'active'
              ? 'auth healthy'
              : 'auth unknown'
          : 'not applicable';
      const openClawLastError =
        identity.employee_key === 'openclaw'
          ? (activation.warnings || []).find((entry) => entry.toLowerCase().includes('openclaw') || entry.toLowerCase().includes('auth')) || (activation.controlPlane?.ai_jobs_enabled === false ? 'AI jobs are disabled in the control plane.' : 'No recent error in safe metadata.')
          : 'not applicable';
      const dependencyNames = {
        'mac-mini-worker': ['OpenClaw', 'Scheduler', 'Dashboard Health'],
        scheduler: ['Supabase', 'Dashboard Health'],
        'signal-router': ['Telegram', 'Supabase'],
        'telegram-bridge': ['Signal Router', 'OpenClaw'],
        openclaw: ['AI provider', 'Mac Mini Worker'],
        'dashboard-health': ['Supabase', 'Storage'],
        'content-pipeline': ['Storage', 'OpenClaw'],
      }[identity.employee_key] || [];
      return {
        identity,
        status,
        purpose: SERVICE_PURPOSES[identity.employee_key] || identity.short_role_description,
        lastHeartbeat:
          identity.employee_key === 'mac-mini-worker'
            ? activation.nexusOne?.latest_briefing_at || briefing.generatedAt
            : identity.employee_key === 'scheduler'
              ? activation.controlPlane?.updated_at || briefing.generatedAt
              : identity.employee_key === 'signal-router'
                ? briefing.generatedAt || activation.controlPlane?.updated_at
                : identity.employee_key === 'telegram-bridge'
                  ? briefing.generatedAt || activation.controlPlane?.updated_at
                  : identity.employee_key === 'openclaw'
                    ? briefing.generatedAt || activation.nexusOne?.latest_briefing_at
                    : identity.employee_key === 'dashboard-health'
                      ? activation.controlPlane?.updated_at || briefing.generatedAt
                      : briefing.generatedAt,
        issueSummary:
          status === 'issue'
            ? 'Requires immediate review.'
            : status === 'warning'
              ? 'Degraded or waiting for confirmation.'
              : 'No issues visible in safe metadata.',
        authState: openClawAuthState,
        lastError: openClawLastError,
        recommendedAction:
          status === 'issue'
            ? 'Review the dependency chain and recheck service health.'
            : status === 'warning'
              ? 'Monitor and confirm the next successful heartbeat.'
              : 'No intervention required right now.',
        dependencyImpact: SERVICE_IMPACTS[identity.employee_key] || [],
        dependencyNames,
      };
    });

    const attentionItems = [
      ...employees
        .filter((item) => item.status === 'warning' || item.status === 'issue')
        .map((item) => ({
          key: item.identity.employee_key,
          kind: 'employee' as const,
          name: item.identity.display_name,
          badge: item.identity.short_label,
          status: item.status,
          summary: item.issueSummary || item.latestReportSummary,
          action: item.recommendedAction,
          createdAt: item.lastActivityAt,
        })),
      ...services
        .filter((item) => item.status === 'warning' || item.status === 'issue')
        .map((item) => ({
          key: item.identity.employee_key,
          kind: 'runtime_service' as const,
          name: item.identity.display_name,
          badge: item.identity.short_label,
          status: item.status,
          summary: item.issueSummary,
          action: item.recommendedAction,
          createdAt: item.lastHeartbeat,
        })),
    ].sort((left, right) => {
      const rank = (status: WorkforceStatus) => (status === 'issue' ? 0 : 1);
      return rank(left.status) - rank(right.status) || new Date(right.createdAt || '').getTime() - new Date(left.createdAt || '').getTime();
    }).slice(0, 6);

    const counts = {
      totalEmployees: employees.length,
      activeEmployees: employees.filter((item) => item.status === 'active').length,
      warningEmployees: employees.filter((item) => item.status === 'warning').length,
      issueEmployees: employees.filter((item) => item.status === 'issue').length,
      inactiveEmployees: employees.filter((item) => item.status === 'inactive').length,
      runtimeHealthy: services.filter((item) => item.status === 'active').length,
      runtimeDegraded: services.filter((item) => item.status === 'warning' || item.status === 'issue').length,
      criticalDependencies: Object.values(dependencyStatuses).filter((status) => status === 'issue').length,
    };

    return {
      latestBriefing,
      employees,
      services,
      attentionItems,
      reportFeed,
      counts,
      dependencyStatuses,
    };
  }, [
    activation.summary,
    activation.controlPlane,
    activation.nexusOne,
    activation.launchSummary,
    activation.warnings,
    activation.missingTables,
    briefing.briefing,
    briefing.briefings,
    briefing.recentHighlights,
    briefing.generatedAt,
  ]);

  useEffect(() => {
    if (selectedEntity) return;
    const defaultEmployee = derivedData.employees.find((item) => item.identity.employee_key === 'Nexus Founder' && item.status !== 'inactive')
      || derivedData.employees.find((item) => item.status !== 'inactive')
      || derivedData.employees[0];
    if (defaultEmployee) {
      setSelectedEntity({ kind: 'employee', key: defaultEmployee.identity.employee_key });
    }
  }, [selectedEntity, derivedData.employees]);

  if (combinedLoading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading workforce command center...</div>;
  }

  if (!isAuthorized) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Unauthorized</p>
          <h1 className="mt-2 text-xl font-black tracking-tight text-slate-900">Internal workforce review access required</h1>
          <p className="mt-3 text-sm text-slate-600">This route is reserved for internal/admin users only.</p>
          <p className="mt-2 text-xs text-slate-500">Signed in role: {String(activation.user?.role || briefing.user?.role || 'unknown')}</p>
        </div>
      </div>
    );
  }

  const selectedEmployee = selectedEntity?.kind === 'employee'
    ? derivedData.employees.find((item) => item.identity.employee_key === selectedEntity.key)
    : undefined;
  const selectedService = selectedEntity?.kind === 'runtime_service'
    ? derivedData.services.find((item) => item.identity.employee_key === selectedEntity.key)
    : undefined;
  const selectedReport = selectedEntity?.kind === 'employee' && selectedEntity.key === 'Nexus Founder'
    ? derivedData.latestBriefing
    : null;
  const activeSelection = selectedEmployee || selectedService;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 text-slate-100">
      <div className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f7fbff_46%,#f8fafc_100%)] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="max-w-4xl">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">AI Employee Command Center</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Workforce visibility for SuperAdmin and Founder</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              A calm review layer for named AI employees, runtime services, recent reports, and the dependencies affecting them. This surface stays summary-first and does not depend on live AI chat calls to render.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-700"
              onClick={() => selectPath('/admin/ceo-briefing', 'admin_ceo_briefing')}
            >
              Open Founder
            </button>
            <button
              type="button"
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
              onClick={() => { void Promise.all([activation.refresh(), briefing.refresh()]); }}
              disabled={activation.refreshing || briefing.refreshing}
            >
              {activation.refreshing || briefing.refreshing ? 'Refreshing...' : 'Refresh Workforce'}
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <SummaryCard icon={<Users className="h-4 w-4" />} label="Total Employees" value={derivedData.counts.totalEmployees} tone="blue" />
          <SummaryCard icon={<Activity className="h-4 w-4" />} label="Active" value={derivedData.counts.activeEmployees} tone="emerald" />
          <SummaryCard icon={<ShieldAlert className="h-4 w-4" />} label="Warnings" value={derivedData.counts.warningEmployees} tone="amber" />
          <SummaryCard icon={<AlertTriangle className="h-4 w-4" />} label="Issues" value={derivedData.counts.issueEmployees} tone="rose" />
          <SummaryCard icon={<Server className="h-4 w-4" />} label="Runtime Healthy" value={derivedData.counts.runtimeHealthy} tone="teal" />
          <SummaryCard icon={<Sparkles className="h-4 w-4" />} label="Critical Dependencies" value={derivedData.counts.criticalDependencies} tone="violet" />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-medium text-slate-500">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1">Inactive employees: {derivedData.counts.inactiveEmployees}</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1">Runtime degraded: {derivedData.counts.runtimeDegraded}</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1">Latest briefing: {derivedData.latestBriefing?.title || 'No briefing yet'}</span>
        </div>
      </div>

      {activation.error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{activation.error}</div> : null}
      {briefing.error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{briefing.error}</div> : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">AI Employees</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">Named employees and their latest review state</h2>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">Each card shows identity, current activity, latest report, and the dependency path that may be shaping the status.</p>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {derivedData.employees.map((employee) => (
                <button
                  key={employee.identity.employee_key}
                  type="button"
                  onClick={() => setSelectedEntity({ kind: 'employee', key: employee.identity.employee_key })}
                  className={`rounded-[1.5rem] border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${selectedEntity?.kind === 'employee' && selectedEntity.key === employee.identity.employee_key ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200 bg-slate-50'}`}
                >
                  <div className="flex items-start gap-4">
                    <AiEmployeeIcon employee={employee.identity.employee_key as AiEmployeeKey} size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-slate-950">{employee.identity.display_name}</h3>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${statusClass(employee.status)}`}>
                          {statusIndicator(employee.status)}
                          {toStatusLabel(employee.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{employee.identity.short_role_description}</p>
                      <p className="mt-3 text-sm font-medium text-slate-700">{employee.currentActivity}</p>
                      <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                        <span className="inline-flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" /> {formatTimestamp(employee.lastActivityAt)}</span>
                        <span className="inline-flex items-center gap-2"><FileText className="h-3.5 w-3.5" /> {employee.latestReportTitle}</span>
                      </div>
                      {employee.issueSummary ? <p className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">{employee.issueSummary}</p> : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {employee.dependencies.slice(0, 3).map((dependency) => (
                          <span key={dependency.name} className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${severityClass(dependency.status)}`}>
                            {statusIndicator(dependency.status)}
                            {dependency.name}
                          </span>
                        ))}
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-slate-500">View details and dependency impact</span>
                        <span className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-[0.18em] text-blue-600">
                          View details <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Runtime Services</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">Mac Mini and backend services</h2>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">These are the system dependencies that can affect multiple employees. OpenClaw is tracked as a first-class runtime service here.</p>
            </div>

            <div className="mt-5 space-y-3">
              {derivedData.services.map((service) => (
                <button
                  key={service.identity.employee_key}
                  type="button"
                  onClick={() => setSelectedEntity({ kind: 'runtime_service', key: service.identity.employee_key })}
                  className={`w-full rounded-[1.5rem] border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${selectedEntity?.kind === 'runtime_service' && selectedEntity.key === service.identity.employee_key ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200 bg-slate-50'}`}
                >
                  <div className="flex items-start gap-4">
                    <AiEmployeeIcon employee={service.identity.employee_key} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-slate-950">{service.identity.display_name}</h3>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${statusClass(service.status)}`}>
                          {statusIndicator(service.status)}
                          {toStatusLabel(service.status)}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                          {service.identity.role_type}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{service.purpose}</p>
                      <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                        <span className="inline-flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" /> {formatTimestamp(service.lastHeartbeat)}</span>
                        <span className="inline-flex items-center gap-2"><Activity className="h-3.5 w-3.5" /> {service.issueSummary}</span>
                      </div>
                      {service.identity.employee_key === 'openclaw' ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${authTone(service.authState)}`}>
                            {service.authState}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                            Last error: {service.lastError}
                          </span>
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {service.dependencyNames.slice(0, 3).map((dependency) => (
                          <span key={dependency} className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${severityClass((service.identity.employee_key === 'openclaw' && dependency === 'OpenClaw') ? service.status : derivedData.dependencyStatuses[dependency] || 'active')}`}>
                            {statusIndicator(derivedData.dependencyStatuses[dependency] || 'active')}
                            {dependency}
                          </span>
                        ))}
                      </div>
                      <p className="mt-3 text-sm text-slate-600">Impact: {service.dependencyImpact.slice(0, 3).join(' · ')}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Recent Reports</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">Stored summaries and worker outputs</h2>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">These reports are derived from stored briefings and employee summary outputs. They keep the review flow fast and avoid live chat dependency.</p>
            </div>

            <div className="mt-5 grid gap-3">
              {derivedData.reportFeed.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">No recent reports are visible yet.</div>
              ) : null}
              {derivedData.reportFeed.slice(0, 6).map((report) => (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => setSelectedEntity(report.linkedEntity)}
                  className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
                >
                  <div className="flex items-start gap-4">
                    <AiEmployeeIcon employee={report.sourceKey} size={42} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-950">{report.title}</h3>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${severityClass(report.severity)}`}>
                          {statusIndicator(report.severity)}
                          {toStatusLabel(report.severity)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">Source: {report.sourceLabel}</p>
                      <p className="mt-3 text-sm leading-6 text-slate-700">{report.summary}</p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                        <span>{formatTimestamp(report.timestamp)}</span>
                        <span className="font-semibold text-blue-600">{report.recommendedAction}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Founder Summary Tie-In</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">Executive summary feed</h2>
              </div>
              <Crown className="h-5 w-5 text-indigo-600" />
            </div>
            <div className="mt-4 rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_100%)] p-4">
              <div className="text-sm font-semibold text-slate-950">{derivedData.latestBriefing?.title || 'No founder summary yet'}</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{derivedData.latestBriefing?.summary || 'Founder summary will surface the latest AI-prepared blockers, approvals, and next actions here.'}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">Blockers: {(activation.summary?.blocking_issues || []).length}</span>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">Alerts: {derivedData.attentionItems.length}</span>
              </div>
              <button
                type="button"
                className="mt-4 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-blue-600"
                onClick={() => selectPath('/admin/ceo-briefing', 'admin_ceo_briefing')}
              >
                Open Founder briefing <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Needs Attention</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">Warnings and issues first</h2>
              </div>
              <ShieldAlert className="h-5 w-5 text-amber-600" />
            </div>

            <div className="mt-4 space-y-3">
              {derivedData.attentionItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">No employees or services need attention right now.</div>
              ) : null}
              {derivedData.attentionItems.map((item) => (
                <button
                  key={`${item.kind}-${item.key}`}
                  type="button"
                  onClick={() => setSelectedEntity({ kind: item.kind, key: item.key })}
                  className="w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <AiEmployeeIcon employee={item.key} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-950">{item.name}</div>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] ${severityClass(item.status)}`}>
                          {statusIndicator(item.status)}
                          {toStatusLabel(item.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{item.summary}</p>
                      <p className="mt-2 text-xs font-semibold text-blue-600">{item.action}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Detail Panel</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">{activeSelection?.identity.display_name || 'Select an employee or service'}</h2>
              </div>
              {activeSelection ? (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${statusClass(activeSelection.status)}`}>
                  {statusIndicator(activeSelection.status)}
                  {toStatusLabel(activeSelection.status)}
                </span>
              ) : null}
            </div>

            {activeSelection ? (
              <div className="mt-4 space-y-4">
                <div className="flex items-start gap-4 rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_100%)] p-4">
                  <AiEmployeeIcon employee={activeSelection.identity.employee_key} size={56} />
                  <div className="min-w-0 flex-1">
                    <div className="text-lg font-semibold text-slate-950">{activeSelection.identity.short_label}</div>
                    <p className="mt-1 text-sm text-slate-500">{activeSelection.identity.short_role_description}</p>
                    <p className="mt-3 text-sm font-medium text-slate-700">
                      {selectedEmployee ? selectedEmployee.currentActivity : selectedService?.purpose || 'No activity summary available.'}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <InfoTile label="Last activity" value={selectedEmployee ? formatTimestamp(selectedEmployee.lastActivityAt) : formatTimestamp(selectedService?.lastHeartbeat)} />
                  <InfoTile label="Recommended next step" value={selectedEmployee ? selectedEmployee.recommendedAction : selectedService?.recommendedAction || 'Monitor and confirm health.'} />
                </div>

                {selectedService?.identity.employee_key === 'openclaw' ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <InfoTile label="Auth state" value={selectedService.authState} />
                    <InfoTile label="Last error" value={selectedService.lastError} />
                  </div>
                ) : null}

                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">What this does</div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">{selectedEmployee ? EMPLOYEE_FOCUS[selectedEmployee.identity.employee_key] || selectedEmployee.identity.short_role_description : selectedService?.purpose}</div>
                  <div className="mt-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">What this does not do</div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">{selectedEmployee ? doesNotDoFor(selectedEmployee.identity) : 'Does not replace human review, billing, or policy decisions.'}</div>
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Dependencies</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(selectedEmployee?.dependencies || selectedService?.dependencyNames.map((name) => ({
                      name,
                      status: derivedData.dependencyStatuses[name] || 'active',
                      affected: derivedData.dependencyStatuses[name] === 'issue' || derivedData.dependencyStatuses[name] === 'warning',
                    })) || []).map((dependency) => (
                      <span key={dependency.name} className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${severityClass(dependency.status)}`}>
                        {statusIndicator(dependency.status)}
                        {dependency.name}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Recent reports</div>
                  <div className="mt-3 space-y-3">
                    {selectedEmployee?.recentReports.length || selectedReport ? null : (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-500">No recent reports were matched to this selection yet.</div>
                    )}
                    {selectedEmployee?.recentReports.slice(0, 2).map((report) => (
                      <button
                        key={report.id}
                        type="button"
                        onClick={() => setSelectedEntity(report.linkedEntity)}
                        className="w-full rounded-xl border border-white bg-white px-4 py-3 text-left"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-slate-900">{report.title}</div>
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] ${severityClass(report.severity)}`}>
                            {statusIndicator(report.severity)}
                            {toStatusLabel(report.severity)}
                          </span>
                        </div>
                        <div className="mt-2 text-sm text-slate-600">{report.summary}</div>
                      </button>
                    ))}
                    {selectedReport ? (
                      <div className="rounded-xl border border-white bg-white px-4 py-3">
                        <div className="text-sm font-semibold text-slate-900">{selectedReport.title}</div>
                        <p className="mt-2 text-sm text-slate-600">{selectedReport.summary}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">Select a card to open a review-first detail panel.</div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'blue' | 'emerald' | 'amber' | 'rose' | 'teal' | 'violet' }) {
  const toneClass = {
    blue: 'border-blue-100 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    rose: 'border-rose-100 bg-rose-50 text-rose-700',
    teal: 'border-teal-100 bg-teal-50 text-teal-700',
    violet: 'border-violet-100 bg-violet-50 text-violet-700',
  }[tone];

  return (
    <div className={`rounded-[1.5rem] border px-4 py-4 ${toneClass}`}>
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-white/70 bg-white/80 p-2 text-current shadow-sm">{icon}</div>
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-80">{label}</div>
          <div className="mt-1 text-3xl font-black tracking-tight text-slate-950">{value}</div>
        </div>
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{label}</div>
      <div className="mt-2 text-sm leading-6 text-slate-800">{value}</div>
    </div>
  );
}
