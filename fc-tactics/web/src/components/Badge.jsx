export default function Badge({ ovr, pos }) {
  const tier = ovr >= 124 ? "tier-top" : ovr >= 120 ? "tier-high" : "";
  return (
    <div className={`badge ${tier}`}>
      <span className="ovr">{ovr}</span>
      <span className="pos">{pos}</span>
    </div>
  );
}

// "PROGRAM_HEROS8" -> "Heros 8", "PROGRAM_ICONS" -> "Icons"
export function prettyProgram(source = "") {
  const s = source.replace(/^PROGRAM_/, "").replace(/_/g, " ").toLowerCase();
  return s.replace(/(\D)(\d)/g, "$1 $2").replace(/\b\w/g, (c) => c.toUpperCase());
}
