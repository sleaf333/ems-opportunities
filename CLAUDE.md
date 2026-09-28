# Notes for Claude

Project owner is not a professional developer; explain changes in plain language and flag anything they must do by hand (Supabase dashboard, Cloudflare, SQL to run).

- Read PLAN.md for goals and the decisions log; update the log when a decision changes.
- Stack: Vite + React + TypeScript SPA on Cloudflare Pages; Supabase (Postgres, email OTP auth, RLS). Must stay on free tiers.
- All authorization lives in SQL (`supabase/migrations/`): RLS policies, column grants and SECURITY DEFINER functions (`set_my_signup`, `admin_set_member`). The UI only mirrors those rules for display; never rely on UI checks for security.
- Sign-ups are written only through `set_my_signup` (handles capacity, waitlist, eligibility, deadlines in America/Chicago). Every change is logged to `signup_events` by trigger.
- Sign-in is a 6-digit email code (verifyOtp type 'email'), limited to @ems-wi.com by a trigger on auth.users.
- After launch, schema changes go in a new numbered migration; never edit an applied one.
- Checks before pushing: `npm run build` and `npm run test:db` (add tests to `supabase/tests/permissions_test.sql` for new rules).
- Writing for the owner or the group: no em dashes.
- Supabase grants anon/authenticated EXECUTE on new public functions by default: in each new migration, revoke from public/anon/authenticated and grant back only what the site calls.
- Brand colors are the four variables at the top of src/styles.css (--brand, --brand-deep, --brand-2, --brand-3, plus dark-mode overrides). Placeholders until the real ems-wi.com colors are confirmed.
