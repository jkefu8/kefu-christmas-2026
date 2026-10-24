# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

About 20 adults (all over 18, mostly middle-aged parents) from three related families plus partners, gathering for one Christmas in 2026. They use it on their phones in short bursts in the weeks before Christmas, often while busy, and on the day itself. One organiser runs the draw, the quiz and the tournament.

## Product Purpose

The family's private hub for Christmas 2026, named **"A Xmas for the Ages"**. Guests sign in with their name and a 4-digit PIN, spin a wheel to reveal their team of three, submit quiz questions, vote on games, and follow the Bauble Pong knockout. On the day, the organiser runs quiz night from a TV screen. Success: everyone signs up without help, the team reveal and quiz night feel like events, and nobody has to ask "how do I…".

## Positioning

It is built for this family only: their guest list, nicknames, partners kept on separate teams, quiz questions written by relatives about each other, and teams that score as a group. A generic party app or Kahoot can't offer that.

## Operating Context

- Phones in the weeks before: sign up, spin for a team, add quiz questions (true/false or 4-choice, optional photo), vote on games.
- Christmas Day: a laptop connected to the living-room TV shows the quiz screen (`tv.html`). Teams shout or write their answers, and the organiser awards points. Phones follow the Bauble Pong bracket live.
- The organiser uses the Organiser tab for the guest list, PIN resets, the secret team draw, revealing the remaining teams at the end of November, and the bracket.

## Capabilities and Constraints

- Static HTML/CSS/JS on GitHub Pages, with a Supabase backend reached only through locked database functions (see CLAUDE.md). No build step.
- Name + PIN sign-in, restricted to the guest list, with nickname and misspelling matching.
- Teams of three (some of four), partners always on different teams, revealed by each person's spin.
- Drinking games are adults-only. Only Bauble Pong is built in; guests can suggest others.
- Family names and data never go in the public repo.

## Brand Commitments

- Site name: **A Xmas for the Ages** (renamed by the user on 2026-10-24). The family is the Kefu family Christmas.
- The user chose a "Christmas cracker" feel: loud and playful.

## Evidence on Hand

- The real guest list (20 people, 3 couples) lives in `data/seed-guests.sql` (private). No family photos or logos have been supplied, so don't invent any.

## Product Principles

1. Obvious beats clever: someone who's busy must be able to do each task in one go, without instructions.
2. Moments matter: the team reveal, the quiz answer reveal and the tournament champion should feel like events.
3. Fair and private: secret draws stay secret, nobody scores on their own question, and quiz answers are seen only by the author and the quizmaster.
4. Family-only: never expose more of the guest list than needed.

## Accessibility & Inclusion

Everyone is an adult, mostly middle-aged. Use comfortably large text and tap targets, strong contrast, plain wording, and respect reduced-motion settings. The TV screen must be readable from across a living room.
