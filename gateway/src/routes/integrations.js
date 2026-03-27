// gateway/src/routes/integrations.js
// Integration Manager API endpoints for Nexus

const express = require('express');
const router = express.Router();

// Mock provider adapters (replace with real logic as needed)
const adapters = {
  'supabase-database': { status: 'ready', lastChecked: new Date(), description: 'Supabase Database' },
  'supabase-storage': { status: 'ready', lastChecked: new Date(), description: 'Supabase Storage' },
  'fastify-api': { status: 'ready', lastChecked: new Date(), description: 'Oracle VM Fastify API' },
  'netlify-portal': { status: 'ready', lastChecked: new Date(), description: 'Netlify Client Portal' },
  'ai-provider': { status: 'ready', lastChecked: new Date(), description: 'AI Provider / Model Router' },
  'telegram': { status: 'not_ready', lastChecked: new Date(), description: 'Telegram' },
  'email': { status: 'ready', lastChecked: new Date(), description: 'Email' },
  'calendar': { status: 'not_ready', lastChecked: new Date(), description: 'Calendar' },
};

// GET /api/integrations
router.get('/', (req, res) => {
  res.json({ providers: Object.keys(adapters) });
});

// GET /api/integrations/:provider/status
router.get('/:provider/status', (req, res) => {
  const provider = req.params.provider;
  if (!adapters[provider]) return res.status(404).json({ error: 'Provider not found' });
  res.json({ ...adapters[provider], provider });
});

// GET /api/integrations/summary
router.get('/summary', (req, res) => {
  const summary = Object.entries(adapters).map(([provider, meta]) => ({ provider, ...meta }));
  res.json({ summary });
});

// GET /api/integrations/readiness
router.get('/readiness', (req, res) => {
  // Example readiness logic
  const coreReady = adapters['supabase-database'].status === 'ready' && adapters['supabase-storage'].status === 'ready';
  const aiReady = adapters['ai-provider'].status === 'ready';
  const portalReady = adapters['netlify-portal'].status === 'ready';
  const notificationsReady = adapters['email'].status === 'ready' || adapters['telegram'].status === 'ready';
  const knowledgeLayerReady = coreReady && aiReady;
  let overall = 'not_ready';
  if (coreReady && aiReady && portalReady && notificationsReady) overall = 'ready_to_launch';
  else if (coreReady && aiReady) overall = 'partially_ready';
  res.json({
    core_services: coreReady,
    ai_access: aiReady,
    client_portal: portalReady,
    notifications: notificationsReady,
    knowledge_layer: knowledgeLayerReady,
    overall,
    blocking: Object.entries(adapters).filter(([_, meta]) => meta.status !== 'ready').map(([provider]) => provider),
    warnings: [],
    next_action: overall === 'ready_to_launch' ? 'Launch system' : 'Connect missing services',
  });
});

module.exports = router;
