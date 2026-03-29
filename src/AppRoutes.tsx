import React from 'react';
import CreditIntelAdmin from './pages/CreditIntelAdmin';
import AdminChannelMapper from './pages/AdminChannelMapper';
import AdminContactsMerge from './pages/AdminContactsMerge';
import AdminMergeJobs from './pages/AdminMergeJobs';
import AdminMergeQueue from './pages/AdminMergeQueue';
import AdminTeamMembers from './pages/AdminTeamMembers';
import AdminOnCall from './pages/AdminOnCall';
import AdminChannelPools from './pages/AdminChannelPools';
import AdminDeadLetters from './pages/AdminDeadLetters';
import AdminOutbox from './pages/AdminOutbox';
import AdminAIFunding from './pages/AdminAIFunding';

export type AppRoute = {
  key: string;
  hash: string;
  label: string;
  element: React.ReactNode;
};

export const APP_ROUTES: AppRoute[] = [
  {
    key: 'credit_intel_admin',
    hash: '#credit-intel-admin',
    label: 'Credit Intel Admin',
    element: <CreditIntelAdmin />,
  },
  {
    key: 'channel_mapper',
    hash: '#channel-mapper',
    label: 'Channel Mapper',
    element: <AdminChannelMapper />,
  },
  {
    key: 'contact_merge',
    hash: '#contact-merge',
    label: 'Contact Merge',
    element: <AdminContactsMerge />,
  },
  {
    key: 'merge_jobs',
    hash: '#merge-jobs',
    label: 'Merge Jobs',
    element: <AdminMergeJobs />,
  },
  {
    key: 'merge_queue',
    hash: '#merge-queue',
    label: 'Merge Queue',
    element: <AdminMergeQueue />,
  },
  {
    key: 'team_members',
    hash: '#team-members',
    label: 'Team Members',
    element: <AdminTeamMembers />,
  },
  {
    key: 'on_call',
    hash: '#on-call',
    label: 'On-Call',
    element: <AdminOnCall />,
  },
  {
    key: 'channel_pools',
    hash: '#channel-pools',
    label: 'Channel Pools',
    element: <AdminChannelPools />,
  },
  {
    key: 'dead_letters',
    hash: '#dead-letters',
    label: 'Dead Letters',
    element: <AdminDeadLetters />,
  },
  {
    key: 'outbox',
    hash: '#outbox',
    label: 'Outbox',
    element: <AdminOutbox />,
  },
  {
    key: 'ai_funding',
    hash: '#ai_funding',
    label: 'AI Funding',
    element: <AdminAIFunding />,
  },
];

export default APP_ROUTES;
