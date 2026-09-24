import { useMemo, useState } from "react";
import { motion } from "motion/react";
import Badge from "./Badge.jsx";
import { layout } from "../engine/formations.js";
import { recommend } from "../engine/recommend.js";
import { IN_MATCH } from "../engine/tactics.js";

const STYLES = [
  ["any", "Best overall"],
  ["attack", "Attack"],
  ["balanced", "Balanced"],
  ["defend", "Defend"],
];

const fade = (i) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { delay: 0.08 * i, duration: 0.4 } },
});

export default function Results({ squad, onEdit }) {
  const [style, setStyle] = useState("any");
  const [picked, setPicked] = useState(0);
  const result = useMemo(() => recommend(squad, style), [squad, style]);
  const shown = result.ranked[picked] ?? result.ranked[0];
  const plan = picked === 0 ? result : result.planFor(shown);

  return (
    <section>
      <div className="section-head">
        <div>
          <h2>Your game plan</h2>
          <p>Worked out from every starter's stats in every slot of all {result.ranked.length} Manager Mode formations.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div className="style-toggle" role="tablist" aria-label="Play style">
            {STYLES.map(([key, label]) => (
              <button key={key} className={style === key ? "on" : ""} onClick={() => { setStyle(key); setPicked(0); }}>
                {style === key && <motion.div layoutId="style-pill" className="pill" transition={{ type: "spring", bounce: 0.2, duration: 0.5 }} />}
                <span>{label}</span>
              </button>
            ))}
          </div>
          <button className="btn ghost small" onClick={onEdit}>Edit squad</button>
        </div>
      </div>

      <div className="results">
        <motion.div className="panel pitch-wrap" {...fade(0)}>
          <div className="pitch-head">
            <h3>{shown.formation.name}</h3>
            <div className="tags">
              {shown.formation.tags.map((t) => <span key={t} className={`tag ${t === "Recommended" ? "lime" : ""}`}>{t}</span>)}
              <span className="tag lime" title="Blend of in-game rating and stat fit">fit {shown.average.toFixed(1)}</span>
            </div>
          </div>
          <Pitch evaluation={shown} squad={squad} />
          <div className="line-bars">
            {[["Defence", plan.lines.def], ["Midfield", plan.lines.mid], ["Attack", plan.lines.att]].map(([l, v]) => (
              <div className="line-bar" key={l}>
                <div className="lbl">{l}</div>
                <div className="val">{v.toFixed(1)}</div>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="side">
          <motion.div className="panel card-block" {...fade(1)}>
            <h4>Formations <small>tap to preview</small></h4>
            <div className="form-list">
              {result.ranked.slice(0, 6).map((r, i) => (
                <button key={r.formation.name} className={`form-row ${i === picked ? "on" : ""}`} onClick={() => setPicked(i)}>
                  <span className="rk">{i + 1}</span>
                  <span className="nm">{r.formation.name}</span>
                  <span className="wk">weakest {r.weakest}</span>
                  <span className="sc">{r.average.toFixed(1)}</span>
                </button>
              ))}
            </div>
          </motion.div>

          <motion.div className="panel card-block" {...fade(2)}>
            <h4>Tactics <small>closest preset: {plan.tactics.preset}</small></h4>
            <div className="tactics">
              {[["BUILD UP", plan.tactics.build], ["OFFENCE", plan.tactics.offence], ["DEFENCE", plan.tactics.defence]].map(([title, list]) => (
                <div key={title}>
                  <div className="tab-title">{title}</div>
                  {list.map((s) => (
                    <div className="setting" key={title + s.name}>
                      <span className="nm">{s.name}</span>
                      {typeof s.value === "number" ? (
                        <span className="level" aria-label={`${s.value} of 3`}>
                          {[1, 2, 3].map((n) => (
                            <motion.i key={n} className={n <= s.value ? "on" : ""} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                              transition={{ delay: 0.3 + n * 0.08 }} style={{ originX: 0 }} />
                          ))}
                          <b>{s.value}</b>
                        </span>
                      ) : (
                        <span className="choice">{s.value}</span>
                      )}
                      <span className="why">{s.why}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      <div className="results" style={{ marginTop: 22 }}>
        <motion.div className="panel card-block" {...fade(3)}>
          <h4>Why each player is there</h4>
          <div className="why-list">
            {plan.explanations.map((x) => (
              <div className="why-row" key={x.slotIndex}>
                <span className="slot">{x.slot}</span>
                <div>
                  <b>{x.name}</b> · in-game {x.game} · stat fit {x.stat}
                  {x.kind !== "main" && <span className="ptile-sub"> ({x.kindLabel})</span>}
                  {x.isWeakest && <span className="weak"> · weak link, upgrade first</span>}
                  <div className="stats">{x.stats}</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="side">
          <motion.div className="panel card-block" {...fade(4)}>
            <h4>Substitutions <small>3 allowed · around 60–70'</small></h4>
            <div className="subs">
              {plan.subs.length === 0 && <div className="ptile-sub">Add more players to get a bench plan.</div>}
              {plan.subs.map((s) => (
                <div className="sub-row" key={s.on}>
                  <span className="arrow">⇄</span>
                  <div>
                    <b>{s.on}</b> for {s.off} at {s.slot}
                    <div className="detail">{s.reason}</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
          <motion.div className="panel card-block" {...fade(5)}>
            <h4>In-match changes</h4>
            <div className="inmatch">
              {IN_MATCH.map((r) => (
                <div className="im-row" key={r.when}>
                  <span className="when">{r.when}</span>
                  <span className="detail">{r.change}</span>
                </div>
              ))}
            </div>
          </motion.div>
          {plan.bench.length > 0 && (
            <motion.div className="panel card-block" {...fade(6)}>
              <h4>Bench</h4>
              <div className="ptile-sub">{plan.bench.join(" · ")}</div>
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}

function Pitch({ evaluation, squad }) {
  const coords = layout(evaluation.formation);
  return (
    <div className="pitch">
      <svg className="lines" viewBox="0 0 100 128" preserveAspectRatio="none" aria-hidden="true">
        <g fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="0.4">
          <rect x="3" y="3" width="94" height="122" />
          <line x1="3" y1="64" x2="97" y2="64" />
          <circle cx="50" cy="64" r="11" />
          <rect x="22" y="3" width="56" height="18" />
          <rect x="36" y="3" width="28" height="7" />
          <rect x="22" y="107" width="56" height="18" />
          <rect x="36" y="118" width="28" height="7" />
        </g>
      </svg>
      {evaluation.picks.map((pick, i) => {
        const entry = squad[pick.player];
        const [x, y] = coords[i];
        return (
          <motion.div
            key={entry.uid}
            className="chip"
            initial={false}
            animate={{ left: `${6 + x * 88}%`, top: `${94 - y * 86}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 18 }}
          >
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.04 * i, type: "spring" }}>
              <Badge ovr={pick.game} pos={evaluation.formation.slots[i]} />
            </motion.div>
            <span className="chip-name">{entry.card.name}</span>
            {pick.kind === "alt" && <span className="chip-flag alt">ALT</span>}
            {pick.kind === "skill" && <span className="chip-flag skill">SKILL</span>}
            {pick.kind === "out" && <span className="chip-flag out">OUT OF POS</span>}
          </motion.div>
        );
      })}
    </div>
  );
}
