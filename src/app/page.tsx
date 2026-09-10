import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TabBar from "@/components/TabBar";
import { signPhotos } from "@/lib/photos";
import { type Photo, type Session } from "@/lib/types";

export const dynamic = "force-dynamic";

function daysAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86_400_000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, user_id, captured_at, lighting_score, notes, created_at")
    .order("captured_at", { ascending: false })
    .limit(3);

  const list = (sessions ?? []) as Session[];
  const latest = list[0];

  let frontUrl: string | undefined;
  if (latest) {
    const { data: photos } = await supabase
      .from("photos")
      .select("angle, storage_path")
      .eq("session_id", latest.id);
    const signed = await signPhotos((photos ?? []) as Photo[]);
    frontUrl = signed.front ?? signed.left ?? signed.right;
  }

  const { count: sessionCount } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true });

  const today = new Date().toISOString().slice(0, 10);
  const { data: todayLog } = await supabase
    .from("logs")
    .select("id")
    .eq("date", today)
    .maybeSingle();

  return (
    <div className="app-shell">
      <div className="container">
        <div className="topbar">
          <h1>Mirror</h1>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Link href="/account" className="linkbtn">
              Account
            </Link>
            <form action="/auth/signout" method="post">
              <button className="linkbtn" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <p className="muted">{user?.email}</p>

        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div
              style={{
                width: 64,
                height: 84,
                borderRadius: 10,
                background: "#000",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {frontUrl && (
                <img
                  src={frontUrl}
                  alt="Latest capture"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              )}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>
                {sessionCount ?? 0} session{sessionCount === 1 ? "" : "s"}
              </div>
              <div className="muted">
                {latest
                  ? `Last capture ${daysAgo(latest.captured_at)}`
                  : "No captures yet"}
              </div>
            </div>
          </div>
        </div>

        <Link href="/capture">
          <button className="btn">
            {latest ? "New capture session" : "Start your first capture"}
          </button>
        </Link>
        <div className="row" style={{ marginTop: 10 }}>
          <Link href="/compare">
            <button className="btn secondary">Compare</button>
          </Link>
          <Link href="/log">
            <button className="btn secondary">
              {todayLog ? "Edit today's log" : "Log today"}
            </button>
          </Link>
        </div>

        <h2>How Mirror works</h2>
        <p className="muted">
          Capture the same three angles on a weekly cadence — the ghost outline
          of your last session keeps them aligned. Compare any two over time.
          Log skin and sleep daily in 15 seconds. No score, ever.
        </p>
      </div>
      <TabBar />
    </div>
  );
}
