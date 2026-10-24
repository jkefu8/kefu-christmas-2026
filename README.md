# Kefu Christmas 2026

A small family website: sign up with your full name and a 4-digit PIN, then see your team of three, submit quiz questions and vote on games.

- **Front end:** plain HTML/CSS/JS (`index.html`, `style.css`, `app.js`), hosted on GitHub Pages.
- **Data:** Supabase (free tier). Every table is locked; the site only calls the database functions in `supabase/schema.sql`.

## One-time setup

1. Create a free account at https://supabase.com and a **New project** (any name, e.g. `kefu-christmas`; region: closest to you). Save the database password in `.env`, never in `config.js`.
2. In the project: **SQL Editor → New query**, paste all of `supabase/schema.sql`, press **Run**.
3. **Project Settings → API**: copy the **Project URL** and the **anon / publishable** key into `config.js`. Never use the `service_role` / secret key.
4. Open the site, sign up with your own name, then in the SQL Editor run:
   `update people set is_admin = true where name_key = 'your full name in lowercase';`
   Refresh, and the **Organiser** tab appears.

## Run locally

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Organiser tasks

- **Draw teams:** Organiser tab → Draw teams → (Draw again) → Save and show everyone.
- **Forgotten PIN:** type a new PIN next to their name → Reset PIN, then tell them.
- **Quiz:** all questions and answers are listed in the Organiser tab.
