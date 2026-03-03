function healthPayload() {
  return {
    ok: true,
    service: 'nexus-gateway',
    ts: new Date().toISOString(),
  };
}

export async function healthRoutes(fastify) {
  fastify.get('/health', async () => healthPayload());
  fastify.get('/healthz', async () => healthPayload());
}
