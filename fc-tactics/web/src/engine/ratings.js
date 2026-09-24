// How good a player is in a given position - from stats, training, rank and skills.
//
// What is VERIFIED (research/mechanics.md + the owner's in-game screenshots):
//   * Rank Up: +1 OVR per rank (0-5). Training never changes OVR, only stats.
//   * Skill tree: each rank gives a skill point; skills add fixed stat boosts (per card, in the
//     database) and second-tier skills unlock the card's alternate positions.
//   * Out-of-position OVR = floor(base OVR x multiplier) + rank, with the multipliers below.
//     This formula reproduces all 25 out-of-position ratings in the owner's screenshots.
// What is ESTIMATED:
//   * Training stat boosts. The real per-position table is only served by renderz's /api/,
//     which its robots.txt disallows. TRAINING_PER_LEVEL is a placeholder until real numbers
//     are available (drop them into trainingTable and they are used instead).
//   * Stat-based position fit uses EA FC 24's position weights (a relative score).

export const MAX_RANK = 5;
export const MAX_LEVEL = 30;
export const MAX_UPGRADE_OVR = MAX_RANK;          // shown OVR - base OVR is the rank
const TRAINING_PER_LEVEL = 1;                     // ESTIMATE: +1 per level to the 8 key stats
const STAT_SCALE = 1.24;                          // a 122 card's key stats average ~151
const GAME_WEIGHT = 0.5;                          // final = 50% in-game OVR, 50% stat fit

export let trainingTable = null;                  // { [position]: { [level]: { stat: +n } } }
let rankTable = null;
export function setRankTable(table) { rankTable = table; }
export function setTrainingTable(table) { trainingTable = table; }

// FC 26 lets you train to level 30 without ranking up (the rank table's old caps are legacy).
export const maxTrainingForRank = () => MAX_LEVEL;

// From a screenshot we only see OVR, so rank = shown - base. Training isn't visible in OVR;
// most maxed cards are fully trained, so assume that and let the user adjust it.
export function inferProgress(upgradeOvr) {
  const rank = Math.max(0, Math.min(MAX_RANK, upgradeOvr));
  return { rank, level: rank === MAX_RANK ? MAX_LEVEL : rank * 5 };
}

export const effectiveOvr = (entry) => entry.card.ovr + (entry.card.custom ? 0 : entry.rank);

export const STAT_NAMES = {
  acc: "Acceleration", spd: "Sprint Speed", agi: "Agility", bal: "Balance", rea: "Reactions",
  bac: "Ball Control", dri: "Dribbling", fin: "Finishing", pos: "Positioning", sho: "Shot Power",
  lsa: "Long Shots", vol: "Volleys", pen: "Penalties", spa: "Short Passing", lpa: "Long Passing",
  vis: "Vision", cro: "Crossing", cur: "Curve", frk: "Free Kicks", mrk: "Def. Awareness",
  stt: "Standing Tackle", slt: "Sliding Tackle", awr: "Interceptions", hea: "Heading",
  jmp: "Jumping", str: "Strength", agg: "Aggression", sta: "Stamina",
  gkd: "GK Diving", han: "GK Handling", gkk: "GK Kicking", gkp: "GK Positioning", ref: "GK Reflexes",
};

// EA FC 24 position weights mapped to FC Mobile stat keys (each row sums to 1).
const W = {
  GK: { gkd: 0.24, han: 0.22, gkp: 0.22, ref: 0.22, rea: 0.06, gkk: 0.04 },
  CB: { spd: 0.02, jmp: 0.03, str: 0.1, rea: 0.05, agg: 0.07, awr: 0.13, bac: 0.04, hea: 0.1, spa: 0.05, mrk: 0.14, stt: 0.17, slt: 0.1 },
  LB: { acc: 0.05, spd: 0.07, sta: 0.08, rea: 0.08, awr: 0.12, bac: 0.07, cro: 0.09, hea: 0.04, spa: 0.07, mrk: 0.08, stt: 0.11, slt: 0.14 },
  LWB: { acc: 0.04, spd: 0.06, sta: 0.1, rea: 0.08, awr: 0.12, bac: 0.08, cro: 0.12, dri: 0.04, spa: 0.1, mrk: 0.07, stt: 0.08, slt: 0.11 },
  CDM: { sta: 0.06, str: 0.04, rea: 0.07, agg: 0.05, awr: 0.14, vis: 0.04, bac: 0.1, lpa: 0.1, spa: 0.14, mrk: 0.09, stt: 0.12, slt: 0.05 },
  CM: { sta: 0.06, rea: 0.08, awr: 0.05, pos: 0.06, vis: 0.13, bac: 0.14, dri: 0.07, fin: 0.02, lpa: 0.13, spa: 0.17, lsa: 0.04, stt: 0.05 },
  LM: { acc: 0.07, spd: 0.06, sta: 0.05, rea: 0.07, pos: 0.08, vis: 0.07, bac: 0.13, cro: 0.1, dri: 0.15, fin: 0.06, lpa: 0.05, spa: 0.11 },
  CAM: { acc: 0.04, spd: 0.03, agi: 0.03, rea: 0.07, pos: 0.09, vis: 0.14, bac: 0.15, dri: 0.13, fin: 0.07, lpa: 0.04, spa: 0.16, lsa: 0.05 },
  LW: { acc: 0.07, spd: 0.06, agi: 0.03, rea: 0.07, pos: 0.09, vis: 0.06, bac: 0.14, cro: 0.09, dri: 0.16, fin: 0.1, spa: 0.09, lsa: 0.04 },
  CF: { acc: 0.05, spd: 0.05, rea: 0.09, pos: 0.13, vis: 0.08, bac: 0.15, dri: 0.14, fin: 0.11, hea: 0.02, spa: 0.09, sho: 0.05, lsa: 0.04 },
  ST: { acc: 0.04, spd: 0.05, str: 0.05, rea: 0.08, pos: 0.13, bac: 0.1, dri: 0.07, fin: 0.18, hea: 0.1, spa: 0.05, sho: 0.1, lsa: 0.03, vol: 0.02 },
};
W.RB = W.LB; W.RWB = W.LWB; W.RM = W.LM; W.RW = W.LW;

const sortedKeys = (pos) => Object.entries(W[pos]).sort((a, b) => b[1] - a[1]).map(([k]) => k);
export const keyStats = (pos) => sortedKeys(pos).slice(0, 3);

// ------------------------------------------------------------ position penalty
// Multipliers fitted to the owner's in-game ratings (e.g. CDM->CM 126 -> 122, LW->ST 126 -> 119).
const TIERS = [
  [1.0, ["LB-LWB", "RB-RWB", "CAM-CF"]],
  [0.97, ["CB-CDM", "CDM-CM", "CM-CAM", "CB-LB", "CB-RB", "LM-LW", "RM-RW", "CF-ST", "LWB-LM", "RWB-RM"]],
  [0.95, ["LW-ST", "RW-ST", "LW-CF", "RW-CF", "CDM-LM", "CDM-RM", "CDM-LWB", "CDM-RWB", "CDM-LB", "CDM-RB",
          "CM-LM", "CM-RM", "CAM-LM", "CAM-RM", "CAM-ST", "CAM-LW", "CAM-RW", "LW-LWB", "RW-RWB",
          "LB-LM", "RB-RM", "CB-LWB", "CB-RWB", "LB-RB", "LWB-RWB", "LM-RM", "LW-RW"]],
  [0.925, ["CM-LWB", "CM-RWB", "CAM-CDM", "CB-CM", "CM-ST", "CM-CF", "CDM-ST", "CDM-CF"]],
];
const TIER_OF = new Map();
for (const [mult, pairs] of TIERS)
  for (const pair of pairs) {
    const [a, b] = pair.split("-");
    TIER_OF.set(`${a}-${b}`, mult);
    TIER_OF.set(`${b}-${a}`, mult);
  }
// CDM->ST was observed at 0.85 (Caicedo 124 -> 106): keep the observation over the heuristic.
TIER_OF.set("CDM-ST", 0.85); TIER_OF.set("ST-CDM", 0.85);

export function positionMultiplier(from, to) {
  if (from === to) return 1;
  if (from === "GK" || to === "GK") return 0.4;
  return TIER_OF.get(`${from}-${to}`) ?? 0.85;
}

// ------------------------------------------------------------ skills & stats
// Skill points = rank. Spend them the way a sensible player would: level the root skill,
// then take the second-tier skills that help this card's position most.
function chooseSkills(card, points) {
  const chosen = new Map();                        // skillId -> level
  const unlocked = new Set();
  if (!card.skills?.length || points <= 0) return { chosen, unlocked };
  const weights = W[card.pos] ?? {};
  const gain = (mods) => Object.entries(mods ?? {}).reduce((s, [k, v]) => s + v * (weights[k] ?? 0.01), 0);

  for (let spent = 0; spent < points; spent++) {
    let best = null;
    for (const skill of card.skills) {
      const current = chosen.get(skill.id) ?? 0;
      const next = skill.levels.find((l) => l.level === current + 1);
      if (!next) continue;
      const req = skill.requires;
      if (req && (chosen.get(req.skillId) ?? 0) < req.level) continue;
      const prevMods = skill.levels.find((l) => l.level === current)?.mods ?? {};
      // levels store cumulative boosts (L2 = +20, not +10 more), so gain = next - current
      const delta = gain(next.mods) - gain(prevMods) + (next.positions?.length ? 0.5 : 0);
      // root skills are prerequisites: value them by what they open up
      const unlocks = card.skills.some((s) => s.requires?.skillId === skill.id && s.requires.level === next.level) ? 3 : 0;
      const value = delta + unlocks;
      if (!best || value > best.value) best = { value, skill, level: next.level };
    }
    if (!best) break;
    chosen.set(best.skill.id, best.level);
  }
  for (const skill of card.skills) {
    const lvl = chosen.get(skill.id);
    if (lvl) skill.levels.filter((l) => l.level <= lvl).forEach((l) => l.positions?.forEach((p) => unlocked.add(p)));
  }
  return { chosen, unlocked };
}

const cache = new WeakMap();

// Upgraded stats + unlocked positions for one squad entry { card, rank, level }.
export function progress(entry) {
  if (cache.has(entry)) return cache.get(entry);
  const { card } = entry;
  let result;
  if (!card.stats) {
    // Card not in the database: neutral stats at the level its OVR implies.
    const flat = Object.fromEntries(Object.keys(STAT_NAMES).map((k) => [k, card.ovr * STAT_SCALE]));
    flat.sta = 90;
    result = { stats: flat, unlocked: new Set(card.alt ?? []) };
  } else {
    const stats = { ...card.stats };
    const train = trainingTable?.[card.pos]?.[entry.level];
    if (train) for (const [k, v] of Object.entries(train)) stats[k] = (stats[k] ?? 0) + v;
    else if (entry.level > 0 && W[card.pos])
      for (const k of sortedKeys(card.pos).slice(0, 8)) stats[k] += entry.level * TRAINING_PER_LEVEL;

    const { chosen, unlocked } = chooseSkills(card, entry.rank);
    for (const skill of card.skills ?? []) {
      const lvl = chosen.get(skill.id);
      const mods = lvl && skill.levels.find((l) => l.level === lvl)?.mods;
      if (mods) for (const [k, v] of Object.entries(mods)) stats[k] = (stats[k] ?? 0) + v;
    }
    // Cards scraped without skill data: treat listed alternates as unlocked from rank 3
    // (root skill to L2 + one second-tier skill = 3 points).
    if (!card.skills && entry.rank >= 3) (card.alt ?? []).forEach((p) => unlocked.add(p));
    result = { stats, unlocked };
  }
  cache.set(entry, result);
  return result;
}

export const effectiveStats = (entry) => progress(entry).stats;

function statFit(stats, pos) {
  const w = W[pos];
  let sum = 0;
  for (const k in w) sum += (stats[k] ?? 0) * w[k];
  return sum / STAT_SCALE;
}

// { rating, game, stat, kind } for this entry playing `pos`.
//   game = what the game shows (floor(base x multiplier) + rank)
//   stat = how well the upgraded stats suit the position, on the same scale
export function ratingAt(entry, pos) {
  const { card } = entry;
  const rank = card.custom ? 0 : entry.rank;
  const { stats, unlocked } = progress(entry);

  let kind = "main";
  let mult = 1;
  if (pos !== card.pos) {
    if (unlocked.has(pos)) kind = "alt";
    else {
      mult = positionMultiplier(card.pos, pos);
      kind = mult === 1 ? "alt" : "out";
    }
  }
  const game = Math.floor(card.ovr * mult) + rank;
  if (card.custom) return { rating: game, game, stat: game, kind };

  const stat = statFit(stats, pos) * mult + rank;
  return { rating: GAME_WEIGHT * game + (1 - GAME_WEIGHT) * stat, game, stat, kind };
}
