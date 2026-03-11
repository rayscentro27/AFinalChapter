export async function runEmployee(
  employee: string,
  user_message: string,
  context?: unknown,
  mode: 'simulated' | 'live' = 'simulated',
  options?: {
    approval_mode?: boolean;
    client_id?: string;
  }
) {
  const res = await fetch('/.netlify/functions/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      employee,
      user_message,
      context,
      mode,
      approval_mode: options?.approval_mode,
      client_id: options?.client_id,
    }),
  });

  if (!res.ok) throw new Error(await res.text());

  return res.json() as Promise<{
    employee: string;
    version: number;
    tool_requests: Array<{ name: string; args: Record<string, unknown>; reason: string }>;
    final_answer: string;
    cached?: boolean;
  }>;
}
