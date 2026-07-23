import { createClient } from "@/lib/supabase/server";
import { type StackItem } from "@/lib/types";
import StackManager from "./StackManager";
import TabBar from "@/components/TabBar";

export const dynamic = "force-dynamic";

export default async function StackPage() {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("stack_items")
    .select("*")
    .order("created_at", { ascending: false });

  const active = (items ?? []).filter((i) => !i.ended_at) as StackItem[];
  const ended = (items ?? []).filter((i) => i.ended_at) as StackItem[];

  return (
    <div className="app-shell">
      <StackManager active={active} ended={ended} />
      <TabBar />
    </div>
  );
}
