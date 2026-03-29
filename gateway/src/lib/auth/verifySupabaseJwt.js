import { jwtVerify } from 'jose';
import { ENV } from '../../env.js';

const encoder = new TextEncoder();

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function unauthorized(error) {
  const err = new Error(error || 'unauthorized');
  err.statusCode = 401;
  return err;
}

function getBearerToken(req) {
  const raw = asText(req?.headers?.authorization || req?.headers?.Authorization);
  if (!raw) throw unauthorized('missing_authorization');

  const [scheme, token] = raw.split(/\s+/, 2);
  if (!scheme || String(scheme).toLowerCase() !== 'bearer' || !token) {
    throw unauthorized('invalid_authorization_header');
  }

  return token;
}

function shouldUseLocalSecret(secret) {
  const value = asText(secret);
  if (!value) return false;
  if (value.startsWith('REPLACE_WITH_')) return false;
  if (value.startsWith('YOUR_')) return false;
  return true;
}

export async function verifySupabaseJwt(req, { supabaseAdmin } = {}) {
  const token = getBearerToken(req);

  if (shouldUseLocalSecret(ENV.SUPABASE_JWT_SECRET)) {
    try {
      const secret = encoder.encode(String(ENV.SUPABASE_JWT_SECRET || ''));
      const { payload } = await jwtVerify(token, secret, {
        algorithms: ['HS256'],
      });

      if (!payload?.sub) {
        throw unauthorized('invalid_token_subject');
      }

      return payload;
    } catch (error) {
      if (error?.statusCode === 401) throw error;
      throw unauthorized('invalid_or_expired_token');
    }
  }

  if (!supabaseAdmin?.auth?.getUser) {
    throw unauthorized('missing_jwt_verification_config');
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user?.id) {
      throw unauthorized('invalid_or_expired_token');
    }

    return {
      sub: data.user.id,
      email: data.user.email || null,
      role: data.user.role || null,
    };
  } catch (error) {
    if (error?.statusCode === 401) throw error;
    throw unauthorized('invalid_or_expired_token');
  }
}
