export async function runEmployee(
  employee: string,
  user_message: string,
  context?: unknown,
  mode: "simulated" | "live" = "simulated"
) {
  const res = await fetch("/.netlify/functions/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employee, user_message, context, mode }),
  });

  if (!res.ok) throw new Error(await res.text());

  return res.json() as Promise<{
    employee: string;
    version: number;
    tool_requests: Array<{ name: string; args: Record<string, unknown>; reason: string }>;
    final_answer: string;
  }>;
}
