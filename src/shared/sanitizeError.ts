const SECRET_KEY_OR_HEADER =
  /\b((?:authorization|token|api[_-]?key|apikey|secret|password|passwd|access[_-]?key|x-[a-z0-9-]*(?:key|token|secret)))\b\s*"?\s*[:=]\s*("[^"]*"|'[^']*'|[^\r\n,;&"']+)/gi;

const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

const QUERY_PARAM_VALUE = /([?&][^=\s&"']+=)[^&\s"';,]+/g;

export const MAX_ERROR_TEXT_LENGTH = 500;

/**
 * Redacts common secret patterns and query-string values from error text.
 *
 * Applied before error data reaches telemetry or logs — a length cap alone
 * does not remove secrets, and error messages routinely embed URLs, tokens,
 * and user-controlled input. Never trust client-supplied text as-is.
 *
 * Input is coerced to a string so callers can pass a possibly-structured
 * `cause.message` without the sanitizer itself throwing.
 */
export function sanitizeErrorText(
  input: unknown,
  maxLength = MAX_ERROR_TEXT_LENGTH,
): string {
  if (input == null) return "";
  let text = String(input);
  text = text.replace(SECRET_KEY_OR_HEADER, "$1=[REDACTED]");
  text = text.replace(BEARER_TOKEN, "Bearer [REDACTED]");
  text = text.replace(QUERY_PARAM_VALUE, "$1[REDACTED]");
  return text.slice(0, maxLength);
}
