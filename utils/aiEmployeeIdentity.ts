// Centralized mapping for Nexus workforce identity, colors, and safe visibility metadata.

export type WorkforceCategory = 'employee' | 'runtime_service';
export type WorkforceVisibility = 'client' | 'admin' | 'internal';

export type AiEmployeeKey =
  | 'Nexus Founder'
  | 'Nexus Analyst'
  | 'Nexus Underwriter'
  | 'Sentinel Scout'
  | 'Lex Ledger'
  | 'Ghost Hunter'
  | 'Nova Grant'
  | 'Nova Media'
  | 'Forensic Bot'
  | 'Sales Trainer'
  | 'Yield Harvester'
  | 'Stacking Shield';

export type RuntimeServiceKey =
  | 'mac-mini-worker'
  | 'scheduler'
  | 'signal-router'
  | 'telegram-bridge'
  | 'openclaw'
  | 'dashboard-health'
  | 'content-pipeline';

export type WorkforceStatus = 'active' | 'warning' | 'issue' | 'inactive' | 'unknown';

export interface WorkforceIdentity {
  employee_key: string;
  display_name: string;
  short_label: string;
  role_type: string;
  category: WorkforceCategory;
  visibility: WorkforceVisibility;
  icon_key: string;
  primary_color: string;
  accent_color: string;
  fallback_initials: string;
  short_role_description: string;
  sort_order: number;
  active: boolean;
}

export interface AiEmployeeIdentity {
  key: AiEmployeeKey;
  icon: string;
  accent: string;
  fallbackInitials: string;
  semantic: string;
}

const EMPLOYEE_REGISTRY: WorkforceIdentity[] = [
  {
    employee_key: 'Nexus Founder',
    display_name: 'Nexus Founder',
    short_label: 'Founder',
    role_type: 'Executive review',
    category: 'employee',
    visibility: 'admin',
    icon_key: 'crown',
    primary_color: '#1E2E7A',
    accent_color: '#D6B25E',
    fallback_initials: 'NF',
    short_role_description: 'Executive synthesis, blockers, approvals, and next actions.',
    sort_order: 10,
    active: true,
  },
  {
    employee_key: 'Nexus Analyst',
    display_name: 'Nexus Analyst',
    short_label: 'Analyst',
    role_type: 'Insight review',
    category: 'employee',
    visibility: 'admin',
    icon_key: 'analytics',
    primary_color: '#0F7490',
    accent_color: '#53D6E0',
    fallback_initials: 'NA',
    short_role_description: 'Reviews stored summaries, trends, and operational signals.',
    sort_order: 20,
    active: true,
  },
  {
    employee_key: 'Nexus Underwriter',
    display_name: 'Nexus Underwriter',
    short_label: 'Underwriter',
    role_type: 'Risk review',
    category: 'employee',
    visibility: 'admin',
    icon_key: 'shield',
    primary_color: '#2E8B57',
    accent_color: '#8EE28E',
    fallback_initials: 'NU',
    short_role_description: 'Validates readiness, risk posture, and approval criteria.',
    sort_order: 30,
    active: true,
  },
  {
    employee_key: 'Sentinel Scout',
    display_name: 'Sentinel Scout',
    short_label: 'Sentinel',
    role_type: 'Opportunity scanning',
    category: 'employee',
    visibility: 'admin',
    icon_key: 'radar',
    primary_color: '#D97706',
    accent_color: '#FDBA74',
    fallback_initials: 'SS',
    short_role_description: 'Scans for opportunities, alerts, and early signal changes.',
    sort_order: 40,
    active: true,
  },
  {
    employee_key: 'Lex Ledger',
    display_name: 'Lex Ledger',
    short_label: 'Lex',
    role_type: 'Compliance review',
    category: 'employee',
    visibility: 'admin',
    icon_key: 'scales',
    primary_color: '#123A72',
    accent_color: '#8CB7FF',
    fallback_initials: 'LL',
    short_role_description: 'Keeps funding, compliance, and document review in bounds.',
    sort_order: 50,
    active: true,
  },
  {
    employee_key: 'Ghost Hunter',
    display_name: 'Ghost Hunter',
    short_label: 'Ghost',
    role_type: 'Follow-up recovery',
    category: 'employee',
    visibility: 'admin',
    icon_key: 'ghost',
    primary_color: '#6B7280',
    accent_color: '#E5E7EB',
    fallback_initials: 'GH',
    short_role_description: 'Finds missing context, stalled items, and blocked follow-ups.',
    sort_order: 60,
    active: true,
  },
  {
    employee_key: 'Nova Grant',
    display_name: 'Nova Grant',
    short_label: 'Grant',
    role_type: 'Grant discovery',
    category: 'employee',
    visibility: 'admin',
    icon_key: 'sparkles',
    primary_color: '#C9A227',
    accent_color: '#F8E08C',
    fallback_initials: 'NG',
    short_role_description: 'Tracks grant opportunities, matches, and ready-to-review packets.',
    sort_order: 70,
    active: true,
  },
  {
    employee_key: 'Nova Media',
    display_name: 'Nova Media',
    short_label: 'Media',
    role_type: 'Content and video',
    category: 'employee',
    visibility: 'admin',
    icon_key: 'clapperboard',
    primary_color: '#6941C6',
    accent_color: '#C4B5FD',
    fallback_initials: 'NM',
    short_role_description: 'Prepares approved educational content and training media.',
    sort_order: 80,
    active: true,
  },
  {
    employee_key: 'Forensic Bot',
    display_name: 'Forensic Bot',
    short_label: 'Forensic',
    role_type: 'Evidence review',
    category: 'employee',
    visibility: 'internal',
    icon_key: 'microscope',
    primary_color: '#4B5563',
    accent_color: '#CBD5E1',
    fallback_initials: 'FB',
    short_role_description: 'Investigates evidence quality, document integrity, and data gaps.',
    sort_order: 90,
    active: true,
  },
  {
    employee_key: 'Sales Trainer',
    display_name: 'Sales Trainer',
    short_label: 'Trainer',
    role_type: 'Enablement',
    category: 'employee',
    visibility: 'internal',
    icon_key: 'graduation-cap',
    primary_color: '#0F766E',
    accent_color: '#67E8F9',
    fallback_initials: 'ST',
    short_role_description: 'Supports internal sales playbooks and guided customer motion.',
    sort_order: 100,
    active: true,
  },
  {
    employee_key: 'Yield Harvester',
    display_name: 'Yield Harvester',
    short_label: 'Yield',
    role_type: 'Revenue review',
    category: 'employee',
    visibility: 'internal',
    icon_key: 'banknote',
    primary_color: '#14532D',
    accent_color: '#86EFAC',
    fallback_initials: 'YH',
    short_role_description: 'Reviews monetization, retention, and yield opportunities.',
    sort_order: 110,
    active: false,
  },
  {
    employee_key: 'Stacking Shield',
    display_name: 'Stacking Shield',
    short_label: 'Shield',
    role_type: 'Capital protection',
    category: 'employee',
    visibility: 'internal',
    icon_key: 'shield-stack',
    primary_color: '#1E40AF',
    accent_color: '#93C5FD',
    fallback_initials: 'SS',
    short_role_description: 'Tracks reserve-first discipline and post-funding protection.',
    sort_order: 120,
    active: false,
  },
];

const RUNTIME_SERVICE_REGISTRY: WorkforceIdentity[] = [
  {
    employee_key: 'mac-mini-worker',
    display_name: 'mac-mini-worker',
    short_label: 'Mac Mini',
    role_type: 'Runtime worker',
    category: 'runtime_service',
    visibility: 'internal',
    icon_key: 'server',
    primary_color: '#0F172A',
    accent_color: '#93C5FD',
    fallback_initials: 'MM',
    short_role_description: 'Worker host that runs Mac Mini jobs, local services, and background tasks.',
    sort_order: 10,
    active: true,
  },
  {
    employee_key: 'scheduler',
    display_name: 'scheduler',
    short_label: 'Scheduler',
    role_type: 'Job orchestration',
    category: 'runtime_service',
    visibility: 'internal',
    icon_key: 'calendar-clock',
    primary_color: '#334155',
    accent_color: '#C7D2FE',
    fallback_initials: 'SC',
    short_role_description: 'Schedules jobs, retries, and deferred workflows.',
    sort_order: 20,
    active: true,
  },
  {
    employee_key: 'signal-router',
    display_name: 'signal-router',
    short_label: 'Router',
    role_type: 'Signal routing',
    category: 'runtime_service',
    visibility: 'internal',
    icon_key: 'git-branch',
    primary_color: '#1D4ED8',
    accent_color: '#A5B4FC',
    fallback_initials: 'SR',
    short_role_description: 'Routes alerts, messages, and service signals across systems.',
    sort_order: 30,
    active: true,
  },
  {
    employee_key: 'telegram-bridge',
    display_name: 'telegram bridge',
    short_label: 'Telegram',
    role_type: 'Messaging bridge',
    category: 'runtime_service',
    visibility: 'internal',
    icon_key: 'messages',
    primary_color: '#0EA5E9',
    accent_color: '#7DD3FC',
    fallback_initials: 'TB',
    short_role_description: 'Connects bot, chat, and routing state for operator messaging.',
    sort_order: 40,
    active: true,
  },
  {
    employee_key: 'openclaw',
    display_name: 'OpenClaw',
    short_label: 'OpenClaw',
    role_type: 'Local assistant',
    category: 'runtime_service',
    visibility: 'internal',
    icon_key: 'bot',
    primary_color: '#4F46E5',
    accent_color: '#C4B5FD',
    fallback_initials: 'OC',
    short_role_description: 'Local assistant runtime on the Mac Mini and fallback operator surface.',
    sort_order: 50,
    active: true,
  },
  {
    employee_key: 'dashboard-health',
    display_name: 'dashboard/health service',
    short_label: 'Health',
    role_type: 'Health metadata',
    category: 'runtime_service',
    visibility: 'admin',
    icon_key: 'activity',
    primary_color: '#047857',
    accent_color: '#6EE7B7',
    fallback_initials: 'DH',
    short_role_description: 'Aggregates safe health metadata and dashboard readiness signals.',
    sort_order: 60,
    active: true,
  },
  {
    employee_key: 'content-pipeline',
    display_name: 'content pipeline service',
    short_label: 'Content',
    role_type: 'Content generation',
    category: 'runtime_service',
    visibility: 'internal',
    icon_key: 'file-scan',
    primary_color: '#7C3AED',
    accent_color: '#DDD6FE',
    fallback_initials: 'CP',
    short_role_description: 'Prepares approved training, content, and summary artifacts.',
    sort_order: 70,
    active: true,
  },
];

export const AI_EMPLOYEE_REGISTRY = EMPLOYEE_REGISTRY;
export const AI_RUNTIME_SERVICE_REGISTRY = RUNTIME_SERVICE_REGISTRY;

const EMPLOYEE_MAP = new Map(EMPLOYEE_REGISTRY.map((entry) => [entry.employee_key, entry]));
const RUNTIME_SERVICE_MAP = new Map(RUNTIME_SERVICE_REGISTRY.map((entry) => [entry.employee_key, entry]));

export const AI_EMPLOYEE_IDENTITIES: Record<AiEmployeeKey, AiEmployeeIdentity> = {
  'Nexus Founder': mapEmployee('Nexus Founder'),
  'Nexus Analyst': mapEmployee('Nexus Analyst'),
  'Nexus Underwriter': mapEmployee('Nexus Underwriter'),
  'Sentinel Scout': mapEmployee('Sentinel Scout'),
  'Lex Ledger': mapEmployee('Lex Ledger'),
  'Ghost Hunter': mapEmployee('Ghost Hunter'),
  'Nova Grant': mapEmployee('Nova Grant'),
  'Nova Media': mapEmployee('Nova Media'),
  'Forensic Bot': mapEmployee('Forensic Bot'),
  'Sales Trainer': mapEmployee('Sales Trainer'),
  'Yield Harvester': mapEmployee('Yield Harvester'),
  'Stacking Shield': mapEmployee('Stacking Shield'),
};

function mapEmployee(key: AiEmployeeKey): AiEmployeeIdentity {
  const entry = EMPLOYEE_MAP.get(key);
  if (!entry) {
    return {
      key,
      icon: 'crown',
      accent: '#4A7AE8',
      fallbackInitials: String(key || '')
        .split(' ')
        .map((part) => part[0] || '')
        .join('')
        .slice(0, 2)
        .toUpperCase(),
      semantic: 'executive review',
    };
  }

  return {
    key,
    icon: entry.icon_key,
    accent: entry.accent_color,
    fallbackInitials: entry.fallback_initials,
    semantic: entry.short_role_description,
  };
}

export function getAiEmployeeIdentity(key: AiEmployeeKey): AiEmployeeIdentity {
  return AI_EMPLOYEE_IDENTITIES[key];
}

export function getWorkforceIdentity(employeeKey: string): WorkforceIdentity | null {
  return EMPLOYEE_MAP.get(employeeKey) || RUNTIME_SERVICE_MAP.get(employeeKey) || null;
}

export function getRuntimeServiceIdentity(key: RuntimeServiceKey): WorkforceIdentity {
  return RUNTIME_SERVICE_MAP.get(key) || {
    employee_key: key,
    display_name: key,
    short_label: key,
    role_type: 'Runtime service',
    category: 'runtime_service',
    visibility: 'internal',
    icon_key: 'server',
    primary_color: '#334155',
    accent_color: '#CBD5E1',
    fallback_initials: String(key || '')
      .split('-')
      .map((part) => part[0] || '')
      .join('')
      .slice(0, 2)
      .toUpperCase(),
    short_role_description: 'Runtime service',
    sort_order: 999,
    active: false,
  };
}

export function allEmployeeIdentities() {
  return [...EMPLOYEE_REGISTRY].sort((a, b) => a.sort_order - b.sort_order);
}

export function allRuntimeServiceIdentities() {
  return [...RUNTIME_SERVICE_REGISTRY].sort((a, b) => a.sort_order - b.sort_order);
}
