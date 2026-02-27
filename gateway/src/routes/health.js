export async function healthRoutes(fastify) {
  fastify.get('/health', async () => ({
    ok: true,
    service: 'nexus-gateway',
    ts: new Date().toISOString(),
  }));
}
