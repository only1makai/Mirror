import { isTimeoutError } from "@/lib/supabase/timeout-fetch";

// postgrest-js hands a failed request back as `{ data: null, error }` instead
// of throwing, so a page that destructures only `{ data }` renders a failure
// as an empty state — "No captures yet" when the truth is "we could not
// reach the database". Every page that can show stale-looking emptiness
// should render this above its content instead.
export default function LoadError({
  error,
}: {
  error: { message?: string } | null;
}) {
  if (!error) return null;

  return (
    <div className="banner danger">
      {isTimeoutError(error)
        ? "The database did not respond in time, so anything below may be incomplete. If this project was recently resumed from pause, give it a moment and reload."
        : `Could not load your data: ${error.message ?? "unknown error"}`}
    </div>
  );
}
