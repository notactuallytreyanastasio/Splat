// Level-up rewards. Each run is a different build because the offers come from the seed.
export const BOONS = [
  { id: 'sharp', name: 'Sharpened Stinger', desc: '+25% damage', icon: '🗡', apply: p => (p.stats.damage *= 1.25) },
  { id: 'sugar', name: 'Sugar Rush', desc: '+15% attack speed, +10% move speed', icon: '🍬', apply: p => { p.stats.atkSpeed *= 1.15; p.stats.speed *= 1.1; } },
  { id: 'vamp', name: 'Vampire Kiss', desc: 'Heal 1.5 HP every hit', icon: '💋', apply: p => (p.stats.lifesteal += 1.5) },
  { id: 'confetti', name: 'Confetti Corpses', desc: 'Kills burst for 12 damage', icon: '🎉', apply: p => (p.stats.explodeOnKill += 12) },
  { id: 'bonk', name: 'Big Bonk', desc: '+35% knockback, wall splats +50%', icon: '🔨', apply: p => { p.stats.knock *= 1.35; p.stats.wallDamage *= 1.5; } },
  { id: 'crit', name: 'Glitter Crits', desc: '+12% crit chance', icon: '✨', apply: p => (p.stats.crit += 0.12) },
  { id: 'frost', name: 'Thick Frosting', desc: '+30 max HP and a full heal', icon: '🧁', apply: p => { p.stats.maxHp += 30; p.hp = p.stats.maxHp; } },
  { id: 'rage', name: 'Rage Cake', desc: '+60% rage gain', icon: '🎂', apply: p => (p.stats.rageGain *= 1.6) },
  { id: 'long', name: 'Long Petal Blade', desc: '+25% reach', icon: '🌸', apply: p => (p.stats.reach *= 1.25) },
  { id: 'yeet', name: 'Olympic Yeet', desc: 'Throws fly 40% harder', icon: '🥏', apply: p => (p.stats.throwPower *= 1.4) },
  { id: 'nectar', name: 'Nectar Stash', desc: '+2 potions, potions heal +15', icon: '🍯', apply: p => { p.potions += 2; p.stats.potionHeal += 15; } },
];

export function rollBoons(rng, n) {
  return rng.shuffle(BOONS.slice()).slice(0, n);
}
