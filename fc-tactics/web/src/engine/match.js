// Turns OCR output (words + bounding boxes) from a screenshot into database cards.
// Pure functions - no browser APIs - so they can be unit-tested with `npm test`.

import { MAX_UPGRADE_OVR } from "./ratings.js";

const POSITIONS = new Set(["GK", "LB", "CB", "RB", "LWB", "RWB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "CF", "ST"]);

export const normalize = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim();

export function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

// How many typos we forgive: none for short names ("PEPE"), more for long ones.
const tolerance = (len) => (len <= 4 ? 0 : len <= 7 ? 1 : 2);

// Index the database by normalized card name: "VAN DIJK" -> [card, card, ...]
export function buildNameIndex(players) {
  const index = new Map();
  for (const p of players) {
    const key = normalize(p.name);
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(p);
  }
  return index;
}

// passes: one or more OCR readings of the same image, each [{ text, bbox: { x0, y0, x1, y1 } }].
// (A single word list is accepted too.) Names are found within each reading; the OVR and
// position above each name are then voted on across all readings, since each preprocessing
// pass misreads different cards.
// Returns [{ name, cards, shownOvr, shownPos, box }] - one per detected player card.
export function detectPlayers(passes, nameIndex) {
  if (!Array.isArray(passes[0])) passes = [passes];
  const readings = passes.map((words) => {
    const clean = words.map((w) => ({ ...w, norm: normalize(w.text) })).filter((w) => w.norm.length > 0);
    return {
      clean,
      numbers: clean.filter((w) => /^\d{3}$/.test(w.norm) && +w.norm >= 100 && +w.norm <= 150),
      positions: clean.filter((w) => POSITIONS.has(w.norm)),
    };
  });

  const found = [];
  for (const { clean } of readings) {
    const used = new Set();
    // Try 3- and 2-word names first ("VAN DIJK", "NUNO MENDES"), then single words.
    for (const span of [3, 2, 1]) {
      for (let i = 0; i + span <= clean.length; i++) {
        const group = clean.slice(i, i + span);
        if (group.some((w) => used.has(w))) continue;
        if (span > 1 && !sameLine(group)) continue;
        const text = group.map((w) => w.norm).join(" ");
        if (text.length < 3 || /^\d+$/.test(text) || POSITIONS.has(text)) continue;
        const match = bestName(text, nameIndex);
        if (!match) continue;
        const box = union(group.map((w) => w.bbox));
        const shownOvr = vote(readings.map((r) => nearestAbove(box, r.numbers)?.norm));
        const shownPos = vote(readings.map((r) => nearestAbove(box, r.positions)?.norm));
        // Misread guards: a fuzzy match needs card details beside it that fit the player,
        // and very short names ("PEPE") need at least a number or position nearby.
        if (match.fuzzy && !shownOvr && !shownPos) continue;
        if (match.fuzzy && shownPos && !match.cards.some((c) => c.pos === shownPos || c.alt?.includes(shownPos))) continue;
        if (text.length <= 4 && !shownOvr && !shownPos) continue;
        group.forEach((w) => used.add(w));
        found.push({ name: match.name, cards: match.cards, shownOvr: shownOvr ? +shownOvr : null, shownPos, box });
      }
    }
  }
  return dedupe(found);
}

// Most common non-empty value; ties go to the earliest reading (the cleanest pass).
function vote(values) {
  const counts = new Map();
  values.forEach((v) => v && counts.set(v, (counts.get(v) ?? 0) + 1));
  let best = null;
  for (const [v, n] of counts) if (!best || n > counts.get(best)) best = v;
  return best;
}

function bestName(text, nameIndex) {
  let best = null;
  const exact = nameIndex.get(text);
  if (exact) return { name: exact[0].name, cards: exact };
  const tol = tolerance(text.length);
  if (tol === 0) return null;
  for (const [key, cards] of nameIndex) {
    if (Math.abs(key.length - text.length) > tol) continue;
    const d = levenshtein(key, text);
    if (d <= tol && (!best || d < best.d)) best = { d, name: cards[0].name, cards, fuzzy: true };
  }
  return best;
}

const sameLine = (ws) => {
  const h = ws[0].bbox.y1 - ws[0].bbox.y0;
  return ws.every((w) => Math.abs(w.bbox.y0 - ws[0].bbox.y0) < h * 0.6 && w.bbox.x0 - ws[0].bbox.x0 < h * 12);
};

const union = (boxes) => ({
  x0: Math.min(...boxes.map((b) => b.x0)), y0: Math.min(...boxes.map((b) => b.y0)),
  x1: Math.max(...boxes.map((b) => b.x1)), y1: Math.max(...boxes.map((b) => b.y1)),
});

// Card layout: OVR and position are printed in the top-left corner, above the name.
function nearestAbove(nameBox, candidates) {
  const cx = (nameBox.x0 + nameBox.x1) / 2;
  const width = Math.max(nameBox.x1 - nameBox.x0, 40);
  let best = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const dy = nameBox.y0 - c.bbox.y1;
    const dx = Math.abs((c.bbox.x0 + c.bbox.x1) / 2 - cx);
    if (dy < 0 || dy > width * 3.5 || dx > width * 1.6) continue;
    const d = dy + dx * 0.7;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// The same name found twice at (almost) the same spot is one card.
function dedupe(found) {
  return found.filter((f, i) =>
    !found.some((g, j) => j < i && g.name === f.name &&
      Math.abs(g.box.x0 - f.box.x0) < 30 && Math.abs(g.box.y0 - f.box.y0) < 30));
}

// Pick which version of a player's card the screenshot shows, and how far it's been
// ranked up. Shown OVR = base OVR + rank (0..MAX_UPGRADE_OVR); training doesn't change OVR.
// `fits` is false when no card in the database can show that OVR - usually a card whose
// base OVR is below the database cut-off, which the caller should add as a custom card.
export function chooseCard(detection) {
  const { cards, shownOvr, shownPos } = detection;
  const ranked = cards
    .map((card) => {
      const upgrade = shownOvr == null ? 0 : shownOvr - card.ovr;
      const fits = shownOvr == null || (upgrade >= 0 && upgrade <= MAX_UPGRADE_OVR);
      let score = fits ? 0 : -100;
      if (shownPos && card.pos === shownPos) score += 20;
      score += card.ovr / 10;               // prefer the highest card that still fits
      return { card, upgrade: Math.max(0, Math.min(MAX_UPGRADE_OVR, upgrade)), fits, score };
    })
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (shownPos && best.card.pos !== shownPos && shownOvr != null) best.fits = false;   // e.g. Pépé RW vs Pepe CB
  return best;
}
