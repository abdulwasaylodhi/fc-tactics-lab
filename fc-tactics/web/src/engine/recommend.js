// Picks the best formation, lineup, tactics and substitutions for a squad.
// Same approach as fc_strategy.cpp, but every rating comes from the card's upgraded
// stats (see ratings.js) instead of the headline OVR.

import { FORMATIONS } from "./formations.js";
import { hungarian } from "./assign.js";
import { effectiveStats, keyStats, ratingAt, STAT_NAMES } from "./ratings.js";
import { deriveTactics } from "./tactics.js";

const DEFENCE = new Set(["CB", "LB", "RB", "LWB", "RWB"]);
const ATTACK = new Set(["ST", "CF", "LW", "RW"]);
const KIND_LABEL = { main: "natural position", alt: "alternate position, no penalty", out: "out of position" };

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function matchesStyle(formation, style) {
  const has = (t) => formation.tags.includes(t);
  if (style === "attack") return has("Attacking") || has("Full Attack");
  if (style === "defend") return has("Defensive") || has("Five Defenders");
  if (style === "balanced") return has("Balanced");
  return false;
}

// Rating table: every player in every position, computed once per squad.
function ratingTable(squad) {
  const positions = new Set(FORMATIONS.flatMap((f) => f.slots));
  return squad.map((entry) => {
    const row = {};
    for (const pos of positions) row[pos] = ratingAt(entry, pos);
    return row;
  });
}

function evaluate(formation, squad, table, style) {
  const cost = formation.slots.map((pos) => squad.map((_, p) => -table[p][pos].rating));
  const assignment = hungarian(cost);
  const picks = formation.slots.map((pos, s) => {
    const r = table[assignment[s]][pos];
    return { player: assignment[s], rating: Math.round(r.rating), exact: r.rating, game: r.game, kind: r.kind };
  });
  const average = avg(picks.map((p) => p.exact));
  const weakest = Math.min(...picks.map((p) => p.rating));
  const score = 0.9 * average + 0.1 * weakest + (matchesStyle(formation, style) ? 1 : 0);
  return { formation, picks, average, weakest, score };
}

export function recommend(squad, style = "any") {
  const table = ratingTable(squad);
  const ranked = FORMATIONS.map((f) => evaluate(f, squad, table, style));
  const recommended = (r) => r.formation.tags.includes("Recommended");
  ranked.sort((a, b) => (b.score - a.score) || (recommended(b) - recommended(a)));   // Array.sort is stable

  const planFor = (evaluation) => buildPlan(evaluation, squad, table, style);
  return { ranked, planFor, ...planFor(ranked[0]) };
}

function buildPlan(evaluation, squad, table, style) {
  const { formation, picks } = evaluation;
  const lineOf = (pos) => (pos === "GK" ? null : DEFENCE.has(pos) ? "def" : ATTACK.has(pos) ? "att" : "mid");
  const lines = { def: [], mid: [], att: [] };
  picks.forEach((p, s) => { const l = lineOf(formation.slots[s]); if (l) lines[l].push(p.exact); });
  const lineAvg = { def: avg(lines.def), mid: avg(lines.mid), att: avg(lines.att) };

  let lean = 0;
  if (lineAvg.att - lineAvg.def >= 2) lean = 1;
  else if (lineAvg.def - lineAvg.att >= 2) lean = -1;
  if (lean === 0 && style === "attack") lean = 1;
  if (lean === 0 && style === "defend") lean = -1;

  const lineup = picks
    .map((p, s) => ({ slot: formation.slots[s], rating: p.exact, stats: effectiveStats(squad[p.player]), card: squad[p.player].card, player: p.player }))
    .filter((p) => p.slot !== "GK");
  const tactics = deriveTactics(lineup, { lean, teamOvr: evaluation.average });

  const starting = new Set(picks.map((p) => p.player));
  const weakestSlot = picks.findIndex((p) => p.rating === evaluation.weakest);

  const explanations = picks.map((p, s) => {
    const entry = squad[p.player];
    const stats = effectiveStats(entry);
    const slot = formation.slots[s];
    const r = table[p.player][slot];
    return {
      game: r.game,
      stat: Math.round(r.stat),
      slotIndex: s,
      slot,
      name: entry.card.name,
      rating: p.rating,
      kind: p.kind,
      kindLabel: KIND_LABEL[p.kind],
      isWeakest: s === weakestSlot,
      stats: entry.card.stats
        ? keyStats(slot).map((k) => `${STAT_NAMES[k]} ${Math.round(stats[k])}`).join(" · ")
        : "rated from OVR only (card not in database)",
    };
  });

  return {
    lines: lineAvg,
    lean,
    tactics,
    explanations,
    subs: planSubs(evaluation, squad, table, starting),
    bench: squad.filter((_, i) => !starting.has(i)).map((e) => `${e.card.name} ${e.card.pos}`),
  };
}

// Three substitutions, one per bench player and slot. Prefers swaps that lose the fewest
// rating points, and replacing starters with low stamina (they fade first).
function planSubs(evaluation, squad, table, starting) {
  const { formation, picks } = evaluation;
  const bench = squad.map((_, i) => i).filter((i) => !starting.has(i));
  const usedBench = new Set();
  const usedSlot = new Set();
  const subs = [];
  for (let round = 0; round < 3; round++) {
    let best = null;
    for (const b of bench) {
      if (usedBench.has(b)) continue;
      picks.forEach((pick, s) => {
        const slot = formation.slots[s];
        if (slot === "GK" || usedSlot.has(s)) return;
        const benchRating = table[b][slot].rating;
        const drop = pick.exact - benchRating;
        const stamina = effectiveStats(squad[pick.player]).sta ?? 90;
        const value = drop - Math.max(0, 95 - stamina) * 0.15;
        if (!best || value < best.value) best = { value, b, s, slot, benchRating, drop, stamina, pick };
      });
    }
    if (!best) break;
    usedBench.add(best.b);
    usedSlot.add(best.s);
    subs.push({
      on: squad[best.b].card.name,
      off: squad[best.pick.player].card.name,
      slot: best.slot,
      reason: `${Math.round(best.benchRating)} vs ${best.pick.rating} in that slot` +
              (best.stamina < 90 ? ` · starter's stamina is only ${Math.round(best.stamina)}` : ""),
    });
  }
  return subs;
}
