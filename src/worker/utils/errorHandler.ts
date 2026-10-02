import { sanitizeErrorText } from "@shared/sanitizeError";

export const logError = (
  err: Error,
  method: string,
  path: string,
  requestId?: string,
) => {
  const cause = err.cause as { message?: string } | undefined;
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      method,
      path,
      requestId,
      message: sanitizeErrorText(err.message || String(err)),
      cause: cause
        ? sanitizeErrorText(cause.message || String(cause))
        : undefined,
    }),
  );
};

/** Never leak internals to the client — details go to the log only. */
export const formatErrorResponse = () => ({
  status: "error",
  message: "Server Error",
  code: "INTERNAL_SERVER_ERROR",
});
