/* ZENSEN 前線 — 盤と駒の描画、効果音、演出 */
(function (root) {
  'use strict';
  const Z = root.Zensen;
  const { W, H, N, KING, HEI, SEI, TATE, YARI, YUMI, KI, TAKA, RYU, RAI } = Z;

  const $ = (sel, el) => (el || document).querySelector(sel);
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- 駒の説明 ----------
  const DESC = {};
  DESC[KING] = '全方向に 1 マス。詰まされたら負け。';
  DESC[HEI] = '前に 1 マス。敵陣（奥の 2 段）に入ると「精」に成る。';
  DESC[SEI] = '成った歩兵。前・斜め前・横・後ろに 1 マス。';
  DESC[TATE] = '前後左右に 1 マス。同じ列の正面からは取られない。';
  DESC[YARI] = '前へ何マスでも。後ろに 1 マス。';
  DESC[YUMI] = '前後左右に 1 マス（動いて取ることはできない）。2 マス先の前・斜め前を、動かずに射抜く。';
  DESC[KI] = '桂馬跳びで 8 方向。間の駒を跳び越える。';
  DESC[TAKA] = '斜めに何マスでも。';
  DESC[RYU] = '縦横に何マスでも。斜めにも 1 マス。';
  DESC[RAI] = '術。王を除く敵の駒をひとつ、どこにいても消す。';

  // ---------- 駒の絵 ----------
  // 8 方向の印の位置（手前の駒。前 = 上）
  const MARK_POS = { '0,-1': [50, 13], '1,-1': [80, 25], '1,0': [87, 58], '1,1': [85, 88], '0,1': [50, 91], '-1,1': [15, 88], '-1,0': [13, 58], '-1,-1': [20, 25] };
  function marks(type, mine) {
    const m = Z.MOVES[type];
    if (!m || type === KI) return '';
    const col = mine ? '#B8452C' : '#FFD79A';
    let out = '';
    const put = (d, slide, hollow) => {
      const p = MARK_POS[d[0] + ',' + d[1]];
      if (!p) return;
      const x = p[0], y = mine ? p[1] : 100 - p[1], dy = mine ? d[1] : -d[1];
      if (slide) {
        const a = Math.atan2(dy, d[0]) * 180 / Math.PI + 90;
        out += `<path d="M0 -5.5 L4.6 3.6 L-4.6 3.6 Z" transform="translate(${x} ${y}) rotate(${a})" fill="${col}"/>`;
      } else if (hollow) out += `<circle cx="${x}" cy="${y}" r="2.8" fill="none" stroke="${col}" stroke-width="1.6"/>`;
      else out += `<circle cx="${x}" cy="${y}" r="3.3" fill="${col}"/>`;
    };
    for (const d of (m.slides || [])) put(d, true);
    for (const d of (m.steps || [])) put(d, false, type === YUMI);
    if (type === YUMI) {
      const y = mine ? 12 : 88, s = mine ? 1 : -1;
      out += `<path d="M38 ${y + 5 * s} L50 ${y - 3 * s} L62 ${y + 5 * s}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    return out;
  }
  let uid = 0;
  function pieceSVG(type, mine) {
    const id = 'g' + (uid++);
    const king = type === KING;
    const shape = mine ? 'M50 3 L88 17 L96 96 L4 96 L12 17 Z' : 'M50 97 L88 83 L96 4 L4 4 L12 83 Z';
    const g = mine
      ? `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF9EC"/><stop offset="1" stop-color="#E2D4B3"/></linearGradient>`
      : `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B03A40"/><stop offset="1" stop-color="#6A1A1F"/></linearGradient>`;
    const stroke = king ? '#E8C56D' : (mine ? '#B5A47C' : '#40090D');
    let ink = mine ? '#1A2433' : '#FFEBD6';
    if (type === SEI) ink = mine ? '#C2321C' : '#FFD25E';
    const shield = type === TATE
      ? (mine ? '<path d="M13 17 L50 3.5 L87 17" fill="none" stroke="#3F74AE" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>'
        : '<path d="M13 83 L50 96.5 L87 83" fill="none" stroke="#FFD79A" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>')
      : '';
    const ty = mine ? 59 : 45;
    return `<svg viewBox="0 0 100 100"><defs>${g}</defs>` +
      `<path d="${shape}" fill="url(#${id})" stroke="${stroke}" stroke-width="${king ? 4.5 : 2.5}" stroke-linejoin="round"/>` +
      // 盾は正面の印の代わりに、盾の帯を描く
      shield + (type === TATE ? marks(type, mine).replace(/<circle[^>]*cy="(13|87)"[^>]*\/>/, '') : marks(type, mine)) +
      `<text x="50" y="${ty}" text-anchor="middle" dominant-baseline="central" font-size="${king ? 52 : 48}" fill="${ink}" style="font-family:var(--f-min);font-weight:900">${Z.NAMES[type].k}</text></svg>`;
  }

  // 動き方の図（5×5、中央が駒）
  function moveDiagram(type) {
    let out = '<svg viewBox="0 0 50 50" class="dia">';
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
      out += `<rect x="${x * 10 + .5}" y="${y * 10 + .5}" width="9" height="9" rx="1.6" fill="${(x + y) % 2 ? '#222C3A' : '#1B2431'}"/>`;
    }
    if (type === RAI) {
      out += '<path d="M28 4 L16 27 L24 27 L20 46 L35 20 L26 20 Z" fill="#FFE58A"/></svg>';
      return out;
    }
    const m = Z.MOVES[type];
    const cx = (dx) => 25 + dx * 10, cy = (dy) => 25 + dy * 10;
    for (const d of (m.slides || [])) {
      let k = 1;
      while (Math.abs(d[0] * k) <= 2 && Math.abs(d[1] * k) <= 2) k++;
      k--;
      out += `<line x1="${cx(d[0] * .55)}" y1="${cy(d[1] * .55)}" x2="${cx(d[0] * (k + .3))}" y2="${cy(d[1] * (k + .3))}" stroke="#5BB9E2" stroke-width="3" stroke-linecap="round"/>`;
    }
    for (const d of (m.steps || [])) {
      if (type === YUMI) out += `<circle cx="${cx(d[0])}" cy="${cy(d[1])}" r="2.6" fill="none" stroke="#5BB9E2" stroke-width="1.5"/>`;
      else out += `<circle cx="${cx(d[0])}" cy="${cy(d[1])}" r="3" fill="#5BB9E2"/>`;
    }
    for (const d of (m.shots || [])) {
      out += `<g stroke="#F0624F" stroke-width="1.5" fill="none"><circle cx="${cx(d[0])}" cy="${cy(d[1])}" r="3.2"/><path d="M${cx(d[0]) - 5} ${cy(d[1])}h10M${cx(d[0])} ${cy(d[1]) - 5}v10"/></g>`;
    }
    out += '<path d="M25 20.5 L29 22 L29.8 29.5 L20.2 29.5 L21 22 Z" fill="#F4EBD8"/>';
    if (type === TATE) out += '<path d="M21 22 L25 20.5 L29 22" fill="none" stroke="#3F74AE" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
    return out + '</svg>';
  }

  // ---------- 盤 ----------
  function BoardView(el, opt) {
    opt = opt || {};
    this.el = el; this.pov = opt.pov || 0; this.onCell = opt.onCell || null;
    el.classList.add('board');
    el.innerHTML = '<div class="cells"></div><div class="pcs"></div><div class="fx"></div>';
    this.cellsEl = el.children[0]; this.pcsEl = el.children[1]; this.fxEl = el.children[2];
    this.cells = []; this.els = new Map(); this.codes = new Int8Array(N);
    for (let i = 0; i < N; i++) {
      const c = this.fromView(i), y = (i / W) | 0, x = i % W;
      const d = document.createElement('div');
      d.className = 'cell' + ((x + y) % 2 ? ' alt' : '') + (y < 2 ? ' hf' : y >= H - 2 ? ' hm' : '') + (y === 0 ? ' gf' : y === H - 1 ? ' gm' : '');
      // 盤の端に、うっすら座標（左下が a1）
      d.innerHTML = '<div class="m"></div>' + (x === 0 ? '<span class="cy">' + (H - y) + '</span>' : '') + (y === H - 1 ? '<span class="cx">' + 'abcde'[x] + '</span>' : '');
      d.dataset.c = c;
      this.cellsEl.appendChild(d);
      this.cells[c] = d;
    }
    this.cellsEl.addEventListener('click', (e) => {
      const t = e.target.closest('.cell');
      if (t && this.onCell) this.onCell(+t.dataset.c);
    });
    this.marked = [];
  }
  const BP = BoardView.prototype;
  BP.fromView = function (i) { return this.pov === 0 ? i : N - 1 - i; };
  BP.xy = function (c) { const v = this.pov === 0 ? c : N - 1 - c; return [v % W, (v / W) | 0]; };
  BP.place = function (el, c, dyExtra) {
    const p = this.xy(c);
    el.style.transform = `translate(calc(var(--cell) * ${p[0]}), calc(var(--cell) * ${p[1] + (dyExtra || 0)}))`;
  };
  BP.makePiece = function (code, c) {
    const el = document.createElement('div');
    el.className = 'pc nomove';
    el.innerHTML = pieceSVG(code & 15, (code >> 4) === this.pov);
    this.place(el, c);
    this.pcsEl.appendChild(el);
    void el.offsetWidth;
    el.classList.remove('nomove');
    return el;
  };
  // 局面に合わせて駒を並べ直す（合っている駒はそのまま使う）
  BP.sync = function (s) {
    for (let c = 0; c < N; c++) {
      const code = s.b[c], el = this.els.get(c);
      if (el && this.codes[c] === code) continue;
      if (el) { el.remove(); this.els.delete(c); }
      if (code) this.els.set(c, this.makePiece(code, c));
      this.codes[c] = code;
    }
    // 演出の途中で残ったものを掃除
    for (const el of Array.from(this.pcsEl.children)) {
      let live = false;
      this.els.forEach((v) => { if (v === el) live = true; });
      if (!live && !el.classList.contains('die') && !el.classList.contains('out')) el.remove();
    }
  };
  BP.clearMarks = function (keep) {
    for (const c of this.marked) this.cells[c].className = this.cells[c].className.replace(/ (sel|t-\w+|hint-a)/g, '');
    this.marked = [];
  };
  BP.mark = function (c, cls) { this.cells[c].classList.add(cls); this.marked.push(c); };
  BP.setFlag = function (cls, list) {
    for (let c = 0; c < N; c++) this.cells[c].classList.toggle(cls, list.indexOf(c) >= 0);
  };
  BP.center = function (c) { const p = this.xy(c); return [(p[0] + .5), (p[1] + .5)]; };
  BP.fxNode = function (html, ms) {
    const n = h(html);
    this.fxEl.appendChild(n);
    setTimeout(() => n.remove(), ms);
    return n;
  };
  BP.sparks = function (c, color) {
    const p = this.center(c);
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2, r = 22 + Math.random() * 30;
      this.fxNode(`<i class="spark" style="left:calc(var(--cell)*${p[0]});top:calc(var(--cell)*${p[1]});--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r}px;background:${color || '#E8C56D'}"></i>`, 520);
    }
  };
  BP.ring = function (c, color) {
    const p = this.xy(c);
    this.fxNode(`<i class="ring" style="left:calc(var(--cell)*${p[0]});top:calc(var(--cell)*${p[1]});border-color:${color || '#E8C56D'}"></i>`, 520);
  };
  BP.banner = function (text, cls) { this.fxNode(`<div class="banner ${cls || ''}">${text}</div>`, 1150); };
  BP.shotLine = function (a, b) {
    const p = this.center(a), q = this.center(b);
    this.fxNode(`<svg viewBox="0 0 5 7" preserveAspectRatio="none"><line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="#FFE39C" stroke-width=".07" stroke-linecap="round" stroke-dasharray="4" stroke-dashoffset="4"><animate attributeName="stroke-dashoffset" from="4" to="0" dur=".16s" fill="freeze"/><animate attributeName="opacity" from="1" to="0" begin=".2s" dur=".2s" fill="freeze"/></line></svg>`, 450);
  };
  BP.bolt = function (c) {
    const q = this.center(c);
    let x = q[0] + (Math.random() - .5) * 1.2, y = -0.3, d = `M${x} ${y}`;
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      x = i === steps ? q[0] : q[0] + (Math.random() - .5) * (1 - t) * 1.6;
      y = -0.3 + (q[1] + .3) * t;
      d += ` L${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    this.fxNode(`<svg viewBox="0 0 5 7" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="#FFF7C9" stroke-width=".13" stroke-linejoin="bevel"><animate attributeName="opacity" values="1;.2;1;0" dur=".42s" fill="freeze"/></path><path d="${d}" fill="none" stroke="#B7A6FF" stroke-width=".32" opacity=".45" stroke-linejoin="bevel"><animate attributeName="opacity" values=".5;.1;.4;0" dur=".42s" fill="freeze"/></path></svg>`, 460);
    this.fxNode('<i class="flash"></i>', 420);
    this.el.classList.remove('shake'); void this.el.offsetWidth; this.el.classList.add('shake');
  };
  // 矢印（振り返り・ヒント用）。前の矢印は消す
  BP.arrows = function (list) {
    const old = $('.arrows', this.fxEl);
    if (old) old.remove();
    if (!list || !list.length) return;
    let out = '<svg class="arrows" viewBox="0 0 5 7" preserveAspectRatio="none">';
    for (const a of list) {
      const p = this.center(a.from), q = this.center(a.to);
      const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      const ex = q[0] - ux * .2, ey = q[1] - uy * .2, sx = p[0] + ux * .25, sy = p[1] + uy * .25;
      out += `<g class="${a.cls}" opacity=".92"><line x1="${sx}" y1="${sy}" x2="${ex - ux * .16}" y2="${ey - uy * .16}" stroke-width=".11" stroke-linecap="round"/>` +
        `<path d="M${ex} ${ey} L${ex - ux * .3 - uy * .16} ${ey - uy * .3 + ux * .16} L${ex - ux * .3 + uy * .16} ${ey - uy * .3 - ux * .16} Z" stroke="none"/></g>`;
    }
    this.fxNode(out + '</svg>', 1e9);
  };
  BP.kill = function (c, color) {
    const el = this.els.get(c);
    if (!el) return;
    this.els.delete(c); this.codes[c] = 0;
    el.classList.add('die');
    this.sparks(c, color);
    setTimeout(() => el.remove(), 330);
  };
  // 1 手ぶんの演出。before → after
  BP.play = async function (d, before, after, sfx) {
    const me = d.player === this.pov;
    if (d.kind === Z.MOVE) {
      const el = this.els.get(d.from);
      if (el) {
        el.classList.add('lift');
        this.place(el, d.to);
        await wait(d.captured ? 170 : 230);
        if (d.captured) { this.kill(d.to, me ? '#FFB3A6' : '#B5E6FB'); sfx.play('capture'); } else sfx.play('move');
        this.els.delete(d.from); this.codes[d.from] = 0;
        this.els.set(d.to, el); this.codes[d.to] = before.b[d.from];
        el.classList.remove('lift');
        if (d.promote) {
          el.innerHTML = pieceSVG(SEI, me);
          this.codes[d.to] = after.b[d.to];
          el.classList.add('promo'); sfx.play('promote');
          this.ring(d.to);
          setTimeout(() => el.classList.remove('promo'), 520);
        }
        await wait(d.captured ? 160 : 40);
      }
    } else if (d.kind === Z.SHOOT) {
      sfx.play('shoot');
      this.shotLine(d.from, d.to);
      await wait(170);
      this.kill(d.to, me ? '#FFB3A6' : '#B5E6FB'); sfx.play('capture');
      await wait(220);
    } else if (d.kind === Z.DEPLOY) {
      const el = this.makePiece(d.card | (d.player << 4), d.to);
      el.classList.add('drop');
      this.els.set(d.to, el); this.codes[d.to] = d.card | (d.player << 4);
      this.ring(d.to, me ? '#5BB9E2' : '#EC5B43');
      sfx.play('place');
      await wait(300);
      el.classList.remove('drop');
    } else if (d.kind === Z.SPELL) {
      sfx.play('thunder');
      this.bolt(d.to);
      await wait(150);
      this.kill(d.to, '#FFF7C9');
      await wait(330);
    } else {
      sfx.play('pass');
      await wait(160);
    }
    // 突破：盤の外へ抜けていく
    const out = [];
    const mover = after.turn;
    for (let c = 0; c < N; c++) {
      const pc = before.b[c];
      if (pc && (pc >> 4) === mover && (pc & 15) !== KING && !after.b[c] && c !== d.to) out.push(c);
    }
    if (out.length && (after.d0 + after.d1) > (before.d0 + before.d1)) {
      const dir = (mover === this.pov) ? -1.2 : 1.2;
      for (const c of out) {
        const el = this.els.get(c);
        if (!el) continue;
        this.els.delete(c); this.codes[c] = 0;
        el.classList.add('out');
        this.place(el, c, dir);
        this.ring(c, mover === this.pov ? '#5BB9E2' : '#EC5B43');
        setTimeout(() => el.remove(), 520);
      }
      sfx.play(mover === this.pov ? 'breachMe' : 'breachFoe');
      this.banner('突破', mover === this.pov ? 'blue' : 'red');
      if (navigator.vibrate) try { navigator.vibrate(mover === this.pov ? 40 : [60, 40, 60]); } catch (e) { /* 使えない端末は黙って通す */ }
      await wait(650);
    }
    this.sync(after);
  };

  // ---------- 効果音（合成。音源ファイルは持たない） ----------
  function Sfx() { this.ctx = null; this.on = true; }
  Sfx.prototype.ensure = function () {
    if (this.ctx || !this.on) return;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = .5; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * .6, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      this.noise = buf;
    } catch (e) { this.ctx = null; }
  };
  Sfx.prototype.tone = function (f0, f1, dur, type, vol, delay) {
    const c = this.ctx, t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || .3, t + .008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + .02);
  };
  Sfx.prototype.hiss = function (dur, freq, q, vol, delay, type) {
    const c = this.ctx, t = c.currentTime + (delay || 0), src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise;
    f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    g.gain.setValueAtTime(vol || .3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + .02);
  };
  Sfx.prototype.play = function (name) {
    if (!this.on) return;
    this.ensure();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    try {
      switch (name) {
        case 'tap': this.tone(1300, 900, .035, 'sine', .08); break;
        case 'select': this.tone(700, 950, .06, 'triangle', .12); break;
        case 'move': this.hiss(.05, 1800, 1.2, .22); this.tone(420, 180, .07, 'sine', .3); break;
        case 'place': this.hiss(.04, 2600, 1, .3); this.tone(620, 210, .1, 'sine', .45); this.tone(1240, 500, .05, 'triangle', .1); break;
        case 'capture': this.hiss(.09, 1200, .8, .4); this.tone(300, 90, .16, 'square', .16); this.tone(520, 160, .09, 'sine', .3, .03); break;
        case 'shoot': this.hiss(.16, 3200, 3, .25); this.tone(1400, 500, .12, 'sine', .08); break;
        case 'thunder': this.hiss(.5, 320, .6, .9, 0, 'lowpass'); this.hiss(.12, 4000, .8, .4); this.tone(110, 38, .45, 'sawtooth', .25); break;
        case 'pass': this.tone(520, 660, .09, 'sine', .1); break;
        case 'promote': this.tone(660, 0, .1, 'triangle', .2); this.tone(990, 0, .18, 'triangle', .2, .08); break;
        case 'check': this.tone(880, 0, .09, 'square', .1); this.tone(880, 0, .12, 'square', .1, .13); break;
        case 'breachMe': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0, .16, 'triangle', .22, i * .07)); break;
        case 'breachFoe': this.tone(220, 110, .35, 'sawtooth', .2); this.tone(165, 82, .4, 'sawtooth', .16, .12); break;
        case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0, .32, 'triangle', .24, i * .11)); this.tone(1568, 0, .7, 'sine', .14, .58); break;
        case 'lose': [392, 349, 294, 220].forEach((f, i) => this.tone(f, 0, .36, 'sine', .22, i * .17)); break;
        case 'ok': this.tone(784, 0, .1, 'triangle', .2); this.tone(1175, 0, .2, 'triangle', .2, .09); break;
        case 'ng': this.tone(196, 150, .22, 'square', .12); break;
        case 'ot': this.tone(440, 0, .12, 'square', .1); this.tone(554, 0, .12, 'square', .1, .13); this.tone(659, 0, .25, 'square', .1, .26); break;
        case 'tick': this.tone(1000, 0, .03, 'square', .06); break;
      }
    } catch (e) { /* 音が出なくても対局は続ける */ }
  };

  root.ZensenUI = { $, h, wait, DESC, pieceSVG, moveDiagram, BoardView, Sfx };
})(typeof self !== 'undefined' ? self : this);
