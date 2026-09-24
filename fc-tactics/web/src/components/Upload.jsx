import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { readScreenshot } from "../ocr.js";
import { chooseCard, detectPlayers } from "../engine/match.js";
import { inferProgress } from "../engine/ratings.js";

let uid = 0;
export const newUid = () => `p${Date.now().toString(36)}${uid++}`;

export default function Upload({ ready, nameIndex, cardCount, onDone, onManual }) {
  const [files, setFiles] = useState([]);          // [{ file, url, progress }]
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const input = useRef(null);

  const addFiles = useCallback((list) => {
    const images = [...list].filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...images.map((file) => ({ file, url: URL.createObjectURL(file), progress: 0 }))]);
  }, []);

  // Paste a screenshot straight from the clipboard (Ctrl+V).
  useEffect(() => {
    const onPaste = (e) => addFiles([...e.clipboardData.items].map((i) => i.getAsFile()).filter(Boolean));
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  async function scan() {
    setBusy(true);
    setError(null);
    try {
      const detections = [];
      for (let i = 0; i < files.length; i++) {
        const passes = await readScreenshot(files[i].file, (p) =>
          setFiles((prev) => prev.map((f, j) => (j === i ? { ...f, progress: p } : f))));
        detections.push(...detectPlayers(passes, nameIndex));
      }
      // The same player in two screenshots counts once (keep the higher OVR reading).
      // Prefer the reading that found both OVR and position, then the higher OVR.
      const quality = (d) => (d.shownOvr != null) * 2 + (d.shownPos != null) + (d.shownOvr ?? 0) / 1000;
      const byName = new Map();
      for (const d of detections) {
        const prev = byName.get(d.name);
        if (!prev || quality(d) > quality(prev)) byName.set(d.name, d);
      }
      const entries = [...byName.values()].map((d) => {
        const { card, upgrade, fits } = chooseCard(d);
        if (!fits && d.shownOvr != null) {
          // No database card can show this OVR (base below the cut-off): rate it from what's on screen.
          return { uid: newUid(), rank: 0, level: 0, shownOvr: d.shownOvr, source: "scan",
                   card: { id: newUid(), custom: true, name: d.name, pos: d.shownPos ?? card.pos, ovr: d.shownOvr, alt: [], stats: null } };
        }
        return { uid: newUid(), card, ...inferProgress(upgrade), shownOvr: d.shownOvr, source: "scan" };
      });
      if (!entries.length) {
        setError("No players recognised. Try a sharper screenshot of the Players or Team Editing screen, or add players by hand.");
        return;
      }
      onDone(entries);
    } catch (e) {
      setError(`Scanning failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="hero">
      <div>
        <h1>
          Your squad.<br />
          <em>The right shape.</em>
        </h1>
        <p className="lead">
          Drop in a screenshot of your best FC Mobile players. We read the cards, pull every stat from a
          database of {cardCount ? cardCount.toLocaleString() : "every"} high-rated cards, and tell you the formation, positions and Manager Mode tactics that fit them.
        </p>
        <ul className="feature-list">
          <li>Judges players on real stats (pace, passing, tackling, stamina), not just OVR</li>
          <li>Accounts for training level, rank up and alternate positions</li>
          <li>Every tactic slider the game offers, with the reason behind it</li>
        </ul>
      </div>

      <motion.div
        className={`dropzone ${over ? "over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1, transition: { delay: 0.15, duration: 0.5 } }}
      >
        <motion.div className="drop-icon" animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 2.4 }}>
          ⇪
        </motion.div>
        <h3>Drop screenshots here</h3>
        <p>or paste with Ctrl+V · PNG / JPG · several at once is fine</p>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />

        <AnimatePresence>
          {files.length > 0 && (
            <motion.div className="thumbs" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {files.map((f, i) => (
                <motion.div className="thumb" key={f.url} layout initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                  <img src={f.url} alt={`Screenshot ${i + 1}`} />
                  {busy && f.progress < 1 && (
                    <motion.div className="scanline" animate={{ top: ["-30%", "100%"] }} transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }} />
                  )}
                  {busy && <div className="progress" style={{ width: `${Math.round(f.progress * 100)}%` }} />}
                  {!busy && (
                    <button aria-label="Remove screenshot" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>✕</button>
                  )}
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="btn ghost" onClick={() => input.current.click()} disabled={busy}>Choose files</button>
          <button className="btn" onClick={scan} disabled={!ready || busy || !files.length}>
            {busy ? "Reading cards…" : !ready ? "Loading database…" : `Scan ${files.length || ""} screenshot${files.length === 1 ? "" : "s"}`}
          </button>
        </div>
        {error && <div className="notice" style={{ marginTop: 14, marginBottom: 0 }}>{error}</div>}
        <div className="tips">
          Best results: the <b>Players</b> list sorted by OVR, or <b>Team Editing</b>. Or{" "}
          <button className="linklike" onClick={onManual} disabled={!ready}>build your squad by hand</button>.
        </div>
      </motion.div>
    </section>
  );
}
