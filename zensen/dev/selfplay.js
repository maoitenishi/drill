// 自己対戦でルールの具合を見る:  node selfplay.js <games> <depthA> <depthB> [key=val ...]
const Z = require('../engine.js');
const args = process.argv.slice(2);
const G = +args[0] || 20, dA = +args[1] || 3, dB = +args[2] || 3;
const opts = {};
for (const a of args.slice(3)) { const [k, v] = a.split('='); opts[k] = v; }
if (opts.cap) Z.RULES.cap = +opts.cap;
if (opts.ot) Z.RULES.otPly = +opts.ot;
if (opts.max) Z.RULES.maxPly = +opts.max;
if (opts.goal) Z.RULES.goal = +opts.goal;
if (opts.rai) Z.COST[Z.RAI] = +opts.rai;
if (opts.sE) Z.RULES.startE = opts.sE.split(',').map(Number);
const noise = +(opts.noise || 12);
const A = new Z.Searcher(), B = new Z.Searcher();
if (opts.wB) Object.assign(B.w = Object.assign({}, Z.DEFAULT_W), JSON.parse(opts.wB));
const deckB = opts.deckB ? opts.deckB.split(',').map(Number) : null;
const rnd = Z.rng(+(opts.seed || 1));
let res = { A: 0, B: 0, D: 0, first: 0, second: 0, mate: 0, judge: 0, breach: 0 }, brs = 0, plies = [], t0 = Date.now(), nodes = 0;
const use = {}, capt = {}, kinds = [0, 0, 0, 0, 0];
for (let g = 0; g < G; g++) {
  let s = Z.newGame((rnd() * 1e9) | 0, deckB ? { [g % 2 === 0 ? 'deck1' : 'deck0']: deckB } : {});
  const aSide = g % 2; // A が先手か後手か
  const seen = new Map();
  while (s.winner < 0) {
    const eng = s.turn === aSide ? A : B, d = s.turn === aSide ? dA : dB;
    const view = Z.blind(s, rnd);
    let r;
    if (noise > 0 && s.ply < 8) {
      // 序盤だけ少し散らして、同じ対局にならないようにする
      const sc = eng.scoreRoot(view, Math.min(d, 2));
      const ok = sc.filter((x) => x.sc >= sc[0].sc - noise * 3);
      r = ok[(rnd() * ok.length) | 0];
      eng.abort = false;
    } else r = eng.best(view, { depth: d, seen: seen });
    nodes += eng.nodes;
    if (r.m < 0) { s = Z.settle(s); break; }
    const ds = Z.describe(s, r.m);
    kinds[ds.kind]++;
    if (ds.card) use[ds.card] = (use[ds.card] || 0) + 1;
    if (ds.captured) capt[ds.captured] = (capt[ds.captured] || 0) + 1;
    s = Z.settle(Z.apply(s, r.m));
    if (s.winner < 0) { const k = Z.posKey(s), c = (seen.get(k) || 0) + 1; seen.set(k, c); if (c >= 3) { s.winner = 2; s.reason = 'rep'; } }
  }
  plies.push(s.ply); brs += s.d0 + s.d1;
  if (s.winner === 2) res.D++; else { if (s.winner === aSide) res.A++; else res.B++; if (s.winner === 0) res.first++; else res.second++; }
  res[s.reason] = (res[s.reason] || 0) + 1;
}
plies.sort((a, b) => a - b);
const nm = (o) => Object.keys(o).map((k) => Z.NAMES[k].k + ':' + o[k]).join(' ');
console.log(`d${dA} vs d${dB}  A:${res.A} B:${res.B} draw:${res.D} | 先手:${res.first} 後手:${res.second} | mate:${res.mate} breach:${res.breach} judge:${res.judge} rep:${res.rep || 0} 突破/局:${(brs / G).toFixed(1)}`);
console.log(`plies med:${plies[plies.length >> 1]} min:${plies[0]} max:${plies[plies.length - 1]} | ${((Date.now() - t0) / 1000).toFixed(1)}s ${(nodes / 1e6).toFixed(2)}M nodes ${(nodes / (Date.now() - t0)).toFixed(0)}k nps`);
console.log('use ', nm(use)); console.log('capt', nm(capt)); console.log('kinds pass/move/shoot/deploy/spell', kinds.join(' '));
