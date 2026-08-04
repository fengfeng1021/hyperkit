/* ==========================================================================
   Diff Warden - motion layer

   ONE authored moment, not a set of effects: THE STRIKE.

   一條缺陷從串流裡被解析出來的那一瞬間，探傷帶上對應的座標被畫上一個圈記、
   一條引線從圈記垂下來、缺陷列在引線末端落定。這一瞬間同時說了三件事：
   找到了（回饋）、在哪個檔案的哪一行（階層）、清單正在被建立（狀態轉換）。
   它取代了旋轉載入指示器——使用者不是在等，是在看儀器工作。

   其餘每一段都能用一句話說出它傳達什麼，說不出來的都不在這裡：

     上架   bed -> deck。量測網格不重繪，角標從試件台飛到探傷帶四角。
            狀態轉換：同一台儀器，現在裝上了東西。
     游標   位置就是進度。值來自 SSE 真實推進，動效只做 450ms 的平滑。
     擊點   招牌時刻，見上。
     落定   缺陷列從 y:-10 卡進定位，極小 overshoot，像零件卡進槽。
     收尾   游標走到右緣消失，每一欄的缺陷數由左至右亮起，
            略過條展開，歷史刻度尺長出今天這一根——而它比上一根矮。
     命中   你建立的規則今天做了工：命中數滾一格，該列左緣亮 1.2 秒。

   規則：
   - 內容預設可見。這一層整層拆掉（GSAP 沒載到、CDN 被擋、reduced-motion）
     站台完全一樣可用：strip.animate 維持 false，每一筆都以終值畫出，
     跨檔案弧線是永久靜態的，缺陷列直接插入。少的是過程，不是資訊。
   - prefers-reduced-motion 走 gsap.matchMedia() 的 reduce 分支：什麼都不裝。
   - 線性只有兩處，都是「等速量測」本身：範例的掃描掃過探傷帶，
     以及收尾時游標走完最後那一段。給掃描緩動會把儀器變成裝飾。
   - canvas 不開第二個 requestAnimationFrame：所有 fx 值是純物件，
     gsap 推它們，gsap.ticker 每幀最多重畫一次。
   ========================================================================== */

const gsap = window.gsap;
const W = window.warden;

if (gsap && W) boot();

function boot() {
  /* 指數型 ease-out，從已經可見的狀態出發。這是全站預設。 */
  gsap.defaults({ ease: 'power3.out', duration: 0.42 });

  const mm = gsap.matchMedia();
  mm.add({
    reduce: '(prefers-reduced-motion: reduce)',
    ok: '(prefers-reduced-motion: no-preference)',
  }, (ctx) => {
    if (ctx.conditions.reduce) return undefined;   // 一個 tween 都不建立
    const live = install();
    return () => live.teardown();
  });
}

/* --------------------------------------------------------------- helpers */

const EASE_SETTLE = 'back.out(1.4)';   /* 對應 --ease-settle：極小 overshoot */
const D = {
  stage: 0.52,   /* --dur-4      */
  strike: 0.42,  /* --dur-strike */
  row: 0.26,     /* --dur-row    */
  cursor: 0.45,  /* --dur-cursor */
  count: 0.32,   /* --dur-count  */
};

function tok(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function num(text) {
  const m = String(text).replace(/[,\s]/g, '').match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/* ============================================================== install */

function install() {
  const strip = () => W.strip;
  const s0 = strip();
  if (s0) s0.animate = true;

  /* ------------------------------------------------------ canvas repaint
     fx 是純物件，gsap 只負責推數字；每幀最多重畫一次，不整張重繪以外的成本。 */
  let dirty = false;
  const markDirty = () => { dirty = true; };
  const tick = () => {
    if (!dirty) return;
    dirty = false;
    const s = strip();
    if (s) s.draw();
  };
  gsap.ticker.add(tick);

  const trash = [];                 // 要在 teardown 清掉的 DOM
  const timelines = new Set();      // 要在 teardown 收掉的時間軸

  /* 收在集合裡等 teardown 收掉，順手在自然播完時放手。
     既有的 onComplete 要保留：這裡曾經把它蓋掉，範例重播就永遠不會收尾。 */
  function own(tl) {
    timelines.add(tl);
    const prev = tl.eventCallback('onComplete');
    tl.eventCallback('onComplete', function own$done() {
      timelines.delete(tl);
      if (prev) prev.apply(this, arguments);
    });
    return tl;
  }

  /* ==================================================== 1. 上架（bed -> deck）
     量測網格從頭到尾都是同一層背景，切換時不重繪——這句話賣的是
     「同一台儀器，現在裝上了東西」。角標是唯一會動的東西：它們從試件台的
     四個邊界飛到探傷帶的四個角，落地的同時 canvas 長出自己的角標。 */

  W.stageDriver = (stage, apply) => {
    const from = document.body.dataset.stage;
    if (stage !== 'deck' || from !== 'bed') { apply(); return; }

    const copy = document.querySelector('.bed-copy');
    const corners = [...document.querySelectorAll('.bed-frame .corner')];
    const rects = corners.map((c) => c.getBoundingClientRect());

    const tl = own(gsap.timeline());
    if (copy) {
      // 標題先走：它已經把話講完了，讓位給要裝上去的東西
      tl.to(copy, { autoAlpha: 0, y: -8, duration: 0.2, ease: 'power2.in' });
    }
    tl.add(() => {
      apply();
      if (copy) gsap.set(copy, { clearProps: 'opacity,visibility,transform' });
      requestAnimationFrame(() => flyCorners(rects));
    });
  };

  function flyCorners(rects) {
    const s = strip();
    const c = s && s.c;
    const r = c ? c.getBoundingClientRect() : null;

    const tl = own(gsap.timeline({ onUpdate: markDirty }));

    // 兩條軌從左右進來。起始不是 autoAlpha:0——動效失敗時內容仍然看得見。
    const rl = document.querySelector('.rail-l');
    if (rl) tl.from(rl, { x: -24, autoAlpha: 0.6, duration: D.stage, clearProps: 'transform,opacity,visibility' }, 0);
    const rr = document.querySelector('.rail-r');
    // < 1024px 的右軌是靠 transform 收起來的抽屜，那條 transform 不能被借走
    if (rr && window.innerWidth >= 1024) {
      tl.from(rr, { x: 24, autoAlpha: 0.6, duration: D.stage, clearProps: 'transform,opacity,visibility' }, 0.06);
    }

    if (!r || !r.width || rects.length !== 4) { if (s) { s.cornerFx = 1; markDirty(); } return; }

    const L = parseFloat(tok('--corner-len')) || 12;
    const dst = [
      [r.left, r.top], [r.right - L, r.top],
      [r.left, r.bottom - L], [r.right - L, r.bottom - L],
    ];
    const keys = ['tl', 'tr', 'bl', 'br'];

    s.cornerFx = 0;
    markDirty();

    const flies = rects.map((src, i) => {
      const el = document.createElement('span');
      el.className = 'cfly';
      el.dataset.c = keys[i];
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
      trash.push(el);
      gsap.set(el, { x: src.left, y: src.top });
      return { el, i };
    });

    flies.forEach(({ el, i }) => {
      tl.to(el, { x: dst[i][0], y: dst[i][1], duration: D.stage, ease: 'power3.out' }, 0);
    });
    // canvas 在角標抵達的同時長出自己的角標，然後飛過去的那四個就沒有存在的理由了
    tl.to(s, { cornerFx: 1, duration: 0.2, ease: 'power2.out', onUpdate: markDirty }, 0.34);
    tl.add(() => {
      flies.forEach(({ el }) => {
        el.remove();
        const k = trash.indexOf(el);
        if (k >= 0) trash.splice(k, 1);
      });
    });
  }

  /* ==================================================== 2. 掃描游標
     位置是真實的：值來自 SSE 已收到的 token 數。動效只負責把一個抖動的
     訊號磨平成 450ms 的追隨，不製造進度。 */

  const prox = { v: 0 };
  let quick = null;

  W.progressDriver = (p) => {
    const s = strip();
    if (!s) return;
    if (p === null || p === undefined) {
      gsap.killTweensOf(prox);
      quick = null;
      s.setProgress(null);
      return;
    }
    if (quick === null) {
      prox.v = p;
      s.progress = p;
      markDirty();
      quick = gsap.quickTo(prox, 'v', {
        duration: D.cursor,
        ease: 'power3.out',
        onUpdate: () => { s.progress = prox.v; markDirty(); },
      });
    }
    quick(p);
  };

  /* ==================================================== 3. 擊點（招牌時刻） */

  const queue = [];
  let pumping = false;
  const rowAnim = new Map();   // defect.id -> { at, dur }

  function enqueue(d) {
    queue.push(d);
    if (!pumping) pump();
  }

  function pump() {
    if (!queue.length) { pumping = false; return; }
    pumping = true;
    // 同時到達的缺陷排隊執行；佇列塞住時壓到 40ms 並跳過十字準星那一步
    const rush = queue.length > 6;
    strike(queue.shift(), rush);
    gsap.delayedCall(rush ? 0.04 : 0.09, pump);
  }

  function strike(d, rush) {
    const s = strip();
    if (!s) return;
    const fx = s.fxOf(d.id);
    const p = s.pointFor(d);
    const cross = !!(d.related && d.related.length);
    const tl = own(gsap.timeline({ onUpdate: markDirty }));

    if (p) {
      // 0.00 游標所在欄位閃一次亮度，60ms 起、然後回落
      const cols = [d.file, ...(d.related || []).map((r) => r.file)]
        .map((f) => (s.colFor(f) ? s.colFxOf(f) : null))
        .filter(Boolean);
      if (cols.length) {
        tl.to(cols, { flash: 1, duration: 0.06, ease: 'power2.out' }, 0)
          .to(cols, { flash: 0, duration: 0.36, ease: 'power3.out' }, 0.06);
      }

      // 0.02 圈記描繪出來：setLineDash + lineDashOffset，半徑依嚴重度
      tl.fromTo(fx, { ring: 0 }, { ring: 1, duration: 0.26, ease: 'power3.out' }, 0.02);

      // 跨檔案先把兩個檔案接起來。這 220ms 是「跨檔案」唯一的視覺證明，
      // 也是這個產品跟「叫 agent 審查一下」的差別本身。
      if (cross) tl.fromTo(fx, { arc: 0 }, { arc: 1, duration: 0.22, ease: 'power2.inOut' }, 0.02);
      else fx.arc = 1;

      // 0.12 十字準星（塞車時跳過，直接給終值）
      if (rush) fx.hair = 1;
      else tl.fromTo(fx, { hair: 0 }, { hair: 1, duration: 0.08, ease: 'power2.out' }, 0.12);

      // 0.16 引線從圈記垂到探傷帶底緣，指向清單。
      // < 768px 的探傷帶降到 64px 且可橫向捲動，引線在那裡沒有可以指的距離，
      // 而且會被捲動位移帶錯位置，所以那個斷點不畫它——圈記與清單都還在。
      if (!rush && window.innerWidth >= 768) tl.add(() => dropLeader(p), 0.16);
    } else {
      fx.ring = 1; fx.hair = 1; fx.arc = 1;
    }

    // 0.22 缺陷列在引線末端落定
    tl.add(() => landRow(d.id), 0.22);
    // 0.30 嚴重度標記做一次亮度脈衝。一次，不循環。
    tl.add(() => pulseMark(d.id), 0.30);
  }

  function dropLeader(p) {
    const s = strip();
    const c = s && s.c;
    const stage = document.getElementById('stage-main');
    if (!c || !stage) return;
    const wrap = c.parentElement;
    const left = wrap.offsetLeft + c.offsetLeft + Math.round(p.x);
    const top = wrap.offsetTop + c.offsetTop + Math.round(p.y);
    const bottom = wrap.offsetTop + c.offsetTop + c.offsetHeight + 18;

    const el = document.createElement('div');
    el.className = 'leader';
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.height = Math.max(10, bottom - top) + 'px';
    stage.appendChild(el);
    trash.push(el);

    const kill = () => {
      el.remove();
      const k = trash.indexOf(el);
      if (k >= 0) trash.splice(k, 1);
    };
    own(gsap.timeline({ onComplete: kill }))
      .fromTo(el, { clipPath: 'inset(0% 0% 100% 0%)' },
        { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.18, ease: 'power4.out' })
      // 引線是動態的關聯線索，圈記才是留下來的紀錄，所以它淡出、圈記留著
      .to(el, { autoAlpha: 0, duration: 0.16, ease: 'power2.in' }, 0.26);
  }

  /* 清單每收到一條就整份重排（跨檔案永遠排最前面），所以落定中的那一列會被
     換成新節點。這裡記下起點與長度，重排後把剩下的那一段接回新節點上，
     動畫不會斷在半路，也不會把一條已經在畫面上的列重播一次。 */
  function landRow(id) {
    const el = document.querySelector(`.drow[data-id="${CSS.escape(id)}"]`);
    if (!el) return;
    rowAnim.set(id, { at: performance.now(), dur: D.row });
    gsap.fromTo(el, { y: -10, autoAlpha: 0.4 },
      { y: 0, autoAlpha: 1, duration: D.row, ease: EASE_SETTLE, clearProps: 'transform,opacity,visibility' });
  }

  function pulseMark(id) {
    const el = document.querySelector(`.drow[data-id="${CSS.escape(id)}"] .dmark`);
    if (!el) return;
    gsap.fromTo(el, { filter: 'brightness(2.4)' },
      { filter: 'brightness(1)', duration: 0.14, ease: 'power2.out', clearProps: 'filter' });
  }

  W.hooks.onStrike = enqueue;

  W.hooks.onListRendered = () => {
    if (!rowAnim.size) return;
    const now = performance.now();
    [...rowAnim.entries()].forEach(([id, rec]) => {
      const t = (now - rec.at) / 1000;
      if (t >= rec.dur) { rowAnim.delete(id); return; }
      const el = document.querySelector(`.drow[data-id="${CSS.escape(id)}"]`);
      if (!el) { rowAnim.delete(id); return; }
      const k = t / rec.dur;
      gsap.fromTo(el, { y: -10 * (1 - k), autoAlpha: 0.4 + 0.6 * k },
        { y: 0, autoAlpha: 1, duration: rec.dur - t, ease: 'power3.out',
          clearProps: 'transform,opacity,visibility' });
    });
  };

  /* ==================================================== 4. 收尾
     沒有 confetti、沒有勾勾、沒有音效。儀器做完事情就是安靜下來。 */

  W.hooks.onFinish = () => {
    const s = strip();
    if (!s) return;
    const tl = own(gsap.timeline({ onUpdate: markDirty }));

    // 1. 游標走到右緣後消失。這一段是線性的：掃描是等速量測。
    if (s.progress !== null && s.progress >= 0) {
      gsap.killTweensOf(prox);
      quick = null;
      prox.v = s.progress;
      tl.to(prox, {
        v: 1, duration: 0.2, ease: 'none',
        onUpdate: () => { s.progress = prox.v; markDirty(); },
      }, 0);
    }
    tl.add(() => { s.setProgress(null); quick = null; });

    // 2. 每一欄的缺陷數由左至右亮起：每一欄都量過了
    const hot = s.cols
      .filter((c) => s.defects.some((d) => d.file === c.file))
      .map((c) => s.colFxOf(c.file));
    if (hot.length) {
      tl.fromTo(hot, { count: 0.45 },
        { count: 1, duration: 0.24, stagger: 0.03, ease: 'power2.out' }, '<')
        .fromTo(hot, { flash: 0.5 },
          { flash: 0, duration: 0.4, stagger: 0.03, ease: 'power3.out' }, '<');
    }

    // 3. 略過條展開：你的規則今天做了工
    const sup = document.getElementById('suppressed');
    if (sup && !sup.hidden) {
      tl.fromTo(sup, { height: 0, overflow: 'hidden' },
        { height: 'auto', duration: D.row, ease: 'power3.out', clearProps: 'height,overflow' }, '<0.05');
    }

    // 4. 歷史刻度尺長出今天這一根。留存迴圈的視覺句點：它比上一根矮。
    const bars = document.querySelectorAll('#hist .hist-b:last-child i');
    if (bars.length) {
      tl.from(bars, {
        scaleY: 0, transformOrigin: 'bottom', duration: 0.42, ease: EASE_SETTLE,
        clearProps: 'transform',
      }, '<0.08');
    }
  };

  /* ==================================================== 5. 略過條手動展開 */

  W.hooks.onSupOpen = () => {
    const b = document.getElementById('sup-body');
    if (!b || b.hidden) return;
    gsap.fromTo(b, { height: 0, overflow: 'hidden' },
      { height: 'auto', duration: 0.18, ease: 'power3.out', clearProps: 'height,overflow' });
  };

  /* ==================================================== 6. 規則命中回饋
     沒有命中的規則不做任何動作。它只是今天沒事做。 */

  const ruleSnap = new Map();
  W.hooks.onRulesRendered = () => {
    const accent = tok('--accent');
    document.querySelectorAll('.rule-row[data-fp]').forEach((row) => {
      const fp = row.dataset.fp;
      const el = row.querySelector('.rule-hits');
      if (!fp || !el) return;
      const to = num(el.textContent);
      if (to === null) return;
      const was = ruleSnap.has(fp) ? ruleSnap.get(fp) : to;
      ruleSnap.set(fp, to);
      if (to <= was) return;

      const o = { v: was };
      gsap.to(o, {
        v: to, duration: D.count, ease: 'power3.out', snap: { v: 1 },
        onUpdate: () => { el.textContent = `命中 ${Math.round(o.v)}`; },
        onComplete: () => { el.textContent = `命中 ${to}`; },
      });
      gsap.fromTo(row, { borderLeftColor: accent },
        { borderLeftColor: 'rgba(0,0,0,0)', duration: 1.2, ease: 'power2.in',
          clearProps: 'borderLeftColor' });
    });
  };

  /* ==================================================== 7. 數字滾動
     計數是回饋，不是裝飾：它從上一個真值滾到下一個真值，中途每一格都是
     整數。用 MutationObserver 監看，所以 main.js 不必知道動效存在。 */

  const watchers = ['defect-count', 'sup-count', 'sup-rules', 'rules-count']
    .map(watchNumber).filter(Boolean);

  function watchNumber(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const o = { v: num(el.textContent) || 0 };
    let written = num(el.textContent);
    const obs = new MutationObserver(() => {
      const cur = num(el.textContent);
      if (cur === null || cur === written) return;   // 這一次是我們自己寫回去的
      const from = written === null ? cur : written;
      written = cur;
      if (from === cur) return;
      o.v = from;
      gsap.to(o, {
        v: cur, duration: D.count, ease: 'power3.out', snap: { v: 1 }, overwrite: true,
        onUpdate: () => { written = Math.round(o.v); el.textContent = String(written); },
        onComplete: () => { written = cur; el.textContent = String(cur); },
      });
    });
    obs.observe(el, { childList: true, characterData: true, subtree: true });
    return obs;
  }

  /* ==================================================== 8. 範例報告的重播
     訪客沒有 API key，所以他看到招牌時刻的唯一機會就是這裡。
     掃描游標等速走過探傷帶，游標經過哪一欄，那一欄的缺陷才浮出來——
     跟真的審查完全同一條路徑，只是進度來自時間而不是 token。 */

  let replay = null;
  let replayWait = null;

  W.replayDriver = (list, emit, done) => {
    cancelReplay();
    // 等上架轉場走完再量欄位座標：deck 還沒顯示時 canvas 寬度是 0
    replayWait = gsap.delayedCall(0.58, () => {
      replayWait = null;
      runReplay(list, emit, done);
    });
  };

  function runReplay(list, emit, done) {
    const s = strip();
    if (!s || !list.length) { done(); return; }
    s.draw();
    const w = s.c.clientWidth || 1;
    const items = list
      .map((d) => { const p = s.pointFor(d); return { d, x: p ? p.x : 0 }; })
      .sort((a, b) => a.x - b.x);

    const total = 4.2;
    const cur = { v: 0 };
    replay = own(gsap.timeline({
      onUpdate: () => { s.progress = cur.v; markDirty(); },
      onComplete: () => { replay = null; done(); },
    }));
    replay.to(cur, { v: 1, duration: total, ease: 'none' }, 0);
    items.forEach((it) => {
      replay.call(() => emit(it.d), null, total * Math.min(0.97, (it.x + 8) / w));
    });
    replay.to({}, { duration: 0.5 }, total);   // 讓最後一條的擊點播完再收尾
  }

  /* 中途離開範例（選了自己的資料夾、按離開範例）時，佇列裡還沒輪到的那幾條
     圈記停在 ring: 0。把它們推到終值：一個被打斷的動畫不可以吃掉一條缺陷。 */
  function cancelReplay() {
    if (replayWait) { replayWait.kill(); replayWait = null; }
    if (replay) { replay.kill(); replay = null; }
    queue.length = 0;
    const s = strip();
    if (s) s.settle();
  }
  W.cancelReplay = cancelReplay;

  /* ==================================================== teardown */

  return {
    teardown() {
      gsap.ticker.remove(tick);
      cancelReplay();
      pumping = false;
      timelines.forEach((tl) => tl.kill());
      timelines.clear();
      gsap.killTweensOf(prox);
      quick = null;
      watchers.forEach((o) => o.disconnect());
      rowAnim.clear();
      ruleSnap.clear();
      trash.splice(0).forEach((el) => el.remove());
      document.querySelectorAll('.leader, .cfly').forEach((el) => el.remove());
      // 半路上的東西一律推到終值：拆掉動效不能拆掉資訊
      document.querySelectorAll('.drow, .rule-row, #suppressed, #sup-body, #hist .hist-b i')
        .forEach((el) => {
          gsap.killTweensOf(el);
          gsap.set(el, { clearProps: 'transform,opacity,visibility,height,overflow,filter,borderLeftColor' });
        });
      W.stageDriver = null;
      W.progressDriver = null;
      W.replayDriver = null;
      W.cancelReplay = null;
      W.hooks.onStrike = null;
      W.hooks.onListRendered = null;
      W.hooks.onRulesRendered = null;
      W.hooks.onFinish = null;
      W.hooks.onSupOpen = null;
      const s = strip();
      if (s) { s.animate = false; s.settle(); }
    },
  };
}
