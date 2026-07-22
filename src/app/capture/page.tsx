import { createClient } from "@/lib/supabase/server";
import { signPhotos } from "@/lib/photos";
import { type Photo, type Session, type Angle } from "@/lib/types";
import CaptureStudio from "./CaptureStudio";
import TabBar from "@/components/TabBar";

export const dynamic = "force-dynamic";

export default async function CapturePage() {
  const supabase = await createClient();

  const { data: last } = await supabase
    .from("sessions")
    .select("id, captured_at, lighting_score")
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let ghosts: Partial<Record<Angle, string>> = {};
  if (last) {
    const { data: photos } = await supabase
      .from("photos")
      .select("angle, storage_path")
      .eq("session_id", (last as Session).id);
    ghosts = await signPhotos((photos ?? []) as Photo[]);
  }

  return (
    <div className="app-shell">
      <CaptureStudio
        ghosts={ghosts}
        prevLighting={(last as Session | null)?.lighting_score ?? null}
        hasPrevSession={!!last}
      />
      <TabBar />
    </div>
  );
}
