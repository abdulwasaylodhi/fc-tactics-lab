# FC Mobile (Season 26) – Training / Rank Up / OVR mechanics

Research date: 2026-09-24. Sources: renderz.app static JS bundles and SSR HTML (no `/api/*` calls were made, per robots.txt), EA and community guides.
Tags: **VERIFIED** = I saw it in code or data. **SOURCED** = stated by an external page (quoted). **ASSUMED** = my inference or an approximation.

Local copies are in the session scratchpad: `n18.js` (player page node), `BU9.js` (chunk `BU9eo7sl.js`: stores and constants), `worker.js` (`/_app_beta/immutable/workers/worker-Dl5QyGeo.js`: upgrade calculator), `h0.html` / `h30.html` (Hazard SSR), `list.txt` (16 players parsed from `/players`).

---

## 1. URL query params and SSR

**VERIFIED (n18.js, BU9.js).** The player page reads and writes three query params:

| param | format | example |
|---|---|---|
| `rankUp` | int 0..5 | `rankUp=5` |
| `level` | int 0..30 (training level) | `level=30` |
| `skillUpgrades` | `"<skillLevelId>.<level>"` joined by `-` | `skillUpgrades=36041.2-39010.1` |

Example: `https://renderz.app/player/30920640-hazard?rankUp=5&level=30&skillUpgrades=36041.2`

**VERIFIED: the SSR response does not change with these params.** I fetched the page with and without `?rankUp=5&level=30`, and the two responses were byte-identical in length (205521) and identical in content:
`upgradeModel:{level:0,rankUp:0,skillUpgrades:[]}`, `upgradeOutput:{skillUpgradedStats:[]}`, `rating:121`, `boostedStats:{}`, and the same stats.
The load function only depends on `params:["playerId"]`. The params are applied in the browser after mount:
`onMount -> store.upgradeQs({player, upgradeModel: url.searchParams.toString()})` -> `postMessage` to a Web Worker.

The worker gets the training-level modifier table from **`GET /api/player/upgrade`** (protobuf, disallowed by robots.txt, **not fetched**) and caches it in IndexedDB `app.renderz` -> store `positions`.
Protobuf schema (VERIFIED in the worker):
```
message PositionModifier { string position = 1; int32 level = 2; Modifiers modifiers = 3; }
message Modifiers { optional int32 acc=1, agg=2, awr=3, bac=4, bal=5, cro=6, cur=7, ... }  // one optional int per stat key
// response = { repeated PositionModifier entries = 1 }
// cached as positions[{id: position, [level]: Modifiers}]
```
**So the exact per-level numbers cannot be obtained without the disallowed API.** The only other way is to render the page in a real browser, which also calls that API. I did not do that.

### Hazard sample (VERIFIED base data; the upgrade is computed as in §2)
Card 30920640, position `LW`, rating 121, baseRating 121, potentialPositions `["LM"]`
Base stats: acc158 agg113 agi150 awr78 bac155 bal153 cro137 cur148 dri156 fin153 frk130 hea113 jmp124 lpa138 lsa147 mrk72 pen138 pos145 rea154 sho146 slt72 spa144 spd153 str127 stt90 vis147 vol135 sta83, GK stats 8, total 3699
avgStats: avg1 155, avg2 147, avg3 142, avg4 153, avg5 82, avg6 122 (totalAvgStats 801)
With `rankUp=5&level=30` the worker returns: rating **126** (121+5). Stats = base + `positions["LW"][30]` modifiers (values unknown, API only).

---

## 2. Upgrade formula (worker `class lo`) – VERIFIED

```js
function upgrade(player, {rankUp, level, skillUpgrades /* [[id,lvl],...] */}) {
  const out = {...player};
  // RANK: +1 OVR per rank. Training level does NOT change rating.
  out.rating = player.rating + rankUp;            // player.rating = base OVR
  out.rank = rankUp; out.level = level;

  // TRAINING: table lookup by the card's PRIMARY position and exact level (the table stores cumulative values, it is not summed per level)
  const mod = positionModifiers[player.position]?.[level];   // from /api/player/upgrade
  if (mod) out.stats = addEachStat(player.stats, mod);       // stat += mod[stat] ?? 0; total recomputed

  // SKILLS: add abilityModifiers of each chosen skill level (from player.skillsData)
  for (const [id, lvl] of skillUpgrades) {
    const m = skillsData[id].levels[`${id}.${lvl}`]?.abilityModifiers;
    if (m) out.stats = addEachStat(out.stats, m);             // additive
  }
  out.stats.total = sum(all stats except total);

  // FACE STATS (avg1..avg6) recomputed from the final stats:
  out.avgStats = computeAvg(out.stats, player.position === "GK");
  return out;
}
```
- Training modifiers depend **only on (primary position string, level)**. The code has no input for card type, OVR, or program. **VERIFIED** (the lookup is `po(l.position, n.level)`).
- There is no stat clamp in the worker. The UI shows a stat above `StatCap = 280` as a special label. **VERIFIED.**
- Rank table from SSR (**VERIFIED**, same for Hazard; likely global):

| rank | maxTrainingLevel | skillPoints | growthOvrSum | rankupProbability |
|---|---|---|---|---|
| 0 | 5 | 0 | 0 | 100 |
| 1 | 10 | 1 | 1 | 100 |
| 2 | 15 | 2 | 2 | 100 |
| 3 | 20 | 3 | 3 | 50 |
| 4 | 25 | 4 | 4 | 20 |
| 5 | 30 | 5 | 5 | 10 |

  The renderz UI lets you pick any level 1..30 (`max(maxTrainingLevel)`). If you lower the rank, it resets the level to that rank's `maxTrainingLevel` and clears the skills. Skill points available = `rank[rankUp].skillPoints - sum(chosen skill levels)`.
  **Conflict:** FC 26 guides say (SOURCED) "You can now train your players all the way to level 30 without needing any rank" and "The chance/probability mechanic is removed". The rank-based cap and probabilities in the data are probably leftovers from FC 24/25. **ASSUMED: treat level 0..30 as independent of rank in S26.**

### Face stats (avgStats) – VERIFIED formula, checked against Hazard data
`avgN = floor( Σ stat*weight / 100 )`
- Outfield: avg1 PAC {acc 50, spd 50}; avg2 SHO {fin 35, lsa 20, sho 20, pos 15, vol 5, pen 5}; avg3 PAS {spa 30, lpa 20, vis 25, cro 15, cur 5, frk 5}; avg4 DRI {dri 25, bac 25, agi 25, rea 15, bal 10}; avg5 DEF {mrk 25, stt 20, slt 20, awr 20, hea 15}; avg6 PHY {str 45, agg 30, jmp 25}
- GK: avg1 {gkd 100}; avg2 {gkp 100}; avg3 {han 100}; avg4 {ref 100}; avg5 {gkk 100}; avg6 {rea 65, agi 15, spd 10, str 10}
- Check: Hazard avg1 = floor((158+153)/2) = 155 ✓; avg2 = floor(14755/100) = 147 ✓.

### Skills (VERIFIED from Hazard skillsData)
- Skill 36041 (no requirement): L1 = +10 to acc, bac, dri, spd, fin, sho, agi, cur. L2 = +20 to the same stats.
- Skills 39010–39014 (need 36041 at L2), L1 = +20 each, and each unlocks position `LM`:
  - 39010: hea, fin, sho, lsa
  - 39011: cro, lpa, spa, vis
  - 39012: bac, dri, rea, agi
  - 39013: awr, mrk, stt, slt
  - 39014: agg, str, bal, jmp
- `potentialPositions` = positions that skills can unlock (alternate positions). Each rank gives 1 skill point, so 5 at rank 5.
- Older EA rule (SOURCED, FC 24 deep dive): skill boosts scale with base OVR (+1/+2, +3/+6, +5/+10). That no longer matches S26 data (+10/+20 at 121 OVR). **Use the per-card skillsData.**

---

## 3. Position OVR from stats

**VERIFIED: renderz does not compute position OVR from stats.** There is no weight table in n18, BU9, or the worker. Rating is a per-card field (`rating`, `baseRating`). The current-season constants block (`FM23`, used for internal season ids ≥23) has no position penalties.

Legacy table (VERIFIED in code, but for **FIFA Mobile 22** constants, `FM22.PositionsSecondary`): OVR penalty when playing out of position.

| natural | penalty group 1 | pen | penalty group 2 | pen |
|---|---|---|---|---|
| LB | LWB, RB, RWB | 1 | CB, LM, RM | 4 |
| CB | LB, RB, CDM | 2 | LWB, RWB | 4 |
| RB | RWB, LB, LWB | 1 | CB, RM, LM | 4 |
| LWB | LB, LM, RWB | 0 | LW, CB, RB | 4 |
| RWB | RB, RM, LWB | 0 | RW, CB, LB | 4 |
| CDM | CM, CB | 2 | RB, LB | 4 |
| CM | CDM, CAM | 2 | RM, LM | 4 |
| RM | RWB, RW, LM | 1 | CM, CAM, RB | 4 |
| LM | LWB, LW, RM | 1 | CM, CAM, LB | 4 |
| CAM | CF, CM | 2 | LW, RW, ST | 4 |
| LW | LM, RW, LF | 1 | ST, LWB, RM | 4 |
| RW | RM, LW, RF | 1 | ST, RWB, LM | 4 |
| CF | LF, RF | 0 | CAM, ST | 1 |
| ST | CF, LF, RF | 2 | LW, RW, CAM | 4 |
| GK | – | – | – | – |

S26 community statement (SOURCED, fifamobileguide/EA forum snippet): "only the default position does not get an OVR penalty". The exact S26 penalty size was not found. **ASSUMED:** use the FM22 table as a heuristic, or treat any non-primary position without a skill unlock as a penalty.

Team OVR (SOURCED, fifamobileguide S26): `TeamOVR = ceil(avg base OVR) + ceil(avg rank)`. Training does not affect it.

### Best public weight table (EA FC 24 console, from eafc24.lol JS; ASSUMED usable as a relative position-fit score)
FC Mobile key mapping: interceptions->awr, defAwareness->mrk, headingAccuracy->hea, positioning->pos, longShots->lsa, shotPower->sho, volleys->vol, standingTackle->stt, slidingTackle->slt, shortPassing->spa, longPassing->lpa, ballControl->bac, crossing->cro. Each row sums to 1.00.
```
LWB/RWB: acc.04 spd.06 sta.10 rea.08 awr.12 bac.08 cro.12 dri.04 spa.10 mrk.07 stt.08 slt.11
LB/RB : acc.05 spd.07 sta.08 rea.08 awr.12 bac.07 cro.09 hea.04 spa.07 mrk.08 stt.11 slt.14
CB    : spd.02 jmp.03 str.10 rea.05 agg.07 awr.13 bac.04 hea.10 spa.05 mrk.14 stt.17 slt.10
CDM   : sta.06 str.04 rea.07 agg.05 awr.14 vis.04 bac.10 lpa.10 spa.14 mrk.09 stt.12 slt.05
LM/RM : acc.07 spd.06 sta.05 rea.07 pos.08 vis.07 bac.13 cro.10 dri.15 fin.06 lpa.05 spa.11
CM    : sta.06 rea.08 awr.05 pos.06 vis.13 bac.14 dri.07 fin.02 lpa.13 spa.17 lsa.04 stt.05
CAM   : acc.04 spd.03 agi.03 rea.07 pos.09 vis.14 bac.15 dri.13 fin.07 lpa.04 spa.16 lsa.05
CF    : acc.05 spd.05 rea.09 pos.13 vis.08 bac.15 dri.14 fin.11 hea.02 spa.09 sho.05 lsa.04
LW/RW : acc.07 spd.06 agi.03 rea.07 pos.09 vis.06 bac.14 cro.09 dri.16 fin.10 spa.09 lsa.04
ST    : acc.04 spd.05 str.05 rea.08 pos.13 bac.10 dri.07 fin.18 hea.10 spa.05 sho.10 lsa.03 vol.02
GK (FIFA 19, fifauteam): gkd.24 han.22 gkp.22 ref.22 rea.06 gkk.04
```
(The FIFA 19 fifauteam table has an LW/RW row that adds up to 104%, so I did not use it for outfield positions.)

**Fit check (VERIFIED computation on 16 renderz S26 cards, all OVR 122):** the weighted value at each card's own position ranges from 144.7 (Kuyt CM) to 155.8 (Cantona ST). So FC Mobile OVR is **not** a fixed function of these weights. The weights only work for ranking a card's best positions, not for predicting its OVR. Examples (own position in bold):
- Varane: **CB 154.6**, CDM 144.4, FB 142.3
- Cantona: **ST 155.8**, CF 154.0
- Rijkaard: **CDM 148.4**, but CB is higher at 150.8

### renderz "meta rating" weights (VERIFIED in SSR `metaData.metaBreakdownJson`, renderz's own model v7, not EA)
For Hazard (LW): `DRI .13, ACC .12, BAC .12, AGI .11, REA .09, SPD .07, FIN .07, BAL .07, CUR .05, SHO .04, CRO .04, POS .04, VIS .03, STA .01, STR .01`.
The final score also multiplies by trait, body type, work rate, archetype and weak-foot factors, then normalizes against peer cards: metaRating 115.9 vs OVR 121, band "underperformer".
The weights for other positions can be read from any player page's SSR (a normal page, allowed). **This is the best gameplay-oriented stat weighting available for the engine.**

---

## 4. Official / community training rules
- EA Training Deep Dive, FC 24 era (SOURCED, ea.com/able/news/fc-mobile-training-deep-dive):
  - "For every rank that a Player has, his OVR increases by 1, he receives a Skill Point, and the max training level is increased by 5 levels."
  - Max 5 ranks.
  - Training upgrades attributes, not OVR.
  - Training XP comes from players in the same position group (ATT/MID/DEF/GK). Higher-OVR players give more XP.
- FC 26 (SOURCED, fifamobileguide.com/training-xp, fcmobilesquad.com/training, fifamobileguide.com/rank-up):
  - Training does not change player or team OVR.
  - Training goes to level 30 with no rank requirement and no coin cost.
  - Rank Up uses Rank Up Points, always succeeds, and gives +1 OVR and +1 Skill Point per rank.
  - Rank Up Point cost at 110+ OVR: 1400 for rank 0→4, 2100 for rank 0→5.
- TXP per level (SOURCED, two sites agree):
  - Levels 1–5: 100, 150, 200, 250, 300
  - Levels 6–10: 600, 800, 1000, 1200, 1400
  - Levels 11–15: 1800, 2200, 2600, 3000, 3400
  - Levels 16–20: 4000, 4600, 5200, 5800, 6400
  - Levels 21–25: 7000, 8000, 9000, 10000, 11000
  - Levels 26–30: 12000, 13000, 14000, 15000, 16000
  - Total is **160,000** by my sum, which matches fcmobilesquad's "160,000". mrbelieverhub's "70,000" is wrong.
- Training Transfer (SOURCED, fcmobilesquad): 10% XP loss. A level-30 transfer costs 1600 Transfer Training Points.
- TXP value by fodder OVR (SOURCED): 47–59: 100, 60–69: 120, 70–74: 160, 75–79: 200, 80–84: 250, 85–89: 300, 90: 400, 95+: 1000.

## 5. Recommendations for the JS engine
1. `ovr(card, rank) = baseRating + rank` (VERIFIED). Training level does not change OVR.
2. `stats(card, level) = base + T[position][level]`. **T is unknown** (it lives only in the protobuf API). If you need numbers, get the user's permission or take them from in-game screenshots. Otherwise, as an ASSUMED placeholder, use a linear per-level boost on the position's key stats.
3. Skills: add `abilityModifiers` from `skillsData`. Alternate positions come only from skill `unlockedPositions` / `potentialPositions`.
4. Position fit: use the renderz meta weights per position, or the FC 24 table above, as a relative score. Use the FM22 penalty table only as a heuristic.
