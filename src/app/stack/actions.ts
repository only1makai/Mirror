"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addStackItem(input: {
  product_name: string;
  category: string | null;
  schedule: "am" | "pm" | "both" | null;
  started_at: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase.from("stack_items").insert({
    user_id: user.id,
    product_name: input.product_name,
    category: input.category,
    schedule: input.schedule,
    started_at: input.started_at,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/stack");
  revalidatePath("/log");
  return { ok: true };
}

export async function endStackItem(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("stack_items")
    .update({ ended_at: today })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/stack");
  revalidatePath("/log");
  return { ok: true };
}
