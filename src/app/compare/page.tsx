import { createClient } from "@/lib/supabase/server";
import { signPhotos } from "@/lib/photos";
import { type Photo, type Angle } from "@/lib/types";
import CompareView, { type SessionView } from "./CompareView";
import TabBar from "@/components/TabBar";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const supabase = await createClient();

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, captured_at, photos(angle, storage_path)")
    .order("captured_at", { ascending: true });

  const views: SessionView[] = [];
  for (const s of sessions ?? []) {
    const photos = (s.photos ?? []) as Pick<Photo, "angle" | "storage_path">[];
    if (photos.length === 0) continue;
    const urls = await signPhotos(photos);
    views.push({
      id: s.id as string,
      captured_at: s.captured_at as string,
      urls: urls as Partial<Record<Angle, string>>,
    });
  }

  return (
    <div className="app-shell">
      <CompareView sessions={views} />
      <TabBar />
    </div>
  );
}
