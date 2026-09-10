"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PHOTO_BUCKET } from "@/lib/types";

export type ResetFaceHistoryResult =
  | { ok: true; sessionsDeleted: number; photosDeleted: number }
  | { ok: false; stage: "storage" | "database"; message: string };

// Storage-first, then DB — deliberately, not incidentally. Storage and
// Postgres are two separate systems with no shared transaction, so this
// can't be perfectly atomic. If the Storage delete fails, nothing in the
// DB has changed yet: the user's sessions are still visibly intact and
// they can just retry. If Storage succeeds and the DB delete then fails,
// the actual photos — the privacy-critical part — are already gone; what's
// left is a metadata cleanup problem (sessions pointing at missing files),
// which is the better of the two ways this can partially fail.
export async function resetFaceHistory(): Promise<ResetFaceHistoryResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, stage: "database", message: "Not authenticated." };
  }

  // 1. Get every session id + photo storage_path belonging to this user,
  //    before anything is deleted — .remove() needs an explicit path
  //    array, there's no "delete everything under this prefix."
  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id")
    .eq("user_id", user.id);

  if (sessionsError) {
    return { ok: false, stage: "database", message: sessionsError.message };
  }

  const sessionIds = (sessions ?? []).map((s) => s.id);

  if (sessionIds.length === 0) {
    return { ok: true, sessionsDeleted: 0, photosDeleted: 0 };
  }

  const { data: photos, error: photosError } = await supabase
    .from("photos")
    .select("storage_path")
    .in("session_id", sessionIds);

  if (photosError) {
    return { ok: false, stage: "database", message: photosError.message };
  }

  const paths = (photos ?? []).map((p) => p.storage_path);

  // 2. Delete the actual files first.
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .remove(paths);
    if (storageError) {
      return { ok: false, stage: "storage", message: storageError.message };
    }
  }

  // 3. Delete the sessions. RLS + the FK cascade chain (photos, and once
  //    Step 3/4 land, readings -> reading_dimorphism_findings /
  //    condition_findings, per 0001_init.sql:22 and 0003_readings.sql:50,
  //    118, 151) handle everything downstream. logs/stack_items are
  //    untouched by design — no FK to sessions, confirmed structurally,
  //    not just by convention.
  const { error: deleteError, count } = await supabase
    .from("sessions")
    .delete({ count: "exact" })
    .eq("user_id", user.id);

  if (deleteError) {
    return {
      ok: false,
      stage: "database",
      message: `Photos were deleted, but removing the session records failed: ${deleteError.message}. Your photos are gone but some database records may remain — this needs manual cleanup, not a retry of this action.`,
    };
  }

  revalidatePath("/");
  revalidatePath("/compare");

  return {
    ok: true,
    sessionsDeleted: count ?? sessionIds.length,
    photosDeleted: paths.length,
  };
}
