# SKYCITY PRO — full-stack starter

A browser-based 3D drone-game project with Supabase Auth, player profiles, admin-managed Premium entitlements, premium private room creation, Socket.IO room presence, and a leaderboard foundation.

## Included
- Responsive neon dashboard and Three.js city scene.
- Real Supabase email/password registration and login, sign-out, persistent session restore, and automatic token refresh.
- Supplied SKYCITY DRONE RACING logo integrated into the site header.
- Unique usernames enforced by a database constraint.
- Admin panel: find a player by username, grant/revoke Premium, choose expiry, and write an audit record.
- Premium users can create private rooms with invite codes; server checks entitlement before creation.
- Socket.IO room presence (up to 4 pilots) and basic position broadcasts.
- Supabase SQL migration with RLS policies and indexes.
- Render deployment blueprint.

## Important security setup
1. Create/use your Supabase project.
2. In Supabase SQL Editor, run `supabase/migrations/001_skycity_pro.sql`.
3. In Supabase Authentication → Providers, ensure the Email provider is enabled.
4. In Supabase Authentication → URL Configuration, set the Site URL to your deployed Render URL and add your local/deployed app URLs to Redirect URLs if email confirmation is enabled.
5. For email/password registration, users create an account with email, unique username and password. If email confirmation is enabled in Supabase, they must confirm the email before their first login. You can configure this under Authentication → Settings.
6. Set environment variables on Render using the Supabase Project URL, publishable key, and **server-only** service role key.
7. Never put `SUPABASE_SERVICE_ROLE_KEY` in `client/`, HTML, GitHub, or any `VITE_`/`NEXT_PUBLIC_` variable.
8. Create your first admin safely: in Supabase SQL Editor, run:
   `update public.profiles set role = 'admin' where username = 'YOUR_OWN_USERNAME';`
   Only do this for your own verified account. Do not expose this operation in the public app.

## Run locally (Windows PowerShell)
1. Extract the ZIP and open PowerShell in the project folder.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and fill in your Supabase values.
4. Run `npm start`.
5. Open `http://localhost:10000`.

## Premium behavior
Premium is not self-selectable. Only an admin can grant or revoke it. Admin actions are checked server-side against the `profiles.role` field and written to `premium_audit`. Premium unlocks creation of private invite-code rooms. This project does not take payments; add a compliant payment provider and verified webhook before selling subscriptions.

## Deployment
Push the extracted project files (not the ZIP itself) to a GitHub repository. In Render, create a Blueprint from the repository, inspect the plan and costs, then deploy. Add the three Supabase environment variables in the Render service settings.

## Current scope / production checklist
This is a complete runnable project foundation, not a finished commercial game service. The 3D city and controls are playable prototypes; networked room presence is implemented, but authoritative physics, collision/checkpoint validation, robust matchmaking, moderation, rate limits, anti-cheat, payment webhooks, email deliverability, backups, monitoring, and load testing still need production hardening. No real-world drone control is included.


Email/parol login uchun batafsil yo‘riqnoma: `EMAIL_PASSWORD_SETUP_UZ.md`.
