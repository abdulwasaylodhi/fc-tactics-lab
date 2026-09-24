// Hungarian algorithm: seats `rows` (formation slots) with `cols` (players, cols >= rows)
// so the total cost is as small as possible. Exact, O(rows^2 * cols).
// Pass cost = -rating to maximise rating. Returns slotToPlayer[] (column index per row).
export function hungarian(cost) {
  const n = cost.length;
  const m = cost[0].length;
  const INF = Number.MAX_SAFE_INTEGER;
  const u = new Array(n + 1).fill(0);
  const v = new Array(m + 1).fill(0);
  const owner = new Array(m + 1).fill(0);
  const way = new Array(m + 1).fill(0);

  for (let row = 1; row <= n; row++) {
    owner[0] = row;
    let col0 = 0;
    const minv = new Array(m + 1).fill(INF);
    const used = new Array(m + 1).fill(false);
    do {
      used[col0] = true;
      const row0 = owner[col0];
      let delta = INF;
      let col1 = 0;
      for (let col = 1; col <= m; col++) {
        if (used[col]) continue;
        const reduced = cost[row0 - 1][col - 1] - u[row0] - v[col];
        if (reduced < minv[col]) { minv[col] = reduced; way[col] = col0; }
        if (minv[col] < delta) { delta = minv[col]; col1 = col; }
      }
      for (let col = 0; col <= m; col++) {
        if (used[col]) { u[owner[col]] += delta; v[col] -= delta; }
        else minv[col] -= delta;
      }
      col0 = col1;
    } while (owner[col0] !== 0);
    do {
      const col1 = way[col0];
      owner[col0] = owner[col1];
      col0 = col1;
    } while (col0 !== 0);
  }

  const slotToPlayer = new Array(n).fill(-1);
  for (let col = 1; col <= m; col++) if (owner[col] !== 0) slotToPlayer[owner[col] - 1] = col - 1;
  return slotToPlayer;
}
