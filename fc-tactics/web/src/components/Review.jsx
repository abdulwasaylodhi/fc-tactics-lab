import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Badge, { prettyProgram } from "./Badge.jsx";
import { newUid } from "./Upload.jsx";
import { normalize } from "../engine/match.js";
import { effectiveOvr, maxTrainingForRank, MAX_RANK } from "../engine/ratings.js";

const POSITIONS = ["GK", "LB", "CB", "RB", "LWB", "RWB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "CF", "ST"];

export default function Review({ db, squad, setSquad, onNext, onBack }) {
  const byName = useMemo(() => {
    const m = new Map();
    for (const p of db.players) {
      const k = normalize(p.name);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p);
    }
    for (const list of m.values()) list.sort((a, b) => b.ovr - a.ovr);
    return m;
  }, [db]);

  const update = (uid, patch) => setSquad((s) => s.map((e) => (e.uid === uid ? { ...e, ...patch } : e)));
  const remove = (uid) => setSquad((s) => s.filter((e) => e.uid !== uid));
  const hasGk = squad.some((e) => e.card.pos === "GK" || e.card.alt?.includes("GK"));
  const outfield = squad.filter((e) => e.card.pos !== "GK").length;
  const sorted = [...squad].sort((a, b) => effectiveOvr(b) - effectiveOvr(a));

  return (
    <section>
      <div className="section-head">
        <div>
          <h2>Check your squad</h2>
          <p>
            Make sure each card is the right version and set its <b>training level</b> and <b>rank</b>. Upgrades raise the
            stats the recommendations are based on. Add anyone the scan missed.
          </p>
        </div>
        <button className="btn ghost small" onClick={onBack}>← New screenshots</button>
      </div>

      {squad.some((e) => e.source === "scan") && (
        <div className="notice">
          Screenshot reading isn't perfect. Check the names, and if a player is missing, add them with the search box.
          Rank is read from the OVR shown. Training level isn't visible in OVR, so it's assumed to be 30 for rank-5 cards.
          Set it yourself if that's wrong.
        </div>
      )}
      <p className="ptile-sub" style={{ margin: "-4px 0 16px" }}>
        Rank adds +1 OVR each and skill points (spent automatically on the skills that suit the position, unlocking
        alternate positions from rank 3). Training boosts stats only; its size is an estimate because EA doesn't publish the table.
      </p>

      <div className="squad-grid">
        <AddPlayer db={db} onAdd={(entry) => setSquad((s) => [entry, ...s])} />
        <AnimatePresence initial={true}>
          {sorted.map((entry, i) => (
            <motion.div
              key={entry.uid}
              layout
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i * 0.03, 0.4) } }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <PlayerTile entry={entry} versions={byName.get(normalize(entry.card.name)) ?? []} update={update} remove={remove} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="sticky-cta panel">
        <div className="count">
          <b>{squad.length}</b> players{squad.length < 11 && ` · add ${11 - squad.length} more`}
          {squad.length >= 11 && !hasGk && " · no goalkeeper yet"}
          {squad.length >= 11 && hasGk && outfield < 10 && ` · need ${10 - outfield} more outfield player${outfield === 9 ? "" : "s"}`}
        </div>
        <button className="btn" disabled={squad.length < 11 || !hasGk || outfield < 10} onClick={onNext}>
          Get formation &amp; tactics →
        </button>
      </div>
    </section>
  );
}

function PlayerTile({ entry, versions, update, remove }) {
  const { card } = entry;
  const maxLevel = maxTrainingForRank(entry.rank);
  return (
    <div className="ptile panel">
      <button className="remove" aria-label={`Remove ${card.name}`} onClick={() => remove(entry.uid)}>✕</button>
      <div className="ptile-top">
        <Badge ovr={effectiveOvr(entry)} pos={card.pos} />
        <div>
          <div className="ptile-name">{card.name}</div>
          <div className="ptile-sub">
            {card.custom ? "not in database · rated by OVR only" : `Base ${card.ovr} · ${prettyProgram(card.program)}`}
          </div>
          {card.alt?.length > 0 && <div className="ptile-sub">Alt: {card.alt.join(", ")}</div>}
        </div>
      </div>

      {versions.length > 1 && (
        <div className="field">
          <label>Card version</label>
          <select value={card.id} onChange={(e) => update(entry.uid, { card: versions.find((v) => String(v.id) === e.target.value) })}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.ovr} {v.pos} · {prettyProgram(v.program)}{v.alt.length ? ` · alt ${v.alt.join("/")}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {!card.custom && (
        <>
          <div className="field">
            <label>Rank up</label>
            <div className="stars" role="radiogroup" aria-label="Rank">
              {Array.from({ length: MAX_RANK }, (_, i) => i + 1).map((r) => (
                <button
                  key={r}
                  className={r <= entry.rank ? "on" : ""}
                  aria-label={`Rank ${r}`}
                  onClick={() => {
                    const rank = entry.rank === r ? r - 1 : r;
                    update(entry.uid, { rank, level: Math.min(entry.level, maxTrainingForRank(rank)) });
                  }}
                >★</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Training level {entry.level} / {maxLevel}</label>
            <input
              type="range" min="0" max={maxLevel} value={entry.level}
              onChange={(e) => update(entry.uid, { level: Number(e.target.value) })}
            />
          </div>
        </>
      )}
    </div>
  );
}

function AddPlayer({ db, onAdd }) {
  const [q, setQ] = useState("");
  const [custom, setCustom] = useState(null);
  const results = useMemo(() => {
    const n = normalize(q);
    if (n.length < 2) return [];
    return db.players
      .filter((p) => normalize(p.name).includes(n) || normalize(p.fullName ?? "").includes(n))
      .slice(0, 40);
  }, [q, db]);

  const add = (card) => {
    onAdd({ uid: newUid(), card, rank: 0, level: 0, source: "manual" });
    setQ("");
  };

  if (custom) {
    return (
      <div className="add-player panel">
        <div className="ptile-name">Player not in the database</div>
        <div className="field"><label>Name</label>
          <input type="text" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
        </div>
        <div className="field-row">
          <div className="field"><label>Position</label>
            <select value={custom.pos} onChange={(e) => setCustom({ ...custom, pos: e.target.value })}>
              {POSITIONS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="field"><label>OVR</label>
            <input type="number" min="40" max="150" value={custom.ovr} onChange={(e) => setCustom({ ...custom, ovr: Number(e.target.value) })} />
          </div>
        </div>
        <div className="btn-row">
          <button className="btn ghost small" onClick={() => setCustom(null)}>Cancel</button>
          <button className="btn small" disabled={!custom.name.trim()} onClick={() => {
            onAdd({ uid: newUid(), rank: 0, level: 0, source: "manual",
                    card: { id: newUid(), custom: true, name: custom.name.trim(), pos: custom.pos, ovr: custom.ovr, alt: [], stats: null } });
            setCustom(null);
          }}>Add</button>
        </div>
      </div>
    );
  }

  return (
    <div className="add-player panel">
      <div className="ptile-name">＋ Add a player</div>
      <div className="field">
        <label>Search {db.players.length.toLocaleString()} cards</label>
        <input type="text" placeholder="e.g. Mbappé, Van Dijk…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {results.length > 0 && (
        <div className="search-results">
          {results.map((p) => (
            <button key={p.id} onClick={() => add(p)}>
              <span>{p.name}</span>
              <span className="meta">{p.ovr} {p.pos} · {prettyProgram(p.program)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="ptile-sub">
        Card below OVR {db.minOvr} or missing?{" "}
        <button className="linklike" onClick={() => setCustom({ name: q, pos: "ST", ovr: 110 })}>Add it manually</button>
      </div>
    </div>
  );
}
