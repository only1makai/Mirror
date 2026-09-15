import "server-only";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { ANGLES, ANGLE_LABEL, PHOTO_BUCKET, type Angle } from "@/lib/types";

// The API resizes anything with a long edge past this and bills the resized
// size, so sending more pixels buys latency and cost without buying signal.
// Capture already targets 1080x1440, which is under the cap — this is the
// guard for a desktop webcam or a future device handing back something much
// larger, not something the current phone path normally hits.
const MAX_EDGE = 1568;
const JPEG_QUALITY = 82;

export type PreparedImage = {
  angle: Angle;
  base64: string;
  mediaType: "image/jpeg";
};

// Carries the angle so the error state can name which shot failed rather
// than saying "something went wrong".
export class ImagePrepError extends Error {
  constructor(
    readonly angle: Angle | null,
    message: string,
  ) {
    super(message);
    this.name = "ImagePrepError";
  }
}

// Downloads all three angles as the signed-in user and re-encodes each one
// down to MAX_EDGE. Download runs through the same request-scoped client the
// rest of the app uses, so Storage RLS is what proves ownership here — the
// path-scoped policies in 0001_init.sql make another user's object
// unreadable regardless of what session id is passed in.
export async function prepareSessionImages(
  sessionId: string,
): Promise<PreparedImage[]> {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("photos")
    .select("angle, storage_path")
    .eq("session_id", sessionId);

  if (error) throw new ImagePrepError(null, error.message);

  const byAngle = new Map<Angle, string>(
    ((rows ?? []) as { angle: Angle; storage_path: string }[]).map((r) => [
      r.angle,
      r.storage_path,
    ]),
  );

  const missing = ANGLES.filter((a) => !byAngle.has(a));
  if (missing.length > 0) {
    throw new ImagePrepError(
      missing[0],
      `This session is missing its ${missing
        .map((a) => ANGLE_LABEL[a].toLowerCase())
        .join(" and ")} photo.`,
    );
  }

  return Promise.all(
    ANGLES.map(async (angle): Promise<PreparedImage> => {
      const path = byAngle.get(angle)!;

      const { data: blob, error: dlErr } = await supabase.storage
        .from(PHOTO_BUCKET)
        .download(path);

      if (dlErr || !blob) {
        throw new ImagePrepError(
          angle,
          `Could not load the ${ANGLE_LABEL[angle].toLowerCase()} photo: ${
            dlErr?.message ?? "no data returned"
          }`,
        );
      }

      try {
        const input = Buffer.from(await blob.arrayBuffer());
        const output = await sharp(input)
          .rotate() // honour EXIF orientation before measuring edges
          .resize({
            width: MAX_EDGE,
            height: MAX_EDGE,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: JPEG_QUALITY })
          .toBuffer();

        return { angle, base64: output.toString("base64"), mediaType: "image/jpeg" };
      } catch (e) {
        throw new ImagePrepError(
          angle,
          `Could not process the ${ANGLE_LABEL[angle].toLowerCase()} photo: ${
            e instanceof Error ? e.message : "unknown image error"
          }`,
        );
      }
    }),
  );
}
