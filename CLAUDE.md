# Kefu Christmas 2026

Family Christmas site: name + 4-digit PIN login, teams of three, quiz questions, game votes.

- Static site (`index.html`, `style.css`, `app.js`, `config.js`) on GitHub Pages; no build step.
- Supabase backend. **All tables are RLS-locked with no grants**; the browser only calls `security definer` functions in `supabase/schema.sql`, each taking `p_token` and checking it via `_person()` / `_admin()`. Any new feature = new function + `grant execute ... to anon`. Never add table policies or grants.
- `schema.sql` must stay re-runnable without data loss (`create ... if not exists`, `create or replace function`).
- `config.js` holds only the public URL + anon/publishable key. Service-role key / DB password live in `.env` only.
- Build DOM with `h()` (text nodes only); never `innerHTML` with user-entered text.
- The repo is public (free GitHub Pages): never commit family names, PINs or exported data.
