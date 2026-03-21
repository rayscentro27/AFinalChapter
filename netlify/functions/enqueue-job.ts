import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export default async (req: any, context: any) => {
  if (req.method !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  if (!supabaseUrl || !supabaseKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Supabase configuration missing' }),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = JSON.parse(req.body || '{}');
    const { job_type, payload, tenant_id } = body;

    if (!job_type || !payload || !tenant_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields: job_type, payload, tenant_id' }),
      };
    }

    // Validate job_type
    const validJobTypes = ['sentiment_triage', 'neural_scout_batch', 'scenario_runner', 'commission_settler', 'merge_executor'];
    if (!validJobTypes.includes(job_type)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Invalid job_type. Must be one of: ${validJobTypes.join(', ')}` }),
      };
    }

    // Insert job into queue
    const { data, error } = await supabase
      .from('job_queue')
      .insert({
        tenant_id,
        job_type,
        payload,
        status: 'pending',
      })
      .select('id, tenant_id, job_type, status, created_at')
      .single();

    if (error) {
      console.error('Job insert failed', { error: error.message, job_type, tenant_id });
      return {
        statusCode: 500,
        body: JSON.stringify({ error: `Job insert failed: ${error.message}` }),
      };
    }

    console.log('Job enqueued successfully', { job_id: data?.id, job_type, tenant_id });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        job_id: data?.id,
        job_type,
        tenant_id,
        status: 'enqueued',
        created_at: data?.created_at,
      }),
    };
  } catch (error) {
    console.error('Enqueue job error', { error: error instanceof Error ? error.message : String(error) });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String(error instanceof Error ? error.message : error) }),
    };
  }
};
