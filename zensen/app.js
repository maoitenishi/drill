/* ZENSEN 前線 — 画面と対局の進行 */
(function () {
  'use strict';
  const Z = self.Zensen, U = self.ZensenUI;
  const { $, h, wait } = U;
  const app = $('#app');
  const sfx = new U.Sfx();
  const PUZZLES = self.ZENSEN_PUZZLES || [];

  // ---------- 相手 ----------
  const OPP = [
    { nm: 'ハチ', role: '足軽', ava: '八', ds: 'とにかく前へ出てくる。まずはここから。', w: { prox: 12, adv: 9 } },
    { nm: 'ゴンゾ', role: '門番', ava: '門', ds: '王のまわりを固めたがる。目の前の一手しか見ていない。', w: { guard: 22, kingAdv: 24 } },
    { nm: 'ミズキ', role: '斥候', ava: '斥', ds: '隙を見つけるのは早いが、うっかりも多い。', w: { prox: 10 } },
    { nm: 'シノ', role: '弓頭', ava: '弦', ds: '2 手先までは読んでくる。取れる駒は逃さない。', w: null },
    { nm: 'トラ', role: '槍組頭', ava: '虎', ds: '筋を通して突破を狙う。3 手読むが、ときどき雑。', w: { adv: 8, hei: 6 } },
    { nm: 'ライ', role: '騎将', ava: '疾', ds: '3 手先を見て跳んでくる。浮いた駒は必ず咎められる。', w: null },
    { nm: 'カスミ', role: '軍師', ava: '霞', ds: '4 手読む。ただし考えすぎて足を滑らせることがある。', w: null },
    { nm: 'ゲンブ', role: '城代', ava: '玄', ds: '崩れない 4 手読み。ミスを待ってはくれない。', w: { guard: 14 } },
    { nm: 'トウカ', role: '大将', ava: '刀', ds: '5 手先まで読む。エナジーの差を一気に形にしてくる。', w: null },
    { nm: '無明', role: '名人', ava: '冥', ds: '持ち時間いっぱい、深く読む。', w: null },
  ];
  const RANKS = ['9級', '7級', '5級', '3級', '1級', '初段', '二段', '三段', '四段', '五段'];

  // ---------- 保存 ----------
  const KEY = 'zensen.v1';
  const fresh = () => ({ v: 1, sound: true, beaten: [], rec: {}, games: [], pz: {}, days: {}, tips: {}, setup: { side: 'rand', mem: false, timer: 0 }, live: null });
  let store = fresh();
  try { const raw = localStorage.getItem(KEY); if (raw) store = Object.assign(fresh(), JSON.parse(raw)); } catch (e) { /* 読めなければ新規 */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* 容量切れでも対局は続ける */ } };
  sfx.on = store.sound;

  const dayKey = (d) => { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const markDay = () => { const k = dayKey(); store.days[k] = (store.days[k] || 0) + 1; };
  function streak() {
    let n = 0;
    const d = new Date();
    if (!store.days[dayKey(d)]) d.setDate(d.getDate() - 1);
    while (store.days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  // どこまで挑めるか（下から順に倒した数）
  function topLevel() { let k = 0; while (k < OPP.length - 1 && store.beaten.indexOf(k) >= 0) k++; return k; }
  function rankName() { let best = -1; for (const b of store.beaten) if (b > best) best = b; return best < 0 ? '無級' : RANKS[best]; }
  const pzDone = () => PUZZLES.filter((p) => store.pz[p.id] && store.pz[p.id].done).length;

  // ---------- 考える係（Worker。使えなければ画面側で） ----------
  const brain = (function () {
    let w = null, seq = 0;
    const pend = new Map();
    function local(q, onp) { return new Promise((res) => setTimeout(() => res(self.ZensenBrain.handle(q, onp)), 30)); }
    function fallback() {
      w = null;
      pend.forEach((p) => local(p.q, p.onp).then(p.res));
      pend.clear();
    }
    try {
      w = new Worker('./worker.js');
      w.onmessage = (e) => {
        const p = pend.get(e.data.id);
        if (!p) return;
        if (e.data.progress != null) { if (p.onp) p.onp(e.data.progress); return; }
        pend.delete(e.data.id); p.res(e.data.out);
      };
      w.onerror = fallback;
    } catch (e) { w = null; }
    return {
      ask(q, onp) {
        if (!w) return local(q, onp);
        const id = ++seq;
        q.id = id;
        return new Promise((res) => { pend.set(id, { res, onp, q }); w.postMessage(q); });
      },
    };
  })();

  // ---------- 小物 ----------
  const IC = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  };
  let toastT = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1900);
  }
  function modal(html, opt) {
    closeModal();
    opt = opt || {};
    const m = h(`<div id="modal" class="${opt.center ? 'center' : ''}"><div class="sheet">${opt.center ? '' : '<div class="grab"></div>'}${html}</div></div>`);
    document.body.appendChild(m);
    m.addEventListener('click', (e) => { if (e.target === m && !opt.sticky) closeModal(); });
    return m;
  }
  function closeModal() { const m = $('#modal'); if (m) m.remove(); }
  const cardName = (c) => Z.NAMES[c].n;
  function cellName(c, pov) {
    const v = pov === 0 ? c : Z.N - 1 - c;
    return 'abcde'[v % Z.W] + (Z.H - ((v / Z.W) | 0));
  }
  function moveText(s, m, pov) {
    const d = Z.describe(s, m), K = (t) => '「' + Z.NAMES[t].k + '」';
    if (d.kind === Z.PASS) return '溜め';
    if (d.kind === Z.MOVE) return K(d.piece) + 'を ' + cellName(d.to, pov) + ' へ' + (d.captured ? '（' + K(d.captured) + 'を取る）' : '') + (d.promote ? '・成る' : '');
    if (d.kind === Z.SHOOT) return '「弓」で ' + cellName(d.to, pov) + ' の' + K(d.captured) + 'を射る';
    if (d.kind === Z.DEPLOY) return K(d.card) + 'を ' + cellName(d.to, pov) + ' に配置';
    return '「雷」で ' + cellName(d.to, pov) + ' の' + K(d.captured) + 'を消す';
  }
  function unitInfoHTML(type, owner) {
    const cost = type === Z.KING || type === Z.SEI ? '' : `<span class="c">コスト ${Z.COST[type]}</span>`;
    return U.moveDiagram(type) + `<div class="tx"><b>${Z.NAMES[type].k}　${cardName(type)}</b>${cost}${owner ? `<span class="c" style="color:var(--foe)">${owner}</span>` : ''}<br>${U.DESC[type]}</div>`;
  }

  let current = null; // 今の画面が持つ後始末
  function go(name, arg) {
    if (current && current.leave) current.leave();
    current = null;
    closeModal();
    app.innerHTML = '';
    current = SCREENS[name](arg) || null;
  }

  // =====================================================================
  // ホーム
  // =====================================================================
  function homeScreen() {
    const top = topLevel(), allClear = store.beaten.indexOf(OPP.length - 1) >= 0;
    const live = store.live;
    const el = h(`<section class="scr" id="scr-home">
      <div class="home-art"></div>
      <div class="home-top">
        <div class="logo"><div class="k">前線</div><div class="e">ZENSEN</div><div class="line"></div><div class="tag">読んで、溜めて、押し上げる。</div></div>
        <div class="home-stats">
          <div class="st"><b>${rankName()}</b><span>段位</span></div>
          <div class="st"><b>${streak()}</b><span>連続日数</span></div>
          <div class="st"><b>${pzDone()}<small style="font-size:12px;color:var(--ink3)">/${PUZZLES.length}</small></b><span>詰め</span></div>
        </div>
      </div>
      <div class="home-menu">
        ${live ? `<div class="resume"><b>${live.mode === 'puzzle' ? '' : OPP[live.level].role + ' ' + OPP[live.level].nm + ' との対局が途中です'}</b><button class="btn sm pri" data-a="resume">再開</button><button class="btn sm ghost" data-a="drop">破棄</button></div>` : ''}
        <button class="btn pri" data-a="play"><span>対局する</span><span class="s">${allClear ? '全員撃破' : '次の相手：' + OPP[top].role + ' ' + OPP[top].nm}</span></button>
        <div class="row2">
          <button class="btn col" data-a="puzzles">詰め道場<span class="s">読みを鍛える</span></button>
          <button class="btn col" data-a="howto">遊び方<span class="s">3 分でわかる</span></button>
          <button class="btn col" data-a="records">記録<span class="s">戦績と精度</span></button>
        </div>
      </div>
      <div class="home-foot"><button data-a="about">この遊びが使う力について</button>　·　<button data-a="sound">音：${store.sound ? 'ON' : 'OFF'}</button></div>
    </section>`);
    app.appendChild(el);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      sfx.play('tap');
      const a = b.dataset.a;
      if (a === 'play') go(Object.keys(store.rec).length || store.tips.seenHowto ? 'select' : 'howto', { first: true });
      else if (a === 'puzzles') go('puzzles');
      else if (a === 'howto') go('howto');
      else if (a === 'records') go('records');
      else if (a === 'about') aboutModal();
      else if (a === 'sound') { store.sound = !store.sound; sfx.on = store.sound; save(); b.textContent = '音：' + (store.sound ? 'ON' : 'OFF'); if (store.sound) sfx.play('ok'); }
      else if (a === 'resume') go('game', { resume: true });
      else if (a === 'drop') { store.live = null; save(); go('home'); }
    });
  }
  function aboutModal() {
    const m = modal(`<h3>この遊びが使う力</h3>
      <div class="scroll" style="min-height:0">
      <p>前頭前野が担うとされる「実行機能」を、1 局のなかで何度も使うように作ってあります。</p>
      <div class="pf">
        <div><b>先読み</b>自分と相手の手を頭の中で進める。詰みと突破、2 つの筋を同時に読む。</div>
        <div><b>記憶</b>手札は 8 枚で一巡。相手が何を使ったか覚えていれば、次に来る札がわかる。</div>
        <div><b>我慢</b>エナジーは溜めるほど強い札が出せる。今使うか、こらえるか。</div>
        <div><b>切り替え</b>攻めの最中に受けへ回る。狙いを詰みから突破へ変える。</div>
      </div>
      <p>対局のあとは「振り返り」で、分かれ目になった一手を確かめられます。うまくいかなかった理由を自分の言葉にするところまでが 1 セットです。</p>
      <p class="dim" style="font-size:12px">脳トレ系のゲームが日常の認知機能まで底上げするかは、研究でも結論が分かれています。これは医療や治療の代わりではなく、考える時間を楽しく積むための道具です。</p>
      </div>
      <div class="acts"><button class="btn" data-x>閉じる</button></div>`);
    $('[data-x]', m).onclick = closeModal;
  }

  // =====================================================================
  // 相手選び
  // =====================================================================
  function selectScreen() {
    const top = topLevel();
    const rows = OPP.map((o, i) => {
      const r = store.rec[i] || { w: 0, l: 0, d: 0 }, won = store.beaten.indexOf(i) >= 0, lock = i > top;
      return `<button class="opp card-box ${lock ? 'lock' : ''} ${won ? 'won' : ''} ${i === top && !won ? 'next' : ''}" data-i="${i}">
        <span class="ava">${lock ? '？' : o.ava}</span>
        <span class="mid"><span class="nm">${lock ? '？？？' : o.role + ' ' + o.nm}<small>Lv.${i + 1}　勝てば ${RANKS[i]}</small></span><span class="ds">${lock ? 'ひとつ前の相手に勝つと挑める' : o.ds}</span></span>
        <span class="rec">${won ? '<b>撃破</b>' : ''}${r.w + r.l + r.d ? r.w + '勝 ' + r.l + '敗' : ''}</span>
      </button>`;
    }).join('');
    const el = h(`<section class="scr"><div class="bar"><button class="icb" data-back>${IC.back}</button><h2>相手を選ぶ</h2><span class="icb"></span></div><div class="list scroll">${rows}</div></section>`);
    app.appendChild(el);
    $('[data-back]', el).onclick = () => { sfx.play('tap'); go('home'); };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('.opp');
      if (!b) return;
      const i = +b.dataset.i;
      if (i > top) { sfx.play('ng'); toast('ひとつ前の相手に勝つと挑めます'); return; }
      sfx.play('tap');
      setupSheet(i);
    });
    const nx = $('.opp.next', el);
    if (nx) nx.scrollIntoView({ block: 'center' });
  }
  function setupSheet(level) {
    const o = OPP[level], st = store.setup;
    const m = modal(`<div style="display:flex;gap:12px;align-items:center;margin:2px 0 8px"><span class="ava">${o.ava}</span><div><div style="font-weight:700;font-size:17px">${o.role} ${o.nm}</div><div class="dim" style="font-size:12px">Lv.${level + 1}　${o.ds}</div></div></div>
      <div class="setup">
        <div class="setrow"><div class="t">手番</div><div class="seg" data-k="side"><button data-v="rand">おまかせ</button><button data-v="0">先手</button><button data-v="1">後手</button></div></div>
        <div class="setrow"><div class="t">早指し<small>1 手の制限時間。切れると自動で「溜め」</small></div><div class="seg" data-k="timer"><button data-v="0">なし</button><button data-v="30">30秒</button><button data-v="15">15秒</button></div></div>
        <div class="setrow"><div class="t">記憶モード<small>相手の手札を伏せる。使われた札を覚えて、持ち札を推理する</small></div><button class="sw ${st.mem ? 'on' : ''}" data-sw="mem"></button></div>
      </div>
      <div class="acts"><button class="btn pri" data-start>対局開始</button></div>`);
    const paint = () => m.querySelectorAll('.seg').forEach((sg) => sg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(st[sg.dataset.k]) === b.dataset.v)));
    paint();
    m.addEventListener('click', (e) => {
      const b = e.target.closest('.seg button');
      if (b) { const k = b.parentNode.dataset.k; st[k] = k === 'side' ? b.dataset.v : +b.dataset.v; sfx.play('tap'); paint(); save(); return; }
      const sw = e.target.closest('[data-sw]');
      if (sw) { st.mem = !st.mem; sw.classList.toggle('on', st.mem); sfx.play('tap'); save(); return; }
      if (e.target.closest('[data-start]')) {
        sfx.play('ok');
        const human = st.side === 'rand' ? (Math.random() < .5 ? 0 : 1) : +st.side;
        go('game', { level, human, mem: st.mem, timer: st.timer });
      }
    });
  }

  // =====================================================================
  // 対局（詰め道場も同じ盤を使う）
  // =====================================================================
  function gameScreen(arg) {
    const G = { dead: false, busy: true, sel: null, legal: [], hist: [], seen: new Map(), stats: { waste: 0, gain: 0, loss: 0 }, assist: false, lastFoe: '', tip: '', hint: null };
    let pz = null;
    if (arg.resume && store.live) {
      const L = store.live;
      Object.assign(G, { mode: 'match', level: L.level, human: L.human, mem: L.mem, timer: L.timer, assist: L.assist, stats: L.stats });
      let s = Z.unpack(L.init);
      G.init = s;
      for (const mv of L.moves) { G.hist.push({ s, m: mv }); s = Z.settle(Z.apply(s, mv)); bump(s); }
      G.s = s;
    } else if (arg.puzzle != null) {
      pz = PUZZLES[arg.puzzle];
      Object.assign(G, { mode: 'puzzle', level: 0, human: 0, mem: false, timer: 0, pzIdx: arg.puzzle, pzLeft: pz.n, pzClean: true });
      G.s = Z.unpack(pz.s); G.init = G.s;
    } else {
      Object.assign(G, { mode: 'match', level: arg.level, human: arg.human, mem: arg.mem, timer: arg.timer });
      G.s = Z.newGame((Math.random() * 2 ** 31) | 0); G.init = G.s;
    }
    const me = G.human, foe = 1 - me, o = OPP[G.level];
    function bump(s) { const k = Z.posKey(s), c = (G.seen.get(k) || 0) + 1; G.seen.set(k, c); return c; }

    const pips = (n) => '<i></i>'.repeat(n);
    const el = h(`<section class="scr" id="scr-game">
      <div class="g-top"><button class="icb" data-a="quit">${IC.back}</button><div class="g-turn"></div><button class="icb" data-a="menu">${IC.more}</button></div>
      <div class="side foe">
        <span class="ava">${pz ? '詰' : o.ava}</span>
        <div class="who">
          <div class="nmrow"><span class="nm">${pz ? '詰め道場　第 ' + (arg.puzzle + 1) + ' 問' : o.role + ' ' + o.nm}</span><span class="sub"></span></div>
          <div class="foe-meters"><div class="breach foe">${pips(3)}</div><div class="energy sm"><span class="num">0</span><span class="pips">${pips(8)}</span></div></div>
        </div>
        <div class="fhand"></div>
      </div>
      <div class="board-wrap"><div id="board"></div></div>
      <div class="info"></div>
      <div class="side me">
        <div class="breach me"><span class="breach-lbl">突破</span>${pips(3)}</div>
        <div class="energy"><span class="num">0</span><span class="pips">${pips(8)}</span></div>
        <button class="passbtn" data-a="pass">溜め<small>+1</small></button>
      </div>
      <div class="hand"></div>
    </section>`);
    app.appendChild(el);
    const view = new U.BoardView($('#board', el), { pov: me, onCell: onCell });
    const infoEl = $('.info', el), handEl = $('.hand', el), fhandEl = $('.fhand', el), subEl = $('.who .sub', el), turnEl = $('.g-turn', el), passEl = $('.passbtn', el);
    const eMe = $('.side.me .energy', el), eFoe = $('.side.foe .energy', el), bMe = $('.breach.me', el), bFoe = $('.breach.foe', el);
    let prevHand = [], prevFoe = [], timerId = 0, timerEnd = 0;
    view.sync(G.s);

    // ----- 表示 -----
    function paintEnergy(box, e, prev) {
      $('.num', box).textContent = e;
      const ps = box.querySelectorAll('.pips i');
      ps.forEach((p, i) => { p.classList.toggle('on', i < e); p.classList.remove('gain'); if (prev != null && i >= prev && i < e) { void p.offsetWidth; p.classList.add('gain'); } });
    }
    let prevE = [null, null], prevD = [0, 0];
    function hud() {
      const s = G.s;
      const em = Z.energy(s, me), ef = Z.energy(s, foe);
      paintEnergy(eMe, em, prevE[0]); paintEnergy(eFoe, ef, prevE[1]);
      prevE = [em, ef];
      const dm = me === 0 ? s.d0 : s.d1, df = me === 0 ? s.d1 : s.d0;
      bMe.querySelectorAll('i').forEach((p, i) => { p.classList.toggle('on', i < dm); if (i < dm && i >= prevD[0]) { p.classList.add('pop'); setTimeout(() => p.classList.remove('pop'), 650); } });
      bFoe.querySelectorAll('i').forEach((p, i) => { p.classList.toggle('on', i < df); if (i < df && i >= prevD[1]) { p.classList.add('pop'); setTimeout(() => p.classList.remove('pop'), 650); } });
      prevD = [dm, df];
      // 手番表示
      const ot = Z.isOT(s);
      turnEl.innerHTML = pz ? `<b>${pz.n * 2 - 1} 手詰</b>　あと ${G.pzLeft} 手` : `<b>${Math.min(s.ply + 1, Z.RULES.maxPly)}</b> / ${Z.RULES.maxPly} 手${ot ? '<span class="ot">決戦 ×2</span>' : ''}`;
      $('small', passEl).textContent = '+' + (ot ? 2 : 1);
      // 自分の手札
      const myTurn = s.turn === me && s.winner < 0 && !G.busy;
      let out = '';
      for (let i = 0; i < 4; i++) {
        const c = s.hq[me * 8 + i], off = Z.COST[c] > em;
        out += `<button class="hc ${c === Z.RAI ? 'spell' : ''} ${off ? 'off' : ''} ${G.sel && G.sel.slot === i ? 'sel' : ''} ${prevHand.length && prevHand[i] !== c ? 'in' : ''}" data-slot="${i}"><span class="cost">${Z.COST[c]}</span><span class="kj">${Z.NAMES[c].k}</span><span class="nmx">${cardName(c)}</span></button>`;
        prevHand[i] = c;
      }
      const nx = s.hq[me * 8 + 4];
      out += `<div class="nextc"><span>つぎ</span><div class="hc ${nx === Z.RAI ? 'spell' : ''}"><span class="cost">${Z.COST[nx]}</span><span class="kj">${Z.NAMES[nx].k}</span></div></div>`;
      handEl.innerHTML = out;
      handEl.style.opacity = myTurn || s.winner >= 0 ? 1 : .8;
      // 相手の手札
      out = '';
      for (let i = 0; i < 5; i++) {
        const c = s.hq[foe * 8 + i];
        if (G.mem) out += `<span class="fc back ${i === 4 ? 'nx' : ''}" data-f="${i}">？</span>`;
        else out += `<span class="fc ${c === Z.RAI ? 'spell' : ''} ${i === 4 ? 'nx' : ''} ${i < 4 && Z.COST[c] > ef ? 'off' : ''} ${i < 4 && prevFoe.length && prevFoe[i] !== c ? 'in' : ''}" data-f="${i}"><i class="cost">${Z.COST[c]}</i>${Z.NAMES[c].k}</span>`;
        prevFoe[i] = c;
      }
      fhandEl.innerHTML = out;
      passEl.disabled = !myTurn || G.legal.indexOf(Z.mk(Z.PASS, 0, 0)) < 0;
      flags();
    }
    // 王手と、突破されそうな駒に印
    function flags() {
      const s = G.s, chk = [], brk = [];
      if (s.winner < 0) {
        if (Z.inCheck(s, 0)) chk.push(s.k0);
        if (Z.inCheck(s, 1)) chk.push(s.k1);
      }
      for (let x = 0; x < Z.W; x++) {
        const a = s.b[x], b = s.b[(Z.H - 1) * Z.W + x];
        if (a && (a >> 4) === 0 && (a & 15) !== Z.KING) brk.push(x);
        if (b && (b >> 4) === 1 && (b & 15) !== Z.KING) brk.push((Z.H - 1) * Z.W + x);
      }
      view.setFlag('chk', chk); view.setFlag('brk', brk);
    }
    function info(html, cls) { infoEl.className = 'info ' + (cls || ''); infoEl.innerHTML = html + (timerId ? '<i class="timer"></i>' : ''); }
    function defaultInfo() {
      const s = G.s;
      if (s.winner >= 0) return info('<div class="tx"><b>終局</b></div>');
      if (s.turn !== me) return info('<div class="tx">相手が考えています…</div>');
      const myRow = me === 0 ? Z.H - 1 : 0;
      let threat = false;
      for (let x = 0; x < Z.W; x++) { const pc = s.b[myRow * Z.W + x]; if (pc && (pc >> 4) === foe && (pc & 15) !== Z.KING) threat = true; }
      if (Z.inCheck(s, me)) return info('<div class="tx"><b>王手！</b>　王を守る手しか指せません。逃げる・取る・間に置く。</div>', 'alert');
      if (threat) return info('<div class="tx"><b>突破される！</b>　最奥の段に入った敵駒を、この手番で取らないと 1 本取られます。</div>', 'alert');
      if (G.tip) return info('<div class="tx">' + G.tip + '</div>', 'tip');
      if (pz) return info(`<div class="tx"><b>${pz.n * 2 - 1} 手詰</b>　あなたの番。あと ${G.pzLeft} 手のうちに王を詰ませる。</div>`, 'turn-me');
      info(`<div class="tx"><b>あなたの番</b>　${G.lastFoe ? '相手は' + G.lastFoe + '。' : '手札か駒をタップ。'}</div>`, 'turn-me');
    }
    function clearSel() {
      G.sel = null; view.clearMarks(); view.arrows(null);
      handEl.querySelectorAll('.hc.sel').forEach((n) => n.classList.remove('sel'));
      eMe.querySelectorAll('.pips i.spend').forEach((n) => n.classList.remove('spend'));
    }

    // ----- 入力 -----
    const myTurn = () => !G.busy && G.s.turn === me && G.s.winner < 0;
    function selectPiece(c) {
      clearSel();
      const ms = G.legal.filter((m) => (Z.kindOf(m) === Z.MOVE || Z.kindOf(m) === Z.SHOOT) && Z.aOf(m) === c);
      G.sel = { cell: c, moves: ms };
      view.mark(c, 'sel');
      for (const m of ms) view.mark(Z.bOf(m), G.s.b[Z.bOf(m)] ? 't-cap' : 't-move');
      sfx.play('select');
      const t = G.s.b[c] & 15;
      info(unitInfoHTML(t), '');
      if (!ms.length) toast(Z.inCheck(G.s, me) ? '王手を外せる手がありません' : 'この駒は今は動かせません');
    }
    function selectCard(slot) {
      const card = G.s.hq[me * 8 + slot], e = Z.energy(G.s, me);
      clearSel();
      info(unitInfoHTML(card), '');
      if (Z.COST[card] > e) {
        const n = handEl.children[slot];
        n.classList.remove('shake'); void n.offsetWidth; n.classList.add('shake');
        sfx.play('ng'); toast('エナジーがあと ' + (Z.COST[card] - e) + ' 足りない');
        return;
      }
      const ms = G.legal.filter((m) => (Z.kindOf(m) === Z.DEPLOY || Z.kindOf(m) === Z.SPELL) && Z.aOf(m) === slot);
      G.sel = { slot: slot, moves: ms };
      handEl.children[slot].classList.add('sel');
      eMe.querySelectorAll('.pips i').forEach((p, i) => p.classList.toggle('spend', i < e && i >= e - Z.COST[card]));
      for (const m of ms) view.mark(Z.bOf(m), card === Z.RAI ? 't-cap' : 't-dep');
      sfx.play('select');
      if (!ms.length) toast(card === Z.RAI ? '狙える駒がありません' : (Z.inCheck(G.s, me) ? '王手を外せる置き場所がありません' : '置けるマスがありません'));
    }
    // 相手の駒：どこに利いているかを見る
    function inspect(c) {
      clearSel();
      const s = G.s, pc = s.b[c], t = Z.clone(s);
      if (Z.inert(pc, c)) {
        view.mark(c, 'sel'); sfx.play('tap');
        info(`<div class="tx"><b>突破待ち</b>　最奥に入った駒はもう動かない。${(pc >> 4) === me ? '次のあなたの番まで生き残れば 1 本。' : 'この手番で取らないと、1 本取られる。'}</div>`, (pc >> 4) === me ? 'tip' : 'alert');
        return;
      }
      t.turn = pc >> 4;
      const buf = new Int32Array(320), n = Z.gen(t, buf);
      view.mark(c, 'sel');
      for (let i = 0; i < n; i++) {
        const m = buf[i], k = Z.kindOf(m);
        if ((k === Z.MOVE || k === Z.SHOOT) && Z.aOf(m) === c) view.mark(Z.bOf(m), 't-foe');
      }
      // 弓は、今は駒がいなくても射程を見せる
      if ((pc & 15) === Z.YUMI) for (const d of Z.SHOTS[pc >> 4][Z.YUMI][c]) view.mark(d, 't-foe');
      sfx.play('tap');
      info(unitInfoHTML(pc & 15, '相手の駒'), '');
    }
    function inspectFoeCard(i) {
      clearSel();
      if (G.mem) { info('<div class="tx"><b>記憶モード</b>　相手の手札は伏せてあります。8 枚で一巡。最近使われた 4 枚は、いま手札にありません。</div>', 'tip'); return; }
      const c = G.s.hq[foe * 8 + i];
      if (c !== Z.RAI) {
        const zone = new Int8Array(Z.N), n = Z.deployZone(G.s, foe, zone);
        for (let k = 0; k < n; k++) view.mark(zone[k], 't-foedep');
      }
      sfx.play('tap');
      info(unitInfoHTML(c, i === 4 ? '相手の次の札' : '相手の手札'), '');
    }
    function onCell(c) {
      const s = G.s, pc = s.b[c];
      if (G.sel && myTurn()) {
        const m = G.sel.moves.find((x) => Z.bOf(x) === c);
        if (m != null) { commit(m); return; }
      }
      if (pc && (pc >> 4) === me && myTurn()) { if (G.sel && G.sel.cell === c) { clearSel(); defaultInfo(); } else selectPiece(c); return; }
      if (pc) { inspect(c); return; }
      if (G.sel || view.marked.length) { clearSel(); defaultInfo(); }
    }
    el.addEventListener('click', (e) => {
      const hc = e.target.closest('.hand .hc[data-slot]');
      if (hc) {
        const slot = +hc.dataset.slot;
        if (!myTurn()) { clearSel(); info(unitInfoHTML(G.s.hq[me * 8 + slot]), ''); return; }
        if (G.sel && G.sel.slot === slot) { clearSel(); defaultInfo(); } else selectCard(slot);
        return;
      }
      const nx = e.target.closest('.nextc');
      if (nx) { clearSel(); info(unitInfoHTML(G.s.hq[me * 8 + 4], '次に来る札'), ''); return; }
      const fc = e.target.closest('.fc');
      if (fc) { inspectFoeCard(+fc.dataset.f); return; }
      const a = e.target.closest('[data-a]');
      if (!a) return;
      if (a.dataset.a === 'pass') { if (myTurn()) commit(Z.mk(Z.PASS, 0, 0)); }
      else if (a.dataset.a === 'quit') quit();
      else if (a.dataset.a === 'menu') menu();
    });

    // ----- 進行 -----
    function persist() {
      if (G.mode !== 'match') return;
      store.live = G.s.winner >= 0 ? null : { mode: 'match', level: G.level, human: me, mem: G.mem, timer: G.timer, assist: G.assist, stats: G.stats, init: Z.pack(G.init), moves: G.hist.map((x) => x.m) };
      save();
    }
    function stopTimer() { if (timerId) { clearInterval(timerId); timerId = 0; } const t = $('.timer', infoEl); if (t) t.remove(); }
    function startTimer() {
      stopTimer();
      if (!G.timer || pz) return;
      timerEnd = Date.now() + G.timer * 1000;
      let lastSec = -1;
      timerId = setInterval(() => {
        const left = timerEnd - Date.now(), bar = $('.timer', infoEl);
        if (bar) { bar.style.transform = `scaleX(${Math.max(0, left / (G.timer * 1000))})`; bar.classList.toggle('low', left < 5000); }
        const sec = Math.ceil(left / 1000);
        if (sec <= 5 && sec !== lastSec && sec > 0) { lastSec = sec; sfx.play('tick'); }
        if (left <= 0) {
          stopTimer();
          if (!myTurn()) return;
          toast('時間切れ');
          const pass = Z.mk(Z.PASS, 0, 0);
          commit(G.legal.indexOf(pass) >= 0 ? pass : G.legal[(Math.random() * G.legal.length) | 0]);
        }
      }, 100);
    }
    function coach() {
      // はじめの数局だけ、その場面で必要なことをひとつ言う
      G.tip = '';
      if (pz) return;
      const s = G.s, T = store.tips;
      let own = 0, deep = false;
      const goal = me === 0 ? 0 : Z.H - 1;
      for (let c = 0; c < Z.N; c++) { const pc = s.b[c]; if (pc && (pc >> 4) === me && (pc & 15) !== Z.KING) { own++; if (((c / Z.W) | 0) === goal) deep = true; } }
      const say = (k, t) => { if (!T[k]) { T[k] = 1; G.tip = t; save(); return true; } return false; };
      if (!own && say('t1', '<b>まず駒を出す</b>　手札をタップ → 光ったマスに置く。置けるのは自陣 2 段と、味方の駒の隣。')) return;
      if (own && say('t2', '<b>駒をタップ</b>すると動ける先が光る。相手の駒や手札をタップすると、相手の利きが見える。')) return;
      if (deep && say('t5', '<b>最奥に入った！</b>　次の自分の番まで生き残れば、突破 1 本。3 本で勝ち。')) return;
      if (Z.energy(s, me) >= 7 && say('t4', '<b>エナジーは 8 で頭打ち</b>　溜めすぎると回復を捨てることになる。')) return;
      if (own >= 2 && s.ply > 12 && say('t6', '<b>前線を押し上げる</b>　前に出た味方の隣にも置ける。奥で援軍を呼べば、一気に攻めが厚くなる。')) return;
    }
    function humanTurn() {
      G.legal = Z.legal(G.s);
      G.busy = false;
      if (G.mode === 'match' && Z.energy(G.s, me) >= Z.RULES.cap) G.stats.waste++;
      coach();
      startTimer();
      hud(); defaultInfo();
    }
    async function aiTurn() {
      G.busy = true; G.legal = [];
      hud(); defaultInfo();
      subEl.innerHTML = '<span class="think">考え中 <i></i><i></i><i></i></span>';
      const t0 = Date.now();
      let r;
      if (pz) r = { m: G.pzReply };
      else r = await brain.ask({ type: 'think', s: Z.pack(G.s), level: G.level, w: o.w, seen: Array.from(G.seen.keys()) });
      const dt = Date.now() - t0;
      if (dt < 700) await wait(700 - dt);
      if (G.dead) return;
      subEl.innerHTML = pz ? '' : 'Lv.' + (G.level + 1);
      if (r.m < 0) { G.s = Z.settle(G.s); return finish(); }
      commit(r.m);
    }
    async function commit(m) {
      const before = G.s, d = Z.describe(before, m), after = Z.settle(Z.apply(before, m));
      const mine = d.player === me;
      G.busy = true; stopTimer(); clearSel(); G.hint = null;
      view.setFlag('last', []);
      G.hist.push({ s: before, m: m });
      if (mine) passEl.disabled = true;
      if (!mine) {
        G.lastFoe = moveText(before, m, me);
        info('<div class="tx"><b>相手</b>　' + G.lastFoe + '</div>');
        if (d.kind === Z.DEPLOY || d.kind === Z.SPELL) {
          const fc = fhandEl.children[d.slot];
          if (fc) { fc.className = 'fc used ' + (d.card === Z.RAI ? 'spell' : ''); fc.innerHTML = `<i class="cost">${d.cost}</i>${Z.NAMES[d.card].k}`; }
          await wait(380);
        }
      }
      if (d.captured && G.mode === 'match') { if (mine) G.stats.gain += Z.COST[d.captured]; else G.stats.loss += Z.COST[d.captured]; }
      await view.play(d, before, after, sfx);
      if (G.dead) return;
      G.s = after;
      if (d.kind !== Z.PASS) view.setFlag('last', d.kind === Z.MOVE ? [d.from, d.to] : [d.to]);
      if (after.winner < 0) {
        const times = bump(after);
        if (times >= 3) { after.winner = 2; after.reason = 'rep'; }
        else if (times === 2 && !pz) toast('同じ局面が 2 回目。3 回で引き分け（千日手）');
        else if (after.ply === Z.RULES.maxPly - 10) toast('あと 10 手で判定');
      }
      hud();
      persist();
      if (after.winner >= 0) return finish();
      if (Z.inCheck(after, after.turn)) { view.banner('王手', after.turn === me ? 'red' : 'gold'); sfx.play('check'); await wait(520); }
      else if (after.ply === Z.RULES.otPly) { view.banner('決戦', 'gold'); sfx.play('ot'); toast('ここからエナジー回復 2 倍'); await wait(700); }
      if (G.dead) return;
      next(mine);
    }
    async function next(afterMine) {
      if (pz && afterMine) {
        // 詰め：まだ詰み筋に乗っているかを確かめてから、相手の最善の受けを指させる
        G.pzLeft--;
        hud();
        const r = await brain.ask({ type: 'puzzle', s: Z.pack(G.s), left: G.pzLeft });
        if (G.dead) return;
        if (!r.ok) return pzFail();
        G.pzReply = r.m;
        return aiTurn();
      }
      if (G.s.turn === me) humanTurn(); else aiTurn();
    }

    // ----- 終局 -----
    function finish() {
      G.busy = true; stopTimer(); clearSel(); hud();
      const s = G.s;
      if (pz) { if (s.winner === me) return pzSolved(); return pzFail(); }
      const res = s.winner === 2 ? 'd' : s.winner === me ? 'w' : 'l';
      const r = store.rec[G.level] || (store.rec[G.level] = { w: 0, l: 0, d: 0 });
      r[res]++;
      let unlocked = false;
      if (res === 'w' && !G.assist && store.beaten.indexOf(G.level) < 0) { store.beaten.push(G.level); unlocked = true; }
      const game = { t: Date.now(), lv: G.level, res: res, why: s.reason, ply: s.ply, side: me, mem: G.mem, timer: G.timer, assist: G.assist, gain: G.stats.gain - G.stats.loss, waste: G.stats.waste, acc: null };
      store.games.unshift(game);
      if (store.games.length > 120) store.games.length = 120;
      store.live = null; markDay(); save();
      const WHY = {
        w: { mate: '王を詰ませた', breach: '3 本、突破した', judge: '判定勝ち（突破の数と盤上の駒）' },
        l: { mate: '王を詰まされた', breach: '3 本、突破された', judge: '判定負け（突破の数と盤上の駒）', resign: '投了' },
        d: { rep: '千日手（同じ局面が 3 回）', judge: '判定：引き分け' },
      };
      info(`<div class="tx"><b>${res === 'w' ? '勝ち' : res === 'l' ? '負け' : '引き分け'}</b>　${WHY[res][s.reason] || ''}</div>`, res === 'w' ? 'tip' : '');
      setTimeout(() => {
        if (G.dead) return;
        sfx.play(res === 'w' ? 'win' : res === 'l' ? 'lose' : 'pass');
        if (res === 'w' && navigator.vibrate) try { navigator.vibrate([30, 40, 30, 40, 80]); } catch (e) { /* 無視 */ }
        const nextOpp = G.level + 1 < OPP.length ? OPP[G.level + 1] : null;
        const m = modal(`<div class="result ${res === 'w' ? 'win' : res === 'l' ? 'lose' : 'draw'}">
          <div class="big">${res === 'w' ? '勝利' : res === 'l' ? '敗北' : '引分'}</div>
          <div class="why">${WHY[res][s.reason] || ''}</div>
          ${unlocked ? `<div class="unlock"><b>${o.role} ${o.nm}</b> を破って <b>${RANKS[G.level]}</b> に。${nextOpp ? '次の相手「' + nextOpp.role + ' ' + nextOpp.nm + '」に挑めます。' : 'これで全員撃破です。'}</div>` : ''}
          ${res === 'w' && G.assist && store.beaten.indexOf(G.level) < 0 ? '<div class="unlock">待った・ヒントを使ったので、昇格は次の対局に持ち越しです。</div>' : ''}
          <div class="statrow">
            <div class="st"><b>${s.ply}</b><span>手数</span></div>
            <div class="st"><b>${game.gain > 0 ? '+' : ''}${game.gain}</b><span>駒の損得</span></div>
            <div class="st"><b>${game.waste}</b><span>満タンの手番</span></div>
          </div>
        </div>
        <div class="acts"><button class="btn pri" data-r="review">振り返る<span class="s" style="font-size:11px;opacity:.7">分かれ目の一手を見る</span></button></div>
        <div class="acts two"><button class="btn" data-r="again">もう一局</button><button class="btn" data-r="select">${unlocked && nextOpp ? '次の相手へ' : '相手を選ぶ'}</button></div>`, { center: true, sticky: true });
        m.addEventListener('click', (e) => {
          const b = e.target.closest('[data-r]');
          if (!b) return;
          sfx.play('tap');
          if (b.dataset.r === 'review') go('review', { hist: G.hist, final: G.s, human: me, level: G.level, game: game });
          else if (b.dataset.r === 'again') go('game', { level: G.level, human: store.setup.side === 'rand' ? 1 - me : me, mem: G.mem, timer: G.timer });
          else go('select');
        });
      }, s.reason === 'resign' ? 100 : 900);
    }
    function pzRecord(clean) {
      const cur = store.pz[pz.id] || {};
      store.pz[pz.id] = { done: true, clean: cur.clean || clean };
      markDay(); save();
    }
    function pzSolved() {
      sfx.play('win');
      view.banner('詰み', 'gold');
      G.pzLeft = Math.max(0, G.pzLeft - 1); hud();
      info('<div class="tx"><b>詰み</b>　相手の王に逃げ場がありません。</div>', 'tip');
      pzRecord(G.pzClean);
      const nextIdx = PUZZLES.findIndex((p, i) => i > G.pzIdx && !(store.pz[p.id] && store.pz[p.id].done));
      setTimeout(() => {
        if (G.dead) return;
        const m = modal(`<div class="result win"><div class="big">正解</div><div class="why">${pz.n * 2 - 1} 手詰　第 ${G.pzIdx + 1} 問${G.pzClean ? '　★ 一発' : ''}</div></div>
          <div class="acts">${nextIdx >= 0 ? '<button class="btn pri" data-r="next">次の問題へ</button>' : ''}</div>
          <div class="acts two"><button class="btn" data-r="retry">もう一度</button><button class="btn" data-r="list">一覧へ</button></div>`, { center: true, sticky: true });
        m.addEventListener('click', (e) => {
          const b = e.target.closest('[data-r]');
          if (!b) return;
          sfx.play('tap');
          if (b.dataset.r === 'next') go('game', { puzzle: nextIdx });
          else if (b.dataset.r === 'retry') go('game', { puzzle: G.pzIdx });
          else go('puzzles');
        });
      }, 1000);
    }
    function pzFail() {
      G.busy = true; G.pzClean = false;
      sfx.play('ng');
      const cur = store.pz[pz.id] || {};
      store.pz[pz.id] = { done: !!cur.done, clean: !!cur.clean, tried: 1 };
      save();
      setTimeout(() => {
        if (G.dead) return;
        const m = modal(`<div class="result lose"><div class="big" style="font-size:44px">不正解</div><div class="why">${G.s.winner === foe ? '逆に詰まされました。' : 'その手では、相手に受けが残ります。'}</div></div>
          <div class="acts two"><button class="btn pri" data-r="retry">もう一度</button><button class="btn" data-r="answer">答えを見る</button></div>
          <div class="acts"><button class="btn ghost" data-r="list">一覧へ</button></div>`, { center: true, sticky: true });
        m.addEventListener('click', (e) => {
          const b = e.target.closest('[data-r]');
          if (!b) return;
          sfx.play('tap');
          if (b.dataset.r === 'retry') go('game', { puzzle: G.pzIdx });
          else if (b.dataset.r === 'answer') { closeModal(); showAnswer(); }
          else go('puzzles');
        });
      }, 500);
    }
    async function showAnswer() {
      G.busy = true;
      G.s = Z.unpack(pz.s); view.setFlag('last', []); view.sync(G.s); G.pzLeft = pz.n; hud();
      info('<div class="tx"><b>答え</b>　手順を再生します。</div>', 'tip');
      await wait(700);
      for (const m of pz.sol) {
        if (G.dead) return;
        const before = G.s, d = Z.describe(before, m), after = Z.settle(Z.apply(before, m));
        info(`<div class="tx"><b>${d.player === me ? 'あなた' : '相手'}</b>　${moveText(before, m, me)}</div>`, d.player === me ? 'tip' : '');
        await view.play(d, before, after, sfx);
        G.s = after;
        view.setFlag('last', d.kind === Z.MOVE ? [d.from, d.to] : d.kind === Z.PASS ? [] : [d.to]);
        if (d.player === me) G.pzLeft--;
        hud();
        await wait(650);
      }
      if (G.dead) return;
      view.banner('詰み', 'gold');
      const m = modal('<h3>答えの手順でした</h3><p>手順を覚えるより、「なぜ相手は受けられないのか」を言葉にしてから、もう一度解いてみてください。</p><div class="acts two"><button class="btn pri" data-r="retry">自分で解く</button><button class="btn" data-r="list">一覧へ</button></div>');
      m.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; if (b.dataset.r === 'retry') go('game', { puzzle: G.pzIdx }); else go('puzzles'); });
    }

    // ----- メニュー -----
    function quit() {
      sfx.play('tap');
      if (pz) return go('puzzles');
      if (G.s.winner < 0 && G.hist.length) toast('中断しました。ホームから再開できます');
      else { store.live = null; save(); }
      go('home');
    }
    function menu() {
      sfx.play('tap');
      const can = myTurn();
      const m = modal(`<h3>${pz ? '詰め道場' : '対局メニュー'}</h3>
        <div class="acts two">
          <button class="btn" data-m="hint" ${can ? '' : 'disabled'}>ヒント</button>
          <button class="btn" data-m="undo" ${can && !pz && G.hist.some((x) => x.s.turn === me) ? '' : 'disabled'}>待った</button>
        </div>
        ${pz ? '' : '<p style="margin:10px 2px 0;font-size:12px" class="dim">ヒント・待ったを使った対局は、勝っても昇格の対象になりません。</p>'}
        <div class="acts"><button class="btn" data-m="units">駒の動きを確認</button><button class="btn" data-m="sound">音：${store.sound ? 'ON' : 'OFF'}</button>
        ${pz ? '<button class="btn" data-m="answer">答えを見る</button>' : `<button class="btn" data-m="resign" ${G.s.winner < 0 ? '' : 'disabled'} style="color:var(--bad)">投了する</button>`}
        <button class="btn ghost" data-m="close">閉じる</button></div>`);
      m.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-m]');
        if (!b) return;
        const a = b.dataset.m;
        sfx.play('tap');
        if (a === 'close') closeModal();
        else if (a === 'sound') { store.sound = !store.sound; sfx.on = store.sound; save(); b.textContent = '音：' + (store.sound ? 'ON' : 'OFF'); }
        else if (a === 'units') unitsModal();
        else if (a === 'resign') { closeModal(); G.s = Z.clone(G.s); G.s.winner = foe; G.s.reason = 'resign'; finish(); }
        else if (a === 'answer') { closeModal(); G.pzClean = false; stopTimer(); showAnswer(); }
        else if (a === 'undo') {
          closeModal();
          // 自分が最後に指した手の直前まで戻す
          let last = null;
          while (G.hist.length) { last = G.hist.pop(); if (last.s.turn === me) break; }
          G.s = last.s;
          G.seen = new Map(); let t = G.init;
          for (const x of G.hist) { t = Z.settle(Z.apply(t, x.m)); bump(t); }
          G.assist = true; G.lastFoe = '';
          view.setFlag('last', []); view.sync(G.s); prevE = [null, null];
          persist(); humanTurn();
          toast('1 手戻しました');
        } else if (a === 'hint') {
          closeModal();
          G.assist = true; if (pz) G.pzClean = false;
          info('<div class="tx">読んでいます…</div>');
          let mv;
          if (pz) mv = (await brain.ask({ type: 'solve', s: Z.pack(G.s), left: G.pzLeft })).m;
          else mv = (await brain.ask({ type: 'hint', s: Z.pack(G.s), seen: Array.from(G.seen.keys()) })).m;
          if (G.dead || !myTurn()) return;
          clearSel();
          // 駒（札）を選んだ状態にしておく。あとは緑のマスをタップすれば指せる
          const d = Z.describe(G.s, mv);
          if (d.kind === Z.MOVE || d.kind === Z.SHOOT) { selectPiece(d.from); view.mark(d.to, 'hint-a'); view.arrows([{ from: d.from, to: d.to, cls: 'arrow-best' }]); }
          else if (d.kind !== Z.PASS) { selectCard(d.slot); view.mark(d.to, 'hint-a'); }
          info('<div class="tx"><b>ヒント</b>　' + moveText(G.s, mv, me) + '</div>', 'tip');
          persist();
        }
      });
    }

    // ----- 開始 -----
    hud();
    if (pz) { subEl.textContent = ''; }
    else subEl.textContent = 'Lv.' + (G.level + 1);
    (async function start() {
      await wait(250);
      if (G.dead) return;
      if (!arg.resume && !pz) { view.banner(me === 0 ? 'あなたが先手' : 'あなたが後手', 'blue'); await wait(900); }
      if (G.dead) return;
      if (G.s.winner >= 0) return finish();
      if (G.s.turn === me) humanTurn(); else aiTurn();
    })();
    return { leave() { G.dead = true; stopTimer(); } };
  }
  function unitsModal() {
    const list = [Z.KING, Z.HEI, Z.SEI, Z.TATE, Z.YARI, Z.YUMI, Z.KI, Z.TAKA, Z.RYU, Z.RAI];
    const m = modal('<h3>駒の動き</h3><div class="scroll" style="min-height:0">' + list.map(unitRow).join('') + '</div><div class="acts"><button class="btn" data-x>閉じる</button></div>');
    $('[data-x]', m).onclick = closeModal;
  }
  function unitRow(t) {
    const c = t === Z.KING || t === Z.SEI ? '' : `<span class="c">コスト ${Z.COST[t]}</span>`;
    return `<div class="unit card-box">${U.moveDiagram(t)}<div><div class="nm"><span class="kj">${Z.NAMES[t].k}</span>${cardName(t)}${c}</div><div class="ds">${U.DESC[t]}</div></div></div>`;
  }

  // =====================================================================
  // 振り返り
  // =====================================================================
  function reviewScreen(arg) {
    const { hist, human } = arg;
    const states = hist.map((x) => x.s).concat([arg.final]);
    let pos = 0, data = null, dead = false;
    const el = h(`<section class="scr">
      <div class="bar"><button class="icb" data-back>${IC.back}</button><h2>振り返り</h2><span class="icb"></span></div>
      <div class="rv-head">
        <div class="ringm"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="none" stroke="#232C39" stroke-width="4.5"/><circle class="arc" cx="20" cy="20" r="16" fill="none" stroke="#E8C56D" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="0 101"/></svg><b>…</b></div>
        <div class="rv-sum"><div class="t">読みの精度</div><div class="tags"><span class="dim" style="font-size:12px">あなたの手を 1 手ずつ読み直しています…</span></div></div>
      </div>
      <div class="graph"></div>
      <div class="rv-board"><div id="rvb"></div></div>
      <div class="rv-note"></div>
      <div class="rv-nav"><button class="btn" data-n="pk">‹ 山場</button><button class="btn" data-n="p">◀</button><div class="pos"></div><button class="btn" data-n="n">▶</button><button class="btn" data-n="nk">山場 ›</button></div>
    </section>`);
    app.appendChild(el);
    const view = new U.BoardView($('#rvb', el), { pov: human });
    const noteEl = $('.rv-note', el), posEl = $('.pos', el), graphEl = $('.graph', el);
    const grade = (loss, same) => (same || loss < 15 ? ['最善', 'g'] : loss < 80 ? ['好手', 'b'] : loss < 220 ? ['疑問手', 'y'] : ['悪手', 'r']);
    const byPly = () => { const m = {}; if (data) for (const d of data) m[d.ply] = d; return m; };
    const keyPlies = () => (data ? data.filter((d) => d.loss >= 80).map((d) => d.ply) : []);

    function show(p) {
      pos = Math.max(0, Math.min(states.length - 1, p));
      const s = states[pos];
      view.clearMarks(); view.sync(s);
      posEl.textContent = pos < hist.length ? (pos + 1) + ' / ' + hist.length + ' 手目' : '終局';
      const arrows = [];
      const addMove = (m, cls, mk) => {
        const d = Z.describe(s, m);
        if (d.kind === Z.MOVE || d.kind === Z.SHOOT) arrows.push({ from: d.from, to: d.to, cls: cls });
        else if (d.kind !== Z.PASS) view.mark(d.to, mk);
      };
      if (pos >= hist.length) {
        view.arrows(null);
        noteEl.innerHTML = '<div><b>終局図</b>　' + (arg.final.winner === 2 ? '引き分け' : arg.final.winner === human ? 'あなたの勝ち' : '相手の勝ち') + '</div>';
      } else {
        const m = hist[pos].m, mine = s.turn === human, d = byPly()[pos];
        let txt = `<b>${mine ? 'あなた' : '相手'}</b>　${moveText(s, m, human)}`;
        if (mine && d) {
          const g = grade(d.loss, d.best === m);
          txt += `　<span class="tag ${g[1]}">${g[0]}</span>`;
          if (d.best !== m && d.loss >= 80) {
            const why = d.bestSc >= 2400 ? '詰み・突破で勝ちがあった' : d.sc <= -2400 ? 'この手だと負けが決まる' : '評価の差 ' + Math.round(d.loss);
            txt += `<br>最善は <b>${moveText(s, d.best, human)}</b>（${why}）`;
            addMove(d.best, 'arrow-best', 'hint-a');
          }
          addMove(m, d.loss >= 80 ? 'arrow-me' : 'arrow-foe', 'sel');
        } else addMove(m, 'arrow-foe', 'sel');
        view.arrows(arrows);
        noteEl.innerHTML = '<div>' + txt + '</div>';
      }
      const cur = $('.cur', graphEl);
      if (cur) cur.setAttribute('x', (pos / Math.max(1, hist.length)) * 100 - .4);
    }
    function drawGraph() {
      const n = Math.max(1, hist.length), pts = data.map((d) => [d.ply / n * 100, 27 - Math.max(-1, Math.min(1, d.sc / 900)) * 24]);
      let path = '', dots = '';
      pts.forEach((p, i) => { path += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); });
      // 横に引き伸ばされても丸く見えるよう、長さゼロの線の丸い端で点を打つ
      data.forEach((d, i) => { if (d.loss >= 80) dots += `<line x1="${pts[i][0]}" y1="${pts[i][1]}" x2="${pts[i][0] + .01}" y2="${pts[i][1]}" stroke="${d.loss >= 220 ? '#F0624F' : '#F4B23F'}" stroke-width="${d.loss >= 220 ? 8 : 6}" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`; });
      graphEl.innerHTML = `<svg viewBox="0 0 100 54" preserveAspectRatio="none"><line x1="0" y1="27" x2="100" y2="27" stroke="#2D394A" stroke-width=".6" stroke-dasharray="2 2"/><path d="${path}" fill="none" stroke="#5BB9E2" stroke-width="1.4" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>${dots}<rect class="cur" x="0" y="0" width=".8" height="54" fill="#ECE9E1" opacity=".7"/></svg>`;
    }
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-back]')) { sfx.play('tap'); go('home'); return; }
      const g = e.target.closest('.graph');
      if (g) { const r = g.getBoundingClientRect(); show(Math.round((e.clientX - r.left) / r.width * hist.length)); return; }
      const b = e.target.closest('[data-n]');
      if (!b) return;
      sfx.play('tap');
      const a = b.dataset.n, ks = keyPlies();
      if (a === 'p') show(pos - 1);
      else if (a === 'n') show(pos + 1);
      else if (a === 'pk') { const c = ks.filter((k) => k < pos); if (c.length) show(c[c.length - 1]); else toast('これより前に山場はありません'); }
      else if (a === 'nk') { const c = ks.filter((k) => k > pos); if (c.length) show(c[0]); else toast(data ? 'これより後に山場はありません' : 'まだ読み直しています'); }
    });
    show(0);

    const items = [];
    hist.forEach((x, i) => { if (x.s.turn === human) items.push({ ply: i, s: Z.pack(x.s), m: x.m }); });
    const ringB = $('.ringm b', el), arc = $('.ringm .arc', el);
    brain.ask({ type: 'review', items: items }, (p) => { if (!dead) ringB.innerHTML = Math.round(p * 100) + '<small>%</small>'; ringB.style.color = 'var(--ink3)'; }).then((out) => {
      if (dead) return;
      data = out;
      const cnt = { g: 0, b: 0, y: 0, r: 0 };
      let acc = 0;
      for (const d of out) { const m = items.find((x) => x.ply === d.ply).m; cnt[grade(d.loss, d.best === m)[1]]++; acc += Math.exp(-d.loss / 260); }
      acc = out.length ? Math.round(acc / out.length * 100) : 0;
      ringB.style.color = ''; ringB.innerHTML = acc + '<small>%</small>';
      arc.setAttribute('stroke-dasharray', (acc / 100 * 100.5).toFixed(1) + ' 101');
      $('.tags', el).innerHTML = `<span class="tag g">最善 ${cnt.g}</span><span class="tag b">好手 ${cnt.b}</span><span class="tag y">疑問手 ${cnt.y}</span><span class="tag r">悪手 ${cnt.r}</span>`;
      if (arg.game && store.games.indexOf(arg.game) >= 0) { arg.game.acc = acc; arg.game.bad = cnt.r; save(); }
      drawGraph();
      const ks = keyPlies();
      // いちばん差の大きかった一手から見せる
      let worst = null;
      for (const d of out) if (d.loss >= 80 && (!worst || d.loss > worst.loss)) worst = d;
      show(worst ? worst.ply : 0);
      if (!ks.length) toast('大きな見落としはありませんでした');
    });
    return { leave() { dead = true; } };
  }

  // =====================================================================
  // 詰め道場
  // =====================================================================
  function puzzlesScreen() {
    const secs = [1, 2, 3].map((n) => {
      const list = PUZZLES.map((p, i) => ({ p, i })).filter((x) => x.p.n === n);
      if (!list.length) return '';
      const done = list.filter((x) => store.pz[x.p.id] && store.pz[x.p.id].done).length;
      const first = list.find((x) => !(store.pz[x.p.id] && store.pz[x.p.id].done));
      return `<div class="pz-sec"><h4><b>${n * 2 - 1} 手詰</b>${['1 手で王を詰ませる', '自分・相手・自分。相手の受けを読む', '5 手先の詰みを読み切る'][n - 1]}<span>${done} / ${list.length}</span></h4><div class="pz-grid">` +
        list.map((x, k) => { const st = store.pz[x.p.id] || {}; return `<button class="pz ${st.done ? 'done' : ''} ${st.clean ? 'clean' : ''} ${first && first.i === x.i ? 'cur' : ''}" data-i="${x.i}">${k + 1}</button>`; }).join('') + '</div></div>';
    }).join('');
    const el = h(`<section class="scr"><div class="bar"><button class="icb" data-back>${IC.back}</button><h2>詰め道場</h2><span class="icb"></span></div>
      <div class="list scroll" style="display:block"><p class="muted" style="font-size:13px;line-height:1.75;margin:4px 2px 0">手前があなた。決められた手数のうちに、相手の王を詰ませてください。相手はいちばん粘る受けを選びます。★ は一発正解の印。</p>${secs || '<p class="dim">問題を準備中です。</p>'}</div></section>`);
    app.appendChild(el);
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-back]')) { sfx.play('tap'); go('home'); return; }
      const b = e.target.closest('.pz');
      if (b) { sfx.play('tap'); go('game', { puzzle: +b.dataset.i }); }
    });
  }

  // =====================================================================
  // 遊び方
  // =====================================================================
  function figState(pieces) {
    const s = new Z.State();
    for (const p of pieces) { const c = p[3] * Z.W + p[2]; s.b[c] = p[0] | (p[1] << 4); if (p[0] === Z.KING) { if (p[1] === 0) s.k0 = c; else s.k1 = c; } }
    return s;
  }
  function howtoScreen(arg) {
    const el = h(`<section class="scr"><div class="bar"><button class="icb" data-back>${IC.back}</button><h2>遊び方</h2><span class="icb"></span></div>
      <div class="doc scroll">
        <h3><i>1</i>勝ち方は 2 つ</h3>
        <p><b>詰み</b> — 相手の王を、逃げ場のない王手に追い込む。<br><b>突破</b> — 相手の最奥の段に駒を入れ、相手の 1 手番を生き延びさせる。これを <b>3 本</b>。</p>
        <div class="fig"><div id="fig1"></div></div><div class="cap">点線が突破ライン。奥まで届いた「槍」は、次の自分の番まで取られなければ 1 本になる</div>
        <h3><i>2</i>1 手番にできるのは 1 つだけ</h3>
        <p><b>配置</b>（手札を盤に置く）・<b>移動</b>（駒を動かす。相手の駒に重ねれば取れる）・<b>溜め</b>（何もしない）。置いた駒が動けるのは次の手番から。</p>
        <h3><i>3</i>エナジー</h3>
        <p>手番が来るたびに <b>+1</b>、上限は <b>8</b>。配置にはコストぶんのエナジーを払う。移動は無料。使い切ると受けの駒が出せない。溜めすぎると回復を捨てる。</p>
        <h3><i>4</i>置ける場所 — 前線</h3>
        <p>置けるのは<b>自陣（手前の 2 段）</b>と、<b>味方の駒の前後左右</b>。前に出た駒は援軍の足場になる。逆に、足場の駒を取られると攻めは途切れる。</p>
        <div class="fig"><div id="fig2"></div></div><div class="cap">緑が置けるマス。前に出た「盾」のまわりにも置ける</div>
        <h3><i>5</i>手札は 8 枚でひと回り</h3>
        <p>手札は 4 枚。使った札は山の底へ行き、次の札が入る。<b>相手が何を使ったかを覚えていれば、次に何が来るかがわかる</b>。相手の「雷」が山に戻った直後は、大駒を出す好機。</p>
        <h3><i>6</i>決戦と判定</h3>
        <p>61 手目からはエナジー回復が <b>2 倍</b>。100 手で決着がつかなければ、突破の数、次に盤上の駒のコスト合計で判定。</p>
        <h3><i>7</i>駒</h3>
        <p>駒のふちの印が動ける向き。<b>●</b> は 1 マス、<b>▲</b> は何マスでも。</p>
        ${[Z.KING, Z.HEI, Z.SEI, Z.TATE, Z.YARI, Z.YUMI, Z.KI, Z.TAKA, Z.RYU, Z.RAI].map(unitRow).join('')}
        <h3><i>8</i>うまくなるコツ</h3>
        <p>・相手の駒や手札をタップすると、利きと置けるマスが見える。指す前に必ず確かめる。<br>・取る駒より、取られる駒のコストが高ければ得。「1 で 3 を取る」を積み重ねる。<br>・王手と突破を同時にかけると、相手は片方しか受けられない。</p>
        <div style="height:10px"></div>
        <button class="btn pri" data-go style="width:100%">${arg && arg.first ? '最初の相手と対局する' : '対局する'}</button>
      </div></section>`);
    app.appendChild(el);
    const f1 = new U.BoardView($('#fig1', el), { pov: 0 });
    f1.sync(figState([[Z.KING, 0, 2, 6], [Z.KING, 1, 3, 0], [Z.YARI, 0, 0, 0], [Z.HEI, 1, 2, 1], [Z.TATE, 0, 1, 3], [Z.KI, 1, 3, 2], [Z.HEI, 0, 3, 5]]));
    f1.setFlag('brk', [0]);
    const f2 = new U.BoardView($('#fig2', el), { pov: 0 });
    const s2 = figState([[Z.KING, 0, 2, 6], [Z.KING, 1, 2, 0], [Z.TATE, 0, 3, 3], [Z.YUMI, 1, 1, 1]]);
    f2.sync(s2);
    const zone = new Int8Array(Z.N), n = Z.deployZone(s2, 0, zone);
    for (let i = 0; i < n; i++) f2.mark(zone[i], 't-dep');
    store.tips.seenHowto = 1; save();
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-back]')) { sfx.play('tap'); go('home'); }
      else if (e.target.closest('[data-go]')) { sfx.play('ok'); go('select'); }
    });
  }

  // =====================================================================
  // 記録
  // =====================================================================
  function recordsScreen() {
    const g = store.games, w = g.filter((x) => x.res === 'w').length, l = g.filter((x) => x.res === 'l').length;
    const accs = g.filter((x) => x.acc != null).slice(0, 10);
    const accAvg = accs.length ? Math.round(accs.reduce((a, x) => a + x.acc, 0) / accs.length) : null;
    const clean = PUZZLES.filter((p) => store.pz[p.id] && store.pz[p.id].clean).length;
    let days = '';
    for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days += `<i class="${store.days[dayKey(d)] ? 'on' : ''} ${i === 0 ? 'td' : ''}"></i>`; }
    const WHY = { mate: '詰み', breach: '突破', judge: '判定', resign: '投了', rep: '千日手' };
    const rows = g.slice(0, 40).map((x) => {
      const d = new Date(x.t);
      return `<div class="hist"><span class="r ${x.res}">${x.res === 'w' ? '勝' : x.res === 'l' ? '負' : '分'}</span><span class="m">${OPP[x.lv].role} ${OPP[x.lv].nm}<small>${d.getMonth() + 1}/${d.getDate()}　${WHY[x.why] || ''}・${x.ply} 手${x.mem ? '・記憶' : ''}${x.timer ? '・早指し' : ''}${x.assist ? '・補助あり' : ''}</small></span><span class="a">${x.acc != null ? '精度 ' + x.acc + '%' : ''}</span></div>`;
    }).join('');
    const el = h(`<section class="scr"><div class="bar"><button class="icb" data-back>${IC.back}</button><h2>記録</h2><span class="icb"></span></div>
      <div class="doc scroll">
        <div class="rec-grid">
          <div class="st"><b>${rankName()}</b><span>段位</span></div>
          <div class="st"><b>${w}<small style="font-size:13px;color:var(--ink3)"> - ${l}</small></b><span>勝ち - 負け</span></div>
          <div class="st"><b>${streak()}</b><span>連続日数</span></div>
          <div class="st"><b>${accAvg == null ? '—' : accAvg + '<small style="font-size:12px">%</small>'}</b><span>読みの精度</span></div>
          <div class="st"><b>${pzDone()}<small style="font-size:13px;color:var(--ink3)">/${PUZZLES.length}</small></b><span>詰め正解</span></div>
          <div class="st"><b>${clean}</b><span>うち一発 ★</span></div>
        </div>
        <h3 style="font-size:15px;margin-top:20px">この 2 週間</h3>
        <div class="days">${days}</div>
        <h3 style="font-size:15px;margin-top:20px">対局の履歴</h3>
        ${rows || '<p class="dim">まだ対局がありません。</p>'}
        <p class="dim" style="font-size:11.5px;margin-top:18px">「読みの精度」は、対局後に「振り返る」を開いた局だけ記録されます。記録はこの端末の中にだけ残ります。</p>
        <button class="btn sm ghost" data-reset style="margin:6px auto 0;color:var(--ink3)">記録をすべて消す</button>
      </div></section>`);
    app.appendChild(el);
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-back]')) { sfx.play('tap'); go('home'); return; }
      if (e.target.closest('[data-reset]')) {
        const m = modal('<h3>記録をすべて消しますか</h3><p>段位・戦績・詰めの進み具合が消えます。元に戻せません。</p><div class="acts two"><button class="btn" data-x>やめる</button><button class="btn" data-ok style="color:var(--bad)">消す</button></div>', { center: true });
        $('[data-x]', m).onclick = closeModal;
        $('[data-ok]', m).onclick = () => { store = fresh(); save(); sfx.on = true; go('home'); };
      }
    });
  }

  const SCREENS = { home: homeScreen, select: selectScreen, game: gameScreen, review: reviewScreen, puzzles: puzzlesScreen, howto: howtoScreen, records: recordsScreen };

  // 最初のタップで音を起こす（ブラウザの決まり）
  document.addEventListener('pointerdown', function once() { sfx.ensure(); document.removeEventListener('pointerdown', once); });
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
  self.__zensen = { go, store: () => store };
  go('home');
})();
