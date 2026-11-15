/* ZENSEN 前線 — 考える側の窓口
 * Worker の中でも、Worker が使えないときの画面側でも、同じ handle を呼ぶ。 */
(function (root) {
  'use strict';
  const Z = root.Zensen;
  const eng = new Z.Searcher();
  const rnd = Z.rng((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  const clampSc = (v) => (v > 2500 ? 2500 : v < -2500 ? -2500 : v);

  function handle(q, progress) {
    if (q.type === 'think') {
      const s = Z.unpack(q.s);
      const cfg = Object.assign({}, Z.LEVELS[q.level]);
      if (q.ms && cfg.ms) cfg.ms = Math.min(cfg.ms, q.ms);
      eng.w = q.w ? Object.assign({}, Z.DEFAULT_W, q.w) : Z.DEFAULT_W;
      eng.exact = false;
      return Z.think(eng, s, cfg, rnd, new Set(q.seen || []));
    }
    if (q.type === 'hint') {
      eng.w = Z.DEFAULT_W; eng.exact = false;
      return eng.best(Z.blind(Z.unpack(q.s), rnd), { depth: 5, ms: 900, seen: new Set(q.seen || []) });
    }
    if (q.type === 'review') {
      // 自分の手を 1 手ずつ読み直して、最善との差を出す
      eng.w = Z.DEFAULT_W; eng.exact = false;
      const out = [];
      for (let i = 0; i < q.items.length; i++) {
        const it = q.items[i], s = Z.unpack(it.s);
        const r = eng.best(s, { depth: 4, ms: 450 });
        let sc = r.sc;
        if (it.m !== r.m) {
          eng.abort = false; eng.deadline = 0; eng.nodeLimit = 0; eng.seen = null;
          sc = -eng.search(Z.apply(s, it.m), Math.max(0, r.depth - 1), -Z.MATE * 2, Z.MATE * 2, 1);
          if (sc > r.sc) sc = r.sc;
        }
        out.push({ ply: it.ply, best: r.m, bestSc: clampSc(r.sc), sc: clampSc(sc), loss: Math.max(0, clampSc(r.sc) - clampSc(sc)) });
        if (progress) progress((i + 1) / q.items.length);
      }
      return out;
    }
    if (q.type === 'puzzle') {
      // 詰め問題：手前が指したあと、まだ n 手以内の詰みが残っているか
      const s = Z.unpack(q.s), n = q.left;
      if (n <= 0) return { ok: false, m: -1 };
      eng.w = Z.DEFAULT_W; eng.exact = true; eng.clear();
      const r = eng.best(s, { depth: 2 * n + 1 });
      eng.exact = false; eng.clear();
      return { ok: r.sc <= -(Z.MATE - 2 * n - 1), m: r.m };
    }
    if (q.type === 'solve') {
      // 詰め問題のヒント：残り n 手で詰む手
      eng.w = Z.DEFAULT_W; eng.exact = true; eng.clear();
      const r = eng.best(Z.unpack(q.s), { depth: 2 * q.left + 1 });
      eng.exact = false; eng.clear();
      return { m: r.m };
    }
    return null;
  }
  root.ZensenBrain = { handle: handle };
})(typeof self !== 'undefined' ? self : this);
