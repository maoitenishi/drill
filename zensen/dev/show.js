const Z = require('../engine.js');
function show(s) {
  let out = '';
  for (let y = 0; y < Z.H; y++) {
    let r = '';
    for (let x = 0; x < Z.W; x++) { const pc = s.b[y * Z.W + x]; r += pc ? ((pc >> 4) ? '\x1b[31m' : '\x1b[36m') + Z.NAMES[pc & 15].k + '\x1b[0m' : '・'; }
    out += r + '\n';
  }
  const h = (p) => [0, 1, 2, 3].map((i) => Z.NAMES[s.hq[p * 8 + i]].k).join('') + '|' + [4, 5, 6, 7].map((i) => Z.NAMES[s.hq[p * 8 + i]].k).join('');
  return out + `ply ${s.ply} turn ${s.turn} E ${s.e0}/${s.e1} 突破 ${s.d0}/${s.d1}  手札0 ${h(0)}  手札1 ${h(1)}`;
}
function mstr(s, m) {
  const d = Z.describe(s, m), xy = (c) => 'abcde'[c % Z.W] + (((c / Z.W) | 0) + 1);
  if (d.kind === Z.PASS) return '溜め';
  if (d.kind === Z.MOVE) return Z.NAMES[d.piece].k + xy(d.from) + (d.captured ? 'x' + Z.NAMES[d.captured].k : '-') + xy(d.to);
  if (d.kind === Z.SHOOT) return '弓' + xy(d.from) + '射' + Z.NAMES[d.captured].k + xy(d.to);
  if (d.kind === Z.DEPLOY) return '配' + Z.NAMES[d.card].k + xy(d.to);
  return '雷→' + Z.NAMES[d.captured].k + xy(d.to);
}
module.exports = { show, mstr };
if (require.main === module) {
  const d = +process.argv[2] || 3, seed = +process.argv[3] || 7, every = +process.argv[4] || 20;
  const A = new Z.Searcher(); let s = Z.newGame(seed); const rnd = Z.rng(seed); let line = [];
  while (s.winner < 0) {
    const r = A.best(Z.blind(s, rnd), { depth: d });
    if (r.m < 0) { s = Z.settle(s); break; }
    line.push(mstr(s, r.m));
    s = Z.settle(Z.apply(s, r.m));
    if (s.ply % every === 0 || s.winner >= 0) { console.log(line.join(' ')); line = []; console.log(show(s)); }
  }
  console.log('winner', s.winner, s.reason);
}
