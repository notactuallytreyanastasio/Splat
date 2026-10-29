// Level-up rewards. Each run is a different build because the offers come from the seed.
// `icon` names a drawing in icons.js; an unknown name throws when the card is shown.
export const BOONS = [
  { id: 'sharp', name: 'Sharpened Stinger', desc: '+25% damage', icon: 'sharp', apply: p => (p.stats.damage *= 1.25) },
  { id: 'sugar', name: 'Sugar Rush', desc: '+15% attack speed, +10% move speed', icon: 'sugar', apply: p => { p.stats.atkSpeed *= 1.15; p.stats.speed *= 1.1; } },
  { id: 'vamp', name: 'Vampire Kiss', desc: 'Heal 1.5 HP every hit', icon: 'vamp', apply: p => (p.stats.lifesteal += 1.5) },
  { id: 'confetti', name: 'Confetti Corpses', desc: 'Kills burst for 12 damage', icon: 'confetti', apply: p => (p.stats.explodeOnKill += 12) },
  { id: 'bonk', name: 'Big Bonk', desc: '+35% knockback, wall splats +50%', icon: 'bonk', apply: p => { p.stats.knock *= 1.35; p.stats.wallDamage *= 1.5; } },
  { id: 'crit', name: 'Glitter Crits', desc: '+12% crit chance', icon: 'crit', apply: p => (p.stats.crit += 0.12) },
  { id: 'frost', name: 'Thick Frosting', desc: '+30 max HP and a full heal', icon: 'frost', apply: p => { p.stats.maxHp += 30; p.hp = p.stats.maxHp; } },
  { id: 'rage', name: 'Rage Cake', desc: '+60% rage gain', icon: 'rage', apply: p => (p.stats.rageGain *= 1.6) },
  { id: 'long', name: 'Long Petal Blade', desc: '+25% reach', icon: 'long', apply: p => (p.stats.reach *= 1.25) },
  { id: 'yeet', name: 'Olympic Yeet', desc: 'Throws fly 40% harder', icon: 'yeet', apply: p => (p.stats.throwPower *= 1.4) },
  { id: 'nectar', name: 'Nectar Stash', desc: '+2 potions, potions heal +15', icon: 'nectar', apply: p => { p.potions += 2; p.stats.potionHeal += 15; } },
  // The projectile boons: each one changes what a flying body does, not just how much it hurts.
  { id: 'ricochet', name: 'Ricochet', desc: 'Launched bugs bank off walls at full speed and splat twice', icon: 'ricochet', apply: p => (p.stats.ricochet += 1) },
  { id: 'sticky', name: 'Sticky Bomb', desc: 'Thrown bugs blow up on their first hit', icon: 'sticky', apply: p => (p.stats.sticky += p.stats.sticky ? 12 : 26) },
  { id: 'longarms', name: 'Long Arms', desc: '+60% grab range, grab beetles any time', icon: 'longarms', apply: p => { p.stats.grabRange *= 1.6; p.stats.grabAny = 1; } },
  { id: 'bowling', name: 'Bowling Ball', desc: 'Corpses and gibs roll heavy and plough through', icon: 'bowling', apply: p => (p.stats.bowling += 1) },
];
export const boonById = id => BOONS.find(b => b.id === id);

export function rollBoons(rng, n) {
  return rng.shuffle(BOONS.slice()).slice(0, n);
}
