export async function callAgent(params: {
  employee?: string;
  employees?: string[];
  arbitrate?: boolean;
  approval_mode?: boolean;
  user_message: string;
  task_context?: any;
  mode?: 'live' | 'simulated' | 'draft';
  token?: string;
  context?: any;
}) {
  const mode: 'live' | 'simulated' = params.mode === 'live' ? 'live' : 'simulated';

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (params.token) headers.Authorization = `Bearer ${params.token}`;

  const res = await fetch('/.netlify/functions/agent', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      employee: params.employee,
      employees: params.employees,
      arbitrate: params.arbitrate,
      approval_mode: params.approval_mode,
      user_message: params.user_message,
      mode,
      context: {
        ...(params.context || null),
        task_context: params.task_context || null,
      },
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as any)?.error || 'Agent call failed');
  return data;
}
