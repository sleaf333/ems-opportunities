# EMS Opportunities Portal: Project Plan

A private website where our group can post committee, leadership and event opportunities. Members sign up, and the site keeps track of who is engaged and interested in what.

## Goals

1. **Get the word out in real time.** One live link that always shows open opportunities. People are pointed to it through the group newsletter and regular reminders, with an optional automatic email digest later.
2. **Track engagement and interest.** Record who expresses interest in, commits to and completes what, so leadership can spot future leaders and see how engaged the group is overall.
3. **Encourage participation.** Show who has signed up for each opportunity so people can see their colleagues taking part.
4. **Give new hires an easy way in.** Posters can label opportunities as good for new hires. There is no new-hire tracking and no limit on commitments; the in-person committee handles that.
5. **Cost nothing to run.** Free plans only. The only optional cost is a custom web address (about $10 to $15 a year).

## Users and roles

About 150 physicians, plus APCs and admin staff who share the same email domain. Everyone signs in with an **@ems-wi.com** email address.

| Role | Who | Can do |
|---|---|---|
| Member | Anyone with an @ems-wi.com email | Browse, express interest, commit, withdraw, edit own profile |
| Shareholder | A flag an admin sets on a member | Can commit to shareholder-only committees |
| Poster | Members an admin has approved | Everything a member can, plus create and manage their own opportunities and mark attendance. Posts go live immediately; admins do not review them first. |
| Admin | Project owner and anyone they appoint | Everything, plus manage roles, edit or close any post, see all engagement data, export data |

**Access control:** only @ems-wi.com addresses can create an account. That domain includes only group members (physicians, APCs, admin staff), so no separate roster is needed. Each profile has a **position** field (Physician / APC / Staff) so reports can be filtered.

**Who can commit:** each opportunity is open to all team members, physicians only, or shareholders only (matching the committee brochure). Anyone can mark themselves **Interested** in anything, so interest in, say, the Finance Committee from someone who is not yet a shareholder is still recorded.

**First admin:** the project owner, set up with one SQL statement during setup (see docs/SETUP.md). Admins add other posters, admins and shareholders by email on the Admin page, even before those people have signed in.

## Features by phase

### Phase 0: Setup (no code; step-by-step in docs/SETUP.md)
- [ ] Create free accounts under a shared group email (not a personal one): Supabase, Brevo and Cloudflare.
- [x] Web address: free `*.pages.dev` to start.
- [ ] Get leadership to agree on what engagement data is tracked and who can see it (see "Engagement data and privacy").
- [ ] Test that sign-in code emails reach @ems-wi.com inboxes (not junk or quarantine); ask IT to allow the sender if needed.

### Phase 1: MVP (built)
- [x] Sign in with a 6-digit code sent by email, accepted only for @ems-wi.com addresses
- [x] Profiles: name, position (Physician/APC/Staff), areas of interest (tags), optional short "leadership goals" note
- [x] Admin panel: grant or remove Poster and Admin roles and the Shareholder flag by email, including for people who have not signed in yet
- [x] Posting opportunities (Poster/Admin): title, type, description, who can commit, time commitment, dates, number of spots, sign-up deadline, contact person, "good for new hires" label, tags, draft/open/closed/archived
- [x] Starting content: the 15 committees from the brochure
- [x] Browse and filter: by type, tag, time commitment, "good for new hires", open/closed, text search
- [x] Two sign-up levels: **Interested** (no commitment) and **Committed** (takes a spot)
- [x] Number of spots and a waitlist: when an opportunity is full, new commitments go on the waitlist, and the first waitlisted person moves up when someone withdraws or a spot is added
- [x] Public list of names on each opportunity: Committed, Waitlist and Interested
- [x] "My sign-ups" page for each member
- [x] Full history log of every sign-up change (who, what, when)
- [x] Admin engagement table with an "Interested but never committed" filter
- [x] CSV exports of members, opportunities, sign-ups and history (admin); these also serve as the backup
- [x] Every opportunity has its own link to paste into the newsletter; people who are not signed in land there after signing in

### Phase 2: Engagement dashboard
- [ ] Posters mark attendance or completion (in bulk: "everyone attended" with exceptions)
- [ ] Richer dashboard: trends over time, by position and by type

### Phase 3: Optional extras
- [ ] Automatic weekly email digest (only if manual newsletter links fall short; see the email limits under "Technology")
- [ ] Calendar invite (.ics) for event-type opportunities

## Engagement data and privacy

This is what will be recorded:

| Data | Source |
|---|---|
| Interest expressed (and when) | Member clicks "Interested" |
| Commitments, withdrawals, waitlist moves (and when) | Sign-up history log |
| Attendance / completion | Poster marks it |
| Stated interests and leadership goals | Member's profile |
| Position (Physician/APC/Staff) | Member's profile |

**Dashboard metrics**
- Per person: number of interests, commitments, completions and withdrawals; types of opportunities; first and most recent activity
- Per opportunity: how full it is, time to fill, completion rate
- Group-wide: percent of members active in the last 6 and 12 months, trends by type and position, and a list of **people showing interest who haven't committed yet** (possible future leaders to approach)

**Not tracked:** page views and clicks tied to a specific person.

**Required safeguards**
- A plain-language "What we track and who sees it" page, linked from the login screen and the footer
- Only admins see the engagement dashboard and exports
- Leadership decides in writing whether the data may be used in evaluations or partnership decisions, and the privacy page says what they decided
- Never allow patient information. The posting form carries a warning.

## Data model

The real definitions are in `supabase/migrations/0001_init.sql`. In short:

- **profiles**: name, email, position, role (member/poster/admin), shareholder flag
- **member_interests**: interests and leadership goals (private to the member and admins)
- **member_presets**: roles an admin set for people who have not signed in yet
- **opportunities**: title, type, description, who can commit, time commitment, time needed, dates, deadline, spots, new-hire label, topics, contact, status
- **signups**: one row per person per opportunity, with a status: interested, committed, waitlisted, withdrawn, completed or did not attend
- **signup_events**: history of every status change (who, from, to, when, changed by)

## Technology ($0 per month)

| Need | Choice | Notes |
|---|---|---|
| Website | React (Vite), built as a static site | No server of its own to run or pay for |
| Hosting | Cloudflare Pages (free) | Redeploys automatically on every push to GitHub. Chosen over Vercel because Vercel's free plan has been limited to non-commercial use. |
| Database + login | Supabase (free) | Postgres database with one-time email login. Database rules enforce who can see and change what, so security does not depend on the website code. |
| Login emails | Brevo (free), connected to Supabase | Supabase's built-in email is for testing only (2 emails an hour). Resend was ruled out because it needs a domain we own before it will email other people. |

**Free-plan limits and how the plan handles them** (these change, so confirm current terms before launch):
- **Supabase pauses a free project after about a week with no activity.** A group of 150 using the site will usually keep it active. If it does pause, an admin restores it from the Supabase dashboard with one click and no data is lost. A free scheduled job (GitHub Actions) that touches the database once a week would prevent pausing; check Supabase's terms before relying on that.
- **Supabase's free plan does not include automatic backups.** An admin downloads the CSV export once a month and stores it in the group's OneDrive or SharePoint.
- **Email sending limits.** Brevo's free plan has been about 300 emails a day. People stay signed in on their own devices, so login emails are occasional. **Launch day is the risk:** if everyone signs in at once, the day's limit may run out. Invite people in batches (for example, about 50 a day) or use Brevo's higher limit. Supabase also has its own hourly login-email limit, which can be raised in its settings.
- Database size (500 MB free) is far more than 150 people will ever use.

**Upgrading later** needs no rebuild. None of these services offer one-time plans; upgrades are monthly or yearly:
- Custom web address: about $10 to $15 a year
- Supabase Pro (no pausing, daily backups): about $25 a month
- Brevo paid plan: only if automatic digest emails to everyone are added

**Security basics**
- Keep secrets in hosting settings, never in this repository. The public Supabase "anon" key is designed to be visible in the website; the "service role" key must never be.
- Database rules on every table
- Account creation limited to @ems-wi.com, checked inside the database, not just on the login page

## Open questions

1. Leadership's written decision on whether engagement data may be used in evaluations or partnership decisions (then add it to the "What we track" page).
2. Which of the 15 committees should carry the "good for new hires" label? (None are labeled yet.)
3. Physician and APC Interview Committees: the brochure lists them under "All Team Members". Keep as one entry open to all, or split into separate physician and APC entries?

## Decisions log

| Date | Decision |
|---|---|
| 2026-09-28 | Custom build chosen over a Microsoft Lists / Power Automate setup |
| 2026-09-28 | Posting limited to members an admin approves; approved posters' posts go live without review |
| 2026-09-28 | Names on each opportunity (Committed and Interested) are visible to all members |
| 2026-09-28 | Detailed individual engagement data for admins; no click or page-view tracking; transparency page required |
| 2026-09-28 | Sign-in with a one-time email link, limited to @ems-wi.com; APCs and admin staff may join; no separate roster |
| 2026-09-28 | No Teams integration; the link is shared through the newsletter by hand; email digest is optional and later |
| 2026-09-28 | No new-hire tracking or commitment limits; the committee handles that in person. Keep a "good for new hires" label on posts. |
| 2026-09-28 | Must cost $0 per month: Supabase free + Cloudflare Pages free + a free email-sending plan |
| 2026-09-28 | Start on free `*.pages.dev`; project owner is the first admin and adds others by email |
| 2026-09-28 | Seed the site with the 15 committees from the brochure, with "who can commit" set to all / physicians / shareholders as the brochure groups them |
| 2026-09-28 | Anyone can mark Interested in any opportunity; committing is limited by position or the shareholder flag |
| 2026-09-28 | Sign in with a typed 6-digit code, not a clickable link, because Microsoft 365 link scanning can use up one-time links; codes also work across devices |
| 2026-09-28 | Brevo for sign-in emails (Resend needs a domain we own) |
| 2026-09-28 | Match ems-wi.com branding: colors sampled from site screenshots; free lookalike fonts (Syncopate, Cormorant Garamond, Figtree); EMS five-dot mark recreated in code |
