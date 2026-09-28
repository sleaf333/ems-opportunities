# Notes for Claude

Project owner is not a professional developer; explain changes in plain language and flag anything they must do by hand (Supabase dashboard, Cloudflare, SQL to run).

- Read PLAN.md for goals and the decisions log; update the log when a decision changes.
- Stack: Vite + React + TypeScript SPA on Cloudflare Pages; Supabase (Postgres, email OTP auth, RLS). Must stay on free tiers.
- All authorization lives in SQL (`supabase/migrations/`): RLS policies, column grants and SECURITY DEFINER functions (`set_my_signup`, `admin_set_member`). The UI only mirrors those rules for display; never rely on UI checks for security.
- Sign-ups are written only through `set_my_signup` (handles capacity, waitlist, eligibility by position, posting window and deadlines in America/Chicago). Every change is logged to `signup_events` by trigger.
- Labels: the database says partner / partnership_track; everything people see says Shareholder / Shareholder track / Shareholders only (labels in src/lib/format.ts; friendlyError rewrites DB messages). Never show "partner" wording.
- Partner (shown as Shareholder) is self-selected like any position (0003 removed the admin-only guard); admins can also set it via `admin_set_member`. Who can sign up is `opportunities.eligible_positions` (0004 replaced `audience`): everyone can view every post; only listed positions can mark Interested or Commit (enforced in `set_my_signup`). Presets live in `ELIGIBILITY_GROUPS` (src/lib/format.ts).
- Names on sign-ups: RLS lets members read only their own rows unless the post has `show_names`; admins and the post's creator see all. Counts for everyone come from `opportunity_counts()`.
- Nothing is deleted: no DELETE on opportunities or interest_categories; expiry is `visible_until` (null = indefinitely), close/archive via status.
- Topics and member interests use `interest_categories` (+ join tables), written via `set_opportunity_categories` / `set_my_interests`.
- In SQL, compare possibly-null owners with `coalesce(x = auth.uid(), false)`; a bare `=` inside `not (...)` let a poster edit seeded (ownerless) posts once.
- Sign-in is a 6-digit email code (verifyOtp type 'email'), limited to @ems-wi.com by a trigger on auth.users.
- After launch, schema changes go in a new numbered migration; never edit an applied one.
- Checks before pushing: `npm run build` and `npm run test:db` (add tests to `supabase/tests/permissions_test.sql` for new rules).
- Writing for the owner or the group: no em dashes.
- Supabase grants anon/authenticated EXECUTE on new public functions by default: in each new migration, revoke from public/anon/authenticated and grant back only what the site calls.
- Brand colors are at the top of src/styles.css, sampled from ems-wi.com screenshots (logo blue #226DA7, five dots #B1DEF6 #6BAEDB #0D6CB3 #094A7D #0B2440, heading indigo #0D0149, turquoise rule #25EFF5). Fonts are free lookalikes: Syncopate (wide caps headings), Cormorant Garamond italic (taglines), Figtree (body).
