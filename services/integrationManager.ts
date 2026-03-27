// services/integrationManager.ts
// Client for backend integration manager endpoints

export async function fetchIntegrationSummary() {
  const res = await fetch('/api/integrations/summary');
  if (!res.ok) throw new Error('Failed to fetch integration summary');
  return res.json();
}

export async function fetchIntegrationReadiness() {
  const res = await fetch('/api/integrations/readiness');
  if (!res.ok) throw new Error('Failed to fetch integration readiness');
  return res.json();
}

export async function fetchProviderStatus(provider: string) {
  const res = await fetch(`/api/integrations/${provider}/status`);
  if (!res.ok) throw new Error('Failed to fetch provider status');
  return res.json();
}
