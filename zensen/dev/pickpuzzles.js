// 掘り出した詰め問題から収録ぶんを選んで puzzles.js を書く:
//   node dev/pickpuzzles.js out1.json out2.json ... > puzzles.js
// 選び方：いまのルールで検証し直す → 似た局面を外す → 初手の種類が偏らないようにする → やさしい順に並べる
const Z = require('../engine.js');
const fs = require('fs');
const WANT = { 1: 24, 2: 24, 3: 18 };
let all = [];
for (const f of process.argv.slice(2)) { const t = fs.readFileSync(f, 'utf8'); if (t.trim()) all = all.concat(JSON.parse(t)); }
const V = new Z.Searcher();
V.exact = true;
function verify(p) {
  const s = Z.unpack(p.s);
  V.clear(); V.abort = false; V.seen = null; V.deadline = 0; V.nodeLimit = 0;
  const res = V.scoreRoot(s, 2 * p.n);
  const wins = res.filter((x) => x.sc >= Z.MATE - 2 * p.n);
  if (wins.length !== 1 || wins[0].m !== p.sol[0] || wins[0].sc !== Z.MATE - 2 * p.n) return false;
  let u = s;
  for (const m of p.sol) { if (Z.legal(u).indexOf(m) < 0) return false; u = Z.settle(Z.apply(u, m)); }
  p.opts = res.length;
  return u.winner === 0 && u.reason === 'mate';
}
const same = (a, b) => { let n = 0; for (let i = 0; i < Z.N; i++) if (a.s.b[i] === b.s.b[i]) n++; return n; };
function id(p) {
  let h = 2166136261;
  for (const v of p.s.b.concat(p.s.hq, p.s.e)) { h ^= v + 1; h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
const rnd = Z.rng(2026);
const out = [];
for (const n of [1, 2, 3]) {
  const pool = Z.shuffle(all.filter((p) => p.n === n), rnd), picked = [], kinds = {};
  for (const p of pool) {
    if (picked.length >= WANT[n]) break;
    const k = p.k0 + (p.cap0 ? 'x' : '');
    if ((kinds[k] || 0) >= Math.ceil(WANT[n] * 0.4)) continue;      // 同じ型の初手ばかりにしない
    if (p.pieces < 6 || p.opts < 12) continue;                      // 駒が少なすぎる・選択肢が少なすぎるものは外す
    if (picked.some((q) => same(p, q) >= 27)) continue;             // 同じ対局の前後の局面を外す
    if (!verify(p)) continue;
    kinds[k] = (kinds[k] || 0) + 1;
    picked.push(p);
    process.stderr.write(`\r${n}: ${picked.length}/${WANT[n]}  `);
  }
  // やさしい順：選べる手が少なく、駒が少ないものから
  picked.sort((a, b) => (a.opts + a.pieces * 2) - (b.opts + b.pieces * 2));
  for (const p of picked) out.push({ id: id(p), n: p.n, s: p.s, sol: p.sol });
}
process.stderr.write('\n');
console.log('/* ZENSEN 前線 — 詰め問題（dev/genpuzzles.js で掘り、dev/pickpuzzles.js で選んだもの）\n * n = 自分が指す手数。s = 局面。sol = 正解手順（相手はいちばん粘る受け）。 */');
console.log('self.ZENSEN_PUZZLES = [');
console.log(out.map((p) => JSON.stringify(p)).join(',\n'));
console.log('];');
