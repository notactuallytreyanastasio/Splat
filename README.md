# Splat — Pastel Garden Massacre

A cel-shaded isometric hack-and-slash in three.js. Bright pastel garden, very
gory bugs, and one rule: **anything you hit hard enough becomes a projectile.**
Bugs you launch bowl over other bugs, corpses and severed limbs keep the
momentum of the blow that killed them, parried pollen flies back at your
target, and the boss is weakest to her own babies thrown at her.

A run is three stages, each with its own boss, and the build carries from one to
the next:

| stage | what is new | boss |
|---|---|---|
| the Pastel Garden | mushroom pinball bumpers, wall splats | the Empress Mantis: weakest to her own babies, thrown |
| the Lily Pond | water: a wall to anything on foot, a grave to anything knocked into it (fast ones skip like stones); frogs that hop onto a marked ring and lash a tongue that drags you in | Old Gold, a koi you cannot reach in her pond: she beaches herself breaching across the bank, and chokes on any bug you dunk and flops out to cough it up |
| the Honey Hive | hives that let out bees until you break them; puffballs that burst when anything hits them, throw everything near them outward and set off their neighbours | the Queen: stings you parry back, and a dive that grounds her for a long time if it lands on a puffball |

Clearing the hive starts lap 2 back in the garden, tougher. The title offers a
shortcut to any stage this browser has reached (a practice start: levels but no
records). Every level is an ASCII file in `game/levels/`.

Play it: **https://gaming.bobbby.online** (keyboard + mouse, gamepad, or touch;
co-op for up to four from the title screen).

## Run it

No build step. The browser loads the ES modules directly.

```sh
npm install        # three, plus playwright for the test tools
npm run dev        # http://localhost:5177  (editor: /editor.html)
```

## Controls

| | keyboard / mouse | touch |
|---|---|---|
| move | WASD | left thumb, anywhere |
| aim | mouse | auto lock-on, or drag SLASH |
| slash chain: slash, backhand, spin, leaping slam | LMB / J | SLASH |
| Batter Up (launch along aim) | RMB / K | BONK |
| Rising Dragon uppercut (heavy after 1-2 hits) | RMB / K mid-chain | BONK |
| Shadow Step dash-through (heavy after 3 hits) | RMB / K mid-chain | BONK |
| Fang thrust | attack out of a roll | |
| grab / throw | E | GRAB |
| parry (tap as the ring closes) | Shift / C | PARRY |
| roll | Space | ROLL |
| rainbow blender (full rage) | Q | rage button |
| potion / lock cycle / sound | R / Tab / M | buttons |

## Layout

```
engine/   reusable: fixed-step loop with hitstop, input intents, toon kit
          (3-band ramp, rim light, inverted-hull ink), iso camera, tile mesh,
          world physics with launched-body contacts, flow field, instanced
          particles, rigid-body debris, floor decals, baking, synth audio,
          music sequencer, touch controls
game/     the content: insect rigs, gore, rooms and waves, boons, the three
          bosses, HUD, co-op (net.js, coop.js), autopilot bot, telemetry;
          levels/*.json are the stages (rows, room names, next stage, songs)
tools/    playtest.mjs (bot plays headlessly, screenshots + report),
          touchtest.mjs (touch on phone/tablet viewports), shot.mjs,
          models.html (model lineup), genlevel.mjs
editor.html  ASCII level editor; validates with the game's own parser
scripts/deploy.sh  ships to gaming.bobbby.online (versioned module URLs)
```

Co-op runs through a Phoenix channel (`BlogWeb.GardenChannel`) in the
bobbby.online blog app. The channel only relays and tracks presence: the first
player in a room simulates the world, every player simulates their own knight.

## Testing

```sh
node tools/playtest.mjs --seeds 1,2,3 --speed 3 --skill 0.5   # bot runs, report in tools/out/playtest
node tools/playtest.mjs --level pond --start 3                 # one stage, straight to its boss
node tools/touchtest.mjs                                       # 5 device layouts, real touch events
node tools/mix.mjs                                             # meter every sound and music mood offline (dBFS)
node tools/score.mjs                                           # render the soundtrack scenes to tools/out/score/*.wav + spectrograms
BASE=https://gaming.bobbby.online node tools/touchtest.mjs     # against the live site
```

The bot uses the same intents as a player and the same parry cue; `--skill`
below 1 makes it miss threats like a person would. Telemetry counts what makes
a run feel good (impacts, chains, wall splats, parries, feedback events per
minute, longest stretch with nothing happening).
