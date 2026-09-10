import { createClient } from "@/lib/supabase/server";
import TabBar from "@/components/TabBar";
import ResetFaceHistoryButton from "./ResetFaceHistoryButton";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="app-shell">
      <div className="container">
        <h1>Account</h1>
        <p className="muted">{user?.email}</p>

        <h2>Danger zone</h2>
        <div className="card">
          <p className="muted" style={{ marginBottom: 14 }}>
            Permanently delete every capture session and photo on this
            account. This does not affect your skin log or product stack.
          </p>
          <ResetFaceHistoryButton />
        </div>
      </div>
      <TabBar />
    </div>
  );
}
