// Every Manager Mode formation, with the tags the game shows on the formation screen.
export const FORMATIONS = [
  ["4-3-3 Attack", "Attacking/Recommended", "GK LB CB CB RB CM CAM CM LW ST RW"],
  ["4-4-2 Flat", "Defensive/Recommended", "GK LB CB CB RB LM CM CM RM ST ST"],
  ["3-4-3 Flat", "Three Defenders/Recommended", "GK CB CB CB LM CM CM RM LW ST RW"],
  ["4-2-3-1 Narrow", "Defensive/Center", "GK LB CB CB RB CDM CDM CAM CAM CAM ST"],
  ["4-1-4-1", "Defensive", "GK LB CB CB RB CDM LM CM CM RM ST"],
  ["5-2-2-1", "Balanced/Five Defenders", "GK LWB CB CB CB RWB CM CM LW ST RW"],
  ["4-1-2-1-2 Narrow", "Defensive/Center", "GK LB CB CB RB CDM CM CM CAM ST ST"],
  ["4-5-1", "Defensive", "GK LB CB CB RB LM CAM CM CAM RM ST"],
  ["4-2-2-2", "Defensive", "GK LB CB CB RB CDM CDM CAM CAM ST ST"],
  ["4-3-3", "Defensive", "GK LB CB CB RB CM CM CM LW ST RW"],
  ["5-4-1 Holding", "Balanced/Five Defenders", "GK LWB CB CB CB RWB LM CDM CAM RM ST"],
  ["5-2-1-2", "Five Defenders", "GK LWB CB CB CB RWB CM CM CAM ST ST"],
  ["4-5-1 Flat", "Defensive", "GK LB CB CB RB LM CM CM CM RM ST"],
  ["3-5-1-1", "Defensive/Second Striker", "GK CB CB CB LM CDM CM CDM RM CF ST"],
  ["4-1-2-1-2 Wide", "Side", "GK LB CB CB RB CDM LM RM CAM ST ST"],
  ["4-3-3 Holding", "Defensive/Control", "GK LB CB CB RB CM CDM CM LW ST RW"],
  ["3-5-2", "Attacking", "GK CB CB CB CDM CDM LM CAM RM ST ST"],
  ["4-3-3 Defend", "Center", "GK LB CB CB RB CDM CM CDM LW ST RW"],
  ["5-3-2", "Five Defenders", "GK LWB CB CB CB RWB CM CM CM ST ST"],
  ["4-2-3-1 Wide", "Side", "GK LB CB CB RB CDM CDM LM CAM RM ST"],
  ["4-4-2 Holding", "Defensive/Control", "GK LB CB CB RB LM CDM CDM RM ST ST"],
  ["4-3-1-2", "Defensive", "GK LB CB CB RB CM CM CM CAM ST ST"],
  ["4-4-1-1 Flat", "Defensive/Second Striker", "GK LB CB CB RB LM CM CM RM CF ST"],
  ["3-4-1-2", "Three Defenders", "GK CB CB CB LM CM CM RM CAM ST ST"],
  ["3-4-3 Diamond", "Three Defenders/Diamond", "GK CB CB CB CDM LM RM CAM LW ST RW"],
  ["4-3-3 False 9", "No Striker/Second Striker", "GK LB CB CB RB CM CDM CM LW CF RW"],
  ["4-2-4", "Full Attack/Four Strikers", "GK LB CB CB RB CM CM LW ST ST RW"],
  ["4-2-1-3", "Side", "GK LB CB CB RB CDM CDM CAM LW ST RW"],
  ["4-1-3-2", "Defensive", "GK LB CB CB RB CDM LM CM RM ST ST"],
  ["4-3-2-1", "Balanced/Recommended", "GK LB CB CB RB CM CM CM CAM CAM ST"],
  ["4-4-1-1 Attack", "Defensive/Center", "GK LB CB CB RB LM CM CM RM CAM ST"],
  ["3-1-4-2", "Defensive/Three Defenders", "GK CB CB CB CDM LM CM CM RM ST ST"],
  ["3-4-2-1", "Recommended/Three Defenders", "GK CB CB CB LM CM CM RM CAM CAM ST"],
  ["5-4-1 Defend", "Balanced/Five Defenders", "GK LB CB CB CB RB LM CM CM RM ST"],
].map(([name, tags, slots]) => ({ name, tags: tags.split("/"), slots: slots.split(" ") }));

// Where each position sits: x across (0 = left touchline, 1 = right), y up the pitch (0 = own goal).
export const PITCH = {
  GK: [0.5, 0.04],
  LB: [0.1, 0.24], CB: [0.5, 0.2], RB: [0.9, 0.24],
  LWB: [0.08, 0.36], RWB: [0.92, 0.36],
  CDM: [0.5, 0.38],
  LM: [0.1, 0.56], CM: [0.5, 0.52], RM: [0.9, 0.56],
  CAM: [0.5, 0.67],
  LW: [0.14, 0.8], CF: [0.5, 0.8], RW: [0.86, 0.8],
  ST: [0.5, 0.88],
};

// Screen coordinates for each slot of a formation: players sharing a position
// (two CBs, three CMs...) are spread out sideways around that position's spot.
export function layout(formation) {
  const groups = {};
  formation.slots.forEach((pos, i) => (groups[pos] ??= []).push(i));
  const coords = new Array(formation.slots.length);
  for (const [pos, idxs] of Object.entries(groups)) {
    const [x, y] = PITCH[pos];
    const n = idxs.length;
    const gap = pos === "CB" ? 0.22 : pos === "ST" ? 0.24 : 0.26;
    idxs.forEach((slot, k) => {
      const offset = (k - (n - 1) / 2) * gap;
      // three in a line: bow the middle one back slightly, like the game draws it
      const bow = n === 3 && k === 1 && pos !== "CB" ? -0.03 : 0;
      coords[slot] = [x + offset, y + bow];
    });
  }
  return coords;
}
