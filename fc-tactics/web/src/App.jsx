import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Upload from "./components/Upload.jsx";
import Review from "./components/Review.jsx";
import Results from "./components/Results.jsx";
import { buildNameIndex } from "./engine/match.js";
import { setRankTable } from "./engine/ratings.js";

const STEPS = ["Upload", "Check squad", "Tactics"];

const page = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -16, transition: { duration: 0.2 } },
};

export default function App() {
  const [db, setDb] = useState(null);
  const [dbError, setDbError] = useState(null);
  const [step, setStep] = useState(0);
  const [squad, setSquad] = useState([]);

  useEffect(() => {
    fetch("/db.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        setRankTable(data.rankTable);
        setDb(data);
      })
      .catch((e) => setDbError(e.message));
  }, []);

  const nameIndex = useMemo(() => (db ? buildNameIndex(db.players) : null), [db]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">FC</div>
          <div className="brand-name">TACTICS <span>LAB</span></div>
        </div>
        <div className="db-chip">
          {db ? `${db.players.length.toLocaleString()} cards · OVR ${db.minOvr}+ · updated ${new Date(db.builtAt).toLocaleDateString()}`
              : dbError ? "database failed to load" : "loading database…"}
        </div>
      </header>

      <nav className="steps" aria-label="Progress">
        {STEPS.map((label, i) => (
          <button
            key={label}
            className={`step ${i === step ? "active" : i < step ? "done" : ""}`}
            disabled={i > step || (i === 2 && squad.length < 11)}
            onClick={() => setStep(i)}
          >
            <b>{i < step ? "✓" : i + 1}</b>
            {label}
          </button>
        ))}
      </nav>

      {dbError && <div className="notice">Couldn't load the player database ({dbError}). Refresh to try again.</div>}

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.main key="upload" {...page}>
            <Upload
              ready={!!nameIndex}
              nameIndex={nameIndex}
              cardCount={db?.players.length}
              onDone={(entries) => { setSquad(entries); setStep(1); }}
              onManual={() => { setSquad([]); setStep(1); }}
            />
          </motion.main>
        )}
        {step === 1 && (
          <motion.main key="review" {...page}>
            <Review db={db} squad={squad} setSquad={setSquad} onNext={() => setStep(2)} onBack={() => setStep(0)} />
          </motion.main>
        )}
        {step === 2 && (
          <motion.main key="results" {...page}>
            <Results squad={squad} onEdit={() => setStep(1)} />
          </motion.main>
        )}
      </AnimatePresence>

      <footer className="foot">
        Player data from <a href="https://renderz.app" target="_blank" rel="noreferrer">RenderZ</a>, created under license from
        Electronic Arts. Not affiliated with or endorsed by EA or RenderZ.
        <br />
        Screenshots are read in your browser and never uploaded.
      </footer>
    </div>
  );
}
