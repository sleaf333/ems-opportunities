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
| Poster | Members an admin has approved | Everything a member can, plus create and manage their own opportunities and mark attendance. Posts go live immediately; admins do not review them first. |
| Admin | Project owner and anyone they appoint | Everything, plus manage roles, edit or close any post, see all engagement data, export data |

**Access control:** only @ems-wi.com addresses can create an account. That domain includes only group members (physicians, APCs, admin staff), so no separate roster is needed. Each profile has a **position** field (Physician / APC / Staff) so reports can be filtered.

## Features by phase

### Phase 0: Setup (no code)
- [ ] Create free accounts under a shared group email (not a personal one): Supabase, Cloudflare and an email-sending service (Brevo or Resend).
- [ ] Decide on the web address: free `*.pages.dev`, or a custom domain for about $10 to $15 a year.
- [ ] Get leadership to agree on what engagement data is tracked and who can see it (see "Engagement data and privacy").

### Phase 1: MVP
- [ ] Sign in with a one-time link sent by email, accepted only for @ems-wi.com addresses
- [ ] Profiles: name, position (Physician/APC/Staff), areas of interest (tags), optional short "leadership goals" note
- [ ] Admin panel: see all members, grant or remove Poster and Admin roles
- [ ] Posting opportunities (Poster/Admin): title, type, description, time commitment, dates, number of spots, sign-up deadline, contact person, "good for new hires" label, tags
- [ ] Browse and filter: by type, tag, time commitment, "good for new hires", open/closed
- [ ] Two sign-up levels: **Interested** (no commitment) and **Committed** (takes a spot)
- [ ] Number of spots and a waitlist: when an opportunity is full, new commitments go on the waitlist, and the first waitlisted person moves up when someone withdraws
- [ ] Public list of names on each opportunity, split into Committed and Interested
- [ ] "My opportunities" page for each member
- [ ] Full history log of every sign-up change (who, what, when)
- [ ] CSV export of members, opportunities and sign-ups (admin); this also serves as the backup

### Phase 2: Engagement dashboard
- [ ] Posters mark attendance or completion (in bulk: "everyone attended" with exceptions)
- [ ] Engagement dashboard (admin), described below
- [ ] Shareable link for each opportunity, to paste into the newsletter

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

## Data model (draft)

- **profiles**: id, email, full_name, position (physician/apc/staff), role (member/poster/admin), interests[], leadership_goals, created_at
- **opportunities**: id, title, type (committee/leadership/event/project/other), description, commitment_level (one_time/short_term/ongoing), est_hours, start_date, end_date, signup_deadline, capacity (blank = unlimited), new_hire_friendly, tags[], contact_id, status (draft/open/closed/archived), created_by, created_at
- **signups**: id, opportunity_id, user_id, level (interested/committed), status (active/waitlisted/withdrawn/completed/no_show), created_at, updated_at; one row per person per opportunity
- **signup_events**: id, signup_id, from_level, to_level, from_status, to_status, changed_by, changed_at (the history log)

## Technology ($0 per month)

| Need | Choice | Notes |
|---|---|---|
| Website | React (Vite), built as a static site | No server of its own to run or pay for |
| Hosting | Cloudflare Pages (free) | Redeploys automatically on every push to GitHub. Chosen over Vercel because Vercel's free plan has been limited to non-commercial use. |
| Database + login | Supabase (free) | Postgres database with one-time email login. Database rules enforce who can see and change what, so security does not depend on the website code. |
| Login emails | Brevo or Resend (free), connected to Supabase | Supabase's built-in email is for testing only and sends just a few emails an hour |

**Free-plan limits and how the plan handles them** (these change, so confirm current terms before launch):
- **Supabase pauses a free project after about a week with no activity.** A group of 150 using the site will usually keep it active. If it does pause, an admin restores it from the Supabase dashboard with one click and no data is lost. A free scheduled job (GitHub Actions) that touches the database once a week would prevent pausing; check Supabase's terms before relying on that.
- **Supabase's free plan does not include automatic backups.** An admin downloads the CSV export once a month and stores it in the group's OneDrive or SharePoint.
- **Email sending limits.** Resend's free plan has been about 100 emails a day and Brevo's about 300 a day. People stay signed in on their own devices, so login emails are occasional. **Launch day is the risk:** if everyone signs in at once, the day's limit may run out. Invite people in batches (for example, about 50 a day) or use Brevo's higher limit. Supabase also has its own hourly login-email limit, which can be raised in its settings.
- Database size (500 MB free) is far more than 150 people will ever use.

**Security basics**
- Keep secrets in hosting settings, never in this repository. The public Supabase "anon" key is designed to be visible in the website; the "service role" key must never be.
- Database rules on every table
- Account creation limited to @ems-wi.com, checked inside the database, not just on the login page

## Open questions

1. Web address: free `*.pages.dev`, or buy a custom domain?
2. Opportunity types and tags: confirm the starting list (committee, leadership, event, project, other).
3. Who, besides the project owner, will be the first admins?

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
