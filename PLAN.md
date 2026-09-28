# EMS Opportunities Portal: Project Plan

A private website where our physician group can post committee, leadership and event opportunities. Members sign up, and the site keeps track of who is engaged and interested in what.

## Goals

1. **Get the word out in real time.** One live link that always shows open opportunities, plus automatic alerts when something new is posted.
2. **Track engagement and interest.** Record who expresses interest in, commits to and completes what, so leadership can spot future leaders and see how engaged the group is overall.
3. **Encourage participation.** Show who has signed up for each opportunity so people can see their colleagues taking part.
4. **Bring new hires in gently.** Point new physicians to low-commitment "good first" opportunities and stop them from taking on too much.

## Users and roles

About 150 physicians. The group uses Microsoft 365.

| Role | Who | Can do |
|---|---|---|
| Member | Every approved physician | Browse, express interest, commit, withdraw, edit own profile |
| Poster | Members an admin has approved | Everything a member can, plus create and manage their own opportunities and mark attendance |
| Admin | Project owner and anyone they appoint | Everything, plus manage the roster and roles, see all engagement data, export data, change settings |

**Access control:** only people on an admin-managed **roster** (an allowlist of emails) can use the site. Signing in with a Microsoft work account alone is not enough, because the organization's Microsoft tenant probably includes staff outside the group (nurses, admin staff, other departments).

## Features by phase

### Phase 0: Setup (no code)
- [ ] Talk to IT: ask whether an outside web app may store staff names and emails, and ask them to register the app in Microsoft Entra ID so people can sign in with Microsoft. We need a client ID, client secret and tenant ID, and admin consent may be required.
- [ ] Create accounts under a shared group email, not a personal one: Supabase, Vercel and Resend.
- [ ] Decide on the site address (a free `*.vercel.app` address or a custom domain).
- [ ] Get the physician roster (names, emails, hire dates) as a spreadsheet.
- [ ] Get leadership to agree on what engagement data is tracked and who can see it (see "Engagement data and privacy").

### Phase 1: MVP
- [ ] Sign in with Microsoft (fallback: a one-time email link limited to the group's email domain)
- [ ] Roster allowlist: an admin uploads a CSV or adds people one at a time; anyone not on the roster is refused access
- [ ] Profiles: name, hire date, areas of interest (tags), optional short "leadership goals" note
- [ ] Admin panel: manage the roster, grant or remove Poster and Admin roles
- [ ] Posting opportunities (Poster/Admin): title, type, description, time commitment, dates, number of spots, sign-up deadline, contact person, "new-hire friendly" flag, tags
- [ ] Browse and filter: by type, tag, time commitment, new-hire friendly, open/closed
- [ ] Two sign-up levels: **Interested** (no commitment) and **Committed** (takes a spot)
- [ ] Number of spots and a waitlist: when an opportunity is full, new commitments go on the waitlist, and the first waitlisted person moves up when someone withdraws
- [ ] Public list of names on each opportunity, split into Committed and Interested
- [ ] "My opportunities" page for each member
- [ ] CSV export of opportunities and sign-ups (admin)

### Phase 2: New-hire track and engagement dashboard
- [ ] New-hire period based on hire date (default 12 months; admin can change it)
- [ ] "Good first opportunities" view for new hires
- [ ] Limit on how many active commitments a new hire can hold (default 2; admin can change it), with a friendly message when they reach it and a way for an admin to override
- [ ] The poster gets a heads-up when a new hire signs up
- [ ] Posters mark attendance or completion (in bulk: "everyone attended" with exceptions)
- [ ] Full history log of every sign-up change (who, what, when)
- [ ] Engagement dashboard (admin), described below

### Phase 3: Notifications
- [ ] **Teams channel post** whenever a new opportunity is published, sent through a Teams Workflows webhook. Because everyone already uses Teams, this is the easiest way to reach phones.
- [ ] Weekly email digest of new and closing-soon opportunities (members can opt out)
- [ ] Optional instant email by category, for members who opt in
- [ ] Calendar invite (.ics) for event-type opportunities

### Phase 4: Optional
- [ ] Phone push notifications (installable web app). On iPhone, this only works after the person adds the site to their home screen.
- [ ] Anonymous feedback after an opportunity ends

## Engagement data and privacy

Leadership wants as much data as possible. This is what will be recorded:

| Data | Source |
|---|---|
| Interest expressed (and when) | Member clicks "Interested" |
| Commitments, withdrawals, waitlist moves (and when) | Sign-up history log |
| Attendance / completion | Poster marks it |
| Stated interests and leadership goals | Member's profile |
| Hire date | Roster |

**Dashboard metrics**
- Per person: number of interests, commitments, completions and withdrawals; types of opportunities; first engagement date; days from hire to first engagement; last activity date
- Per opportunity: how full it is, time to fill, share of new hires, completion rate
- Group-wide: percent of physicians active in the last 6 and 12 months, trends by type, and a list of **people showing interest who haven't committed yet** (possible future leaders to approach)

**Deliberately NOT tracked (for now):** page views and clicks tied to a specific person. This adds little value, feels like surveillance and makes trust harder to earn. It can be revisited.

**Required safeguards**
- A plain-language "What we track and who sees it" page, linked from the login screen and the footer
- Only admins see the engagement dashboard and exports
- Leadership decides in writing whether the data may be used in evaluations or partnership decisions, and the privacy page says what they decided
- Never allow patient information. The posting form carries a warning.
- Decide how long data is kept (suggested: kept while the person is in the group, then made anonymous)

## Data model (draft)

- **profiles**: id, email, full_name, role (member/poster/admin), hire_date, active (on roster), interests[], leadership_goals, notification_prefs, created_at
- **opportunities**: id, title, type (committee/leadership/event/project/other), description, commitment_level (one_time/short_term/ongoing), est_hours, start_date, end_date, signup_deadline, capacity (blank = unlimited), new_hire_friendly, tags[], contact_id, status (draft/open/closed/archived), created_by, created_at
- **signups**: id, opportunity_id, user_id, level (interested/committed), status (active/waitlisted/withdrawn/completed/no_show), created_at, updated_at; one row per person per opportunity
- **signup_events**: id, signup_id, from_level, to_level, from_status, to_status, changed_by, changed_at (the history log)
- **settings**: new_hire_months, new_hire_commit_cap, teams_webhook_url, digest_day

## Technology

| Need | Choice | Notes |
|---|---|---|
| Website | Next.js (TypeScript) | Well suited to building with Claude Code |
| Database + login | Supabase (Postgres) | Built-in Microsoft ("Azure") sign-in, limited to our tenant; database rules enforce who can see and change what |
| Hosting | Vercel | Redeploys automatically on every push to GitHub |
| Email | Resend | Weekly digest and alerts |
| Teams alerts | Teams Workflows webhook | Needs a Teams channel owner to set it up |

**Cost and plan limits to check before launch** (these change, so confirm current terms):
- Supabase's free tier has paused inactive projects after about a week. Use the paid plan (about $25/mo) for the live site.
- Vercel's free Hobby plan has been limited to non-commercial use. Group use may require Pro (about $20/mo).
- Resend's free tier should cover a weekly digest to 150 people. Check its daily sending limit.

**Security basics**
- Keep secrets in hosting environment variables, never in this repository
- Supabase database rules on every table (members only see what they are allowed to see)
- Admin-only pages checked on the server, not just hidden in the browser

## Open questions

1. Do all physicians use **one email domain** in the Microsoft tenant? Are some on a different one (for example, hospital vs. group)?
2. Will IT register the app for Microsoft sign-in? If not, use the one-time email link.
3. Once someone is approved as a Poster, do their posts go live immediately, or does each post need admin approval? (Current plan: live immediately, and an admin can edit or close any post.)
4. How long is the new-hire period (default 12 months) and what is the commitment limit (default 2)?
5. Which Teams channel should receive new-opportunity posts?
6. Opportunity types and tags: confirm the starting list (committee, leadership, event, project, other).
7. Custom domain, or is `*.vercel.app` fine?

## Decisions log

| Date | Decision |
|---|---|
| 2026-09-28 | About 150 physicians; Microsoft 365 organization |
| 2026-09-28 | Posting is limited to members an admin approves; the project owner is the first admin and can appoint others |
| 2026-09-28 | Names on each opportunity are visible to all members, to encourage participation |
| 2026-09-28 | Leadership gets detailed individual engagement data; a transparency page is required |
| 2026-09-28 | Custom build (Next.js + Supabase + Vercel) chosen over a Microsoft Lists / Power Automate setup |
