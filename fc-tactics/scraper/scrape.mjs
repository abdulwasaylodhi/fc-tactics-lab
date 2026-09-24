// Builds the FC Mobile player database from renderz.app (a licensed FC Mobile database).
//
//   node scrape.mjs              list pages + detail pages, then build data/players.json
//   node scrape.mjs --min 118    only cards with base OVR >= 118 (default 117)
//   node scrape.mjs --no-details skip detail pages (no skill-tree data, much faster)
//   node scrape.mjs --build      rebuild players.json from the cache without downloading
//
// Polite by design: one request at a time, ~1.2 s apart, backs off on 429/5xx, and never
// touches /api/ (disallowed in renderz.app/robots.txt). Every page is cached under
// data/cache, so an interrupted run (Ctrl+C) resumes where it stopped.
// It runs entirely on your machine - it uses no Claude usage.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractKitData } from "./jsliteral.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "data", "cache");
const OUT = path.join(ROOT, "data", "players.json");
const WEB_OUT = path.join(ROOT, "web", "public", "db.json");
const BASE = "https://renderz.app";
const DELAY_MS = 1200;
const UA = "FC-Tactics-DB/1.0 (non-commercial fan tool; 1 req/s)";

const args = process.argv.slice(2);
const MIN_OVR = args.includes("--min") ? Number(args[args.indexOf("--min") + 1]) : 117;
const DETAILS = !args.includes("--no-details");
const BUILD_ONLY = args.includes("--build");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastRequest = 0;

async function get(url) {
  for (let attempt = 1; ; attempt++) {
    const wait = lastRequest + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    let res;
    try {
      res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
    } catch (e) {
      res = { ok: false, status: `network error (${e.cause?.code ?? e.message})` };
    }
    if (res.ok) return res.text();
    if (res.status === 404) return null;
    if (attempt >= 6) throw new Error(`${url} failed: ${res.status}`);
    const backoff = 15000 * attempt;
    console.warn(`  ${res.status} on ${url} - waiting ${backoff / 1000}s (attempt ${attempt})`);
    await sleep(backoff);
  }
}

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const writeJson = (f, v) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(v));
};

// ---------------------------------------------------------------- list pages
async function scrapeList() {
  const cards = [];
  for (let page = 1; ; page++) {
    const file = path.join(CACHE, "list", `page-${page}.json`);
    let data;
    if (fs.existsSync(file)) data = readJson(file);
    else {
      const html = await get(`${BASE}/players?page=${page}`);
      const kit = extractKitData(html);
      const node = kit.find((n) => n?.data?.players);
      if (!node) throw new Error(`page ${page}: no players in page data`);
      data = { hasMore: node.data.hasMore, players: node.data.players.map(trimListPlayer) };
      writeJson(file, data);
      console.log(`list page ${page}: ${data.players.length} cards, ` +
                  `OVR ${data.players[0]?.ovr}-${data.players.at(-1)?.ovr}`);
    }
    cards.push(...data.players.filter((p) => p.ovr >= MIN_OVR));
    const lowest = data.players.at(-1)?.ovr ?? 0;
    if (!data.hasMore || lowest < MIN_OVR) break;   // list is sorted by OVR, highest first
  }
  return cards;
}

function trimListPlayer(p) {
  return {
    id: p.assetId,
    pid: p.playerId,
    name: p.cardName,
    fullName: p.commonName || `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim(),
    pos: p.position,
    ovr: p.rating,
    alt: p.potentialPositions ?? [],
    stats: p.stats,
    wf: p.weakFoot,
    foot: p.foot,
    wr: [p.workRateAtt, p.workRateDef],
    height: p.height,
    weight: p.weight,
    program: p.source,
    skillMoves: p.skillMovesLevel ?? p.skillMoves?.id,
    traits: (p.traits ?? []).map((t) => t.id),
    playStyles: (p.playStyles ?? []).map((s) => ({ name: s.name, level: s.level })),
    tags: p.tags,
    added: p.added,
  };
}

// -------------------------------------------------------------- detail pages
function slugMapFromSitemaps() {
  const map = new Map();
  const dir = path.join(CACHE, "sitemaps");
  if (!fs.existsSync(dir)) return map;
  for (const f of fs.readdirSync(dir)) {
    for (const m of fs.readFileSync(path.join(dir, f), "utf8").matchAll(/\/player\/(\d+)-([^<\s]+)/g))
      map.set(Number(m[1]), m[2]);
  }
  return map;
}

async function fetchSitemaps() {
  const dir = path.join(CACHE, "sitemaps");
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) return;
  fs.mkdirSync(dir, { recursive: true });
  const index = await get(`${BASE}/sitemap.xml`);
  for (const m of index.matchAll(/<loc>([^<]*sitemap-players[^<]*)<\/loc>/g)) {
    const xml = await get(m[1]);
    fs.writeFileSync(path.join(dir, path.basename(m[1])), xml);
  }
}

const slugify = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function scrapeDetails(cards) {
  await fetchSitemaps();
  const slugs = slugMapFromSitemaps();
  let done = 0;
  for (const card of cards) {
    const file = path.join(CACHE, "detail", `${card.id}.json`);
    done++;
    if (fs.existsSync(file)) continue;
    const url = `${BASE}/player/${card.id}-${slugs.get(card.id) ?? slugify(card.name)}`;
    const html = await get(url);
    if (!html) { writeJson(file, { missing: true }); continue; }
    const player = extractKitData(html).find((n) => n?.data?.player)?.data;
    if (!player) throw new Error(`${url}: no player data`);
    writeJson(file, {
      skills: (player.player.skillsData ?? []).map((s) => ({
        id: s.skill.id,
        requires: s.requirement,
        levels: s.skill.levels.map((l) => ({ level: l.level, positions: l.unlockedPositions, mods: l.abilityModifiers })),
      })),
      rankTable: (player.rank ?? []).map(({ animation, ...r }) => r),
      meta: player.player.metaData ? { rating: player.player.metaData.metaRating, band: player.player.metaData.metaBand } : null,
    });
    if (done % 25 === 0 || done === cards.length) console.log(`details ${done}/${cards.length}`);
  }
}

// --------------------------------------------------------------------- build
function build(allCards) {
  // renderz lists most cards twice (two asset ids, identical data) - keep one of each.
  const seen = new Set();
  const cards = allCards.filter((c) => {
    const key = JSON.stringify([c.name, c.pos, c.ovr, c.program, c.alt, c.stats]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  let rankTable = null;
  const players = cards.map((c) => {
    const file = path.join(CACHE, "detail", `${c.id}.json`);
    const d = fs.existsSync(file) ? readJson(file) : {};
    if (!rankTable && d.rankTable?.length) rankTable = d.rankTable;
    return { ...c, skills: d.skills ?? null, meta: d.meta ?? null };
  });
  const db = { source: "renderz.app", builtAt: new Date().toISOString(), minOvr: MIN_OVR, rankTable, players };
  writeJson(OUT, db);
  if (fs.existsSync(path.dirname(WEB_OUT))) writeJson(WEB_OUT, db);
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log(`\nwrote ${players.length} cards (OVR >= ${MIN_OVR}) to ${OUT} (${kb} KB)` +
              (fs.existsSync(path.dirname(WEB_OUT)) ? ` and ${WEB_OUT}` : ""));
}

// ---------------------------------------------------------------------- main
process.on("SIGINT", () => {
  console.log("\nstopped - progress is cached, run again to resume");
  process.exit(130);
});

const cards = await (BUILD_ONLY ? Promise.resolve().then(scrapeListFromCacheOnly) : scrapeList());
console.log(`${cards.length} cards with base OVR >= ${MIN_OVR}`);
if (DETAILS && !BUILD_ONLY) await scrapeDetails(cards);
build(cards);

function scrapeListFromCacheOnly() {
  const dir = path.join(CACHE, "list");
  const files = fs.readdirSync(dir).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5)));
  return files.flatMap((f) => readJson(path.join(dir, f)).players).filter((p) => p.ovr >= MIN_OVR);
}
