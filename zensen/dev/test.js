// ルールの回帰テスト:  node dev/test.js
const Z = require('../engine.js');
const { KING, HEI, SEI, TATE, YARI, YUMI, KI, TAKA, RYU, RAI, W, H, N } = Z;
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) pass++; else { fail++; console.log('  ✗ ' + name); } }
const at = (x, y) => y * W + x;
// 盤を手で組む。pieces: [種類, 持ち主, x, y]。手札は既定のデッキ順
function pos(pieces, o) {
  o = o || {};
  const s = new Z.State();
  for (const p of pieces) { const c = at(p[2], p[3]); s.b[c] = p[0] | (p[1] << 4); if (p[0] === KING) { if (p[1] === 0) s.k0 = c; else s.k1 = c; } }
  const d = o.deck || Z.DEFAULT_DECK;
  for (let i = 0; i < 8; i++) { s.hq[i] = d[i]; s.hq[8 + i] = d[i]; }
  s.e0 = o.e0 == null ? 0 : o.e0; s.e1 = o.e1 == null ? 0 : o.e1; s.turn = o.turn || 0; s.ply = o.ply || 0;
  s.d0 = o.d0 || 0; s.d1 = o.d1 || 0;
  return s;
}
const has = (s, kind, a, b) => Z.legal(s).indexOf(Z.mk(kind, a, b)) >= 0;
const K0 = [KING, 0, 2, 6], K1 = [KING, 1, 2, 0];

console.log('動き');
{
  let s = pos([K0, K1, [HEI, 0, 0, 3]]);
  ok(has(s, Z.MOVE, at(0, 3), at(0, 2)), '兵は前に 1');
  ok(!has(s, Z.MOVE, at(0, 3), at(1, 3)) && !has(s, Z.MOVE, at(0, 3), at(0, 4)), '兵は横・後ろに動けない');
  s = pos([K0, K1, [HEI, 1, 0, 3]], { turn: 1 });
  ok(has(s, Z.MOVE, at(0, 3), at(0, 4)), '後手の兵は下が前');
  s = pos([K0, K1, [YARI, 0, 4, 5], [HEI, 1, 4, 2]]);
  ok(has(s, Z.MOVE, at(4, 5), at(4, 2)) && !has(s, Z.MOVE, at(4, 5), at(4, 1)), '槍は駒を跳び越えない');
  ok(has(s, Z.MOVE, at(4, 5), at(4, 6)), '槍は後ろに 1');
  s = pos([K0, K1, [KI, 0, 2, 4], [HEI, 0, 2, 3], [HEI, 1, 3, 3]]);
  ok(has(s, Z.MOVE, at(2, 4), at(3, 2)) && has(s, Z.MOVE, at(2, 4), at(0, 3)), '騎は跳び越える');
  s = pos([K0, K1, [TAKA, 0, 0, 5], [HEI, 1, 2, 3]]);
  ok(has(s, Z.MOVE, at(0, 5), at(2, 3)) && !has(s, Z.MOVE, at(0, 5), at(3, 2)), '鷹は斜めに走り、駒で止まる');
  s = pos([K0, K1, [RYU, 0, 0, 4]]);
  ok(has(s, Z.MOVE, at(0, 4), at(0, 0)) && has(s, Z.MOVE, at(0, 4), at(4, 4)) && has(s, Z.MOVE, at(0, 4), at(1, 3)) && !has(s, Z.MOVE, at(0, 4), at(2, 2)), '龍は縦横に走り、斜めは 1');
}

console.log('盾と弓');
{
  let s = pos([K0, K1, [YARI, 0, 1, 5], [TATE, 1, 1, 2]]);
  ok(!has(s, Z.MOVE, at(1, 5), at(1, 2)), '盾は正面から取られない（槍）');
  s = pos([K0, K1, [RYU, 0, 4, 2], [TATE, 1, 1, 2]]);
  ok(has(s, Z.MOVE, at(4, 2), at(1, 2)), '盾は横からは取られる');
  s = pos([K0, K1, [RYU, 0, 1, 0], [TATE, 1, 1, 2]]);
  ok(has(s, Z.MOVE, at(1, 0), at(1, 2)), '盾は背後からは取られる');
  s = pos([K0, K1, [TATE, 1, 1, 2]], { e0: 8, deck: [RAI, HEI, TATE, YARI, YUMI, KI, TAKA, RYU] });
  ok(has(s, Z.SPELL, 0, at(1, 2)), '雷は盾にも効く');
  ok(!has(s, Z.SPELL, 0, at(2, 0)), '雷は王を狙えない');
  s = pos([K0, K1, [YUMI, 0, 2, 4], [HEI, 1, 2, 2], [HEI, 1, 0, 2], [HEI, 1, 2, 3], [TATE, 1, 4, 2]]);
  ok(has(s, Z.SHOOT, at(2, 4), at(2, 2)) && has(s, Z.SHOOT, at(2, 4), at(0, 2)), '弓は 2 マス先を、間の駒を越えて射る');
  ok(has(s, Z.SHOOT, at(2, 4), at(4, 2)), '斜めからなら盾も射抜ける');
  ok(!has(s, Z.MOVE, at(2, 4), at(2, 3)), '弓は動いて取れない');
  const t = Z.apply(s, Z.mk(Z.SHOOT, at(2, 4), at(2, 2)));
  ok(t.b[at(2, 4)] === YUMI && t.b[at(2, 2)] === 0, '射っても弓は動かない');
}

console.log('成り・配置・手札');
{
  let s = pos([K0, K1, [HEI, 0, 4, 2]]);
  let t = Z.apply(s, Z.mk(Z.MOVE, at(4, 2), at(4, 1)));
  ok((t.b[at(4, 1)] & 15) === SEI, '兵は敵陣で成る');
  s = pos([K0, K1, [TATE, 0, 3, 3]], { e0: 8 });
  const zone = new Int8Array(N), n = Z.deployZone(s, 0, zone), zs = Array.from(zone.slice(0, n));
  ok(zs.indexOf(at(3, 2)) >= 0 && zs.indexOf(at(2, 3)) >= 0 && zs.indexOf(at(0, 5)) >= 0, '自陣と味方の隣に置ける');
  ok(zs.indexOf(at(2, 2)) < 0 && zs.indexOf(at(1, 4)) < 0 && zs.indexOf(at(3, 4)) >= 0, '斜めや離れたマスには置けない');
  ok(zs.indexOf(at(1, 5)) >= 0 && n === 9 + 4, '王の隣は自陣ぶんだけ（王は足場にならない）');
  s = pos([K0, K1], { e0: 2 });
  ok(has(s, Z.DEPLOY, 0, at(0, 6)) && has(s, Z.DEPLOY, 1, at(0, 6)) && !has(s, Z.DEPLOY, 3, at(0, 6)), 'コストが足りない札は置けない');
  t = Z.apply(s, Z.mk(Z.DEPLOY, 1, at(0, 6)));
  ok(t.e0 === 0 && t.hq[1] === KI && t.hq[7] === TATE && t.hq[4] === TAKA, '使った札は山の底へ、次の札が同じ枠に入る');
  ok(t.e1 === 1, '相手の手番でエナジー +1');
  s = pos([K0, K1], { e1: 8, turn: 0 });
  ok(Z.apply(s, Z.mk(Z.PASS, 0, 0)).e1 === 8, 'エナジーは上限 8');
  s = pos([K0, K1], { e1: 3, ply: Z.RULES.otPly - 1 });
  ok(Z.apply(s, Z.mk(Z.PASS, 0, 0)).e1 === 5, '決戦は回復 2 倍');
}

console.log('突破・詰み・判定');
{
  let s = pos([K0, K1, [YARI, 0, 4, 3]]);
  let t = Z.apply(s, Z.mk(Z.MOVE, at(4, 3), at(4, 0)));
  ok(t.d0 === 0 && t.b[at(4, 0)], '最奥に入っただけでは突破にならない');
  t = Z.apply(t, Z.mk(Z.PASS, 0, 0));
  ok(t.d0 === 1 && !t.b[at(4, 0)], '相手の 1 手番を生き延びると突破 1 本、駒は盤を抜ける');
  s = pos([K0, K1, [YARI, 0, 3, 3]]);
  t = Z.apply(s, Z.mk(Z.MOVE, at(3, 3), at(3, 0)));
  ok(has(t, Z.MOVE, at(2, 0), at(3, 0)), '王で取り返せる');
  t = Z.apply(t, Z.mk(Z.MOVE, at(2, 0), at(3, 0)));
  ok(t.d0 === 0, '取られたら突破にならない');
  s = pos([K0, K1, [HEI, 0, 0, 0]], { d0: 2, turn: 1 });
  t = Z.apply(s, Z.mk(Z.PASS, 0, 0));
  ok(t.winner === 0 && t.reason === 'breach', '3 本で勝ち');
  // 龍が逃げ道 3 つを押さえ、鷹が斜めから王手。手札に 1 コストの札がなければ合駒もできない
  const noCheap = [TATE, YARI, YUMI, KI, HEI, TAKA, RYU, RAI];
  const matePos = [[KING, 0, 2, 6], [KING, 1, 0, 0], [RYU, 0, 1, 2], [TAKA, 0, 4, 4]];
  s = pos(matePos, { deck: noCheap });
  t = Z.settle(Z.apply(s, Z.mk(Z.MOVE, at(4, 4), at(3, 3))));
  ok(t.winner === 0 && t.reason === 'mate', '逃げ場のない王手は詰み');
  s = pos(matePos, { deck: noCheap, e1: 8 });
  t = Z.settle(Z.apply(s, Z.mk(Z.MOVE, at(4, 4), at(3, 3))));
  ok(t.winner < 0 && has(t, Z.DEPLOY, 0, at(1, 1)), '間に駒を置けるなら詰みではない');
  ok(Z.legal(t).every((m) => Z.kindOf(m) !== Z.PASS), '王手は放置できない');
  s = pos([[KING, 0, 2, 6], [KING, 1, 0, 0], [RYU, 0, 3, 6]]);
  t = Z.apply(s, Z.mk(Z.MOVE, at(3, 6), at(3, 0)));
  ok(!Z.inCheck(t, 1) && has(t, Z.PASS, 0, 0), '最奥に入った駒は王手にならない（突破するだけ）');
  s = pos([K0, K1, [RYU, 1, 2, 3], [TATE, 0, 2, 5]]);
  ok(!has(s, Z.MOVE, at(2, 5), at(1, 5)), '動かすと王が取られる駒は動かせない');
  s = pos([K0, K1, [HEI, 0, 0, 4]], { ply: Z.RULES.maxPly - 1 });
  t = Z.apply(s, Z.mk(Z.PASS, 0, 0));
  ok(t.winner === 0 && t.reason === 'judge', '100 手で判定（盤上の駒）');
  s = pos([K0, K1, [RYU, 0, 0, 4]], { ply: Z.RULES.maxPly - 1, d1: 1 });
  ok(Z.apply(s, Z.mk(Z.PASS, 0, 0)).winner === 1, '判定は突破の数が先');
}

console.log('一貫性');
{
  const rnd = Z.rng(7);
  let bad = 0, games = 0, plies = 0;
  for (let g = 0; g < 60; g++) {
    let s = Z.newGame(g + 1);
    while (s.winner < 0) {
      const ms = Z.legal(s);
      if (!ms.length) { s = Z.settle(s); break; }
      // 反転しても合法手の数は同じ
      if (plies % 7 === 0 && Z.legal(Z.flip(s)).length !== ms.length) bad++;
      if (plies % 11 === 0) { const u = Z.unpack(JSON.parse(JSON.stringify(Z.pack(s)))); if (Z.posKey(u) !== Z.posKey(s)) bad++; }
      s = Z.settle(Z.apply(s, ms[(rnd() * ms.length) | 0]));
      plies++;
      if (s.e0 < 0 || s.e1 < 0 || s.e0 > Z.RULES.cap || s.e1 > Z.RULES.cap) bad++;
      if (s.winner < 0 && ((s.b[s.k0] & 15) !== KING || (s.b[s.k1] & 15) !== KING)) bad++;
      for (let p = 0; p < 2; p++) { const d = Array.from(s.hq.slice(p * 8, p * 8 + 8)).sort((a, b) => a - b).join(); if (d !== Z.DEFAULT_DECK.slice().sort((a, b) => a - b).join()) bad++; }
    }
    games++;
  }
  ok(bad === 0, 'でたらめに 60 局指しても壊れない（' + plies + ' 手）');
  const A = new Z.Searcher();
  let s = Z.newGame(3), illegal = 0;
  for (let i = 0; i < 40 && s.winner < 0; i++) {
    const r = A.best(s, { depth: 3 });
    if (Z.legal(s).indexOf(r.m) < 0) illegal++;
    s = Z.settle(Z.apply(s, r.m));
  }
  ok(illegal === 0, 'AI は合法手しか指さない');
}

console.log('詰め問題');
{
  global.self = global;
  require('../puzzles.js');
  const P = global.ZENSEN_PUZZLES || [];
  const V = new Z.Searcher();
  V.exact = true;
  let bad = 0;
  const ids = new Set();
  for (const p of P) {
    const s = Z.unpack(p.s);
    V.clear(); V.abort = false; V.seen = null; V.deadline = 0; V.nodeLimit = 0;
    const all = V.scoreRoot(s, 2 * p.n);
    const wins = all.filter((x) => x.sc >= Z.MATE - 2 * p.n);
    let u = s;
    for (const m of p.sol) u = Z.settle(Z.apply(u, m));
    if (wins.length !== 1 || wins[0].m !== p.sol[0] || wins[0].sc !== Z.MATE - 2 * p.n || u.winner !== 0 || u.reason !== 'mate' || ids.has(p.id)) { bad++; console.log('   問題 ' + p.id + ' が条件を満たさない'); }
    ids.add(p.id);
  }
  ok(bad === 0, P.length + ' 問すべて、初手が一意で手数ちょうどの詰み');
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
