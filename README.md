# Splat — Pastel Garden Massacre

A cel-shaded isometric hack-and-slash in three.js. Bright pastel garden, very
gory bugs, and one rule: **anything you hit hard enough becomes a projectile.**
Bugs you launch bowl over other bugs, corpses and severed limbs keep the
momentum of the blow that killed them, parried pollen flies back at your
target, and the boss is weakest to her own babies thrown at her.

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
| slash combo (3rd hit launches) | LMB / J | SLASH |
| Batter Up (launch along aim) | RMB / K | BONK |
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
game/     the content: insect rigs, gore, rooms and waves, boons, the Empress
          Mantis, HUD, co-op (net.js, coop.js), autopilot bot, telemetry
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
node tools/touchtest.mjs                                       # 5 device layouts, real touch events
BASE=https://gaming.bobbby.online node tools/touchtest.mjs     # against the live site
```

The bot uses the same intents as a player and the same parry cue; `--skill`
below 1 makes it miss threats like a person would. Telemetry counts what makes
a run feel good (impacts, chains, wall splats, parries, feedback events per
minute, longest stretch with nothing happening).
