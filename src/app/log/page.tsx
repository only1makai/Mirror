import { createClient } from "@/lib/supabase/server";
import { type Log, type StackItem } from "@/lib/types";
import LogForm from "./LogForm";
import TabBar from "@/components/TabBar";

export const dynamic = "force-dynamic";

export default async function LogPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from("logs")
    .select("*")
    .eq("date", today)
    .maybeSingle();

  const { data: stack } = await supabase
    .from("stack_items")
    .select("*")
    .is("ended_at", null)
    .order("created_at", { ascending: true });

  let adherence: Record<string, boolean> = {};
  if (existing) {
    const { data: adh } = await supabase
      .from("log_adherence")
      .select("stack_item_id, taken")
      .eq("log_id", (existing as Log).id);
    adherence = Object.fromEntries(
      (adh ?? []).map((r) => [r.stack_item_id as string, r.taken as boolean]),
    );
  }

  return (
    <div className="app-shell">
      <LogForm
        date={today}
        existing={(existing as Log) ?? null}
        stack={(stack ?? []) as StackItem[]}
        adherence={adherence}
      />
      <TabBar />
    </div>
  );
}
