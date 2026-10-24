# Kefu Christmas 2026

A small family website: sign up with your full name and a 4-digit PIN, then see your team of three, submit quiz questions and vote on games.

- **Front end:** plain HTML/CSS/JS (`index.html`, `style.css`, `app.js`), hosted on GitHub Pages.
- **Data:** Supabase (free tier). Every table is locked; the site only calls the database functions in `supabase/schema.sql`.

## One-time setup

1. Create a free account at https://supabase.com and a **New project** (any name, e.g. `kefu-christmas`; region: closest to you). Save the database password in `.env`, never in `config.js`.
2. In the project: **SQL Editor → New query**, paste all of `supabase/schema.sql`, press **Run**.
3. **Project Settings → API**: copy the **Project URL** and the **anon / publishable** key into `config.js`. Never use the `service_role` / secret key.
4. Run `data/seed-guests.sql` (private, not in git) to load the guest list, partners and organiser. Then sign up on the site as the organiser straight away.

## Run locally

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Organiser tasks

- **Teams:** Organiser tab → Set up the draw (secret, partners kept apart). Everyone spins on the Teams tab to reveal their team. End of November: Reveal the others.
- **Guests:** add late guests (and their partner) in the Organiser tab; only listed guests can sign up.
- **Forgotten PIN:** type a new PIN next to their name → Reset PIN, then tell them.
- **Quiz:** all questions and answers are listed in the Organiser tab.
