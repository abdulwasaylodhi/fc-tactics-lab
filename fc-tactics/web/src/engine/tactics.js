// Turns a chosen lineup's STATS into Manager Mode tactic settings.
// Every setting the game exposes is covered (Build Up / Offence / Defence, sliders 1-3,
// Back Line Cover/Offside Trap), and each comes with the numbers that decided it.

const FORWARDS = new Set(["ST", "CF", "LW", "RW"]);
const WIDE = new Set(["LW", "RW", "LM", "RM", "LB", "RB", "LWB", "RWB"]);
const MIDS = new Set(["CDM", "CM", "CAM", "LM", "RM"]);
const FULLBACKS = new Set(["LB", "RB", "LWB", "RWB"]);

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pick = (lineup, set) => lineup.filter((p) => set.has(p.slot));

// Stats are on a different scale from OVR (a 121 winger has ~155 pace), so every stat is
// compared with what a "key stat" usually is for this squad's level: about 1.25 x OVR.
// index 1.00 = normal for the level, 1.04+ = standout, 0.94- = weak.
function indexer(teamOvr) {
  const par = teamOvr * 1.25;
  return (value) => value / par;
}

export function deriveTactics(lineup, { lean, teamOvr }) {
  // lineup: [{ slot, rating, stats, card }] for the 10 outfield players
  const idx = indexer(teamOvr);
  const s = (players, ...keys) => avg(players.map((p) => avg(keys.map((k) => p.stats[k] ?? 0))));

  const fwd = pick(lineup, FORWARDS);
  const mids = pick(lineup, MIDS);
  const wide = pick(lineup, WIDE).filter((p) => !FULLBACKS.has(p.slot));
  const cbs = lineup.filter((p) => p.slot === "CB");
  const backs = lineup.filter((p) => p.slot === "CB" || FULLBACKS.has(p.slot));
  const strikers = lineup.filter((p) => p.slot === "ST" || p.slot === "CF");

  const m = {
    fwdPace: idx(s(fwd, "acc", "spd")),
    fwdDribble: idx(s(fwd, "dri", "agi", "bac")),
    midShortPass: idx(s(mids, "spa", "vis")),
    midLongPass: idx(s(mids, "lpa", "vis")),
    wideCross: wide.length ? idx(s(wide, "cro", "cur")) : 0,
    boxAerial: strikers.length ? idx(s(strikers, "hea", "jmp", "str")) : 0,
    longShots: idx(s([...fwd, ...mids], "lsa", "sho")),
    cbPace: idx(s(cbs, "acc", "spd")),
    tackling: idx(s(backs, "stt", "slt", "mrk")),
    aggression: idx(s(backs, "agg", "str")),
    stamina: avg(lineup.map((p) => p.stats.sta ?? 0)),
    fwdWorkRate: avg(fwd.map((p) => p.card.wr?.[0] ?? 1)),
  };
  const pct = (x) => `${Math.round(x * 100)}%`;
  const hi = (x) => x >= 1.04;
  const lo = (x) => x <= 0.94;

  const build = [], offence = [], defence = [];
  const add = (list, name, value, why) => list.push({ name, value, why });

  // ---------------- BUILD UP
  if (lean < 0 && hi(m.fwdPace)) add(build, "Speed", 3, `counter: forwards' pace ${pct(m.fwdPace)} of par - break before they recover`);
  else if (hi(m.fwdPace) && lean >= 0) add(build, "Speed", 3, `forwards' pace ${pct(m.fwdPace)} of par - get it to them early`);
  else if (hi(m.midShortPass) && !hi(m.fwdPace)) add(build, "Speed", 1, `midfield passing ${pct(m.midShortPass)} beats forward pace ${pct(m.fwdPace)} - build patiently`);
  else add(build, "Speed", 2, "no standout pace or passing edge - steady tempo");

  if (hi(m.fwdPace) && m.midLongPass >= 1.0) add(build, "Passing Distance", 3, `quick forwards + long passing ${pct(m.midLongPass)} - balls in behind`);
  else if (m.midShortPass >= m.midLongPass + 0.02 || !hi(m.fwdPace)) add(build, "Passing Distance", 1, `short passing ${pct(m.midShortPass)} vs long ${pct(m.midLongPass)} - keep it short`);
  else add(build, "Passing Distance", 2, "mix short and long");

  add(build, "Mentality", lean > 0 ? "Attacking" : lean < 0 ? "Defensive" : "Balanced",
    lean > 0 ? "attack is your strongest line" : lean < 0 ? "defence is your strongest line" : "no line clearly stronger");
  const free = lean >= 0 && hi(m.fwdDribble);
  add(build, "Positioning", free ? "Free" : "Organised",
    free ? `forwards' dribbling ${pct(m.fwdDribble)} of par - let them roam` : "keep shape; your players aren't the roaming type");

  // ---------------- OFFENCE
  add(offence, "Passing Tendency", hi(m.midShortPass) ? 3 : lo(m.midShortPass) ? 1 : 2,
    `midfield short passing + vision ${pct(m.midShortPass)} of par`);
  const crossValue = wide.length === 0 ? 1 : hi(m.wideCross) && m.boxAerial >= 0.98 ? 3 : lo(m.boxAerial) || lo(m.wideCross) ? 1 : 2;
  add(offence, "Cross Tendency", crossValue,
    wide.length === 0 ? "no wide attackers in this shape" : `crossing ${pct(m.wideCross)}, strikers in the air ${pct(m.boxAerial)}`);
  add(offence, "Shooting Tendency", hi(m.longShots) ? 3 : lo(m.longShots) ? 1 : 2,
    `long shots + shot power ${pct(m.longShots)} of par`);
  add(offence, "Positioning", free ? "Free" : "Organised",
    free ? "runners find gaps on their own" : "stick to lanes - cleaner counters");

  // ---------------- DEFENCE
  const pressure = m.stamina >= 95 && m.fwdWorkRate >= 1.5 ? 3 : m.stamina < 80 || lean < 0 ? 1 : 2;
  add(defence, "Pressure", pressure, `team stamina ${Math.round(m.stamina)}, forwards' work rate ${["low", "medium", "high"][Math.round(m.fwdWorkRate)] ?? "medium"}`);
  const threeBack = cbs.length === 3 && backs.length === 3;
  add(defence, "Width", threeBack ? 2 : 1, threeBack ? "only 3 at the back - midfield must cover the flanks" : "stay compact; force play wide");
  add(defence, "Aggression", hi(m.tackling) && hi(m.aggression) ? 3 : lo(m.tackling) ? 1 : 2,
    `defenders' tackling ${pct(m.tackling)}, strength/aggression ${pct(m.aggression)}`);
  const trap = hi(m.cbPace) && lean >= 0;
  add(defence, "Back Line", trap ? "Offside Trap" : "Cover",
    trap ? `centre-backs are quick (${pct(m.cbPace)} of par) - they can recover` : `centre-back pace ${pct(m.cbPace)} of par - don't play a high trap`);

  const preset = lean > 0 ? "Attacking" : lean < 0 ? "Counter" : hi(m.midShortPass) ? "Control" : "Balanced (Custom)";
  return { preset, build, offence, defence, metrics: m };
}

export const IN_MATCH = [
  { when: "2+ goals up", change: "Speed 1 · Mentality Defensive · Positioning Organised · Pressure 1" },
  { when: "Level after 70'", change: "keep the plan; bring on fresh legs from the sub list" },
  { when: "Behind", change: "Speed 3 · Mentality Attacking · Passing Tendency 3 · Pressure 3 · Aggression 3" },
];
