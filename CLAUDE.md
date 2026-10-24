# Kefu Christmas 2026

Family Christmas site: name + 4-digit PIN login (guest list only), spin-wheel team reveal (teams of three, partners split), true/false and 4-choice quiz questions with optional photos, game votes with how-to-play illustrations (`art.js`).

- Static site (`index.html`, `style.css`, `app.js`, `config.js`) on GitHub Pages; no build step.
- Supabase backend. **All tables are RLS-locked with no grants**; the browser only calls `security definer` functions in `supabase/schema.sql`, each taking `p_token` and checking it via `_person()` / `_admin()`. Any new feature = new function + `grant execute ... to anon`. Never add table policies or grants.
- `schema.sql` must stay re-runnable without data loss (`create ... if not exists`, `create or replace function`).
- `config.js` holds only the public URL + anon/publishable key. Service-role key / DB password live in `.env` only.
- Build DOM with `h()` (text nodes only); never `innerHTML` with user-entered text.
- Guest list lives in `data/seed-guests.sql` (git-ignored). Teams are drawn in secret by the organiser (`drawTeams` in app.js) and each `spin()` only reveals the caller's own team.
- The practice Postgres used for testing (PGlite in the scratchpad) crashes on any `raise exception`, so test error paths against the live API instead.
- The repo is public (free GitHub Pages): never commit family names, PINs or exported data.
