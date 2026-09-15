// supabase-js ships no request timeout. postgrest-js and storage-js both call
// global fetch with no AbortSignal, and Node's fetch has no default timeout
// either, so a Supabase instance that is slow — or a socket that accepts a
// connection and then never answers — stalls the awaiting request forever.
// On a server-rendered page that is indistinguishable from a hung process:
// the browser spins on a navigation that will never resolve and nothing is
// ever logged.
//
// This wrapper puts a ceiling on it. Every Supabase call now either answers
// or fails within SUPABASE_TIMEOUT_MS.
//
// Sized for the free tier's worst legitimate case, not its typical one: a
// project resuming from pause can take double-digit seconds to answer its
// first query, and timing that out would turn a recoverable cold start into
// an error. Warm queries on this project answer in well under two seconds,
// so anything approaching this ceiling is genuinely wrong.
export const SUPABASE_TIMEOUT_MS = 15_000;

export function timeoutFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  // Respect a caller-supplied signal if there ever is one; otherwise this is
  // the only thing that can cancel the request.
  if (init?.signal) return fetch(input, init);

  // Deliberately NOT AbortSignal.timeout(), which rejects with a DOMException
  // named "TimeoutError". postgrest-js only short-circuits its retry loop when
  // the rejection is named "AbortError" (or has code ABORT_ERR) — everything
  // else it treats as a transient network fault and retries, because GET is in
  // its RETRYABLE_METHODS. A TimeoutError therefore gets retried on a timer
  // that has already expired once, and the real ceiling becomes roughly four
  // times this constant. Measured: a 15s timeout took 67s to surface.
  //
  // Aborting with a reason we name "AbortError" ourselves hits the
  // short-circuit on the first failure, so the ceiling is the constant. The
  // message still says "timed out", which is what isTimeoutError and the
  // user-facing banner key off.
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException(
          `Supabase request timed out after ${SUPABASE_TIMEOUT_MS}ms`,
          "AbortError",
        ),
      ),
    SUPABASE_TIMEOUT_MS,
  );

  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

// What a timed-out call looks like by the time it reaches calling code.
//
// postgrest-js converts a rejected fetch into `{ data: null, error }` rather
// than throwing (PostgrestBuilder, `if (!this.shouldThrowOnError)`), so a
// timeout arrives in the `error` field of a normal result — it does NOT throw
// past an `await`. Any caller that destructures only `{ data }` will therefore
// read a timeout as "no rows", not as a failure. Check `error`.
// The two clients word this differently: postgrest-js prefixes the error name
// ("AbortError: Supabase request timed out after 15000ms") while storage-js
// passes the bare message through ("Supabase request timed out after
// 15000ms"). Matching on "timed out" is what covers both — note that it does
// NOT contain the substring "timeout", which is the obvious thing to check for
// and would silently miss every storage failure.
export function isTimeoutError(error: { message?: string } | null): boolean {
  if (!error?.message) return false;
  const m = error.message.toLowerCase();
  return m.includes("timed out") || m.includes("timeout") || m.includes("abort");
}
