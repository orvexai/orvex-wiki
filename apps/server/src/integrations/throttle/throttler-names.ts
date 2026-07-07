export const AUTH_THROTTLER = 'auth';
export const AI_CHAT_THROTTLER = 'ai-chat';

/**
 * ENG-1473 — the GDPR user-data-export endpoint's dedicated throttler
 * (5 requests / hour). Registered in {@link ../throttle.module.ts}.
 */
export const USER_EXPORT_THROTTLER = 'user_export';

/**
 * Pass to `@SkipThrottle()` on the user-export route so ONLY the
 * `USER_EXPORT_THROTTLER` limit applies. Without this, the shared `auth`
 * (10/min) and `ai-chat` (25/min) throttlers — keyed by IP by default — would
 * also gate the route and could reject an export well before its own 5/hour
 * budget is reached. Keep in sync with the `throttlers` array in
 * `throttle.module.ts`.
 */
export const SKIP_NON_EXPORT_THROTTLERS: Record<string, true> = {
  [AUTH_THROTTLER]: true,
  [AI_CHAT_THROTTLER]: true,
};
