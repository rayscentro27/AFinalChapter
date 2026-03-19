import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { ENV } from '../env.js';
import { supabaseAdmin } from '../supabase.js';
import { requireTenantRole } from '../lib/auth/requireTenantRole.js';
import { requireTenantPermission } from '../lib/auth/requireTenantPermission.js';
import { evaluatePolicy } from '../lib/policy/policyEngine.js';
import { ADMIN_RATE_LIMIT } from '../util/rate-limit.js';
import { checkLimit } from '../lib/billing/planEnforcer.js';
import { logAudit } from '../lib/audit/auditLog.js';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_TTL_SEC = 10 * 60;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
]);

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value) {
    return asText(value.value);
  }
  return String(value || '').trim();
}

function asInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function sanitizeFilename(value) {
  const raw = String(value || 'upload').trim();
  const base = raw.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  return base || 'upload';
}

function isMissingColumnError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('column')
    && (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes("could not find the '"));
}

function isNotNullConstraint(error, column) {
  const msg = String(error?.message || '').toLowerCase();
  const col = String(column || '').toLowerCase();
  return msg.includes('null value in column') && msg.includes(col) && msg.includes('not-null');
}

function yyyymm(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return { year: String(y), month: m };
}

function requireApiKey(req, reply) {
  const key = req.headers['x-api-key'];
  if (!key || key !== ENV.INTERNAL_API_KEY) {
    reply.code(401).send({ ok: false, error: 'unauthorized' });
    return false;
  }
  return true;
}

async function requireApiKeyPreHandler(req, reply) {
  if (!requireApiKey(req, reply)) return;
  return undefined;
}

async function readPartFile(filePart) {
  const hash = createHash('sha256');
  const chunks = [];
  let total = 0;

  for await (const chunk of filePart.file) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_UPLOAD_BYTES) {
      throw new Error(`file_too_large_max_${MAX_UPLOAD_BYTES}_bytes`);
    }
    hash.update(buf);
    chunks.push(buf);
  }

  if (filePart.file.truncated) {
    throw new Error('file_truncated_by_upload_limits');
  }

  return {
    buffer: Buffer.concat(chunks),
    sizeBytes: total,
    sha256: hash.digest('hex'),
  };
}

async function insertAttachmentRecord({
  tenantId,
  fields,
  mimeType,
  sizeBytes,
  sha256,
  originalName,
  storageBucket,
  storagePath,
}) {
  const attachmentId = randomUUID();
  const messageId = isUuid(fields.message_id) ? fields.message_id : null;
  const provider = (asText(fields.provider) || 'meta').toLowerCase();

  const candidates = [
    {
      id: attachmentId,
      tenant_id: tenantId,
      contact_id: isUuid(fields.contact_id) ? fields.contact_id : null,
      conversation_id: isUuid(fields.conversation_id) ? fields.conversation_id : null,
      message_id: messageId,
      storage_bucket: storageBucket,
      storage_path: storagePath,
      content_type: mimeType,
      size_bytes: sizeBytes,
      sha256,
    },
    {
      id: attachmentId,
      tenant_id: tenantId,
      message_id: messageId,
      storage_bucket: storageBucket,
      storage_path: storagePath,
      content_type: mimeType,
      size_bytes: sizeBytes,
    },
    {
      id: attachmentId,
      tenant_id: tenantId,
      message_id: messageId,
      provider,
      provider_media_id: null,
      mime_type: mimeType,
      filename: originalName,
      storage_bucket: storageBucket,
      storage_path: storagePath,
      size_bytes: sizeBytes,
    },
    {
      id: attachmentId,
      tenant_id: tenantId,
      message_id: messageId,
      provider,
      mime_type: mimeType,
      filename: originalName,
      storage_bucket: storageBucket,
      storage_path: storagePath,
      size_bytes: sizeBytes,
    },
  ];

  let lastError = null;

  for (const row of candidates) {
    const { data, error } = await supabaseAdmin
      .from('attachments')
      .insert(row)
      .select('id')
      .single();

    if (!error) {
      return {
        id: data?.id || attachmentId,
        storage_path: storagePath,
      };
    }

    if (isNotNullConstraint(error, 'message_id') && !messageId) {
      throw new Error('attachments_insert_failed: message_id_required_for_legacy_attachment_schema');
    }

    if (isMissingColumnError(error)) {
      lastError = error;
      continue;
    }

    lastError = error;
  }

  throw new Error(`attachments_insert_failed: ${lastError?.message || 'unknown_error'}`);
}

async function loadAttachmentForSignedUrl({ tenantId, attachmentId }) {
  const selectCandidates = [
    'id,tenant_id,storage_bucket,storage_path,content_type,size_bytes,created_at',
    'id,tenant_id,storage_bucket,storage_path,mime_type,size_bytes,created_at',
    'id,tenant_id,storage_path,mime_type,size_bytes,created_at',
    'id,tenant_id,storage_path,content_type,size_bytes,created_at',
  ];

  let lastError = null;

  for (const select of selectCandidates) {
    const { data, error } = await supabaseAdmin
      .from('attachments')
      .select(select)
      .eq('tenant_id', tenantId)
      .eq('id', attachmentId)
      .maybeSingle();

    if (!error) return data || null;

    if (isMissingColumnError(error)) {
      lastError = error;
      continue;
    }

    throw new Error(`attachments_lookup_failed: ${error.message}`);
  }

  if (lastError) {
    throw new Error(`attachments_lookup_failed: ${lastError.message}`);
  }

  return null;
}

export async function attachmentsRoutes(fastify) {
  const agentRoleGuard = requireTenantRole({
    supabaseAdmin,
    allowedRoles: ['owner', 'admin', 'agent'],
  });

  const attachmentUploadGuard = requireTenantPermission({
    supabaseAdmin,
    permission: 'attachments.upload',
  });

  fastify.post('/attachments/upload', {
    preHandler: [requireApiKeyPreHandler, attachmentUploadGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    if (!req.isMultipart || !req.isMultipart()) {
      return reply.code(400).send({ ok: false, error: 'multipart_required' });
    }

    const tenantFromQuery = asText(req.query?.tenant_id || req.tenant?.id);
    if (!isUuid(tenantFromQuery)) {
      return reply.code(400).send({ ok: false, error: 'missing_or_invalid_tenant_id_query' });
    }

    let filePart = null;
    const fields = {};

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (filePart) {
          return reply.code(400).send({ ok: false, error: 'only_one_file_allowed' });
        }
        filePart = part;
      } else {
        fields[part.fieldname] = asText(part.value);
      }
    }

    if (!filePart) {
      return reply.code(400).send({ ok: false, error: 'file_missing' });
    }

    const tenantId = asText(fields.tenant_id || tenantFromQuery || req.tenant?.id);
    if (!isUuid(tenantId)) {
      return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    }
    if (req.tenant?.id && req.tenant.id !== tenantId) {
      return reply.code(403).send({ ok: false, error: 'tenant_scope_mismatch' });
    }

    const mimeType = String(filePart.mimetype || '').toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return reply.code(415).send({ ok: false, error: 'unsupported_content_type', content_type: mimeType });
    }

    try {
      const { buffer, sizeBytes, sha256 } = await readPartFile(filePart);
      if (sizeBytes <= 0) {
        return reply.code(400).send({ ok: false, error: 'empty_file' });
      }

      const uploadPolicy = await evaluatePolicy({
        supabaseAdmin,
        action: 'attachments.upload',
        context: {
          tenant_id: tenantId,
          user_id: req.user?.id || null,
          ip: req.ip,
          attachment_bytes: sizeBytes,
          has_attachments: true,
        },
      });

      if (!uploadPolicy.allowed) {
        return reply.code(403).send({
          ok: false,
          error: 'policy_denied',
          reason: uploadPolicy.reason,
          policy_id: uploadPolicy.policy?.id || null,
        });
      }

      const projectedMb = sizeBytes / (1024 * 1024);
      const limitCheck = await checkLimit({
        supabaseAdmin,
        tenant_id: tenantId,
        metric: 'attachments_mb_per_month',
        projected_increment: projectedMb,
      });

      if (!limitCheck.allowed) {
        return reply.code(402).send({
          ok: false,
          error: 'limit_exceeded',
          metric: limitCheck.metric,
          limit: limitCheck.limit,
          used: limitCheck.used,
        });
      }

      const originalName = sanitizeFilename(filePart.filename || fields.filename || 'upload');
      const ext = path.extname(originalName);
      const basename = ext ? originalName.slice(0, -ext.length) : originalName;
      const objectName = `${basename.slice(0, 48)}_${randomUUID()}${ext}`;
      const now = new Date();
      const { year, month } = yyyymm(now);
      const storageBucket = 'attachments';
      const storagePath = `tenant/${tenantId}/${year}/${month}/${objectName}`;

      const uploadResult = await supabaseAdmin.storage
        .from(storageBucket)
        .upload(storagePath, buffer, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadResult.error) {
        throw new Error(`storage_upload_failed: ${uploadResult.error.message}`);
      }

      const data = await insertAttachmentRecord({
        tenantId,
        fields,
        mimeType,
        sizeBytes,
        sha256,
        originalName,
        storageBucket,
        storagePath,
      });

      await logAudit({
        tenant_id: tenantId,
        actor_user_id: req.user?.id || null,
        actor_type: 'user',
        action: 'upload_attachment',
        entity_type: 'attachment',
        entity_id: data.id,
        metadata: {
          storage_path: data.storage_path,
          size_bytes: sizeBytes,
          content_type: mimeType,
        },
      }).catch(() => {});

      return reply.send({
        ok: true,
        attachment_id: data.id,
        storage_path: data.storage_path,
        warning: limitCheck.warning ? limitCheck.warning_message : null,
      });
    } catch (error) {
      req.log.error({ err: error }, 'attachment upload failed');
      return reply.code(400).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/attachments/:tenant_id/:attachment_id/signed-url', {
    preHandler: [requireApiKeyPreHandler, agentRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.params?.tenant_id || req.query?.tenant_id || req.tenant?.id);
    const attachmentId = asText(req.params?.attachment_id);

    if (!isUuid(tenantId)) {
      return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    }
    if (!isUuid(attachmentId)) {
      return reply.code(400).send({ ok: false, error: 'invalid_attachment_id' });
    }

    const ttl = Math.min(3600, Math.max(60, asInt(req.query?.ttl, SIGNED_URL_TTL_SEC)));

    try {
      const row = await loadAttachmentForSignedUrl({ tenantId, attachmentId });
      if (!row) return reply.code(404).send({ ok: false, error: 'attachment_not_found' });

      const storageBucket = asText(row.storage_bucket) || 'attachments';
      const storagePath = asText(row.storage_path);
      if (!storagePath) {
        return reply.code(400).send({ ok: false, error: 'attachment_missing_storage_path' });
      }

      const { data, error: signErr } = await supabaseAdmin.storage
        .from(storageBucket)
        .createSignedUrl(storagePath, ttl);

      if (signErr) throw new Error(`signed_url_failed: ${signErr.message}`);

      return reply.send({
        ok: true,
        attachment_id: row.id,
        signed_url: data?.signedUrl || null,
        expires_in: ttl,
      });
    } catch (error) {
      req.log.error({ err: error }, 'attachment signed-url failed');
      return reply.code(400).send({ ok: false, error: String(error?.message || error) });
    }
  });
}
