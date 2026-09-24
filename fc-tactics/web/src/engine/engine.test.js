import { test } from "node:test";
import assert from "node:assert/strict";
import { positionMultiplier, ratingAt } from "./ratings.js";
import { hungarian } from "./assign.js";
import { buildNameIndex, chooseCard, detectPlayers } from "./match.js";
import { recommend } from "./recommend.js";
import { parseJsLiteral } from "../../../scraper/jsliteral.mjs";

// Out-of-position ratings read from the owner's FC Mobile screenshots (19 Sep 2026).
// All cards were rank 5, so base = shown OVR - 5.
const OBSERVED = [
  ["Hazard", 121, "LW", { ST: 119, CM: 107, CB: 107 }],
  ["Kimmich", 121, "CDM", { CM: 122, CB: 122, LM: 119 }],
  ["Diaz", 120, "LW", { CF: 119 }],
  ["Caicedo", 119, "CDM", { CM: 120, CB: 120, RM: 118, LM: 118, RWB: 118, ST: 106 }],
  ["Nuno Mendes", 119, "LB", { LWB: 124, CB: 120 }],
  ["Gullit", 117, "CM", { LM: 116, LWB: 113 }],
  ["Messi", 117, "RW", { RM: 118, ST: 116, RWB: 116, CM: 104, LM: 104 }],
  ["Zico", 117, "CAM", { CF: 122, LM: 116, RM: 116, CDM: 113 }],
  ["Van Dijk", 116, "CB", { RB: 117 }],
];

test("out-of-position formula matches every in-game rating", () => {
  let checked = 0;
  for (const [name, base, pos, seen] of OBSERVED) {
    for (const [to, expected] of Object.entries(seen)) {
      const got = Math.floor(base * positionMultiplier(pos, to)) + 5;
      assert.equal(got, expected, `${name} ${pos}->${to}`);
      checked++;
    }
  }
  assert.equal(checked, 27);
});

test("custom card uses the same game formula", () => {
  const entry = { card: { custom: true, name: "X", pos: "LW", ovr: 126, alt: [] }, rank: 0, level: 0 };
  assert.equal(ratingAt(entry, "ST").game, Math.floor(126 * 0.95));
});

test("hungarian finds the optimal assignment (brute-force check)", () => {
  const rand = mulberry(7);
  for (let t = 0; t < 40; t++) {
    const rows = 3 + Math.floor(rand() * 3);
    const cols = rows + Math.floor(rand() * 3);
    const cost = Array.from({ length: rows }, () => Array.from({ length: cols }, () => Math.round(rand() * 50)));
    const a = hungarian(cost);
    assert.equal(new Set(a).size, rows);
    const total = a.reduce((s, c, r) => s + cost[r][c], 0);
    assert.equal(total, bruteForce(cost));
  }
});

test("OCR words are matched to database cards with OVR and position", () => {
  const db = [
    { id: 1, name: "Hazard", pos: "LW", ovr: 121, alt: ["LM"] },
    { id: 2, name: "Hazard", pos: "LW", ovr: 118, alt: [] },
    { id: 3, name: "Van Dijk", pos: "CB", ovr: 116, alt: [] },
  ];
  const w = (text, x, y) => ({ text, bbox: { x0: x, y0: y, x1: x + text.length * 12, y1: y + 20 } });
  const words = [w("126", 100, 160), w("LW", 104, 185), w("HAZARD", 120, 250),
                 w("121", 300, 520), w("CB", 302, 545), w("VAN", 310, 610), w("DIJK", 360, 610)];
  const found = detectPlayers(words, buildNameIndex(db));
  assert.deepEqual(found.map((f) => [f.name, f.shownOvr, f.shownPos]), [["Van Dijk", 121, "CB"], ["Hazard", 126, "LW"]]);
  const hazard = chooseCard(found.find((f) => f.name === "Hazard"));
  assert.equal(hazard.card.id, 1);
  assert.equal(hazard.upgrade, 5);
});

test("OCR tolerates a typo in a long name but not in a short one", () => {
  const index = buildNameIndex([{ id: 1, name: "Rummenigge", pos: "ST", ovr: 117, alt: [] }, { id: 2, name: "Pepe", pos: "CB", ovr: 117, alt: [] }]);
  const w = (text, y = 100) => ({ text, bbox: { x0: 0, y0: y, x1: 60, y1: y + 20 } });
  assert.equal(detectPlayers([w("119", 20), w("RUMMENIGE")], index).length, 1);
  assert.equal(detectPlayers([w("119", 20), w("PEPF")], index).length, 0);
});

test("fuzzy matches need card details that fit the player", () => {
  const index = buildNameIndex([{ id: 1, name: "Aguerd", pos: "CB", ovr: 117, alt: [] }]);
  const w = (text, y) => ({ text, bbox: { x0: 0, y0: y, x1: 60, y1: y + 20 } });
  assert.equal(detectPlayers([w("AGUERO", 100)], index).length, 0);                 // nothing beside it
  assert.equal(detectPlayers([w("ST", 60), w("AGUERO", 100)], index).length, 0);    // a striker, not CB Aguerd
  assert.equal(detectPlayers([w("CB", 60), w("AGUERD", 100)], index).length, 1);
});

test("OVR and position are voted across OCR passes", () => {
  const index = buildNameIndex([{ id: 1, name: "Gabriel", pos: "CB", ovr: 119, alt: [] }]);
  const w = (text, y) => ({ text, bbox: { x0: 0, y0: y, x1: 60, y1: y + 20 } });
  const passes = [[w("123", 20), w("CB", 50), w("GABRIEL", 100)], [w("CB", 50), w("GABRIEL", 100)], [w("LW", 55), w("GABRIEL", 100)]];
  const [g] = detectPlayers(passes, index);
  assert.deepEqual([g.shownOvr, g.shownPos], [123, "CB"]);
});

test("recommend returns a full lineup and every tactic setting", () => {
  const positions = ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CAM", "LW", "ST", "RW", "ST", "CB"];
  const squad = positions.map((pos, i) => ({
    uid: `u${i}`, rank: 0, level: 0,
    card: { custom: true, name: `P${i}`, pos, ovr: 115 + (i % 5), alt: [] },
  }));
  const r = recommend(squad);
  assert.equal(r.ranked.length, 34);
  assert.equal(new Set(r.ranked[0].picks.map((p) => p.player)).size, 11);
  const names = [...r.tactics.build, ...r.tactics.offence, ...r.tactics.defence].map((s) => s.name);
  for (const n of ["Speed", "Passing Distance", "Mentality", "Passing Tendency", "Cross Tendency",
                   "Shooting Tendency", "Pressure", "Width", "Aggression", "Back Line"]) assert.ok(names.includes(n), n);
  assert.equal(r.subs.length, 2);
});

test("page-data parser reads SvelteKit object literals", () => {
  const { value } = parseJsLiteral(`{a:1,b:"x\\"y",c:[1,,2],d:{e:-.5,f:void 0,g:null},h:true}`);
  assert.deepEqual(value, { a: 1, b: 'x"y', c: [1, undefined, 2], d: { e: -0.5, f: undefined, g: null }, h: true });
});

function bruteForce(cost) {
  const rows = cost.length, cols = cost[0].length;
  let best = Infinity;
  const used = new Array(cols).fill(false);
  (function go(r, sum) {
    if (r === rows) { best = Math.min(best, sum); return; }
    for (let c = 0; c < cols; c++) if (!used[c]) { used[c] = true; go(r + 1, sum + cost[r][c]); used[c] = false; }
  })(0, 0);
  return best;
}

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
