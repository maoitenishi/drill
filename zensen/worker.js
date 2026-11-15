/* ZENSEN 前線 — 思考用 Worker（画面を止めずに読む） */
importScripts('./engine.js', './brain.js');
self.onmessage = function (e) {
  const q = e.data;
  const out = self.ZensenBrain.handle(q, function (p) { self.postMessage({ id: q.id, progress: p }); });
  self.postMessage({ id: q.id, out: out });
};
