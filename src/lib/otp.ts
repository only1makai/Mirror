// Length of the email OTP, shared by the login UI and the verify action so the
// two can never disagree.
//
// This MUST match Supabase's Authentication -> Sign In / Providers -> Email ->
// "Email OTP Length" setting. This project's is 8, not the Supabase default of
// 6. A mismatch is unusually nasty to debug: the UI silently truncated the
// issued 8-digit code to 6, GoTrue then hashed a code that was never issued,
// found nothing, and returned its catch-all 403 otp_expired — the same error it
// returns for a genuinely expired token. Nothing in that chain mentions length.
export const OTP_LENGTH = 8;
