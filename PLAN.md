# EMS Opportunities Portal: Project Plan

A private website where our group can post committee, leadership and event opportunities. Members raise a hand, each post's lead confirms who joins, and the site keeps track of who is engaged and interested in what.

## Goals

1. **Get the word out in real time.** One live link that always shows open opportunities. People are pointed to it through the group newsletter and regular reminders, with an optional automatic email digest later.
2. **Track engagement and interest.** Record who expresses interest in, is confirmed for and completes what, so leadership can spot future leaders and see how engaged the group is overall.
3. **Encourage participation.** Show who has signed up for each opportunity so people can see their colleagues taking part.
4. **Give new hires an easy way in.** Posters can label opportunities as good for new hires. There is no new-hire tracking and no limit on commitments; the in-person committee handles that.
5. **Cost nothing to run.** Free plans only. The only optional cost is a custom web address (about $10 to $15 a year).

## Users and roles

About 150 physicians, plus APCs and admin staff who share the same email domain. Everyone signs in with an **@ems-wi.com** email address.

| Role | Who | Can do |
|---|---|---|
| Member | Anyone with an @ems-wi.com email | Browse, raise a hand (Interested), take it down or step off, edit own profile. Joining is confirmed by the post's lead |
| Shareholder | A position members choose (admins can correct it) | Can raise a hand for shareholders-only committees |
| Poster | Members an admin has approved | Everything a member can, plus create and manage their own opportunities and mark attendance. Posts go live immediately; admins do not review them first. |
| Admin | Project owner and anyone they appoint | Everything, plus manage roles, edit or close any post, see all engagement data, export data |

**Access control:** only @ems-wi.com addresses can create an account. That domain includes only group members (physicians, APCs, admin staff), so no separate roster is needed. Each profile has a **position** field (Physician / APC / Staff) so reports can be filtered.

**Positions:** Employed physician, Shareholder track, Shareholder, APC, Administrative staff. Members pick their own; admins can correct anyone's.

**Who can sign up:** each post lists exactly which positions can sign up, with presets: Everyone, Physicians and APCs, Physicians, Shareholder track and shareholders, Shareholders, Administrative staff. Everyone can **view** every post (for future reference), but only listed positions can mark Interested or Commit. Administrative staff sign up only for administrative-staff posts and posts open to everyone. The brochure's "All Team Members" committees are open to everyone, physician committees to the three physician positions, and shareholder committees to shareholders.

**Who sees names:** admins and the person who posted an opportunity always see who signed up. Other members see only counts, unless the poster turns on "Show names to members" for that post.

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
- [x] Admin panel: grant or remove Poster and Admin roles and Shareholder status by email, including for people who have not signed in yet
- [x] Posting opportunities (Poster/Admin): title, type, description, who can commit, time commitment, dates, number of spots, sign-up deadline, contact person, "good for new hires" label, tags, draft/open/closed/archived
- [x] Starting content: the 15 committees from the brochure
- [x] Browse and filter: by type, tag, time commitment, "good for new hires", open/closed, text search
- [x] Two sign-up levels: **Interested** (no commitment) and **Committed** (takes a spot)
- [x] Number of spots and a waitlist: when an opportunity is full, new commitments go on the waitlist, and the first waitlisted person moves up when someone withdraws or a spot is added
- [x] Public list of names on each opportunity: Confirmed and Interested (when the owners choose to show names)
- [x] "My sign-ups" page for each member
- [x] Full history log of every sign-up change (who, what, when)
- [x] Admin engagement table with an "Interested but never confirmed" filter
- [x] CSV exports of members, opportunities, sign-ups and history (admin), plus a one-file full backup of every table
- [x] Every opportunity has its own link to paste into the newsletter; people who are not signed in land there after signing in

### Phase 1.5: Second round (built)
- [x] Positions: Employed physician, Shareholder track, Shareholder, APC, Administrative staff
- [x] "APCs only" preset and main-page section for posts that intentionally exclude physicians
- [x] The separate shareholder checkbox became a Shareholder position (self-selected since 0003; admins can correct it)
- [x] Required location (Door County, Fox Valley, Milwaukee, Watertown, Group-wide), optional hospital/site, meeting format, and a location filter
- [x] "Show on site until" date, separate from the activity dates: committees default to indefinitely, other posts to 180 days; expired posts leave the list but are never deleted; admins see posts ending soon and expired posts
- [x] Nobody can delete an opportunity through the site; close or archive instead
- [x] Names of who signed up: admins and the poster always; members only when the poster turns on "Show names to members" (off by default); counts are always shown
- [x] Curated topic list shared by opportunities and member interests, managed by admins; members add write-in interests; admins see who is interested in each topic and can email them
- [x] Several owners per post (co-chairs): whoever posts it is the first owner; owners and admins add co-owners by email on the post page (the person must have signed in once); owners can step down; only admins remove others. Owners edit the post and see every name
- [x] "My posts" page for posters and admins: every post they own, with counts, names, and email buttons (everyone, per group, or copy the addresses)

### Phase 2: Engagement dashboard and committee leads
- [ ] Every committee has its lead added as an owner (posts with no owner can only be decided by site admins)
- [ ] Each lead reviews their post: description, time and hours, contacts (replace the "EMS Admin" placeholder), seat count and who can sign up (for example, limit the PPC to the right positions)
- [ ] Optional: a People Analyzer (Traction / EOS) for each role, so leads judge fit the same way ("right people, right seats")
- [x] Member lists: leads add their current members on My posts by typing a name (people who have not signed in yet are added at their first sign-in), Remove people who leave, and confirm the list once a year (November email plus a note on the page). Admins export all lists as a CSV
- [ ] Leads add their current members, so the member lists are accurate
- [ ] Communicate the above to committee leads (Sam, the c-suite or Jawwad), with a short "how to confirm people" note
- [ ] Posters mark attendance or completion (in bulk: "everyone attended" with exceptions)
- [x] Admin Insights ("Leadership pipeline"): engagement funnel, activity by month, rising stars, interest heatmap by location and by position, and gaps (topics wanted with no post, quiet posts, locations with nothing open), filterable by time range and position

- [x] Suggest someone: any member suggests a colleague for a post; the colleague gets one email (even before their first sign-in). Leads see suggestions on their posts
- [x] My service record on My sign-ups (Lead / Member, since, before), printable
- [x] Committees at a glance on Insights: lead, members, seats, waiting, suggestions, last list check, with flags for what needs attention

### Phase 3: Optional extras
- [ ] Automatic weekly email digest of new posts to everyone (only if manual newsletter links fall short; see the email limits under "Technology")
- [x] Reminder emails (built, off until an admin turns them on): owners get a summary about every two weeks of people not yet ticked Contacted; members get one follow-up three weeks after signing up if nobody ticked them; opt-out on Profile; at most 150 a day
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
- Group-wide: percent of members active in the last 6 and 12 months, trends by type and position, and a list of **people showing interest who haven't been confirmed yet** (possible future leaders to approach)

**Not tracked:** page views and clicks tied to a specific person.

**Required safeguards**
- A plain-language "What we track and who sees it" page, linked from the login screen and the footer
- Only admins see the engagement dashboard and exports
- Leadership decides in writing whether the data may be used in evaluations or partnership decisions, and the privacy page says what they decided
- Never allow patient information. The posting form carries a warning.

## Data model

The real definitions are in `supabase/migrations/`. In short:

- **profiles**: name, email, position (employed physician / shareholder track / shareholder / APC / administrative staff; stored internally as partnership_track / partner), role (member/poster/admin)
- **interest_categories**: the curated topic list (admins add, rename, retire; never deleted)
- **opportunity_categories** / **member_interest_categories**: which topics each opportunity has and which each member picked
- **member_interests**: interests and leadership goals (private to the member and admins)
- **member_presets**: roles an admin set for people who have not signed in yet
- **opportunities**: title, type, description, who can commit, time commitment, time needed, dates, deadline, spots, new-hire label, topics, contact, status
- **signups**: one row per person per opportunity, with a status: interested, committed (shown as Confirmed; set by the post's lead), not_selected ("Not this time", shown to the member as "Reviewed by the lead"), withdrawn, completed or did not attend. waitlisted is no longer used (0012)
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
- **Supabase's free plan does not include automatic backups.** An admin downloads the full backup once a month (the Admin page reminds them after 30 days) and stores it in the group's OneDrive or SharePoint.
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
   - Related (c-suite, 2026-10-12): could the site feed the year-end tracking of shareholder involvement for the incentive bonus? To discuss in person; nothing planned yet. The site already keeps a dated record of who raised a hand, who a lead confirmed and who stepped off, and could later record attendance. Before any use for pay: decide what counts (confirmed seats, attendance, leadership roles, hours), who verifies it, and update the "What we track" page so members know.
   - Current process: each of the 51 shareholders emails one physician at year end. Criteria (any one qualifies): 1) hold an elected position; 2) ongoing administrative duties; 3) a committee internal to EMS or with the hospital system needing about 1 hour a month; 4) 3 RN activities a year.
   - What the site can confirm: 1 no; 2 partly (Leadership posts where a lead confirmed them); 3 partly (EMS committees with lead-confirmed members only; not hospital committees, attendance or hours); 4 no, unless RN events are posted and attendance is recorded.
   - This year (decided 2026-10-13): a form replaces the 51 emails, with the four criteria as checkboxes plus "tell us what" and dates. Use the service that holds the @ems-wi.com accounts, limited to the organization: Microsoft Forms if Microsoft 365 (likely, since email is 365), Google Forms if Google Workspace. Ask IT which one.
   - Later, once Phase 2 rosters are in place and leadership decides: (a) the site gives each shareholder a pre-filled Google Form link listing their confirmed committees and leadership roles (Google Forms supports pre-filled links; Microsoft Forms support is unconfirmed), or (b) a "My year" page on this site with a reviewer view.
   - If built, it belongs on this site as a separate page, not a separate site: it reuses sign-in, the member list, positions (the 51 shareholders are already marked) and the data to pre-fill, with one place to secure and maintain. Keep it in an area only shareholders and the reviewer see, with clear wording, so the opportunities side stays about engagement rather than pay. Always keep a self-report path so nobody loses credit because a lead did not use the site.
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
| 2026-09-28 | Anyone can mark Interested in any opportunity; committing is limited by position |
| 2026-09-28 | Sign in with a typed 6-digit code, not a clickable link, because Microsoft 365 link scanning can use up one-time links; codes also work across devices |
| 2026-09-28 | Brevo for sign-in emails (Resend needs a domain we own) |
| 2026-09-28 | Match ems-wi.com branding: colors sampled from site screenshots; free lookalike fonts (Syncopate, Cormorant Garamond, Figtree); EMS five-dot mark recreated in code |
| 2026-09-28 | Partners are the shareholders: one Partner position, set only by admins; "Partners only" replaces "Shareholders only" |
| 2026-09-28 | Staff position renamed Administrative staff; physicians split into Employed physician and Partnership track |
| 2026-09-28 | Names of who signed up: hidden from members by default; the poster can show them per post; admins and the poster always see them |
| 2026-09-28 | Posting window: committees indefinite by default, other posts 180 days, picked on a calendar or "indefinitely"; expired posts kept for history |
| 2026-09-28 | Opportunities are never deleted through the site |
| 2026-09-28 | Every post needs a location: Door County, Fox Valley, Milwaukee, Watertown or Group-wide; hospital/site optional |
| 2026-09-28 | Interests come from one admin-managed topic list, shared with opportunity topics, plus an optional write-in |
| 2026-09-28 | Use the company's own titles: "Shareholder track" and "Shareholder" (not "Partnership track" / "Partner"). Only labels changed; the database still stores them as partnership_track / partner |
| 2026-09-28 | Members can choose Shareholder themselves (admin-only was confusing for real shareholders). Accepted risk: someone could mislabel themselves to join shareholders-only committees; admins see every commitment with names and positions and can correct it |
| 2026-09-28 | Who can sign up is a per-post list of positions (replaces everyone / physicians / shareholders). Ineligible people can view but not mark Interested or Commit |
| 2026-09-28 | Shareholder-track posts are open to shareholder track and shareholders; employed physicians cannot join shareholder or shareholder-track posts |
| 2026-09-28 | Administrative staff join only administrative-staff posts and posts open to everyone; the brochure's "All Team Members" committees are open to everyone, including administrative staff |
| 2026-09-28 | Add an admin Insights page to spot rising leaders and unmet interest; computed in the browser from existing data, no database change. Attendance marking deferred |
| 2026-09-30 | Add an "APCs only" preset and section; some posts are intentionally closed to all physician positions |
| 2026-09-30 | Posts can have several owners (for co-chairs), added and removed only by admins, by email, after the person has signed in once. Adding a plain member makes them a poster; removing an owner leaves their role alone. The seeded committees start with no owner |
| 2026-09-30 | "My posts" menu item for posters and admins, with group email links (Bcc) and a copy-addresses fallback for long lists |
| 2026-09-30 | Safety net: deleting a person or post with any activity is blocked in the database (deliberate erase commands exist for the SQL editor only); every post edit and role change is logged; admins download a one-file full backup, and each download is recorded |
| 2026-09-30 | Owners add their own co-owners by email; being an owner is enough to edit that post (the poster role is only for creating posts), so owner-added members are not made posters. Owners can step down but not remove others or leave a post with no owner; admins can still remove anyone. Ownership changes are logged |
| 2026-09-30 | "Moments of delight" for members: a brief burst of the five EMS dots and "You're in!" on Commit (not on the waitlist), a ripple on Interested, numbers that count up, spot bars that fill. Understated, no new libraries, and fully off for people who turn on reduced motion |
| 2026-09-30 | The site states its purpose positively in three places (welcome screen, footer, What we track page); no "not punitive" wording, which would plant the idea |
| 2026-10-03 | Posts list several contacts (name and email each, up to 10, anyone). The edit page has "Add another contact" and "Add the owners"; contacts stay separate from owners (owners edit, contacts are who to ask) |
| 2026-10-03 | Positions can be set in advance for people who have not signed in, and in bulk from pasted lists (shareholders, then track, then all physicians). Lists never downgrade a position or change roles |
| 2026-10-03 | Posters by request: members see Post, which asks an admin for posting access (optional note). Admins approve or decline from Admin > Manage, singly or all at once; a count by Admin in the menu shows waiting requests. Every request and decision is kept |
| 2026-10-03 | "Admin" role relabelled "Site admin" and "role" shown as "site role", to keep it apart from the Administrative staff position. Granting Site admin asks for confirmation, and the Admin page lists current site admins. Site admins are kept to about three people |
| 2026-10-09 | Pilot fixes: confirmations happen on the page, never as browser pop-ups (blocked in the Outlook app on iPhone, which broke Withdraw); page loads retry automatically and show "Try again" instead of a dead end |
| 2026-10-09 | Reminder emails, changing the earlier "no automatic emails" stance for these two cases only. Owners tick "Contacted" per person on My posts (the site cannot otherwise know); owners get a summary about every two weeks listing people not yet ticked, spread across the 14 days so sends do not pile onto one day, and only when someone is waiting (no daily digest). Members get one follow-up after three weeks if not ticked. Anyone can turn these off on Profile. Sent from the database (pg_cron + pg_net) through Brevo's API, at most 150 a day so sign-in codes keep room in the free 300; the Brevo key lives in the Supabase Vault. Off until an admin turns it on |
| 2026-10-12 | Leads confirm who joins ("right people, right seats", c-suite feedback after a pilot sign-up for the PPC that was not a fit). Members can no longer commit themselves to anything: they raise a hand (Interested). The post's owners, or a site admin, choose Confirm or Not this time for each person, can undo either, and can add current members by email (they must have signed in once). Seat limits apply when confirming; the waitlist is retired. "Not this time" shows the member the neutral "Reviewed by the lead" (the lead tells them personally) and they may raise a hand again. "Committed" is shown everywhere as "Confirmed". Reminder emails cover only people still waiting. Supersedes the 2026-09-28 rules on committing and the first-come waitlist |
| 2026-10-13 | Year-end shareholder involvement (incentive bonus): a form this year instead of 51 emails; revisit site support (pre-filled form or a "My year" page on this site) after Phase 2 and leadership's written decision |
| 2026-10-19 | Committee leads set as owners and contacts (one lead per committee, two for Prehospital and Peer Review). Owners can now be named before their first sign-in and are applied when they sign in. New committees: Outreach, Peer Review (PRC), Resident Education, Patient Satisfaction. Chart Reviews and Missing Charts merged into one post. Peer Support keeps EMS Admin as contact for now |
| 2026-10-21 | Committee member lists: the confirmed people on each post are the group's record of who serves where, and a future data source for the year-end shareholder involvement review (leadership agrees). No attendance or activity ticking, so no extra work for leads: someone who is not active is removed or nudged by the lead. Leads add members by typing a name and picking from suggestions, including people who have not signed in yet (added automatically at first sign-in; they count toward seats). "Remove" replaces Undo for confirmed members and records them as having left, so service dates are kept. Once a year leads confirm the list ("List is up to date"): one email in November plus a note on the page. Admins can export all member lists. The What we track page is not changed yet |
| 2026-10-23 | Reaching people already on committees, who have no reason to visit: (1) "Suggest someone" on every open post. Any signed-in member names a colleague and the site sends one email saying who suggested them, even to people who have never signed in. Limits: once per person per post a year, 3 per person a month, 10 a day per sender; eligible positions only; respects the email opt-out; its own Admin switch, on by default, separate from reminder emails. Suggestions are kept and visible to the suggester, the post's leads and admins, and listed on the What we track page. The name search is opened to all members (it only shows names and work emails, like the directory). (2) "My service record" on My sign-ups: Lead or Member, since when, and past service, printable; built from existing history, no new data. A monthly opportunities email and a newsletter block are deferred |
| 2026-10-23 | Committees at a glance for leadership (Insights): one row per committee with lead, members, open seats, people waiting, suggestions and the last list check, problems first. No new emails for now (owner wants to hold email volume); a monthly digest and year-end record email stay deferred |
| 2026-09-30 | The member directory (names, emails, positions, roles) stays readable to signed-in members, like the Outlook address book; interests, goals and history stay private to the member and admins |
