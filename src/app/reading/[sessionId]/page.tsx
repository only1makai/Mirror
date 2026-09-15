import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadVocabularies } from "@/lib/vision/reference";
import TabBar from "@/components/TabBar";
import ReadingForm from "./ReadingForm";

export const dynamic = "force-dynamic";

export default async function ReadingPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createClient();

  // RLS scopes this to the signed-in user, so a session id belonging to
  // someone else comes back empty and 404s like any other unknown id.
  const { data: session } = await supabase
    .from("sessions")
    .select("id, captured_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) notFound();

  // The vocabularies drive every dropdown, and they are read here rather than
  // shipped as constants for the same reason the schema builder reads them:
  // they are foreign keys, and the live table is the only version that is
  // guaranteed to still be true.
  const vocab = await loadVocabularies();

  // One reading per session is the intent. If one already exists, say so
  // instead of quietly creating a second.
  const { data: existing } = await supabase
    .from("readings")
    .select("id")
    .eq("session_id", sessionId)
    .maybeSingle();

  return (
    <div className="app-shell">
      <ReadingForm
        sessionId={sessionId}
        vocab={vocab}
        alreadyRead={!!existing}
      />
      <TabBar />
    </div>
  );
}
