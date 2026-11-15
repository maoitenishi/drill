// 強さの段差を確かめる:  node ladder.js <games> <lvA> <lvB> [ms上限]
const Z = require('../engine.js');
const G = +process.argv[2] || 40, la = +process.argv[3], lb = +process.argv[4], cap = +process.argv[5] || 0;
const A = new Z.Searcher(), B = new Z.Searcher(), rnd = Z.rng(la * 100 + lb + 7);
const cfg = (l) => { const c = Object.assign({}, Z.LEVELS[l]); if (cap && c.ms) c.ms = Math.min(c.ms, cap); return c; };
let a = 0, b = 0, d = 0, plies = 0, why = {};
for (let g = 0; g < G; g++) {
  let s = Z.newGame((rnd() * 1e9) | 0); const aSide = g % 2, seen = new Map();
  while (s.winner < 0) {
    const r = s.turn === aSide ? Z.think(A, s, cfg(la), rnd, seen) : Z.think(B, s, cfg(lb), rnd, seen);
    if (r.m < 0) { s = Z.settle(s); break; }
    s = Z.settle(Z.apply(s, r.m));
    if (s.winner < 0) { const k = Z.posKey(s), c = (seen.get(k) || 0) + 1; seen.set(k, c); if (c >= 3) { s.winner = 2; s.reason = 'rep'; } }
  }
  plies += s.ply; why[s.reason] = (why[s.reason] || 0) + 1;
  if (s.winner === 2) d++; else if (s.winner === aSide) a++; else b++;
}
console.log(`Lv${la + 1} vs Lv${lb + 1}: ${a}-${b} (draw ${d})  avg plies ${(plies / G).toFixed(0)}`, JSON.stringify(why));
