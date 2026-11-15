/* ZENSEN 前線 — ルールと思考エンジン
 *
 * 画面・Worker・Node（自己対戦や詰め問題の生成）から同じものを使う。
 * 盤は 5×7。手前が先手（0）、奥が後手（1）。
 * 1 手番にできるのは「配置・移動・射撃・術・溜め」のどれか 1 つ。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Zensen = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const W = 5, H = 7, N = W * H;
  const HOME_ROWS = 2;

  // 駒の種類
  const KING = 1, HEI = 2, SEI = 3, TATE = 4, YARI = 5, YUMI = 6, KI = 7, TAKA = 8, RYU = 9;
  // 術（盤に残らない札）
  const RAI = 20;

  const RULES = {
    cap: 8,          // エナジー上限
    income: 1,       // 手番ごとの回復
    otPly: 60,       // ここから決戦（回復 2 倍）
    maxPly: 100,     // ここで判定
    startE: [1, 2],  // 開始時（最初の手番の回復で、先手は 2、後手は 3 になる）
    goal: 3,         // 突破がこの数に届いたら勝ち
  };

  const COST = {};
  COST[HEI] = 1; COST[TATE] = 2; COST[YARI] = 2; COST[YUMI] = 3;
  COST[KI] = 3; COST[TAKA] = 3; COST[RYU] = 5; COST[RAI] = 4;
  COST[SEI] = 1; COST[KING] = 0;

  const DEFAULT_DECK = [HEI, TATE, YARI, YUMI, KI, TAKA, RYU, RAI];

  const NAMES = {};
  NAMES[KING] = { k: '王', n: '王将' };
  NAMES[HEI] = { k: '兵', n: '歩兵' };
  NAMES[SEI] = { k: '精', n: '精兵' };
  NAMES[TATE] = { k: '盾', n: '盾兵' };
  NAMES[YARI] = { k: '槍', n: '槍兵' };
  NAMES[YUMI] = { k: '弓', n: '弓兵' };
  NAMES[KI] = { k: '騎', n: '騎兵' };
  NAMES[TAKA] = { k: '鷹', n: '大鷹' };
  NAMES[RYU] = { k: '龍', n: '飛龍' };
  NAMES[RAI] = { k: '雷', n: '雷撃' };

  // 動き（前 = dy -1 として書く。後手は上下を反転して使う）
  const ORTH = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const DIAG = [[1, -1], [1, 1], [-1, 1], [-1, -1]];
  const KNIGHT = [[1, -2], [2, -1], [2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2]];
  const MOVES = {};
  MOVES[KING] = { steps: ORTH.concat(DIAG) };
  MOVES[HEI] = { steps: [[0, -1]] };
  MOVES[SEI] = { steps: [[0, -1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1]] };
  MOVES[TATE] = { steps: ORTH };
  MOVES[YARI] = { slides: [[0, -1]], steps: [[0, 1]] };
  MOVES[YUMI] = { steps: ORTH, shots: [[0, -2], [2, -2], [-2, -2]] };
  MOVES[KI] = { steps: KNIGHT };
  MOVES[TAKA] = { slides: DIAG };
  MOVES[RYU] = { slides: ORTH, steps: DIAG };

  // 事前計算： [p][type][cell] → 行き先
  const STEPS = [], RAYS = [], SHOTS = [];
  for (let p = 0; p < 2; p++) {
    const f = p === 0 ? 1 : -1;
    STEPS[p] = []; RAYS[p] = []; SHOTS[p] = [];
    for (let t = 0; t < 16; t++) {
      STEPS[p][t] = []; RAYS[p][t] = []; SHOTS[p][t] = [];
      const m = MOVES[t];
      for (let c = 0; c < N; c++) {
        const x = c % W, y = (c / W) | 0;
        const st = [], ry = [], sh = [];
        if (m) {
          for (const d of (m.steps || [])) {
            const nx = x + d[0], ny = y + d[1] * f;
            if (nx >= 0 && nx < W && ny >= 0 && ny < H) st.push(ny * W + nx);
          }
          for (const d of (m.slides || [])) {
            const r = [];
            let nx = x + d[0], ny = y + d[1] * f;
            while (nx >= 0 && nx < W && ny >= 0 && ny < H) { r.push(ny * W + nx); nx += d[0]; ny += d[1] * f; }
            if (r.length) ry.push(r);
          }
          for (const d of (m.shots || [])) {
            const nx = x + d[0], ny = y + d[1] * f;
            if (nx >= 0 && nx < W && ny >= 0 && ny < H) sh.push(ny * W + nx);
          }
        }
        STEPS[p][t][c] = st; RAYS[p][t][c] = ry; SHOTS[p][t][c] = sh;
      }
    }
  }
  const HOME = [[], []];
  for (let c = 0; c < N; c++) {
    const y = (c / W) | 0;
    if (y >= H - HOME_ROWS) HOME[0].push(c);
    if (y < HOME_ROWS) HOME[1].push(c);
  }
  const IN_ENEMY_HOME = [new Uint8Array(N), new Uint8Array(N)];
  for (const c of HOME[1]) IN_ENEMY_HOME[0][c] = 1;
  for (const c of HOME[0]) IN_ENEMY_HOME[1][c] = 1;

  // 手の符号化
  const PASS = 0, MOVE = 1, SHOOT = 2, DEPLOY = 3, SPELL = 4;
  const mk = (kind, a, b) => (kind << 12) | (a << 6) | b;
  const kindOf = (m) => m >> 12;
  const aOf = (m) => (m >> 6) & 63;
  const bOf = (m) => m & 63;

  // ---- 乱数（種つき） ----
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---- 局面 ----
  // b: 盤（0 = 空、種類 | 持ち主<<4）
  // hq: 手札と山。 [p*8 + 0..3] = 手札、[p*8 + 4..7] = 山（4 が次に来る札）
  function State() {
    this.b = new Int8Array(N);
    this.hq = new Int8Array(16);
    this.e0 = 0; this.e1 = 0;
    this.turn = 0; this.ply = 0;
    this.k0 = -1; this.k1 = -1;
    this.d0 = 0; this.d1 = 0; // 突破した数
    this.winner = -1;      // -1 進行中 / 0,1 勝者 / 2 引き分け
    this.unk0 = 3; this.unk1 = 3; // 山のうち、まだ順番が明かされていない枚数（表示と AI の公平さ用）
    this.reason = '';      // 'mate' | 'judge' | 'resign'
  }
  function clone(s) {
    const t = new State();
    t.b = s.b.slice(); t.hq = s.hq.slice();
    t.e0 = s.e0; t.e1 = s.e1; t.turn = s.turn; t.ply = s.ply;
    t.k0 = s.k0; t.k1 = s.k1; t.d0 = s.d0; t.d1 = s.d1; t.winner = s.winner;
    t.unk0 = s.unk0; t.unk1 = s.unk1; t.reason = s.reason;
    return t;
  }
  function newGame(seed, opts) {
    opts = opts || {};
    const rnd = rng(seed == null ? (Math.random() * 2 ** 31) | 0 : seed);
    const s = new State();
    const d0 = shuffle(opts.deck0 || DEFAULT_DECK, rnd);
    const d1 = shuffle(opts.deck1 || DEFAULT_DECK, rnd);
    for (let i = 0; i < 8; i++) { s.hq[i] = d0[i]; s.hq[8 + i] = d1[i]; }
    s.k0 = (H - 1) * W + 2; s.k1 = 2;
    s.b[s.k0] = KING; s.b[s.k1] = KING | 16;
    s.e0 = RULES.startE[0] + RULES.income; s.e1 = RULES.startE[1];
    return s;
  }

  const energy = (s, p) => (p === 0 ? s.e0 : s.e1);
  const isOT = (s) => s.ply >= RULES.otPly;

  // 盾は、同じ列の正面からは取られない
  function canCapture(from, to, target) {
    if ((target & 15) !== TATE) return true;
    if (from % W !== to % W) return true;
    return (target >> 4) === 0 ? from > to : from < to;
  }

  // 配置できるマス：自陣の空きマスと、味方の駒（王を除く）に隣り合う空きマス
  const _zone = new Int8Array(N), _mark = new Uint8Array(N);
  const NEAR4 = [], NEAR8 = [];
  for (let c = 0; c < N; c++) {
    const x = c % W, y = (c / W) | 0, a4 = [], a8 = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      a8.push(ny * W + nx); if (!dx || !dy) a4.push(ny * W + nx);
    }
    NEAR4[c] = a4; NEAR8[c] = a8;
  }
  function deployZone(s, p, out) {
    const b = s.b, home = HOME[p];
    let n = 0;
    _mark.fill(0);
    for (let k = 0; k < home.length; k++) { const c = home[k]; if (!b[c]) { _mark[c] = 1; out[n++] = c; } }
    for (let c = 0; c < N; c++) {
      const pc = b[c];
      if (!pc || (pc >> 4) !== p || (pc & 15) === KING) continue;
      const nb = NEAR4[c];
      for (let i = 0; i < nb.length; i++) { const d = nb[i]; if (!b[d] && !_mark[d]) { _mark[d] = 1; out[n++] = d; } }
    }
    return n;
  }

  // 疑似合法手（自玉が取られる手も含む）
  function gen(s, out) {
    const me = s.turn, b = s.b;
    let n = 0;
    for (let c = 0; c < N; c++) {
      const pc = b[c];
      if (!pc || (pc >> 4) !== me) continue;
      const t = pc & 15;
      const st = STEPS[me][t][c];
      for (let i = 0; i < st.length; i++) {
        const d = st[i], tc = b[d];
        if (!tc) out[n++] = mk(MOVE, c, d);
        else if ((tc >> 4) !== me && t !== YUMI && canCapture(c, d, tc)) out[n++] = mk(MOVE, c, d);
      }
      const ry = RAYS[me][t][c];
      for (let i = 0; i < ry.length; i++) {
        const r = ry[i];
        for (let j = 0; j < r.length; j++) {
          const d = r[j], tc = b[d];
          if (!tc) { out[n++] = mk(MOVE, c, d); continue; }
          if ((tc >> 4) !== me && canCapture(c, d, tc)) out[n++] = mk(MOVE, c, d);
          break;
        }
      }
      if (t === YUMI) {
        const sh = SHOTS[me][t][c];
        for (let i = 0; i < sh.length; i++) {
          const d = sh[i], tc = b[d];
          if (tc && (tc >> 4) !== me && canCapture(c, d, tc)) out[n++] = mk(SHOOT, c, d);
        }
      }
    }
    const e = me === 0 ? s.e0 : s.e1, base = me * 8;
    let zoneReady = false, zoneN = 0;
    for (let i = 0; i < 4; i++) {
      const card = s.hq[base + i];
      if (!card || COST[card] > e) continue;
      let dup = false;
      for (let j = 0; j < i; j++) if (s.hq[base + j] === card) dup = true;
      if (dup) continue;
      if (card === RAI) {
        for (let c = 0; c < N; c++) {
          const tc = b[c];
          if (tc && (tc >> 4) !== me && (tc & 15) !== KING) out[n++] = mk(SPELL, i, c);
        }
      } else {
        if (!zoneReady) { zoneN = deployZone(s, me, _zone); zoneReady = true; }
        for (let k = 0; k < zoneN; k++) out[n++] = mk(DEPLOY, i, _zone[k]);
      }
    }
    out[n++] = mk(PASS, 0, 0);
    return n;
  }

  // 相手の最奥の段に入った駒は、もう動かない。次の自分の番の頭に盤を抜けて 1 本になる
  const GOAL_LO = [0, (H - 1) * W], GOAL_HI = [W, N];
  const inert = (pc, c) => (pc & 15) !== KING && c >= GOAL_LO[pc >> 4] && c < GOAL_HI[pc >> 4];

  // by 側の駒が cell にいる駒を取れるか
  function attacked(s, cell, by) {
    const b = s.b, target = b[cell];
    for (let c = 0; c < N; c++) {
      const pc = b[c];
      if (!pc || (pc >> 4) !== by || inert(pc, c)) continue;
      const t = pc & 15;
      if (target && !canCapture(c, cell, target)) continue;
      if (t !== YUMI) {
        const st = STEPS[by][t][c];
        for (let i = 0; i < st.length; i++) if (st[i] === cell) return true;
      } else {
        const sh = SHOTS[by][t][c];
        for (let i = 0; i < sh.length; i++) if (sh[i] === cell) return true;
      }
      const ry = RAYS[by][t][c];
      for (let i = 0; i < ry.length; i++) {
        const r = ry[i];
        for (let j = 0; j < r.length; j++) {
          if (r[j] === cell) return true;
          if (b[r[j]]) break;
        }
      }
    }
    return false;
  }
  const inCheck = (s, p) => attacked(s, p === 0 ? s.k0 : s.k1, 1 - p);

  function materialOf(s, p) {
    let m = 0;
    for (let c = 0; c < N; c++) { const pc = s.b[c]; if (pc && (pc >> 4) === p) m += COST[pc & 15]; }
    return m;
  }

  // 手を進める（s は壊さない）
  function apply(s, m) {
    const t = clone(s);
    const me = s.turn, opp = 1 - me, b = t.b, kind = m >> 12, a = (m >> 6) & 63, d = m & 63;
    if (kind === MOVE) {
      const pc = b[a], cap = b[d];
      let np = pc;
      if ((pc & 15) === HEI && IN_ENEMY_HOME[me][d]) np = SEI | (me << 4);
      b[d] = np; b[a] = 0;
      if ((pc & 15) === KING) { if (me === 0) t.k0 = d; else t.k1 = d; }
      if (cap && (cap & 15) === KING) { t.winner = me; t.reason = 'mate'; }
    } else if (kind === SHOOT) {
      const cap = b[d];
      b[d] = 0;
      if ((cap & 15) === KING) { t.winner = me; t.reason = 'mate'; }
    } else if (kind === DEPLOY || kind === SPELL) {
      const base = me * 8, card = t.hq[base + a];
      if (me === 0) t.e0 -= COST[card]; else t.e1 -= COST[card];
      if (kind === DEPLOY) b[d] = card | (me << 4); else b[d] = 0;
      // 使った札は山の底へ。空いた枠に次の札が入る
      t.hq[base + a] = t.hq[base + 4];
      t.hq[base + 4] = t.hq[base + 5]; t.hq[base + 5] = t.hq[base + 6]; t.hq[base + 6] = t.hq[base + 7];
      t.hq[base + 7] = card;
      if (me === 0) { if (t.unk0 > 0) t.unk0--; } else if (t.unk1 > 0) t.unk1--;
    }
    t.turn = opp; t.ply = s.ply + 1;
    if (t.winner < 0) {
      // 突破：相手の最奥の段で 1 手番を生き延びた駒は、盤を抜けて 1 本になる
      const row = opp === 0 ? 0 : (H - 1) * W;
      for (let c = row; c < row + W; c++) {
        const pc = b[c];
        if (pc && (pc >> 4) === opp && (pc & 15) !== KING) {
          b[c] = 0;
          if (opp === 0) t.d0++; else t.d1++;
        }
      }
      if ((opp === 0 ? t.d0 : t.d1) >= RULES.goal) { t.winner = opp; t.reason = 'breach'; }
    }
    if (t.winner < 0) {
      if (t.ply >= RULES.maxPly) {
        const m0 = materialOf(t, 0), m1 = materialOf(t, 1);
        t.winner = t.d0 !== t.d1 ? (t.d0 > t.d1 ? 0 : 1) : m0 > m1 ? 0 : m1 > m0 ? 1 : 2; t.reason = 'judge';
      } else {
        const inc = t.ply >= RULES.otPly ? RULES.income * 2 : RULES.income;
        if (opp === 0) t.e0 = Math.min(RULES.cap, t.e0 + inc); else t.e1 = Math.min(RULES.cap, t.e1 + inc);
      }
    }
    return t;
  }

  const _buf = new Int32Array(320);
  // 合法手（自玉を取られる手を除く）
  function legal(s) {
    if (s.winner >= 0) return [];
    const n = gen(s, _buf), me = s.turn, res = [];
    const list = Array.prototype.slice.call(_buf, 0, n);
    for (const m of list) {
      const t = apply(s, m);
      if (t.winner === me || !attacked(t, me === 0 ? t.k0 : t.k1, 1 - me)) res.push(m);
    }
    return res;
  }
  // 詰み（合法手なし）なら勝敗を確定させた局面を返す
  function settle(s) {
    if (s.winner >= 0) return s;
    if (legal(s).length === 0) { const t = clone(s); t.winner = 1 - s.turn; t.reason = 'mate'; return t; }
    return s;
  }

  // ---- 評価 ----
  const VAL = new Int32Array(16);
  VAL[HEI] = 100; VAL[SEI] = 260; VAL[TATE] = 210; VAL[YARI] = 210; VAL[YUMI] = 310;
  VAL[KI] = 330; VAL[TAKA] = 300; VAL[RYU] = 560;
  const DEFAULT_W = { energy: 62, adv: 5, prox: 7, kingAdv: 16, guard: 10, hei: 4, capWaste: 30, breach: [0, 420, 900, 0] };

  function cheb(a, c) {
    const dx = Math.abs(a % W - c % W), dy = Math.abs(((a / W) | 0) - ((c / W) | 0));
    return dx > dy ? dx : dy;
  }
  const CHEB = [];
  for (let a = 0; a < N; a++) { CHEB[a] = new Int8Array(N); for (let c = 0; c < N; c++) CHEB[a][c] = cheb(a, c); }

  function evaluate(s, w) {
    const b = s.b;
    let sc = 0;
    for (let c = 0; c < N; c++) {
      const pc = b[c];
      if (!pc) continue;
      const p = pc >> 4, t = pc & 15, y = (c / W) | 0;
      const adv = p === 0 ? H - 1 - y : y;
      let v;
      if (t === KING) {
        v = -w.kingAdv * adv;
      } else {
        const ek = p === 0 ? s.k1 : s.k0, ok = p === 0 ? s.k0 : s.k1;
        v = VAL[t] + w.adv * adv + w.prox * (6 - CHEB[c][ek]);
        if (t === HEI) v += w.hei * adv;
        if (CHEB[c][ok] === 1) v += w.guard;
      }
      sc += p === 0 ? v : -v;
    }
    sc += w.energy * (s.e0 - s.e1);
    sc += w.breach[s.d0] - w.breach[s.d1];
    // 上限に張り付いたエナジーは、回復を捨てている
    if (s.e0 >= RULES.cap) sc -= w.capWaste;
    if (s.e1 >= RULES.cap) sc += w.capWaste;
    return s.turn === 0 ? sc : -sc;
  }

  // ---- 探索 ----
  const MATE = 100000;
  const TT_BITS = 18, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  const zr = rng(20261115);
  const z32 = () => (zr() * 4294967296) | 0;
  const Z_B = [], Z_B2 = [], Z_HQ = [], Z_HQ2 = [], Z_E = [], Z_E2 = [];
  for (let c = 0; c < N; c++) {
    Z_B[c] = new Int32Array(32); Z_B2[c] = new Int32Array(32);
    for (let i = 0; i < 32; i++) { Z_B[c][i] = z32(); Z_B2[c][i] = z32(); }
  }
  for (let i = 0; i < 16; i++) {
    Z_HQ[i] = new Int32Array(32); Z_HQ2[i] = new Int32Array(32);
    for (let j = 0; j < 32; j++) { Z_HQ[i][j] = z32(); Z_HQ2[i][j] = z32(); }
  }
  for (let i = 0; i < 64; i++) { Z_E[i] = z32(); Z_E2[i] = z32(); }
  const Z_TURN = z32(), Z_TURN2 = z32(), Z_OT = z32(), Z_OT2 = z32();

  function Searcher() {
    this.ttKey = new Int32Array(TT_SIZE);
    this.ttMove = new Int32Array(TT_SIZE);
    this.ttScore = new Int32Array(TT_SIZE);
    this.ttMeta = new Int16Array(TT_SIZE); // depth<<2 | flag(1 exact, 2 lower, 3 upper)
    this.history = new Int32Array(1 << 15);
    this.killers = new Int32Array(64 * 2);
    this.nodes = 0; this.deadline = 0; this.abort = false; this.nodeLimit = 0;
    this.w = DEFAULT_W;
    this.bufs = [];
    for (let i = 0; i < 64; i++) this.bufs.push({ m: new Int32Array(320), s: new Int32Array(320) });
    this.seen = null;
    this.exact = false; // true で枝の省略をやめる（詰みの検証用）
  }
  Searcher.prototype.clear = function () {
    this.ttKey.fill(0); this.ttMove.fill(0); this.ttScore.fill(0); this.ttMeta.fill(0);
    this.history.fill(0); this.killers.fill(0);
  };
  let _h1 = 0, _h2 = 0;
  function hashState(s) {
    let h1 = 0, h2 = 0;
    const b = s.b, hq = s.hq;
    for (let c = 0; c < N; c++) { const pc = b[c]; if (pc) { h1 ^= Z_B[c][pc]; h2 ^= Z_B2[c][pc]; } }
    for (let i = 0; i < 16; i++) { h1 ^= Z_HQ[i][hq[i]]; h2 ^= Z_HQ2[i][hq[i]]; }
    h1 ^= Z_E[s.e0] ^ Z_E[16 + s.e1]; h2 ^= Z_E2[s.e0] ^ Z_E2[16 + s.e1];
    if (s.turn) { h1 ^= Z_TURN; h2 ^= Z_TURN2; }
    if (s.ply >= RULES.otPly) { h1 ^= Z_OT; h2 ^= Z_OT2; }
    h1 ^= Z_E[32 + s.d0] ^ Z_E[40 + s.d1]; h2 ^= Z_E2[32 + s.d0] ^ Z_E2[40 + s.d1];
    _h1 = h1; _h2 = h2 || 1;
  }
  // 千日手の判定に使う、局面の鍵
  function posKey(s) { hashState(s); return (_h1 >>> 0) * 2097152 + ((_h2 >>> 0) & 2097151); }

  // 並べ替え用の点数
  Searcher.prototype.scoreMoves = function (s, buf, n, ttm, ply) {
    const b = s.b, ms = buf.m, sc = buf.s, me = s.turn, base = me * 8;
    const k1 = this.killers[ply * 2], k2 = this.killers[ply * 2 + 1];
    for (let i = 0; i < n; i++) {
      const m = ms[i], kind = m >> 12, a = (m >> 6) & 63, d = m & 63;
      let v = 0;
      if (m === ttm) v = 1 << 30;
      else if (kind === MOVE) {
        const cap = b[d];
        if (cap) v = (cap & 15) === KING ? 1 << 29 : 1000000 + VAL[cap & 15] * 16 - VAL[b[a] & 15];
        else if (m === k1) v = 900000; else if (m === k2) v = 890000;
        else v = this.history[m & 32767];
      } else if (kind === SHOOT) {
        const cap = b[d];
        v = (cap & 15) === KING ? 1 << 29 : 1000000 + VAL[cap & 15] * 16;
      } else if (kind === SPELL) {
        v = 600000 + VAL[b[d] & 15] * 16;
      } else if (kind === DEPLOY) {
        if (m === k1) v = 900000; else if (m === k2) v = 890000;
        else v = this.history[m & 32767] + COST[s.hq[base + a]];
      } else v = -1;
      sc[i] = v;
    }
  };
  function pick(buf, i, n) {
    const ms = buf.m, sc = buf.s;
    let best = i, bv = sc[i];
    for (let j = i + 1; j < n; j++) if (sc[j] > bv) { bv = sc[j]; best = j; }
    if (best !== i) {
      const tm = ms[i]; ms[i] = ms[best]; ms[best] = tm;
      const ts = sc[i]; sc[i] = sc[best]; sc[best] = ts;
    }
    return ms[i];
  }

  Searcher.prototype.qsearch = function (s, alpha, beta, ply, qd) {
    this.nodes++;
    if (s.winner >= 0) return s.winner === 2 ? 0 : (s.winner === s.turn ? MATE - ply : -(MATE - ply));
    const stand = evaluate(s, this.w);
    if (qd <= 0 || ply >= 60) return stand;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const buf = this.bufs[ply], b = s.b;
    let n = gen(s, buf.m), k = 0;
    // 取る手だけ残す
    for (let i = 0; i < n; i++) {
      const m = buf.m[i], kind = m >> 12;
      if ((kind === MOVE && b[m & 63]) || kind === SHOOT) buf.m[k++] = m;
    }
    n = k;
    this.scoreMoves(s, buf, n, 0, ply);
    let best = stand;
    for (let i = 0; i < n; i++) {
      const m = pick(buf, i, n);
      if ((b[m & 63] & 15) === KING) return MATE - ply;
      const sc = -this.qsearch(apply(s, m), -beta, -alpha, ply + 1, qd - 1);
      if (sc > best) { best = sc; if (sc > alpha) { alpha = sc; if (sc >= beta) break; } }
    }
    return best;
  };

  Searcher.prototype.search = function (s, depth, alpha, beta, ply) {
    if (s.winner >= 0) return s.winner === 2 ? 0 : (s.winner === s.turn ? MATE - ply : -(MATE - ply));
    if (depth <= 0) return this.qsearch(s, alpha, beta, ply, 4);
    this.nodes++;
    if ((this.nodes & 1023) === 0) {
      if ((this.deadline && Date.now() > this.deadline) || (this.nodeLimit && this.nodes > this.nodeLimit)) this.abort = true;
    }
    if (this.abort) return 0;

    hashState(s);
    const h1 = _h1, h2 = _h2, idx = h1 & TT_MASK;
    // 対局中にすでに現れた局面へ戻る手は、引き分け（千日手）として読む
    if (ply > 0 && this.seen && this.seen.has((h1 >>> 0) * 2097152 + ((h2 >>> 0) & 2097151))) return 0;
    let ttm = 0;
    if (this.ttKey[idx] === h2) {
      ttm = this.ttMove[idx];
      const meta = this.ttMeta[idx], d = meta >> 2, flag = meta & 3;
      if (d >= depth && ply > 0) {
        let sc = this.ttScore[idx];
        if (sc > MATE - 200) sc -= ply; else if (sc < -MATE + 200) sc += ply;
        if (flag === 1) return sc;
        if (flag === 2 && sc >= beta) return sc;
        if (flag === 3 && sc <= alpha) return sc;
      }
    }

    const buf = this.bufs[ply], b = s.b;
    const n = gen(s, buf.m);
    this.scoreMoves(s, buf, n, ttm, ply);
    const a0 = alpha;
    let best = -MATE * 2, bestMove = 0;
    for (let i = 0; i < n; i++) {
      const m = pick(buf, i, n);
      const kind = m >> 12;
      if ((kind === MOVE || kind === SHOOT) && (b[m & 63] & 15) === KING) { best = MATE - ply; bestMove = m; break; }
      const child = apply(s, m);
      let sc;
      if (i === 0) sc = -this.search(child, depth - 1, -beta, -alpha, ply + 1);
      else {
        // 後ろのほうの静かな手は浅く読んで、良さそうなら読み直す
        let red = 0;
        if (!this.exact && depth >= 3 && i >= 8 && (kind === DEPLOY || kind === PASS || (kind === MOVE && !b[m & 63]))) red = 1;
        sc = -this.search(child, depth - 1 - red, -alpha - 1, -alpha, ply + 1);
        if (sc > alpha && (red || sc < beta)) sc = -this.search(child, depth - 1, -beta, -alpha, ply + 1);
      }
      if (this.abort) return 0;
      if (sc > best) {
        best = sc; bestMove = m;
        if (sc > alpha) {
          alpha = sc;
          if (sc >= beta) {
            if (!(kind === MOVE && b[m & 63]) && kind !== SHOOT && kind !== SPELL) {
              const k = ply * 2;
              if (this.killers[k] !== m) { this.killers[k + 1] = this.killers[k]; this.killers[k] = m; }
              this.history[m & 32767] += depth * depth;
            }
            break;
          }
        }
      }
    }
    let st = best;
    if (st > MATE - 200) st += ply; else if (st < -MATE + 200) st -= ply;
    this.ttKey[idx] = h2; this.ttMove[idx] = bestMove; this.ttScore[idx] = st;
    this.ttMeta[idx] = (depth << 2) | (best <= a0 ? 3 : best >= beta ? 2 : 1);
    return best;
  };

  // 根の全合法手に点をつける（深さ depth）。弱い相手や振り返りで使う
  Searcher.prototype.scoreRoot = function (s, depth, moves) {
    const res = [];
    moves = moves || legal(s);
    for (const m of moves) {
      const sc = -this.search(apply(s, m), depth - 1, -MATE * 2, MATE * 2, 1);
      if (this.abort) break;
      res.push({ m: m, sc: sc });
    }
    res.sort((x, y) => y.sc - x.sc);
    return res;
  };

  // 反復深化で最善手を探す
  Searcher.prototype.best = function (s, opt) {
    opt = opt || {};
    const maxDepth = opt.depth || 4;
    this.abort = false; this.nodes = 0;
    this.deadline = opt.ms ? Date.now() + opt.ms : 0;
    this.nodeLimit = opt.nodes || 0;
    this.seen = opt.seen || null;
    this.killers.fill(0);
    for (let i = 0; i < this.history.length; i++) this.history[i] >>= 2;
    let moves = legal(s);
    if (moves.length === 0) return { m: -1, sc: -MATE, depth: 0, nodes: 0 };
    let bestM = moves[0], bestSc = 0, reached = 0;
    for (let d = 1; d <= maxDepth; d++) {
      let alpha = -MATE * 2, lm = moves[0], ls = -MATE * 2;
      const scored = [];
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i], child = apply(s, m);
        let sc;
        if (i === 0) sc = -this.search(child, d - 1, -MATE * 2, -alpha, 1);
        else {
          sc = -this.search(child, d - 1, -alpha - 1, -alpha, 1);
          if (sc > alpha) sc = -this.search(child, d - 1, -MATE * 2, -alpha, 1);
        }
        if (this.abort) break;
        scored.push({ m: m, sc: sc });
        if (sc > ls) { ls = sc; lm = m; }
        if (sc > alpha) alpha = sc;
      }
      if (this.abort && d > 1) {
        // 途中で切れても、前の深さの最善手より良い手が見つかっていれば採る
        if (scored.length && ls > bestSc && scored[0].m === bestM) { bestM = lm; bestSc = ls; }
        break;
      }
      bestM = lm; bestSc = ls; reached = d;
      // 次の深さは、今の最善手から読む
      moves = [lm].concat(moves.filter((x) => x !== lm));
      if (Math.abs(bestSc) > MATE - 200) break;
    }
    return { m: bestM, sc: bestSc, depth: reached, nodes: this.nodes };
  };

  // 順番がまだ明かされていない山を混ぜる（AI が知らないはずの情報を使わないように）
  function blind(s, rnd) {
    const t = clone(s);
    for (let p = 0; p < 2; p++) {
      const u = p === 0 ? t.unk0 : t.unk1;
      if (u < 2) continue;
      const base = p * 8 + 8 - u, arr = [];
      for (let i = 0; i < u; i++) arr.push(t.hq[base + i]);
      const sh = shuffle(arr, rnd);
      for (let i = 0; i < u; i++) t.hq[base + i] = sh[i];
    }
    return t;
  }

  // 盤を 180 度回して先後を入れ替える（詰め問題を、いつも手前番で出すため）
  function flip(s) {
    const t = new State();
    for (let c = 0; c < N; c++) { const pc = s.b[c]; if (pc) t.b[N - 1 - c] = pc ^ 16; }
    for (let i = 0; i < 8; i++) { t.hq[i] = s.hq[8 + i]; t.hq[8 + i] = s.hq[i]; }
    t.e0 = s.e1; t.e1 = s.e0; t.d0 = s.d1; t.d1 = s.d0;
    t.k0 = N - 1 - s.k1; t.k1 = N - 1 - s.k0;
    t.unk0 = s.unk1; t.unk1 = s.unk0;
    t.turn = 1 - s.turn; t.ply = s.ply; t.winner = s.winner < 2 && s.winner >= 0 ? 1 - s.winner : s.winner; t.reason = s.reason;
    return t;
  }
  // 保存・受け渡し用
  function pack(s) {
    return { b: Array.from(s.b), hq: Array.from(s.hq), e: [s.e0, s.e1], d: [s.d0, s.d1], k: [s.k0, s.k1],
      t: s.turn, p: s.ply, w: s.winner, u: [s.unk0, s.unk1], r: s.reason };
  }
  function unpack(o) {
    const s = new State();
    s.b.set(o.b); s.hq.set(o.hq); s.e0 = o.e[0]; s.e1 = o.e[1]; s.d0 = o.d[0]; s.d1 = o.d[1];
    s.k0 = o.k[0]; s.k1 = o.k[1]; s.turn = o.t; s.ply = o.p; s.winner = o.w; s.unk0 = o.u[0]; s.unk1 = o.u[1]; s.reason = o.r || '';
    return s;
  }

  // 相手の強さ。temp が大きいほど、最善から外れた手を選びやすい
  // slip の確率で、その手だけ浅い読みに落ちる（人間らしい見落とし）
  const LEVELS = [
    { depth: 1, temp: 90, miss: 0.5 },
    { depth: 1, temp: 45, miss: 0.3 },
    { depth: 2, temp: 40, miss: 0.1, slip: 0.5, slipTo: { depth: 1, temp: 45, miss: 0.3 } },
    { depth: 2, temp: 25, miss: 0, slip: 0.2, slipTo: { depth: 1, temp: 40, miss: 0.2 } },
    { depth: 3, temp: 20, miss: 0, slip: 0.3, slipTo: { depth: 1, temp: 30, miss: 0 } },
    { depth: 3, temp: 10, miss: 0, slip: 0.1, slipTo: { depth: 1, temp: 30, miss: 0 } },
    { depth: 4, temp: 0, ms: 1500, slip: 0.38, slipTo: { depth: 2, temp: 15, miss: 0 } },
    { depth: 4, temp: 0, ms: 1500, slip: 0.08, slipTo: { depth: 2, temp: 15, miss: 0 } },
    { depth: 5, temp: 0, ms: 2500, slip: 0.07, slipTo: { depth: 3, temp: 10, miss: 0 } },
    { depth: 9, temp: 0, ms: 3200 },
  ];
  // その強さで 1 手選ぶ
  function think(eng, s, cfg, rnd, seen) {
    const view = blind(s, rnd);
    if (cfg.slip && rnd() < cfg.slip) cfg = cfg.slipTo;
    if (!cfg.temp) {
      const r = eng.best(view, { depth: cfg.depth, ms: cfg.ms || 0, seen: seen });
      return { m: r.m, sc: r.sc, depth: r.depth, nodes: r.nodes };
    }
    eng.abort = false; eng.nodes = 0; eng.deadline = 0; eng.nodeLimit = 0; eng.seen = seen || null;
    const res = eng.scoreRoot(view, cfg.depth);
    if (!res.length) return { m: -1, sc: -MATE, depth: 0, nodes: 0 };
    // 勝ちが見えている手は、たまにしか見逃さない
    if (res[0].sc > MATE - 200 && rnd() >= cfg.miss) return { m: res[0].m, sc: res[0].sc, depth: cfg.depth, nodes: eng.nodes };
    let tot = 0;
    const ws = res.map((x) => { const w = Math.exp((x.sc - res[0].sc) / cfg.temp); tot += w; return w; });
    let r = rnd() * tot, i = 0;
    while (i < ws.length - 1 && r > ws[i]) { r -= ws[i]; i++; }
    return { m: res[i].m, sc: res[i].sc, depth: cfg.depth, nodes: eng.nodes };
  }

  // 手の説明（棋譜・表示用）
  function describe(s, m) {
    const kind = kindOf(m), a = aOf(m), d = bOf(m), me = s.turn;
    const o = { kind: kind, player: me };
    if (kind === MOVE || kind === SHOOT) {
      o.from = a; o.to = d; o.piece = s.b[a] & 15; o.captured = s.b[d] ? s.b[d] & 15 : 0;
      o.promote = kind === MOVE && o.piece === HEI && !!IN_ENEMY_HOME[me][d];
    } else if (kind === DEPLOY || kind === SPELL) {
      o.slot = a; o.to = d; o.card = s.hq[me * 8 + a]; o.cost = COST[o.card];
      o.captured = kind === SPELL ? s.b[d] & 15 : 0;
    }
    return o;
  }

  return {
    W, H, N, HOME_ROWS, HOME, RULES, COST, NAMES, MOVES, DEFAULT_DECK, VAL, MATE,
    KING, HEI, SEI, TATE, YARI, YUMI, KI, TAKA, RYU, RAI,
    PASS, MOVE, SHOOT, DEPLOY, SPELL, mk, kindOf, aOf, bOf,
    STEPS, RAYS, SHOTS, IN_ENEMY_HOME,
    rng, shuffle, State, clone, newGame, energy, isOT, canCapture,
    deployZone, gen, legal, apply, settle, posKey, inert, attacked, inCheck, materialOf, evaluate, describe, blind,
    Searcher, DEFAULT_W, LEVELS, think, flip, pack, unpack,
  };
});
