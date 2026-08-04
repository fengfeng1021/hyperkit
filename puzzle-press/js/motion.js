/* ==========================================================================
   Puzzle Press - motion layer

   ONE authored moment, not a set of effects: 套版 / REGISTRATION.

   買家付錢買的不是「產生了 100 題」，是「這一本可以送印」。所以招牌時刻不在
   進場，也不在生成的過程裡，而在最後一題落定、證明成立的那一格。

   它是一條線，不是四個特效：

     開印   空版框四邊中點的四個套印十字被摘下來，留在落版台的四個邊上。
            版框沒有了，機台的記號還在。狀態轉換：這台機器現在正在跑。
     上版   每完成一題，那張紙由左往右被刷過一次（clip-path，240ms
            power2.out）。滾筒是機械等速的，指數尾巴給得太重就變裝飾了。
            回饋：這一題真的被產生了。
     驗證   右下角 3px 實心方塊換成 8px 套印十字時 scale 1.8 → 1。
            回饋：這一題複驗過了。
     套版   四個十字飛向落版台中心、旋轉 90 度、鎖成一個；縮圖矩陣在這 0.64 秒
            內 blur(0) → 1.2px → 0。blur 在這個站只出現這一次，它的工作是景深：
            把眼睛從縮圖推到那個記號上。階層：驗印單才是這個產品在賣的東西。
     落章   活下來的那一個十字飛到驗印單的驗印章上，收縮、交棒給驗印章本體。
            成果與證明在視覺上被接起來，這是整段動效的論點。
     翻牌   驗證列由上而下逐列 xPercent -4 → 0，洋紅底閃一次。
            狀態轉換：預估翻成實測。

   線性只有一處，因為它是資料不是動效：走紙標尺（與被它帶動的驗印章圓環）。
   它綁在真實完成數上，給它緩動就是在說謊。press-btn 的 --progress 同一個
   道理，但它留在 CSS 的 `transition: width 100ms linear` 裡，這樣沒有這一層
   的時候它照樣是線性的。

   規則：
   - 內容預設可見。這一層整層拆掉（GSAP 沒載到、CDN 被擋、reduced-motion）
     產品完全一樣可用：縮圖直接畫出來、標記直接是最終形狀、驗印章直接是完整
     的圓與十字、驗證列直接全部是 check。少的是過程，不是資訊。
   - prefers-reduced-motion 走 gsap.matchMedia() 的 reduce 分支，一個 tween
     都不建立。
   - 零 plugin。只有 gsap.min.js。這裡沒有 scroll telling，圓環用
     strokeDasharray 自己畫，不需要 DrawSVGPlugin。
   ========================================================================== */

import { fx } from './fx.js';

const gsap = window.gsap;
if (gsap) boot();

/* --------------------------------------------------------------- constants */

const D = {
  roll: 0.24,   /* --dur-roll  一張紙被滾筒刷過 */
  mark: 0.12,   /* --dur-1     驗證標記閃動 */
  reg: 0.64,    /* --dur-reg   套版收攏 */
  land: 0.44,   /* 十字飛向驗印章 */
  row: 0.28,    /* 驗證列翻牌 */
  drawer: 0.32, /* --dur-3     清單庫抽屜 */
  park: 0.52,   /* 十字從版框移到落版台邊 */
};

/* .stamp-ring 是 <circle r="25">，所以周長是這個數，不是猜的 */
const RING_C = 2 * Math.PI * 25;

function boot() {
  /* 指數型 ease-out，從已經可見的狀態出發。這是全站預設。 */
  gsap.defaults({ ease: 'power4.out', duration: 0.32 });

  const mm = gsap.matchMedia();
  mm.add(
    {
      reduce: '(prefers-reduced-motion: reduce)',
      ok: '(prefers-reduced-motion: no-preference)',
    },
    (ctx) => {
      if (ctx.conditions.reduce) return undefined; /* 一個 tween 都不建立 */
      const live = install();
      return () => live.teardown();
    },
  );
}

/* ----------------------------------------------------------------- helpers */

function tok(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function px(name) {
  return parseFloat(tok(name)) || 0;
}

/** 同一個 token 的零透明度版本。顏色仍然只有一個來源，沒有裸 hex。 */
function faded(hex) {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return 'rgba(0,0,0,0)';
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0)`;
}

function centreOf(node) {
  const r = node.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** 落版台在畫面上真正看得到的那一塊。
    < 1024px 的落版台會長到幾千 px 高並且整頁捲動，用元素本身的 rect 會把
    十字丟到視窗外面，所以這裡先跟視窗取交集。 */
function plateBox() {
  const host = document.getElementById('plate-body');
  if (!host) return null;
  const r = host.getBoundingClientRect();
  if (r.width < 120) return null;
  const inset = 14;
  const top = Math.max(r.top, 8) + inset;
  const bottom = Math.min(r.bottom, window.innerHeight - px('--status-h') - 8) - inset;
  if (bottom - top < 120) return null;
  return { left: r.left + inset, right: r.right - inset, top, bottom };
}

/** 四邊中點，順序對齊 #frame 裡的 .reg-t / .reg-b / .reg-l / .reg-r */
function edgeMidpoints(box) {
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  return [
    { x: cx, y: box.top },
    { x: cx, y: box.bottom },
    { x: box.left, y: cy },
    { x: box.right, y: cy },
  ];
}

/* ================================================================= install */

function install() {
  const timelines = new Set();
  let flyers = [];
  let parkDst = null;
  let parkToken = 0;
  let ringArmed = false;
  let resizeTimer = null;

  function own(tl) {
    timelines.add(tl);
    const prev = tl.eventCallback('onComplete');
    tl.eventCallback('onComplete', function own$done() {
      timelines.delete(tl);
      if (prev) prev.apply(this, arguments);
    });
    return tl;
  }

  /* ================================================ 1. 上版（每完成一題一次）
     由左往右刷過去，像滾筒經過紙面。縮圖的預設狀態是完全可見的：起點由
     GSAP 從 inset(0 100% 0 0) 給，CSS 裡沒有任何等 JS 來救的初始值。 */

  fx.sheet = (node) => {
    gsap.fromTo(
      node,
      { clipPath: 'inset(0 100% 0 0)' },
      {
        clipPath: 'inset(0 0% 0 0)',
        duration: D.roll,
        ease: 'power2.out',
        overwrite: 'auto',
        clearProps: 'clipPath',
      },
    );
  };

  /* ================================================ 2. 驗證閃動
     形狀已經換好了（3px 實心方塊 → 8px 套印十字，DOM 換 class）。
     動效只負責讓那一下被看見。 */

  fx.verified = (mark) => {
    gsap.fromTo(
      mark,
      { scale: 1.8 },
      { scale: 1, duration: D.mark, ease: 'power3.out', overwrite: 'auto', clearProps: 'transform' },
    );
  };

  /* ================================================ 3. 走紙標尺（線性，資料）
     值來自真實完成數。這裡唯一做的事是把每題一跳的階梯磨成 0.22 秒的等速
     追隨，不製造進度。驗印章的圓環掛在同一個值上：生成期畫半圈，驗證期畫
     另外半圈，所以那個圓環是量到的，不是演出來的。 */

  const rulerV = { v: 0 };
  const ringV = { v: 0 };
  let rulerQuick = null;
  let ringQuick = null;
  /* 這兩個節點在整個生命週期裡不會被換掉，而這兩個 painter 一秒跑 60 次 */
  const fillNode = document.getElementById('ruler-fill');
  const ringNode = document.querySelector('.stamp-ring');

  function paintFill() {
    if (fillNode) gsap.set(fillNode, { scaleX: rulerV.v });
  }

  function paintRing() {
    if (ringArmed && ringNode) gsap.set(ringNode, { strokeDashoffset: RING_C * (1 - ringV.v) });
  }

  fx.ruler = (k, phase) => {
    if (!rulerQuick) {
      rulerQuick = gsap.quickTo(rulerV, 'v', { duration: 0.22, ease: 'none', onUpdate: paintFill });
      ringQuick = gsap.quickTo(ringV, 'v', { duration: 0.22, ease: 'none', onUpdate: paintRing });
    }
    rulerQuick(k);
    const target = phase === 'verifying' ? 0.5 + k * 0.5 : phase === 'done' ? 1 : k * 0.5;
    ringQuick(target);
  };

  /* ================================================ 4. 四個套印十字
     版框上的那四個記號被摘下來留在落版台邊。它們不是新的裝飾，是同一個
     東西換了位置：版框沒有了，機台的記號還在。 */

  function makeFlyer(at) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'reg-fly');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-registration');
    svg.appendChild(use);
    document.body.appendChild(svg);
    gsap.set(svg, { x: at.x, y: at.y, transformOrigin: '50% 50%' });
    return svg;
  }

  function clearFlyers() {
    flyers.forEach((el) => {
      gsap.killTweensOf(el);
      el.remove();
    });
    flyers = [];
    parkDst = null;
  }

  function armStamp() {
    const ring = document.querySelector('.stamp-ring');
    const cross = document.querySelector('.stamp-cross');
    const count = document.getElementById('stamp-count');
    if (!ring) return;
    gsap.killTweensOf([ring, cross, count].filter(Boolean));
    ringArmed = true;
    ringV.v = 0;
    gsap.set(ring, { strokeDasharray: RING_C, strokeDashoffset: RING_C });
    if (cross) gsap.set(cross, { autoAlpha: 0 });
    if (count) gsap.set(count, { autoAlpha: 0 });
  }

  function stampParts() {
    return [
      document.querySelector('.stamp-ring'),
      document.querySelector('.stamp-cross'),
      document.getElementById('stamp-count'),
    ].filter(Boolean);
  }

  /** 把驗印章推回 CSS 的預設狀態：完整的圓、完整的十字、看得見的頁數。
      這裡不用 clearProps：GSAP 碰過 SVG 之後會自己補一個 transform-origin
      回去，逐項移除才是真的乾淨。 */
  function bareStamp(nodes) {
    nodes.forEach((n) => {
      [
        'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'visibility',
        'transform', 'transform-origin', 'translate', 'rotate', 'scale',
      ].forEach((p) => n.style.removeProperty(p));
    });
  }

  function disarmStamp() {
    ringArmed = false;
    const nodes = stampParts();
    if (!nodes.length) return;
    gsap.killTweensOf(nodes);
    bareStamp(nodes);
  }

  fx.runStart = () => {
    clearFlyers();
    /* 十字現在還在版框上，先量它們；下一格畫面版框就被縮圖矩陣換掉了 */
    const src = Array.from(document.querySelectorAll('#frame .reg')).map(centreOf);
    armStamp();
    const token = (parkToken += 1);
    /* 等矩陣接手之後再量落版台：< 1024px 的落版台在空版框狀態下只有一張紙那麼
       高，量到的邊會落在半路上，而記號要停的是機台的邊 */
    requestAnimationFrame(() => {
      if (token !== parkToken) return;
      const box = plateBox();
      if (!box) return;
      parkDst = edgeMidpoints(box);
      flyers = parkDst.map((p, i) => makeFlyer(src[i] || p));
      gsap.to(flyers, {
        x: (i) => parkDst[i].x,
        y: (i) => parkDst[i].y,
        duration: D.park,
        ease: 'power3.out',
      });
    });
  };

  /** 取消、換種子、回到空版框：記號歸位，沒有儀式。 */
  fx.runStop = () => {
    parkToken += 1;
    if (!flyers.length && !ringArmed) return;
    clearFlyers();
    disarmStamp();
    ringV.v = 0;
  };

  /* ================================================ 5. 套版（招牌時刻）
     這一段是整個站唯一被編排的時間軸。上面每一拍都是它的素材。 */

  fx.runDone = ({ clean }) => {
    /* 收攏的中心就是那四個記號自己圍出來的中心，不是重新量一次落版台：
       它們站在哪裡，就往哪裡的中間收 */
    parkToken += 1; /* 跑得夠快時停版那一格還沒到，別讓它事後才長出四個十字 */
    const stamp = document.getElementById('stamp');
    const sr = stamp ? stamp.getBoundingClientRect() : null;
    /* 要模糊的是那個捲動視窗，不是裡面的矩陣：258 頁的矩陣有一萬 px 高，
       filter 會逼瀏覽器把整個元素光柵化，不是只有看得到的那一塊。
       < 1024px 的落版台不裁切（捲的是整頁），那裡沒有安全的模糊對象，
       這一拍就不做景深。 */
    const stage = document.getElementById('plate-body');
    const depth = stage && stage.clientHeight <= window.innerHeight * 1.2 ? stage : null;
    const regSize = px('--reg-size') || 12;
    /* 提早一格宣告，讓合成器在第一張模糊畫面被要求之前先把圖層準備好 */
    if (depth) gsap.set(depth, { willChange: 'filter' });
    const tl = own(gsap.timeline());

    /* A. 四個十字飛向落版台中心，旋轉 90 度，鎖成一個。
          三個在半路淡出：套版就是四個記號重合成一個。 */
    if (flyers.length && parkDst) {
      const cx = (parkDst[2].x + parkDst[3].x) / 2;
      const cy = (parkDst[0].y + parkDst[1].y) / 2;
      tl.to(flyers, { x: cx, y: cy, rotation: 90, scale: 1.7, duration: D.reg, ease: 'power4.out' }, 0);
      tl.to(flyers.slice(1), { autoAlpha: 0, duration: 0.22, ease: 'power2.in' }, 0.4);
    }

    /* B. 景深。全站唯一的一次 blur，0.32 進 0.32 出，把眼睛推到記號上。 */
    if (depth) {
      tl.fromTo(depth, { filter: 'blur(0px)' }, { filter: 'blur(1.2px)', duration: 0.32, ease: 'power2.out' }, 0)
        .to(depth, { filter: 'blur(0px)', duration: 0.32, ease: 'power2.in' }, 0.32)
        .set(depth, { clearProps: 'filter,willChange' }, 0.66);
    }

    /* C. 活下來的那一個飛到驗印單的驗印章上。
          放大到圓環的直徑：飛過去的是記號，落下來的是證明。 */
    const lead = flyers[0];
    const landed = lead && sr && sr.width > 0;
    if (landed) {
      tl.to(
        lead,
        {
          x: sr.left + sr.width / 2,
          y: sr.top + sr.height / 2,
          rotation: 90,
          scale: (1.43 * sr.width) / regSize,
          duration: D.land,
          ease: 'power4.out',
        },
        0.5,
      );
      /* 收縮進驗印章的同時交棒。這 0.18 秒是「成果」變成「證明」的接縫。 */
      tl.to(lead, { scale: sr.width / regSize, autoAlpha: 0, duration: 0.18, ease: 'power2.in' }, 0.94);
    }

    const t = landed ? 0.96 : 0.5;
    tl.add(() => lockStamp(clean), t);
    /* D. 驗印單走到驗證區。這一段是階層，不是禮貌：使用者付錢買的是那幾列
          結果，而在 900px 高的視窗裡它們本來在摺線以下。 */
    tl.add(() => revealVerdicts(), t + 0.24);
    tl.add(() => flipVerdicts(), t + 0.5);
    tl.add(() => clearFlyers(), t + 0.24);
  };

  /** 把驗證區捲進視野。捲不動（面板沒有溢出、或本來就看得到）就不捲。 */
  function revealVerdicts() {
    const scroller = document.querySelector('.check-scroll');
    const rows = document.getElementById('verdict-rows');
    if (!scroller || !rows) return;
    const max = scroller.scrollHeight - scroller.clientHeight;
    if (max < 8) return;
    const head = rows.previousElementSibling || rows;
    const want = scroller.scrollTop + head.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16;
    const to = Math.max(0, Math.min(max, want));
    if (Math.abs(to - scroller.scrollTop) < 8) return;
    const at = { v: scroller.scrollTop };
    own(gsap.timeline()).to(at, {
      v: to,
      duration: 0.5,
      ease: 'power3.inOut',
      onUpdate: () => {
        scroller.scrollTop = at.v;
      },
    });
  }

  /** 驗印章接手：圓環收口、十字落下、頁數彈進來。 */
  function lockStamp(clean) {
    const ring = document.querySelector('.stamp-ring');
    const cross = document.querySelector('.stamp-cross');
    const count = document.getElementById('stamp-count');
    if (!ring) return;
    const tl = own(gsap.timeline());
    gsap.killTweensOf(ringV);
    ringV.v = 1;
    tl.to(ring, { strokeDashoffset: 0, duration: 0.3, ease: 'power3.out' }, 0);
    if (cross) {
      tl.fromTo(
        cross,
        { autoAlpha: 0, scale: 1.5 },
        {
          autoAlpha: 1,
          scale: 1,
          duration: 0.26,
          /* --ease-stamp：落下時的微幅過衝。有問題的那一本不過衝，
             它只是安靜地落定，因為那不是一件值得慶祝的事。 */
          ease: clean ? 'back.out(1.6)' : 'power3.out',
          svgOrigin: '28 28',
        },
        0.06,
      );
    }
    if (count) {
      tl.fromTo(
        count,
        { autoAlpha: 0, scale: 0.7 },
        { autoAlpha: 1, scale: 1, duration: 0.28, ease: 'back.out(1.6)', svgOrigin: '28 28' },
        0.14,
      );
    }
    tl.add(() => {
      ringArmed = false;
      bareStamp(stampParts());
    });
  }

  /* ================================================ 6. 驗印單翻牌
     預估翻成實測。逐列 0.05 stagger，因為它們是一列一列被量到的。 */

  function flipVerdicts() {
    const rows = Array.from(document.querySelectorAll('#verdict-rows .spec'));
    if (!rows.length) return;
    const wash = faded(tok('--magenta-wash'));
    const lit = tok('--magenta-wash');
    gsap.fromTo(
      rows,
      { xPercent: -4 },
      { xPercent: 0, duration: D.row, ease: 'power4.out', stagger: 0.05, clearProps: 'transform' },
    );
    rows.forEach((row, i) => {
      /* 反白的那一列本來就已經是警示狀態，不再閃一次洋紅底：
         印刷廠不會為了一版壞掉的東西放煙火。 */
      if (row.classList.contains('is-flagged')) return;
      gsap.fromTo(
        row,
        { backgroundColor: lit },
        {
          backgroundColor: wash,
          duration: 0.2,
          delay: i * 0.05,
          ease: 'power2.out',
          clearProps: 'backgroundColor',
          onStart: () => row.classList.add('is-turning'),
          onComplete: () => row.classList.remove('is-turning'),
        },
      );
    });
  }

  /* ================================================ 7. 清單庫抽屜
     覆蓋，不是 modal：可以一邊看落版台一邊挑清單。所以它從它貼著的那一邊
     滑出來，而不是從畫面中央長出來。 */

  function drawerFrom() {
    return window.matchMedia('(max-width: 1023px)').matches ? 100 : -100;
  }

  fx.drawerOpen = (node) => {
    gsap.killTweensOf(node);
    gsap.fromTo(
      node,
      { xPercent: drawerFrom() },
      { xPercent: 0, duration: D.drawer, ease: 'power4.out', clearProps: 'transform' },
    );
  };

  fx.drawerClose = (node, done) => {
    gsap.killTweensOf(node);
    gsap.to(node, {
      xPercent: drawerFrom(),
      duration: 0.22,
      ease: 'power2.in',
      onComplete: () => {
        gsap.set(node, { clearProps: 'transform' });
        done();
      },
    });
  };

  /* ================================================ 8. 就地確認列
     它插在落版台上方，會把整個矩陣往下推。動的是高度而不是位移，因為要被
     看懂的正是「有東西插進來了」這件事，不是它自己好不好看。 */

  fx.inlineIn = (row) => {
    gsap.fromTo(
      row,
      { height: 0, autoAlpha: 0, overflow: 'hidden' },
      {
        height: 'auto',
        autoAlpha: 1,
        duration: 0.2,
        ease: 'power3.out',
        clearProps: 'height,overflow,opacity,visibility',
      },
    );
  };

  /* ================================================ 9. 暫態確認（toast）
     它只說「剛剛那件事做完了」。所以它從動作發生的那一側進來，時間到就走，
     不需要任何人回應。 */

  fx.toastIn = (node) => {
    gsap.from(node, { x: 16, autoAlpha: 0, duration: 0.24, ease: 'power3.out', clearProps: 'transform,opacity,visibility' });
  };

  fx.toastOut = (node, done) => {
    gsap.to(node, { x: 12, autoAlpha: 0, duration: 0.2, ease: 'power2.in', onComplete: done });
  };

  /* ================================================ 視窗改變大小
     記號停在落版台的邊上，那條邊會移動。收攏進行中就不要動它們。 */

  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!flyers.length) return;
      if (flyers.some((el) => gsap.isTweening(el))) return;
      const box = plateBox();
      if (!box) return;
      parkDst = edgeMidpoints(box);
      flyers.forEach((el, i) => gsap.set(el, { x: parkDst[i].x, y: parkDst[i].y }));
    }, 120);
  }
  window.addEventListener('resize', onResize, { passive: true });

  /* ================================================ teardown
     拆掉動效不可以拆掉資訊：半路上的每一個東西都被推回它的預設值。 */

  return {
    teardown() {
      window.removeEventListener('resize', onResize);
      clearTimeout(resizeTimer);
      timelines.forEach((tl) => tl.kill());
      timelines.clear();
      clearFlyers();
      disarmStamp();
      document.querySelectorAll('.toast, .inline-confirm').forEach((el) => {
        gsap.killTweensOf(el);
        gsap.set(el, { clearProps: 'height,overflow,transform,opacity,visibility' });
      });
      gsap.killTweensOf([rulerV, ringV]);
      rulerQuick = null;
      ringQuick = null;

      document.querySelectorAll('.thumb, .thumb-mark, #plate-body, #verdict-rows .spec, .drawer').forEach((el) => {
        gsap.killTweensOf(el);
        gsap.set(el, { clearProps: 'clipPath,transform,opacity,visibility,filter,willChange,backgroundColor' });
      });
      document.querySelectorAll('.is-turning').forEach((el) => el.classList.remove('is-turning'));
      const fill = document.getElementById('ruler-fill');
      if (fill) gsap.set(fill, { scaleX: rulerV.v });

      Object.keys(fx).forEach((k) => {
        fx[k] = null;
      });
    },
  };
}
