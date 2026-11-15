// 詰め問題を自己対戦の棋譜から掘り出す:  node genpuzzles.js <games> <seed> > out.json
// 条件：手前番で、N 手で必ず詰み、初手がただ 1 つ。
const Z = require('../engine.js');
const G = +process.argv[2] || 200, seed = +process.argv[3] || 1;
const rnd = Z.rng(seed), A = new Z.Searcher(), B = new Z.Searcher(), V = new Z.Searcher();
V.exact = true;
const found = [], keys = new Set();
const lv = [Z.LEVELS[5], Z.LEVELS[3], Z.LEVELS[4], Z.LEVELS[2]];
function norm(s) {
  const t = s.turn === 0 ? Z.clone(s) : Z.flip(s);
  t.d0 = 0; t.d1 = 0; t.ply = 0; t.unk0 = 0; t.unk1 = 0; t.winner = -1; t.reason = '';
  return t;
}
function check(s) {
  const t = norm(s);
  // まず速く：5 手以内の詰みがあるか
  V.clear();
  const r = V.best(t, { depth: 6 });
  if (r.sc < Z.MATE - 200) return;
  const n = (Z.MATE - r.sc) / 2;          // 何手詰か
  if (n !== 1 && n !== 2 && n !== 3) return;
  V.clear(); V.abort = false; V.seen = null; V.deadline = 0; V.nodeLimit = 0;
  const all = V.scoreRoot(t, 2 * n);
  const wins = all.filter((x) => x.sc >= Z.MATE - 2 * n);
  if (wins.length !== 1) return;
  // 解の手順を最後まで進めて、詰みで終わることを確かめる
  let u = t, line = [];
  for (let i = 0; i < 2 * n - 1; i++) {
    V.clear();
    const b = V.best(u, { depth: 2 * n - i + 1 });
    line.push(b.m);
    u = Z.settle(Z.apply(u, b.m));
    if (u.winner >= 0) break;
  }
  if (u.winner !== 0 || u.reason !== 'mate' || line.length !== 2 * n - 1) return;
  const key = Array.from(t.b).join('') + '|' + Array.from(t.hq).join('') + t.e0 + t.e1;
  if (keys.has(key)) return;
  keys.add(key);
  let pieces = 0; for (let c = 0; c < Z.N; c++) if (t.b[c]) pieces++;
  const d0 = Z.describe(t, line[0]);
  found.push({ n: n, s: Z.pack(t), sol: line, opts: all.length, pieces: pieces, k0: d0.kind, cap0: d0.captured ? 1 : 0 });
  process.stderr.write(`\r${found.filter((x) => x.n === 1).length}/${found.filter((x) => x.n === 2).length}/${found.filter((x) => x.n === 3).length}   `);
}
for (let g = 0; g < G; g++) {
  let s = Z.newGame((rnd() * 1e9) | 0);
  const ca = lv[(rnd() * lv.length) | 0], cb = lv[(rnd() * lv.length) | 0], hist = [];
  while (s.winner < 0 && s.ply < 100) {
    hist.push(s);
    const r = Z.think(s.turn === 0 ? A : B, s, s.turn === 0 ? ca : cb, rnd, null);
    if (r.m < 0) break;
    s = Z.settle(Z.apply(s, r.m));
  }
  if (s.reason !== 'mate') continue;
  for (const h of hist.slice(-9)) check(h);
}
console.log(JSON.stringify(found));
