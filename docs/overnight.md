# Overnight polish log

Everything below is live at https://gaming.bobbby.online and on `main` in
github.com/notactuallytreyanastasio/Splat. Each item was played by the bot
(`tools/playtest.mjs`), run through the touch test on five phone/tablet layouts
(`tools/touchtest.mjs`), and looked at in screenshots before it shipped.

## Try these first

| what | where |
|---|---|
| the tutorial | title screen, "how to play" (or `/?tutorial`) |
| the boss with her new entrance, phase two and death scene | `/?start=3` |
| the four new boons | `/?boons=sticky,ricochet,bowling,longarms` |
| co-op | title screen, "host co-op", send the link (tap to copy) |
| fps / draw calls on your phone | add `?perf` |

## What changed

**The color story.** Dead bugs drain to grey and stay that way, but their
blood stays red. The world is colorful by default and loses color as a fight
heats up: kills, hits, pinball chains and wall splats build "heat", and about
a second of calm drains it. At peak heat (and during the blender) the game
goes noir: black and white, grain, vignette, blood still red, and every living
bug turns into a red silhouette. In bot runs noir is about 12-17% of play.

**Music.** It's now a composed score in F major: a 56-bar form with sections A,
A2, B, A3 and C, a countermelody, and chords that move one note at a time. As
heat rises it turns into Kraftwerk under Eno: motorik drums, 16th-note
sequencers, octave bass, a robot voice, plus Eno-style pads and piano loops
whose lengths are primes, so they keep drifting against each other. The
Empress has her own A-minor theme. A drained, colorless world also sounds
muffled and wobbly, like warped tape. **I could not listen to any of it**: the
composer agent and I checked it with note counts, layer levels and music
theory, not ears. It needs your ears.

**Tutorial.** Eight lessons that only move on when you actually do the move:
walk, slash, finisher, Batter Up one bug into another, grab and throw, parry,
roll, blender. The card wording switches between keyboard and touch, and
practice bugs are gentle.

**Icons.** No emoji anywhere. Every icon is hand-drawn SVG in the house style:
boon medals, sound states, hearts, gems, the co-op ghost, touch buttons.
Level-up cards are dealt in with a bounce.

**Mushroom pinball bumpers.** A launched bug, corpse or gib that hits a
mushroom pillar comes off faster than it went in, adds to the pinball chain,
says BOING, and the cap wobbles.

**Juice.** Footstep dust, a roll puff, a ribbon off the sword tip,
reinforcements that hatch out of flower buds, a health orb that wobbles,
lingering damage numbers, rage sparkles, a low-HP heartbeat, a flash at the
screen edge on crits.

**The Empress.** Her room now locks with a letterboxed entrance: camera pan, a
title card, a scream. Phase two shows: glowing eyes, flared wings, swirling
petals. Each attack has its own sound and an honest telegraph. On death:
freeze, zoom, a huge burst of gibs and confetti, and her crown bounces across
the floor and stays there as a trophy.

**Boons and the report card.** Four new boons: Ricochet, Sticky Bomb, Long
Arms, Bowling Ball. The end screen is now a report card: an S/A/B/C grade, four
stats, personal bests saved in your browser, and your build shown as cards.

**Also:**
- Social card, favicon and page title.
- Performance: draw calls mid-fight went from about 1,170 to about 300, and
  the render resolution drops automatically when frames run slow.
- Fixed a GPU memory leak in effects and corpses.
- Corpse bowling no longer skips bugs at low frame rates.
- Debris rolls the same distance at any frame rate.
- Touch fixes: double-tap zoom, canvas sizing, and buttons hidden on the title
  screen.

## How it was built

Six features ran in parallel in a workflow: one builder agent per feature,
each in its own git worktree, then an independent reviewer per feature who
played and tested the branch and fixed what was clearly broken. The music was
a seventh agent. I merged the branches, resolved the conflicts, and re-tested
the merged build before deploying. The reviewers caught real problems,
including:
- the tutorial's grab icon read as a middle finger
- the mushroom spring went NaN at 10 fps
- the streak slam fired on nearly every multi-kill
- two agents' test runs hit each other's servers because of a port race in
  the test tool

## Known rough edges

- **Music:** reasoned about, not heard. Bass below about 100 Hz will vanish on
  phone speakers.
- **Bot runs** show the Empress taking hits during her entrance; the bot
  doesn't wait for the cinematic, but a person will.
- **Tutorial:** "Start a real run" goes back to the title screen. That's on
  purpose, so the next click turns audio on.
- **Short landscape phones:** a praise word can sit under the tutorial card.
- **Big body pieces** launched high can still clear a wall. They now sink away
  if they land outside the level.
- **Co-op has no host migration:** if the host leaves, the run ends.
- **Shader count:** it grew to about 30, so there can be a small hitch the
  first time a new effect appears.
