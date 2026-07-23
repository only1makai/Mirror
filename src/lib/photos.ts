import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PHOTO_BUCKET, SIGNED_URL_TTL, type Angle, type Photo } from "@/lib/types";

// Generate short-lived signed URLs for a set of photos. Runs as the signed-in
// user, so Storage RLS guarantees only the owner's objects can be signed.
export async function signPhotos(
  photos: Pick<Photo, "angle" | "storage_path">[],
): Promise<Partial<Record<Angle, string>>> {
  const supabase = await createClient();
  const out: Partial<Record<Angle, string>> = {};
  await Promise.all(
    photos.map(async (p) => {
      const { data } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(p.storage_path, SIGNED_URL_TTL);
      if (data?.signedUrl) out[p.angle] = data.signedUrl;
    }),
  );
  return out;
}
