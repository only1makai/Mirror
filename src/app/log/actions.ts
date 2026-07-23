"use server";

import { createClient } from "@/lib/supabase/server";

export type LogInput = {
  date: string;
  sleep_hours: number | null;
  note: string | null;
  shine_tzone: number | null;
  shine_cheeks: number | null;
  breakout_count: number | null;
  breakout_zones: string[];
  dryness: number | null;
  irritation: boolean;
  adherence: { stack_item_id: string; taken: boolean }[];
};

export async function saveLog(
  input: LogInput,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: log, error } = await supabase
    .from("logs")
    .upsert(
      {
        user_id: user.id,
        date: input.date,
        sleep_hours: input.sleep_hours,
        note: input.note,
        shine_tzone: input.shine_tzone,
        shine_cheeks: input.shine_cheeks,
        breakout_count: input.breakout_count,
        breakout_zones: input.breakout_zones,
        dryness: input.dryness,
        irritation: input.irritation,
      },
      { onConflict: "user_id,date" },
    )
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  if (input.adherence.length > 0) {
    const rows = input.adherence.map((a) => ({
      log_id: log.id as string,
      stack_item_id: a.stack_item_id,
      taken: a.taken,
    }));
    const { error: adhErr } = await supabase
      .from("log_adherence")
      .upsert(rows, { onConflict: "log_id,stack_item_id" });
    if (adhErr) return { ok: false, error: adhErr.message };
  }

  return { ok: true };
}
