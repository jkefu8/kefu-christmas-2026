---
name: A Xmas for the Ages
description: A family Christmas hub that looks like the contents of a pulled Christmas cracker.
colors:
  cracker-red: "#a3122d"
  cracker-red-stripe: "#9a0f29"
  cracker-red-deep: "#6f0a1d"
  title-red: "#8a0c24"
  on-red: "#ffffff"
  on-red-soft: "#f8d3d9"
  foil-gold: "#f2c14e"
  foil-gold-stripe: "#e5ad2c"
  gold-ink: "#3a2300"
  slip-white: "#ffffff"
  slip-shade: "#fbf1ef"
  ink: "#2a0b12"
  ink-soft: "#6a4a51"
  print-red: "#c8102e"
  rule-blush: "#ecd5d8"
  ok-green: "#138a52"
  crown-red: "#d7263d"
  crown-gold: "#f2b705"
  crown-emerald: "#138a52"
  crown-cobalt: "#1f5fbf"
  crown-plum: "#7b2d8e"
  crown-tangerine: "#f07a1a"
  tangerine-ink: "#2a1300"
typography:
  display:
    fontFamily: "Titan One, Arial Rounded MT Bold, Trebuchet MS, sans-serif"
    fontSize: "clamp(2.3rem, 11vw, 3.4rem)"
    fontWeight: 400
    lineHeight: 0.95
  headline:
    fontFamily: "Titan One, Arial Rounded MT Bold, Trebuchet MS, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0.005em"
  title:
    fontFamily: "Titan One, Arial Rounded MT Bold, Trebuchet MS, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.1
  body:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 500
    lineHeight: 1.55
  label:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 800
  meta:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.88rem"
    fontWeight: 700
  tv-question:
    fontFamily: "Titan One, Arial Rounded MT Bold, Trebuchet MS, sans-serif"
    fontSize: "clamp(1.8rem, 4.2vw, 4.6rem)"
    fontWeight: 400
    lineHeight: 1.12
rounded:
  tag: "2px"
  slip: "4px"
  field: "6px"
  tile: "10px"
  pill: "999px"
spacing:
  gutter: "16px"
  stack: "0.6rem"
  grid: "0.75rem"
  panel: "1rem"
  slip-compact: "0.9rem 1rem"
  slip: "1.25rem"
components:
  button-primary:
    backgroundColor: "{colors.foil-gold}"
    textColor: "{colors.gold-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.8rem 1.4rem"
    height: "48px"
  button-big:
    backgroundColor: "{colors.foil-gold}"
    textColor: "{colors.gold-ink}"
    typography: "{typography.title}"
    rounded: "{rounded.pill}"
    padding: "1rem 2.2rem"
    height: "58px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0.4rem 0.9rem"
    height: "40px"
  input:
    backgroundColor: "{colors.slip-shade}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "0.75rem 0.85rem"
  input-focus:
    backgroundColor: "{colors.slip-white}"
    textColor: "{colors.ink}"
  slip:
    backgroundColor: "{colors.slip-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.slip}"
    padding: "{spacing.slip}"
  tab:
    backgroundColor: "{colors.cracker-red-deep}"
    textColor: "{colors.on-red}"
    typography: "{typography.label}"
    rounded: "{rounded.tag}"
    padding: "0.55rem 0.85rem 0.55rem 1.3rem"
    height: "44px"
  tab-selected:
    backgroundColor: "{colors.foil-gold}"
    textColor: "{colors.gold-ink}"
  sleeps-tag:
    backgroundColor: "{colors.cracker-red}"
    textColor: "{colors.on-red}"
    rounded: "{rounded.tag}"
    padding: "0.35rem 0.85rem 0.35rem 1.25rem"
  chip:
    backgroundColor: "{colors.slip-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.75rem"
  vote:
    backgroundColor: "{colors.slip-shade}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    size: "3.4rem"
  vote-on:
    backgroundColor: "{colors.foil-gold}"
    textColor: "{colors.gold-ink}"
---

# Design System: A Xmas for the Ages

## Overview

**Creative North Star: "What Tumbles Out of the Cracker"**

The whole interface is the contents of a pulled Christmas cracker. The page itself is the cracker's red paper, striped on the diagonal; across the top runs the gold foil tube with crimped zigzag ends; everything you read or fill in is a white joke slip; every team is a tissue-paper crown in its own colour. It is loud and playful on purpose, and it stays on one theme: the red ground is the identity, so it does not flip for dark mode.

Loudness lives in the ground, the foil and the display face, never in clutter. The slips are calm, square-ish paper with a single red print rule under their title, sturdy body type and big tap targets for a middle-aged audience on phones. Hierarchy comes from weight, case and the display/body switch on a small type scale rather than from many sizes. The TV quiz screen is the same world scaled up for reading across a living room: the same crimped band, the red stage, answers on big tissue-coloured tiles.

Every gradient in the system is a hard-stop pattern (stripes, a punched hole), never a smooth blend. Depth is paper lying on paper: one short shadow, no floating cards.

**Key Characteristics:**
- Cracker-red striped ground owns every page; single light theme by design.
- Crimped gold foil band (repeating stripes, zigzag mask) as the masthead on phone and TV.
- White joke slips with a 2px print-red rule under the title and a "Slip N · kind" foot line.
- Six tissue-crown team colours, each with a paired text colour, carried by a drawn paper-crown icon.
- Gift tags (notched end plus punched hole) for the countdown tag and the tabs.
- Titan One for display, Figtree for everything you read; both self-hosted.

## Colors

A saturated cracker palette: one dominant red ground, gold foil as the single accent, white paper for content, and six tissue colours reserved for teams.

### Primary
- **Cracker Red** (cracker-red): the page ground, striped at 135deg with **Cracker Red Stripe** (26px bands on phone, 34px on TV). Also the fill of the countdown tag and the selected segment of the on-slip mode switch.
- **Cracker Red Deep** (cracker-red-deep): unselected tabs, the off-slip mode switch track, the lower line of the site name, and the timer track on TV.
- **Title Red** (title-red): the site name on the foil band; chosen to read on both foil stripes.

### Secondary
- **Foil Gold** (foil-gold) with **Foil Gold Stripe** (foil-gold-stripe): the masthead band (stripes at -62deg), the wheel rim (repeating conic stripes), the selected tab, primary buttons, the selected vote, the champion banner, focus rings and text selection. Gold is the one "act here" colour on the red ground.
- **Gold Ink** (gold-ink): all text on gold.

### Tertiary
- **Print Red** (print-red): the ink printed on the slips. Slip title rules, slip headings, question text rules, list markers, bracket round labels, vote bars, radio accents, caret, errors and danger actions. It appears only on white/shade paper, never on the red ground.
- **Tissue crowns** (crown-red, crown-gold, crown-emerald, crown-cobalt, crown-plum, crown-tangerine): one per team, cycled in that order. Used for the crown icon, the team-card rule, the prize band, bracket dots, TV score chips, scoreboard bars and confetti. Text on them uses white, except crown-gold (gold-ink) and crown-tangerine (tangerine-ink). The TV answer tiles A to D reuse gold, emerald, cobalt and plum.

### Neutral
- **On Red** (on-red) and **On Red Soft** (on-red-soft): headings and secondary text sitting directly on the red ground.
- **Slip White** (slip-white): every slip, card, chip and the TV scoreboard rows.
- **Slip Shade** (slip-shade): inputs at rest, choice rows, vote buttons, bracket matches, the how-to-play art panel.
- **Ink** (ink) and **Ink Soft** (ink-soft): primary and secondary text on paper.
- **Rule Blush** (rule-blush): field borders, option outlines, match dividers, bar tracks.
- **OK Green** (ok-green): correct answers and bracket winners' check.

### Named Rules
**The Red Ground Rule.** The striped cracker red is the page, on every surface and in every OS colour scheme. Content goes on paper laid over it; the ground is never replaced by a pale background.

**The One Accent Rule.** On the red ground, gold is the only colour that means "do this". Print red belongs to the paper; tissue colours belong to teams and nothing else.

**The Hard-Stop Rule.** Gradients exist only as hard-stop patterns: diagonal stripes, conic stripes, a punched-hole radial. No smooth decorative blends.

## Typography

**Display Font:** Titan One (with Arial Rounded MT Bold, Trebuchet MS)
**Body Font:** Figtree, weights 500 to 800 (with system-ui)

**Character:** A chunky, rounded, single-weight display face that looks stamped on a cracker, paired with a sturdy geometric sans that stays readable for tired eyes on a phone.

### Hierarchy
- **Display** (Titan One 400, clamp(2.3rem, 11vw, 3.4rem), 0.95): the site name in two lines on the foil band; the second line drops to 0.62em (minimum 1.45rem) in deep red.
- **Headline** (Titan One 400, 1.6rem, 1.1): slip titles and section titles on the red ground. The prize headline scales to clamp(1.7rem, 8vw, 2.3rem).
- **Title** (Titan One 400, 1.25rem): h3, the big spin button, the spin status line (1.35rem), game names (1.15rem), team names (1.05rem).
- **Body** (Figtree 500, 1.0625rem, 1.55): all running text. Ledes and hints use on-red-soft on the ground and ink-soft on paper; hints drop to 0.92rem.
- **Label** (Figtree 800, 0.95rem): form labels, tabs, buttons, mode switch. Fields are set at weight 600.
- **Meta** (Figtree 700, 0.88rem, ink-soft): slip foot lines ("Slip N · kind · author"), voter lists. Counts use tabular numerals.
- **TV Question** (Titan One 400, clamp(1.8rem, 4.2vw, 4.6rem), 1.12, max 26ch): the question on the TV stage; TV body is Figtree 600 clamp(1rem, 1.4vw, 1.5rem).

### Named Rules
**The Weight-Not-Size Rule.** Rank comes from the display/body switch, weight (500/600/700/800) and case, on a small scale. Don't add new sizes to create emphasis.

**The Foot-Line Rule.** Slip metadata goes at the foot of the slip as a Meta line, never as a small label above the heading.

## Layout

Phone-first single column: content sits in a 40rem max container with 16px side gutters that respect the safe-area insets. The masthead band spans the full width; the main column stacks panels at a 1rem gap, slip contents at 0.6rem (0.3rem when tight). Team cards use an auto-fill grid (minmax(10.5rem, 1fr), 0.75rem gap), so phones show two per row. Your job on each tab is the biggest element: the wheel runs at min(340px, 100%) with the big gold button under it. The bracket is one column per round, scrolling sideways; at 600px and below the rounds stack and each round's matches sit two across. Tabs scroll horizontally rather than wrap. The TV screen is a full-height three-row grid (band, stage, control bar); answer tiles sit two across up to 74rem and collapse to one column at 700px.

## Elevation & Depth

Depth is paper on paper. Slips, cards and buttons carry one short paper shadow; nothing floats, glows or blurs. Buttons press flat: the shadow disappears on active as the button drops 1px. Drawn crowns get a small drop shadow so they read as cut paper.

### Shadow Vocabulary
- **Paper shadow** (`box-shadow: 0 3px 3px -1px rgb(40 0 10 / .5)`): every slip, card, team card, question slip and game slip.
- **Button shadow** (`box-shadow: 0 3px 3px -1px rgb(40 0 10 / .45)`): gold buttons at rest; removed on active and on ghost buttons.
- **Crown drop** (`filter: drop-shadow(0 1px 0 rgb(0 0 0 / .25))`, prize crown `drop-shadow(0 3px 2px rgb(40 0 10 / .35))`): the paper crown icon.

### Named Rules
**The Short Paper Rule.** A shadow is at most a few pixels: paper resting on paper. If it reads as floating, it is wrong.

## Shapes

Paper is nearly square: slips have a 4px corner, fields and matches 6px, gift tags 2px. Pills (999px) are reserved for things you press or that count: buttons, the mode switch, chips, TV score chips. The signature silhouettes are cut, not rounded: the foil band's zigzag crimp (18px teeth on phone, 22px on TV, cut with a conic-gradient mask top and bottom), the gift-tag notch (a clip-path point on the left) with a punched hole, and the paper crown's five points. Rules are 2px and solid everywhere: under slip titles, around fields, between bracket sides.

## Components

### Buttons
Big, gold and pressable.
- **Shape:** full pill (999px), min height 48px.
- **Primary:** foil gold fill and border, gold-ink Label text, 0.8rem 1.4rem padding, button shadow.
- **Big:** the one main action on a tab (spin, add question) switches to Titan One at 1.3rem, 58px tall.
- **Hover / Active:** lifts 1px on hover, drops 1px and loses its shadow on press, 0.15s ease; no transition under reduced motion. Disabled goes to 60% opacity.
- **Ghost:** transparent with a rule-blush border on paper; on the red ground it uses on-red text and a 55% white border. Danger ghosts use print-red text.
- **Focus:** a 3px foil-gold outline, 2px offset, on every focusable element.

### Gift tags (tabs and countdown)
- **Style:** 2px corners, a clip-path notch on the left end and a punched hole drawn as a hard-stop radial gradient near the point. Tabs are 44px tall, Label type.
- **State:** unselected tabs are cracker-red-deep with on-red text; the selected tab is striped foil gold with gold-ink text. The countdown tag ("N sleeps till Christmas") is cracker red with a gold hole, tabular numerals.

### Joke slips
- **Corner Style:** 4px.
- **Background:** slip white, ink text.
- **Shadow Strategy:** paper shadow.
- **Border:** none; the title carries a 2px print-red rule beneath it and is set in print red. Team cards rule in their own tissue colour instead.
- **Internal Padding:** 1.25rem; list slips (questions, games, team cards) use 0.9rem 1rem.
- **Foot line:** question slips end with a Meta line, "Slip N · kind".

### Inputs / Fields
- **Style:** slip-shade fill, 2px rule-blush border, 6px corners, 0.75rem 0.85rem padding, weight 600 ink.
- **Focus:** border turns print red and the fill turns white; no glow.
- **Choices:** radio and option rows share the field style at 48px; the checked row takes the print-red border and white fill.

### Mode switch
A pill track holding two equal segments. On the red ground: deep-red track, selected segment gold. On a slip: shade track, selected segment cracker red with white text.

### Prize slip (signature)
Your team, as the prize from the cracker: a centred slip with a 10px inset band of your team's tissue colour along the top, a 7.5rem paper crown in that colour, and a scaled headline. On a fresh spin the slip pops in (0.7s) and the crown drops in from above (1s, cubic-bezier(.16, 1, .3, 1)), while 150 tissue-coloured confetti bits burst from the wheel for 2.5s. Under reduced motion, nothing moves and no confetti is drawn.

### Spin wheel
A canvas wheel of tissue-colour segments lettered in Titan One, inside a 10px striped gold conic rim, with a white pointer at the top. It eases to rest with cubic-bezier(.17, .67, .16, 1).

### Vote button and bars
A 3.4rem square tile (10px corners) on slip shade showing the count in Titan One over an uppercase micro label; when you have voted it fills gold. Vote share bars are 6px print-red on a rule-blush track.

### TV answer tiles
Large tiles (10px corners, 9vh minimum) in gold, emerald, cobalt and plum with a Titan One letter. On reveal, wrong tiles fade to 25% and the correct one scales to 1.04 inside a gold ring with a check.

## Do's and Don'ts

### Do:
- **Do** keep the striped cracker red (cracker-red / cracker-red-stripe, 135deg) as the ground of every page, in light and dark OS settings alike.
- **Do** put everything readable or fillable on a white joke slip with the 4px corner, the paper shadow `0 3px 3px -1px rgb(40 0 10 / .5)` and a 2px print-red rule under its title.
- **Do** use foil gold for the single main action and the current selection on the red ground.
- **Do** give each team its tissue colour and its paired text colour, and show it with the paper crown.
- **Do** build stripes, crimps and holes from hard-stop gradients and masks (the "paper-cracker stripes" motif).
- **Do** carry slip metadata in the foot line ("Slip N · kind") in Meta type.
- **Do** keep tap targets at 44px or more and every motion still under reduced motion.

### Don't:
- **Don't** add a dark theme or a pale page background; the red ground does not flip.
- **Don't** use soft, long or blurred elevation on slips; depth is a short paper shadow only.
- **Don't** use smooth decorative gradients; stripes and holes are hard-stop.
- **Don't** put a small uppercase label above a heading; slip metadata belongs in the foot line.
- **Don't** use tissue team colours for anything except teams (and the TV answer tiles that borrow four of them).
- **Don't** set print red on the red ground or body text in Titan One.
