import { createClient } from '@supabase/supabase-js';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function asText(value: unknown) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function isMissingSchema(error: any) {
  const message = String(error?.message || '').toLowerCase();
  return (
    (message.includes('relation') && message.includes('does not exist'))
    || (message.includes('column') && message.includes('does not exist'))
    || (message.includes('could not find the table') && message.includes('schema cache'))
  );
}

function json(res: any, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function getHeader(headers: Record<string, string | string[] | undefined>, name: string) {
  const target = String(name || '').toLowerCase();
  const hit = Object.entries(headers || {}).find(([key]) => String(key || '').toLowerCase() === target)?.[1];
  return Array.isArray(hit) ? String(hit[0] || '').trim() : String(hit || '').trim();
}

function createAuthedSupabaseClient(env: Record<string, string>, authHeader: string) {
  const supabaseUrl = String(env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim();
  const anonKey = String(env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '').trim();

  if (!supabaseUrl || !anonKey) {
    throw new Error('Missing Supabase env for local function shim');
  }

  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function queryRows(query: PromiseLike<{ data?: unknown; error?: any }>) {
  const { data, error } = await query;
  return { rows: Array.isArray(data) ? data : [], error: error || null };
}

function buildPortalStrategyQuery(base: any, tenantId: string, opts: { status?: string; symbol?: string; limit: number }) {
  const now = new Date().toISOString();
  let query = base
    .eq('tenant_id', tenantId)
    .eq('approval_status', 'approved')
    .eq('is_published', true)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('rank', { ascending: true })
    .limit(opts.limit);

  if (opts.status) query = query.eq('status', opts.status);
  if (opts.symbol) query = query.eq('symbol', opts.symbol);

  return query;
}

async function handleListNotifications(req: any, res: any, env: Record<string, string>, url: URL) {
  try {
    const tenantId = asText(url.searchParams.get('tenant_id'));
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 50)));
    if (!tenantId) return json(res, 400, { error: 'tenant_id required' });

    const supabase = createAuthedSupabaseClient(env, getHeader(req.headers, 'authorization'));
    const { rows, error } = await queryRows(
      supabase
        .from('tenant_notifications')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit),
    );

    if (error && !isMissingSchema(error)) {
      return json(res, Number(error?.statusCode) || 400, { error: String(error?.message || 'notifications query failed') });
    }

    return json(res, 200, { ok: true, tenant_id: tenantId, notifications: rows });
  } catch (error: any) {
    return json(res, Number(error?.statusCode) || 400, { error: String(error?.message || 'bad_request') });
  }
}

async function handleListClientTasks(req: any, res: any, env: Record<string, string>, url: URL) {
  try {
    const tenantId = asText(url.searchParams.get('tenant_id'));
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 100)));
    if (!tenantId) return json(res, 400, { error: 'tenant_id required' });

    const supabase = createAuthedSupabaseClient(env, getHeader(req.headers, 'authorization'));
    const { rows, error } = await queryRows(
      supabase
        .from('client_tasks')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('group_key', { ascending: true, nullsFirst: true } as any)
        .order('due_date', { ascending: true })
        .limit(limit),
    );

    if (error && !isMissingSchema(error)) {
      return json(res, Number(error?.statusCode) || 400, { error: String(error?.message || 'client tasks query failed') });
    }

    return json(res, 200, { ok: true, tenant_id: tenantId, tasks: rows });
  } catch (error: any) {
    return json(res, Number(error?.statusCode) || 400, { error: String(error?.message || 'bad_request') });
  }
}

async function handleResearchProxy(req: any, res: any, env: Record<string, string>, url: URL) {
  try {
    const endpoint = asText(url.searchParams.get('endpoint'));
    const tenantId = asText(url.searchParams.get('tenant_id'));
    if (!endpoint) return json(res, 400, { ok: false, error: 'endpoint required' });
    if (!tenantId) return json(res, 400, { ok: false, error: 'tenant_id required' });

    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 10)));
    const status = asText(url.searchParams.get('status'));
    const symbol = asText(url.searchParams.get('symbol'));
    const agentRole = asText(url.searchParams.get('agent_role'));
    const supabase = createAuthedSupabaseClient(env, getHeader(req.headers, 'authorization'));

    if (endpoint === 'strategy-rankings' || endpoint === 'options-rankings') {
      const viewName = endpoint === 'strategy-rankings' ? 'v_research_strategy_rankings' : 'v_research_options_rankings';
      const { rows, error } = await queryRows(
        buildPortalStrategyQuery(
          supabase.from(viewName).select('*'),
          tenantId,
          { status, symbol, limit },
        ),
      );

      if (error && !isMissingSchema(error)) {
        return json(res, Number(error?.statusCode) || 500, { ok: false, error: String(error?.message || `${endpoint} query failed`) });
      }

      return json(res, 200, { ok: true, count: rows.length, items: rows });
    }

    if (endpoint === 'agent-scorecards') {
      let query = supabase
        .from('agent_scorecards')
        .select('id,tenant_id,agent_name,agent_role,score,decision_accuracy,confidence_calibration_score,throughput,status,decision,confidence_band,snapshot_window,notes,created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (agentRole) query = query.eq('agent_role', agentRole);

      const { rows, error } = await queryRows(query);
      if (error && !isMissingSchema(error)) {
        return json(res, Number(error?.statusCode) || 500, { ok: false, error: String(error?.message || 'agent scorecards query failed') });
      }

      return json(res, 200, { ok: true, count: rows.length, items: rows });
    }

    if (endpoint === 'recent-hypotheses') {
      const { rows, error } = await queryRows(
        supabase
          .from('research_hypotheses')
          .select('id,tenant_id,hypothesis_key,cluster_id,strategy_id,asset_type,symbol,hypothesis,status,decision,approval_status,confidence_band,notes,created_at')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(limit),
      );

      if (error && !isMissingSchema(error)) {
        return json(res, Number(error?.statusCode) || 500, { ok: false, error: String(error?.message || 'recent hypotheses query failed') });
      }

      return json(res, 200, { ok: true, count: rows.length, items: rows });
    }

    if (endpoint === 'coverage-gaps') {
      let query = supabase
        .from('coverage_gaps')
        .select('id,tenant_id,gap_key,strategy_id,asset_type,symbol,status,decision,approval_status,confidence_band,gap_type,priority,notes,created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status) query = query.eq('status', status);

      const { rows, error } = await queryRows(query);
      if (error && !isMissingSchema(error)) {
        return json(res, Number(error?.statusCode) || 500, { ok: false, error: String(error?.message || 'coverage gaps query failed') });
      }

      return json(res, 200, { ok: true, count: rows.length, items: rows });
    }

    if (endpoint === 'summary') {
      const [strategyRes, optionsRes, scoreRes, hypothesisRes, gapRes] = await Promise.all([
        queryRows(
          buildPortalStrategyQuery(
            supabase.from('v_research_strategy_rankings').select('strategy_id,asset_type,symbol,timeframe,trades_total,win_rate,profit_factor,net_pnl,confidence_band,status,rank,created_at'),
            tenantId,
            { status, symbol, limit: 5 },
          ),
        ),
        queryRows(
          buildPortalStrategyQuery(
            supabase.from('v_research_options_rankings').select('strategy_id,symbol,underlying_symbol,structure_type,trades_total,win_rate,profit_factor,net_pnl,confidence_band,status,rank,created_at'),
            tenantId,
            { status, symbol, limit: 5 },
          ),
        ),
        queryRows(
          supabase
            .from('v_research_agent_scorecards_latest')
            .select('agent_name,agent_role,score,decision_accuracy,confidence_calibration_score,throughput,status,decision,confidence_band,created_at')
            .eq('tenant_id', tenantId)
            .order('score', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })
            .limit(50),
        ),
        queryRows(
          supabase
            .from('research_hypotheses')
            .select('id,hypothesis_key,strategy_id,asset_type,symbol,hypothesis,status,decision,confidence_band,created_at')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(5),
        ),
        queryRows(
          supabase
            .from('coverage_gaps')
            .select('id,gap_key,strategy_id,asset_type,symbol,status,decision,confidence_band,gap_type,priority,created_at')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(5),
        ),
      ]);

      const firstError = strategyRes.error || optionsRes.error || scoreRes.error || hypothesisRes.error || gapRes.error;
      if (firstError && !isMissingSchema(firstError)) {
        return json(res, 500, { ok: false, error: String(firstError?.message || 'research summary query failed') });
      }

      return json(res, 200, {
        ok: true,
        top_forex_strategies: strategyRes.rows,
        top_options_structures: optionsRes.rows,
        analyst_score: null,
        risk_office_score: null,
        latest_hypotheses: hypothesisRes.rows,
        latest_gaps: gapRes.rows,
        agent_scorecards: scoreRes.rows,
      });
    }

    return json(res, 400, { ok: false, error: `unsupported endpoint: ${endpoint}` });
  } catch (error: any) {
    return json(res, Number(error?.statusCode) || 400, { ok: false, error: String(error?.message || 'bad_request') });
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      {
        name: 'local-netlify-function-shim',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const url = new URL(req.url || '/', 'http://localhost');
            if (!url.pathname.startsWith('/.netlify/functions/')) {
              next();
              return;
            }

            if (req.method !== 'GET') {
              next();
              return;
            }

            const fn = url.pathname.split('/').pop() || '';
            if (fn === 'list_notifications') {
              await handleListNotifications(req, res, env, url);
              return;
            }

            if (fn === 'list_client_tasks') {
              await handleListClientTasks(req, res, env, url);
              return;
            }

            if (fn === 'research-proxy') {
              await handleResearchProxy(req, res, env, url);
              return;
            }

            next();
          });
        },
      },
    ],
    root: '.',
    server: {
      port: 3000,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1600,
      rollupOptions: {
        input: 'index.html',
      },
    },
  };
});
