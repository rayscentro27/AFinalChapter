import { useEffect, useRef, useState } from 'react';
import { isSupabaseConfigured } from '../lib/supabaseClient';

type TurnstileWidgetId = string | number;

interface TurnstileRenderOptions {
  sitekey: string;
  action?: string;
  theme?: 'light' | 'dark' | 'auto';
  retry?: 'auto' | 'never';
  'refresh-expired'?: 'auto' | 'manual' | 'never';
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileRenderOptions) => TurnstileWidgetId;
      reset: (widgetId: TurnstileWidgetId) => void;
      remove: (widgetId: TurnstileWidgetId) => void;
    };
  }
}

const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)
  || (import.meta.env.VITE_AUTH_TURNSTILE_SITE_KEY as string | undefined)
  || '';

const TURNSTILE_ENABLED = String(import.meta.env.VITE_TURNSTILE_ENABLED || '').toLowerCase() === 'true';

interface UseTurnstileCaptchaOptions {
  action?: string;
}

const MAX_TOKEN_AGE_MS = 4 * 60 * 1000;

export function useTurnstileCaptcha(options: UseTurnstileCaptchaOptions) {
  const hostname = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  const isNetlifyReviewHost = hostname.endsWith('.netlify.app');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaIssuedAt, setCaptchaIssuedAt] = useState<number | null>(null);
  const [captchaRuntimeFailed, setCaptchaRuntimeFailed] = useState(false);

  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<TurnstileWidgetId | null>(null);

  const captchaRequired = isSupabaseConfigured && TURNSTILE_ENABLED;
  const captchaSiteKeyMissing = captchaRequired && !TURNSTILE_SITE_KEY;
  const captchaReady = captchaRequired && !captchaSiteKeyMissing && !captchaRuntimeFailed;

  let captchaBlockedReason: string | null = null;
  if (captchaSiteKeyMissing) {
    captchaBlockedReason = 'Captcha is enabled for authentication, but the Turnstile site key is missing.';
  } else if (captchaRequired && captchaRuntimeFailed) {
    captchaBlockedReason = isNetlifyReviewHost
      ? 'Captcha is required, but this Netlify review hostname is not allowed by the current Turnstile widget. Use the primary domain or add this review hostname to the Cloudflare Turnstile allowlist.'
      : 'Captcha verification is required, but the Turnstile widget failed to load.';
  }

  useEffect(() => {
    if (!captchaRequired) {
      setCaptchaRuntimeFailed(false);
      setCaptchaToken('');
      return undefined;
    }

    if (!captchaReady) {
      setCaptchaToken('');
      return undefined;
    }

    let cancelled = false;

    const renderWidget = () => {
      if (cancelled || !window.turnstile || !turnstileContainerRef.current) return;
      if (turnstileWidgetIdRef.current !== null) return;

      const renderOptions: TurnstileRenderOptions = {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        retry: 'auto',
        'refresh-expired': 'auto',
        callback: (token: string) => {
          setCaptchaToken(token);
          setCaptchaIssuedAt(Date.now());
        },
        'expired-callback': () => {
          setCaptchaToken('');
          setCaptchaIssuedAt(null);
        },
        'error-callback': () => {
          setCaptchaToken('');
          setCaptchaIssuedAt(null);
          setCaptchaRuntimeFailed(true);
        },
      };

      if (options.action) {
        renderOptions.action = options.action;
      }

      turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, renderOptions);
    };

    if (window.turnstile) {
      renderWidget();
      return () => {
        cancelled = true;
        if (window.turnstile && turnstileWidgetIdRef.current !== null) {
          window.turnstile.remove(turnstileWidgetIdRef.current);
          turnstileWidgetIdRef.current = null;
        }
      };
    }

    let script = document.querySelector('script[data-nexus-turnstile="true"]') as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.nexusTurnstile = 'true';
      document.head.appendChild(script);
    }

    const onLoad = () => renderWidget();
    const onError = () => {
      setCaptchaToken('');
      setCaptchaIssuedAt(null);
      setCaptchaRuntimeFailed(true);
    };

    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);

    return () => {
      cancelled = true;
      script?.removeEventListener('load', onLoad);
      script?.removeEventListener('error', onError);
      if (window.turnstile && turnstileWidgetIdRef.current !== null) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
        turnstileWidgetIdRef.current = null;
      }
    };
  }, [captchaReady, captchaRequired, options.action]);

  const resetCaptcha = () => {
    setCaptchaToken('');
    setCaptchaIssuedAt(null);
    if (window.turnstile && turnstileWidgetIdRef.current !== null) {
      window.turnstile.reset(turnstileWidgetIdRef.current);
    }
  };

  const captchaTokenIsFresh = Boolean(
    captchaToken
    && captchaIssuedAt !== null
    && (Date.now() - captchaIssuedAt) < MAX_TOKEN_AGE_MS
  );

  return {
    captchaBlockedReason,
    captchaReady,
    captchaRequired,
    captchaToken,
    captchaTokenIsFresh,
    resetCaptcha,
    turnstileContainerRef,
  };
}