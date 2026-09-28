# Setting up the live site

This takes about an hour, done once. Everything here is free. Use a shared group email address (not a personal one) for every account, so the site does not depend on one person.

You will create three accounts:

| Service | What it does | Cost |
|---|---|---|
| Supabase | Stores the data and handles sign-in | Free |
| Brevo | Sends the sign-in code emails | Free (about 300 emails a day) |
| Cloudflare | Hosts the website | Free |

Keep a note of each value marked **Save this**. Never paste the Supabase **service_role** or **secret** key anywhere in this project.

---

## 1. Supabase (database and sign-in)

1. Go to supabase.com and sign up.
2. Click **New project**. Name it `ems-opportunities`, create a strong database password (**Save this** somewhere safe), and pick a US region.
3. Wait for the project to finish setting up (a minute or two).

### Create the tables and rules
4. In the left menu, open **SQL Editor**, then **New query**.
5. Open `supabase/migrations/0001_init.sql` from this repository, copy all of it, paste it in and click **Run**. It should say "Success. No rows returned."
6. New query: do the same with `supabase/migrations/0002_positions_locations_interests.sql`. Run every file in `supabase/migrations` once, in number order.
7. New query again: copy all of `supabase/seed.sql`, paste and **Run**. This loads the topics and the 15 committees from the brochure.
8. New query again: make yourself the first admin. Replace the email with yours, then **Run**:

   ```sql
   insert into public.member_presets (email, role)
   values ('your.name@ems-wi.com', 'admin')
   on conflict (email) do update set role = 'admin';

   update public.profiles set role = 'admin' where email = 'your.name@ems-wi.com';
   ```

   Use lowercase. The first part applies when you first sign in; the second covers the case where you already have.

### Get the connection values
9. Open **Project Settings** (gear icon), then **API** (it may be called **API Keys**).
10. **Save this:** the **Project URL** (looks like `https://abcdefgh.supabase.co`).
11. **Save this:** the **anon public** key, or the **publishable** key if that is what you see. Either works. It is safe for this key to be public.

---

## 2. Brevo (sends the sign-in emails)

Supabase's built-in email is limited to 2 emails an hour and is only for testing, so the site needs an email service.

1. Go to brevo.com and sign up for the free plan.
2. Add a sender: **Senders, Domains & Dedicated IPs**, then **Senders**, then **Add a sender**. Use the group email address you signed up with and confirm it from the email Brevo sends.
3. Open **SMTP & API**, then the **SMTP** tab, and click **Generate a new SMTP key**.
4. **Save this:** the SMTP server (`smtp-relay.brevo.com`), port (`587`), login and the SMTP key.

**Important: sender address.** Do not send from an @ems-wi.com address unless IT sets up the domain in Brevo. Otherwise, your own email system may reject the messages as spoofed. Use the group's separate address for now.

---

## 3. Connect Brevo to Supabase and set up sign-in emails

In Supabase:

1. **Authentication**, then **Emails** (or **SMTP Settings**): turn on **Custom SMTP** and enter:
   - Sender email: the address you verified in Brevo
   - Sender name: `EMS Opportunities`
   - Host: `smtp-relay.brevo.com`, Port: `587`
   - Username: your Brevo SMTP login; Password: the Brevo SMTP key
2. Still under **Emails**, open the **Magic Link** template. Set the subject to `Your EMS Opportunities sign-in code` and replace the body with the contents of `supabase/templates/sign_in_code.html`. Save.
3. Do the same for the **Confirm signup** template (a person's very first sign-in may use this one).
4. **Authentication**, then **Rate Limits**: raise **emails sent per hour** to about 100. The default is very low.

**Why a code instead of a link:** Microsoft 365 security scanning often "clicks" links in incoming email to check them. That can use up a one-time sign-in link before the person clicks it. A code that people type in avoids this, and it also works when someone reads the email on their phone but signs in on a computer.

---

## 4. Cloudflare Pages (the website)

1. Go to dash.cloudflare.com and sign up.
2. Open **Workers & Pages**, then **Create**, then the **Pages** tab, then **Connect to Git**. Authorize GitHub and choose the `ems-opportunities` repository.
3. Settings:
   - Production branch: `main`
   - Framework preset: `React (Vite)` (or none)
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Under **Environment variables**, add:
   - `VITE_SUPABASE_URL` = your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon or publishable key
   - `NODE_VERSION` = `22`
5. Click **Save and Deploy**. When it finishes, **Save this:** your site address, like `https://ems-opportunities.pages.dev`.

From now on, every change merged into `main` on GitHub redeploys the site automatically.

### Tell Supabase the site address
6. In Supabase, go to **Authentication**, then **URL Configuration**. Set **Site URL** to your `pages.dev` address and add it under **Redirect URLs** too. Save.

---

## 5. Test it

1. Open your site, enter your @ems-wi.com email and click **Email me a sign-in code**.
2. Check your inbox **and junk folder**. If the email never arrives, it may be quarantined by Microsoft 365: ask IT to allow the Brevo sender address.
3. Enter the code, then your name and position. You should see the committees and an **Admin** link at the top.
4. Ask one or two colleagues to try it before announcing it widely.

---

## 6. Launch

- **Invite people in batches** (about 50 a day). The free email plan allows about 300 emails a day. People stay signed in on their own devices, so after launch day, sign-in emails are rare.
- **Approve posters:** on the **Admin** page, enter someone's email, choose **Poster** and save. They do not need to have signed in yet.
- **Mark shareholders** the same way (tick **Shareholder**), so they can commit to shareholders-only committees. Only admins can make someone a shareholder.
- **Share the link** in the newsletter.

## Monthly: back up the data

The free Supabase plan does not include automatic backups. Once a month, on the **Admin** page, click the four **Export** buttons and save the files to the group's OneDrive.

## If the site stops loading data

Free Supabase projects pause after about a week with no activity. If the site shows errors, sign in to Supabase and click **Restore project** on the dashboard. No data is lost. This is unlikely while the group uses the site regularly.

## Upgrading later

Nothing needs to be rebuilt to upgrade. These are monthly or yearly costs; none of these services offer one-time plans.

| What | Why | Approximate cost |
|---|---|---|
| Custom web address (e.g. `emsopportunities.org`) | Easier to remember; can be bought through Cloudflare | $10 to $15 a year |
| Supabase Pro | No pausing, daily backups | About $25 a month |
| Brevo paid plan | Only if you add automatic digest emails to everyone | Varies |

Check current prices before buying; they change.

## Applying a database update

When a change needs a new file in `supabase/migrations` (for example `0002_...sql`), it will say so in the pull request. To apply it:

1. In Supabase, open **SQL Editor**, then **New query**.
2. Paste the whole new file and click **Run**. Run each new file once, in number order. Never re-run an older one.
3. Right after that, merge the pull request so Cloudflare publishes the matching website. The site may show errors for the minute or two in between.

Download the four Admin exports first if there is data you would hate to lose.
