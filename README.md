# EMS Opportunities

A private website where the group posts committee, leadership and event opportunities. Members sign in with their @ems-wi.com email, show interest or commit, and see who else has signed up. Admins see engagement across the group and can export it.

- **Plan and decisions:** [PLAN.md](PLAN.md)
- **Putting it online (accounts, keys, launch):** [docs/SETUP.md](docs/SETUP.md)

## How it is built

| Part | Tool |
|---|---|
| Website | React + TypeScript (Vite), built as a static site |
| Hosting | Cloudflare Pages (free) |
| Database, sign-in, permissions | Supabase (free): Postgres with row-level security |
| Sign-in emails | Brevo SMTP (free), connected to Supabase |

All permission rules (who can see, post, sign up or change roles) live in the database, in `supabase/migrations/`. The website cannot get around them.

## Working on it locally

Requires Node 22+.

```bash
npm install
cp .env.example .env.local   # then fill in the Supabase URL and anon key
npm run dev                   # http://localhost:5173
```

Other commands:

```bash
npm run build      # type-check and build to dist/
npm run test:unit  # unit tests for the Insights calculations
npm run test:db    # run the database permission tests on a throwaway local Postgres
```

`npm run test:db` needs Postgres 15+ installed locally but no Supabase account.

For a full local Supabase (database, sign-in and a test inbox at http://127.0.0.1:54324), install Docker and run `npx supabase start`. It prints the local URL and anon key to put in `.env.local`.

## Changing the database after launch

Never edit a migration that has already been run on the live project. Add a new numbered file (`0006_...sql`), test it with `npm run test:db` (which checks both upgrading an existing database and a fresh install), then run it in the Supabase SQL Editor (see "Applying a database update" in docs/SETUP.md).
