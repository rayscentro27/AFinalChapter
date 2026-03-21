import type { Handler } from '@netlify/functions';
import { createHash } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';
import {
  buildPortalAIContext,
  resolveAuthedUserId,
  toHttpErrorBody,
} from './_shared/funding_foundation';

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  role: z.enum(['funding_guide', 'credit_advisor', 'business_setup_advisor']).default('funding_guide'),
  coaching_goal: z.string().min(3).max(300).optional(),
  user_message: z.string().max(1200).optional(),
});

function roleInstruction(role: 'funding_guide' | 'credit_advisor' | 'business_setup_advisor'): string {
  if (role === 'credit_advisor') {
    return [
      'You are Credit Advisor for a funding-first portal.',
      'Explain analysis and dispute recommendations clearly in plain language.',
      'Do not promise score outcomes or approvals.',
      'Give concise actionable steps with caution around compliance.',
    ].join(' ');
  }

  if (role === 'business_setup_advisor') {
    return [
      'You are Business Setup Advisor for a funding-first portal.',
      'Help user choose and complete new-business vs existing-business optimization path.',
      'Explain why EIN/address/phone/website/NAICS/bank consistency matters for underwriting readiness.',
      'Do not make legal or tax guarantees.',
    ].join(' ');
  }

  return [
    'You are Funding Guide for a funding-first portal.',
    'Prioritize current stage, blockers, and the next deterministic action.',
    'Keep response calm, concise, and practical.',
    'Do not provide financial advice or guarantees.',
  ].join(' ');
}

function compactContext(context: unknown): string {
  return JSON.stringify(context);
}

function fallbackAnswer(context: any): string {
  const stage = String(context?.user_stage || 'unknown').replace(/_/g, ' ');
  const blockers = Array.isArray(context?.blockers) ? context.blockers.slice(0, 3) : [];
  const recommendation = context?.roadmap_summary?.recommendation?.top_recommendation?.title;
  const steps: string[] = [];

  if (recommendation) steps.push(`Top recommendation: ${recommendation}.`);
  if (blockers.length > 0) steps.push(`Current blockers: ${blockers.join(' | ')}.`);
  steps.push('Open Action Center and complete the top urgent task first.');

  return `Current stage: ${stage}. ${steps.join(' ')}`;
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));
    const supabase = getUserSupabaseClient(event);
    const userId = await resolveAuthedUserId(supabase as any);
    const tenantId = await resolveTenantId(supabase as any, { requestedTenantId: body.tenant_id });

    const coachingGoal = body.coaching_goal || body.user_message || 'What should I focus on next?';
    const context = await buildPortalAIContext(supabase as any, {
      tenantId,
      userId,
      role: body.role,
      coachingGoal,
    });

    const contextJson = compactContext(context);
    const contextHash = createHash('sha256').update(contextJson).digest('hex').slice(0, 16);
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

    let answer = fallbackAnswer(context);
    let model = 'fallback-deterministic';

    if (apiKey) {
      const ai = new GoogleGenAI({ apiKey });
      const selectedModel = process.env.PORTAL_AI_MODEL || 'gemini-3-flash-preview';
      model = selectedModel;

      const prompt = [
        roleInstruction(body.role),
        `Coaching goal: ${coachingGoal}`,
        body.user_message ? `User question: ${body.user_message}` : '',
        `Context JSON: ${contextJson}`,
        'Return plain text with 3 sections: Summary, Why It Matters, Next Actions (max 4 bullets).',
      ]
        .filter(Boolean)
        .join('\n\n');

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: prompt,
        config: {
          temperature: 0.2,
          maxOutputTokens: 500,
        },
      } as any);

      const text = String(response.text || '').trim();
      if (text) answer = text;
    }

    return json(200, {
      ok: true,
      tenant_id: tenantId,
      role: body.role,
      answer,
      context_meta: {
        stage: context.user_stage,
        blockers_count: Array.isArray(context.blockers) ? context.blockers.length : 0,
        context_hash: contextHash,
        model,
      },
    });
  } catch (error) {
    const err = toHttpErrorBody(error);
    return json(err.statusCode, err.body);
  }
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
