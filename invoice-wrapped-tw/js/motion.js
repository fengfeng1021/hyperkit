/* motion.js
   動效層。這一層只做四件事，每一件都能用一句話說出它傳達什麼：

   1. 招牌時刻（第 3 屏「你的第二個家」）——敘事。
      一整年的店家散開，只留下你去最多次的那一家，它長大、報出次數、
      再把那個次數攤成一圈年輪；捲走時整圈收成一顆油墨點，落到下一個數字上。
   2. 進紙口掃描光帶——狀態。這台機器現在在待命、在讀、在解析、成功、還是卡住。
   3. 六個數字的列印——回饋。資料剛剛被讀進來了，數字是「印」出來的，不是換上去的。
   4. 圖卡的重繪掃描線——回饋。按下產生 PNG 之後，它真的在重畫。

   規則：
   - 內容預設可見。GSAP 掛掉、CDN 被擋、reduced-motion，這一層整層不裝，站台照常運作。
   - prefers-reduced-motion 走 gsap.matchMedia() 的 reduce 分支：
     第 3 屏直接是終值（置中的泡泡、數字、一整圈可查詢的年輪），使用者少的是過程不是內容。
   - 大量元素一律「一次 tween 打在物件陣列上 + 每幀一次 canvas 重繪」，不開幾百個獨立 tween。 */

import { $$, token, rampColor, fitCanvas, stripePattern } from './ui.js';
import { hasData, on } from './state.js';

const TAU = Math.PI * 2;

/**
 * @param {{ review: any, bubbles: any }} deps
 */
export function initMotion({ review, bubbles }) {
  const gsap = window.gsap;
  if (!gsap) return null;                       // CDN 沒載到就整層不裝
  const ScrollTrigger = window.ScrollTrigger;
  if (ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  const mm = gsap.matchMedia();

  mm.add({
    reduce: '(prefers-reduced-motion: reduce)',
    ok: '(prefers-reduced-motion: no-preference)',
  }, (ctx) => {
    const reduce = !!ctx.conditions.reduce;
    const root = document.documentElement;
    root.classList.toggle('motion-on', !reduce);

    const teardown = [];
    if (reduce) {
      // 只把第 3 屏擺成終值版面，不建立任何 tween 與 ScrollTrigger
      teardown.push(installSignature({ gsap, ScrollTrigger, review, bubbles, reduce: true }));
    } else {
      teardown.push(installFeedScan(gsap));
      teardown.push(installDataArrival(gsap, ScrollTrigger));
      teardown.push(installCardScan(gsap));
      teardown.push(installSignature({ gsap, ScrollTrigger, review, bubbles, reduce: false }));
    }

    return () => {
      root.classList.remove('motion-on');
      teardown.forEach((fn) => { if (typeof fn === 'function') fn(); });
    };
  });

  return { mm };
}

/* ============================================================
   1. 進紙口掃描光帶
   一句話：這條光帶就是機器的狀態指示——待命時來回掃、拖曳時鎖在進紙緣、
   解析時單向吐紙、成功時掃出畫面、失敗時停在半路。
   GSAP 接管前先讓 CSS 的 @keyframes scan 停掉（.motion-on 那條規則），
   否則兩套會同時跑。位移一律用 y（transform），不動 top。
   ============================================================ */

function installFeedScan(gsap) {
  const slot = document.getElementById('feed-slot');
  const band = slot && slot.querySelector('.feed-scan');
  if (!slot || !band) return null;

  let tl = null;
  let hovered = false;

  function travel() {
    return Math.max(24, slot.clientHeight - 2);
  }

  function apply() {
    const name = slot.getAttribute('data-state') || 'idle';
    const disabled = slot.getAttribute('aria-disabled') === 'true';
    if (tl) { tl.kill(); tl = null; }
    gsap.killTweensOf(band);
    const d = travel();

    if (disabled) {
      gsap.set(band, { y: d * 0.5, autoAlpha: 0, scaleY: 1 });
      return;
    }

    switch (name) {
      case 'dragover':
        // 鎖在進紙緣：紙要從這條線進去
        tl = gsap.timeline();
        tl.to(band, { y: 0, autoAlpha: 1, duration: 0.2, ease: 'power3.out' })
          .fromTo(band, { scaleY: 1 }, { scaleY: 2.4, duration: 0.5, ease: 'sine.inOut', repeat: -1, yoyo: true }, 0.1);
        break;

      case 'reading':
      case 'parsing':
        // 單向往下吐紙，這是唯一允許線性的地方（迴圈接點不能有加減速）
        tl = gsap.timeline({ repeat: -1 });
        tl.set(band, { scaleY: 1 })
          .fromTo(band, { y: -6, autoAlpha: 0.15 }, { y: d, duration: 0.9, ease: 'none' }, 0)
          .to(band, { autoAlpha: 1, duration: 0.18, ease: 'power2.out' }, 0)
          .to(band, { autoAlpha: 0.15, duration: 0.3, ease: 'power2.in' }, 0.6);
        break;

      case 'success':
        // 掃出畫面就結束，成功狀態在這個世界裡沒有顏色
        tl = gsap.timeline();
        tl.to(band, { y: d, duration: 0.46, ease: 'power3.out', scaleY: 1 })
          .to(band, { autoAlpha: 0, duration: 0.22, ease: 'power2.out' }, '-=0.14');
        break;

      case 'error':
        // 停在半路：機器卡住了
        tl = gsap.timeline();
        tl.to(band, { y: d * 0.5, autoAlpha: 1, scaleY: 1, duration: 0.3, ease: 'power3.out' })
          .fromTo(band, { scaleX: 1 }, { scaleX: 0.86, duration: 0.12, ease: 'power2.inOut', repeat: 3, yoyo: true }, 0);
        break;

      default:
        // idle：2.4 秒一趟往返，hover / focus 時加速到兩倍
        tl = gsap.timeline({ repeat: -1, yoyo: true });
        tl.set(band, { autoAlpha: 0.9, scaleY: 1, scaleX: 1 })
          .fromTo(band, { y: d * 0.06 }, { y: d * 0.94, duration: 1.2, ease: 'sine.inOut' });
        tl.timeScale(hovered ? 2 : 1);
    }
  }

  const obs = new MutationObserver(apply);
  obs.observe(slot, { attributes: true, attributeFilter: ['data-state', 'aria-disabled'] });

  const enter = () => { hovered = true; if (tl && (slot.dataset.state || 'idle') === 'idle') tl.timeScale(2); };
  const leave = () => { hovered = false; if (tl && (slot.dataset.state || 'idle') === 'idle') tl.timeScale(1); };
  slot.addEventListener('pointerenter', enter);
  slot.addEventListener('pointerleave', leave);
  slot.addEventListener('focusin', enter);
  slot.addEventListener('focusout', leave);

  let rz = 0;
  const onResize = () => { clearTimeout(rz); rz = setTimeout(apply, 180); };
  window.addEventListener('resize', onResize);

  apply();

  return () => {
    obs.disconnect();
    clearTimeout(rz);
    window.removeEventListener('resize', onResize);
    slot.removeEventListener('pointerenter', enter);
    slot.removeEventListener('pointerleave', leave);
    slot.removeEventListener('focusin', enter);
    slot.removeEventListener('focusout', leave);
    if (tl) tl.kill();
    gsap.set(band, { clearProps: 'all' });
  };
}

/* ============================================================
   2. 資料到位的那一刻
   一句話：六格從「- - -」被印成真實數字，這是整頁從空到有的唯一轉場。
   只做一次，只在這一組節點上。捲到看得見時才跑，沒捲到就是正確的靜態數字。
   ============================================================ */

function installDataArrival(gsap, ScrollTrigger) {
  const strip = document.getElementById('stat-strip');
  const sample = document.getElementById('sample-strip');
  if (!strip) return null;

  let tl = null;
  let st = null;
  let sampleWasHidden = true;

  const off = on('data', () => {
    if (tl) { tl.kill(); tl = null; }
    if (st) { st.kill(); st = null; }

    // 範例標記帶剛出現：從站頭底下滑出來（狀態轉換，28px 一格）
    if (sample && !sample.hidden && sampleWasHidden) {
      gsap.fromTo(sample, { yPercent: -100 }, { yPercent: 0, duration: 0.42, ease: 'power3.out' });
    }
    sampleWasHidden = !sample || sample.hidden;

    if (!hasData()) return;

    const cells = $$('.stat-value', strip).map((node) => ({
      node,
      final: node.textContent,
      value: Number(node.dataset.value || 0),
      isNum: node.dataset.stat !== 'top' && Number(node.dataset.value || 0) > 0,
    }));

    tl = gsap.timeline({ paused: true });
    cells.forEach((c, i) => {
      const at = i * 0.07;
      if (c.isNum) {
        const prefix = c.final.startsWith('NT$') ? 'NT$' : '';
        const proxy = { v: 0 };
        tl.to(proxy, {
          v: c.value,
          duration: 1.1,
          ease: 'power3.out',
          snap: { v: 1 },
          onUpdate: () => { c.node.textContent = prefix + Math.round(proxy.v).toLocaleString('zh-TW'); },
          onComplete: () => { c.node.textContent = c.final; },
        }, at);
      } else {
        // 店名是文字不是數字，用熱感應紙的印法：由左往右印出來
        tl.fromTo(c.node,
          { clipPath: 'inset(0 100% 0 0)' },
          { clipPath: 'inset(0 0% 0 0)', duration: 0.55, ease: 'power3.out', immediateRender: false,
            onComplete: () => { c.node.style.clipPath = ''; } },
          at);
      }
    });

    // 載入範例之後頁面會自己捲到儀表板，所以這一組數字有可能已經在畫面裡、
    // 也有可能還在上面。兩種情況都要印，只是時機不同。
    let fired = false;
    const fire = () => { if (!fired && tl) { fired = true; tl.play(); } };
    const box = strip.getBoundingClientRect();
    if (box.top < window.innerHeight * 0.9 && box.bottom > 0) {
      fire();                                   // 已經在畫面裡：現在就印
    } else if (ScrollTrigger) {
      st = ScrollTrigger.create({
        trigger: strip,
        start: 'top 90%',
        end: 'bottom 10%',
        onEnter: fire,
        onEnterBack: fire,
      });
    } else {
      fire();
    }
  });

  return () => {
    off();
    if (tl) tl.kill();
    if (st) st.kill();
    $$('.stat-value', strip).forEach((n) => { n.style.clipPath = ''; });
  };
}

/* ============================================================
   3. 圖卡重繪掃描線
   一句話：按下「產生 PNG」之後，那張卡真的正在被重畫。
   ============================================================ */

function installCardScan(gsap) {
  const root = document.getElementById('review');
  if (!root) return null;
  let tw = null;
  let wrap = null;

  const obs = new MutationObserver(() => {
    const prev = root.querySelector('.card-preview');
    const w = prev && prev.closest('.card-preview-wrap');
    if (!w) return;
    const want = prev.classList.contains('is-scanning');
    if (want === !!tw) return;                       // 沒變就不要再動 class，避免自己觸發自己
    if (want) {
      wrap = w;
      wrap.classList.add('is-scanning');
      const h = prev.getBoundingClientRect().height || 420;
      tw = gsap.fromTo(wrap,
        { '--scan-y': '-28px' },
        { '--scan-y': `${Math.round(h)}px`, duration: 0.85, ease: 'none', repeat: -1 });
    } else {
      tw.kill(); tw = null;
      if (wrap) { wrap.classList.remove('is-scanning'); wrap.style.removeProperty('--scan-y'); }
      wrap = null;
    }
  });
  obs.observe(root, { attributes: true, attributeFilter: ['class'], subtree: true });

  return () => {
    obs.disconnect();
    if (tw) tw.kill();
    if (wrap) wrap.classList.remove('is-scanning');
  };
}

/* ============================================================
   4. 招牌時刻：年度回顧第 3 屏「你的第二個家」
   ============================================================ */

function installSignature({ gsap, ScrollTrigger, review, bubbles, reduce }) {
  const root = document.getElementById('review');
  if (!root) return null;

  let live = null;   // 目前這一次 open 的安裝結果

  function down() {
    if (live) { live.destroy(); live = null; }
  }

  function up() {
    down();
    live = reduce
      ? mountStatic({ gsap, review })
      : mountMoment({ gsap, ScrollTrigger, review, bubbles });
  }

  root.addEventListener('review:open', up);
  root.addEventListener('review:close', down);
  if (review.isOpen && review.isOpen()) up();

  return () => {
    root.removeEventListener('review:open', up);
    root.removeEventListener('review:close', down);
    down();
  };
}

/** reduced-motion：直接是終值。置中的數字、一整圈可查詢的年輪、一句敘述。 */
function mountStatic({ gsap, review }) {
  const home = document.getElementById('ch-home');
  if (!home) return { destroy() {} };
  home.classList.add('is-composed');
  const ring = review.getRing && review.getRing();
  if (ring) { ring.setReveal(null); ring.setRadiusScale(1); ring.draw(); }
  return {
    destroy() { home.classList.remove('is-composed'); },
  };
}

function mountMoment({ gsap, ScrollTrigger, review, bubbles }) {
  const home = document.getElementById('ch-home');
  const scroller = review.scroller;
  const summary = review.getSummary && review.getSummary();
  const champion = summary && summary.champion;
  const ring = review.getRing && review.getRing();

  if (!home || !scroller || !champion || !ring || !ScrollTrigger) {
    return mountStatic({ gsap, review });
  }

  const inner = home.querySelector('.chapter-inner');
  const champBox = home.querySelector('.champion');
  const logo = home.querySelector('.champion-logo');
  const num = home.querySelector('.champion-num');
  const note = home.querySelector('.chapter-note');
  const seed = home.querySelector('.ring-seed');
  const ringCanvas = ring.canvas;
  const nextNum = document.querySelector('#ch-max .chapter-num');
  const finalCount = String(champion.count);

  if (!inner || !champBox || !num || !ringCanvas) return mountStatic({ gsap, review });

  home.classList.add('is-composed');

  // 種子只是一顆油墨方塊。移到 .chapter 底下，讓它的定位基準就是 #ch-home 本身，
  // 這樣它的座標與下一屏的落點都在同一個捲動內容座標系裡，捲動時不會失準。
  if (seed && seed.parentElement !== home) home.append(seed);

  /* ---- 舞台：兩層 canvas。雲要被整層模糊，冠軍不能糊，所以分開。 ---- */
  const stage = document.createElement('div');
  stage.className = 'home-stage';
  stage.setAttribute('aria-hidden', 'true');
  const cloudEl = document.createElement('canvas');
  cloudEl.className = 'home-cloud';
  const discEl = document.createElement('canvas');
  discEl.className = 'home-disc';
  stage.append(cloudEl, discEl);
  home.prepend(stage);

  let W = 0, H = 0, cctx = null, dctx = null;
  let cloudNodes = [];
  let champSrc = null;
  let G = { cx: 0, cy: 0, R: 120 };
  const ch = { x: 0, y: 0, r: 40, fill: 1, label: 1, stroke: 0 };

  function measure() {
    // 年輪 canvas 上一輪可能還留著 -6 度的就位旋轉，量之前先歸零，
    // 否則 getBoundingClientRect 會把旋轉後的外接矩形當成直徑
    gsap.set(ringCanvas, { rotation: 0 });
    const box = home.getBoundingClientRect();
    W = Math.max(240, Math.round(box.width));
    H = Math.max(240, Math.round(box.height));
    cctx = fitCanvas(cloudEl, W, H);
    dctx = fitCanvas(discEl, W, H);

    const rc = ringCanvas.getBoundingClientRect();
    G = {
      cx: rc.left - box.left + rc.width / 2,
      cy: rc.top - box.top + rc.height / 2,
      R: rc.width * 0.40,
    };

    // 把儀表板那朵雲的座標搬到這一屏，等比縮放置中
    const src = (bubbles && bubbles.getNodes && bubbles.getNodes()) || [];
    const bw = parseFloat(bubbles && bubbles.canvasEl && bubbles.canvasEl.style.width) || 0;
    const bh = parseFloat(bubbles && bubbles.canvasEl && bubbles.canvasEl.style.height) || 0;
    const k = bw && bh ? Math.min(W / bw, H / bh) * 0.94 : 0;
    const ox = (W - bw * k) / 2;
    const oy = (H - bh * k) / 2;

    cloudNodes = [];
    champSrc = null;
    if (k > 0) {
      src.forEach((n) => {
        const node = {
          bx: ox + n.x * k,
          by: oy + n.y * k,
          r0: Math.max(1.5, n.r * k),
          ramp: n.ramp, stripes: n.stripes, name: n.name,
          x: 0, y: 0, sc: 1, a: 1, ox: 0, oy: 0,
        };
        if (!champSrc && n.name === champion.name) champSrc = node;
        else cloudNodes.push(node);
      });
    }
    // 離心方向：每顆從畫面中心往外推出視野
    cloudNodes.forEach((n) => {
      const dx = n.bx - G.cx;
      const dy = n.by - G.cy;
      const d = Math.hypot(dx, dy) || 1;
      const push = n.r0 * 2.6 + Math.max(W, H) * 0.42;
      n.ox = (dx / d) * push;
      n.oy = (dy / d) * push;
    });

    if (!champSrc) {
      champSrc = { bx: G.cx, by: G.cy, r0: Math.max(24, G.R * 0.34), ramp: 6, stripes: 5, name: champion.name };
    }
  }

  /* ---- 繪圖：整段動效每幀只重畫一次，不開幾百個獨立 tween 碰 DOM ---- */

  function drawCloud() {
    if (!cctx) return;
    cctx.clearRect(0, 0, W, H);
    for (let i = 0; i < cloudNodes.length; i++) {
      const n = cloudNodes[i];
      if (n.a <= 0.01) continue;
      const r = n.r0 * n.sc;
      if (r < 0.7) continue;
      cctx.globalAlpha = n.a;
      cctx.beginPath();
      cctx.arc(n.bx + n.x, n.by + n.y, r, 0, TAU);
      cctx.fillStyle = rampColor(n.ramp);
      cctx.fill();
      if (r > 13 && n.stripes) {
        const pat = stripePattern(cctx, n.stripes);
        if (pat) { cctx.fillStyle = pat; cctx.fill(); }
      }
    }
    cctx.globalAlpha = 1;
  }

  function drawDisc() {
    if (!dctx) return;
    dctx.clearRect(0, 0, W, H);
    if (ch.r < 0.5) return;
    if (ch.fill > 0.005) {
      dctx.globalAlpha = ch.fill;
      dctx.beginPath();
      dctx.arc(ch.x, ch.y, ch.r, 0, TAU);
      dctx.fillStyle = rampColor(champSrc.ramp);
      dctx.fill();
      if (ch.fill > 0.4 && champSrc.stripes) {
        const pat = stripePattern(dctx, champSrc.stripes);
        if (pat) { dctx.fillStyle = pat; dctx.fill(); }
      }
    }
    if (ch.stroke > 0.005) {
      dctx.globalAlpha = ch.stroke;
      dctx.lineWidth = 1.5;
      dctx.strokeStyle = token('--vermilion');
      dctx.beginPath();
      dctx.arc(ch.x, ch.y, ch.r, 0, TAU);
      dctx.stroke();
    }
    if (ch.label > 0.01 && ch.r > 18) {
      dctx.globalAlpha = ch.label;
      dctx.fillStyle = champSrc.ramp >= 4 ? token('--ink-void') : token('--paper');
      dctx.font = `600 ${Math.min(15, Math.max(10, ch.r / 3.4))}px ${token('--font-text') || 'sans-serif'}`;
      dctx.textAlign = 'center';
      dctx.textBaseline = 'middle';
      const label = champSrc.name.length > 7 ? `${champSrc.name.slice(0, 6)}…` : champSrc.name;
      dctx.fillText(label, ch.x, ch.y);
    }
    dctx.globalAlpha = 1;
  }

  /* 整段動效每幀只重畫一次：兩個主時間軸的 onUpdate 各呼叫一次 paint()，
     底下所有 tween 都只是在改物件陣列的數字，沒有一個會自己碰 canvas。 */
  function paint() {
    drawCloud();
    drawDisc();
    ring.setRadiusScale(ringScale.v);
    ring.draw();
  }

  /* ---- 年輪的 214 個方塊：一次 stagger tween 打在 proxy 陣列上 ---- */
  const N = Math.max(1, ring.count());
  const cells = Array.from({ length: N }, () => ({ s: 0, a: 0 }));
  const ringScale = { v: 1 };
  ring.setReveal((i) => {
    const c = cells[i];
    if (!c) return { s: 1, a: 1 };
    return { s: Math.max(0, c.s), a: Math.min(1, Math.max(0, c.a)) };
  });

  /* ---- 建立時間軸 ---- */
  let tl = null;
  let tlExit = null;
  let stArrive = null;
  let stExit = null;
  let played = false;

  function build() {
    measure();

    ch.x = champSrc.bx;
    ch.y = champSrc.by;
    ch.r = champSrc.r0;
    ch.fill = 1;
    ch.label = 1;
    ch.stroke = 0;
    cloudNodes.forEach((n) => { n.x = 0; n.y = 0; n.sc = 1; n.a = 1; });
    cells.forEach((c) => { c.s = 0; c.a = 0; });
    ringScale.v = 1;
    ring.setRadiusScale(1);

    gsap.set(cloudEl, { filter: 'blur(0px)', willChange: 'filter' });
    // 這兩個節點是這一屏的無障礙名稱來源（section aria-labelledby 指著 .champion-num），
    // 所以只降 opacity，不用 autoAlpha——visibility:hidden 會讓它從無障礙樹上消失。
    // 它們在 pointer-events:none 的容器裡，不會擋到年輪的滑鼠查詢。
    gsap.set([logo, num], { opacity: 0 });
    gsap.set(num, { scale: 0.86, willChange: 'transform' });
    gsap.set(note, { autoAlpha: 0.35, y: 16 });
    if (seed) gsap.set(seed, { autoAlpha: 0, x: G.cx, y: G.cy, scale: 1 });

    const finalR = G.R / 1.18;
    const proxy = { v: 0 };

    tl = gsap.timeline({ paused: true, onUpdate: paint });

    // 0.00 其餘兩百多顆散出視野。一次 tween 打在陣列上，from: 'random'
    if (cloudNodes.length) {
      tl.to(cloudNodes, {
        sc: 0.3,
        a: 0,
        x: (i, t) => t.ox,
        y: (i, t) => t.oy,
        duration: 0.9,
        ease: 'power2.in',
        stagger: { each: 0.008, from: 'random' },
      }, 0);
      // 整層 CSS filter（GPU 合成），不是 216 次 ctx.filter
      tl.to(cloudEl, { filter: 'blur(8px)', duration: 1.1, ease: 'power2.in' }, 0);
    }

    // 0.35 冠軍脫離雲層，飛到年輪圓心並長大
    tl.to(ch, { x: G.cx, y: G.cy, r: finalR, duration: 1.0, ease: 'expo.out' }, 0.35);
    // 表面的店名淡出，讓位給數字
    tl.to(ch, { label: 0, duration: 0.32, ease: 'power2.in' }, 0.45);
    // 實心圓退成描邊圓：紙白數字要壓在深底上才讀得到，不是壓在 --ramp-6 上
    tl.to(ch, { fill: 0.14, stroke: 1, duration: 0.6, ease: 'power2.out' }, 0.78);

    // 1.00 店名以 DOM 文字重新出現在圓的上緣
    if (logo) tl.fromTo(logo, { y: 10 }, { y: 0, opacity: 1, duration: 0.45, ease: 'power3.out' }, 1.0);

    // 1.10 數字從 0 滾到 214，snap 到整數
    tl.to(num, { opacity: 1, scale: 1, duration: 0.5, ease: 'power3.out' }, 1.1);
    tl.to(proxy, {
      v: champion.count,
      duration: 1.2,
      ease: 'power3.out',
      snap: { v: 1 },
      onUpdate: () => { num.textContent = String(Math.round(proxy.v)); },
      onComplete: () => { num.textContent = finalCount; },
    }, 1.1);

    // 2.30 數字落定的同一幀，年輪逐格點亮（每格代表一次造訪，依日期順時針）
    tl.to(cells, {
      s: 1,
      a: 1,
      duration: 0.28,
      ease: 'back.out(2.2)',
      stagger: 0.004,
    }, 2.3);
    tl.fromTo(ringCanvas, { rotation: -6 }, {
      rotation: 0,
      duration: 0.28 + N * 0.004,
      ease: 'power2.out',
    }, 2.3);

    // 3.10 敘述補上來
    if (note) tl.to(note, { y: 0, autoAlpha: 1, duration: 0.55, ease: 'power3.out' }, 3.1);

    tl.eventCallback('onComplete', () => {
      paint();
      gsap.set([cloudEl, num], { willChange: 'auto' });
      num.textContent = finalCount;
    });

    /* ---- 退場：整圈年輪收成一顆油墨點，落到下一屏的數字上 ---- */
    tlExit = gsap.timeline({ paused: true, onUpdate: paint });
    tlExit.to(ringScale, { v: 0, duration: 0.55, ease: 'power2.in' }, 0);
    tlExit.to(cells, {
      s: 0.2, a: 0,
      duration: 0.4,
      ease: 'power2.in',
      stagger: { each: 0.0014, from: 'end' },
    }, 0);
    tlExit.to(num, { scale: 0.15, opacity: 0, duration: 0.5, ease: 'power2.in' }, 0);
    if (logo) tlExit.to(logo, { opacity: 0, duration: 0.3, ease: 'power2.in' }, 0);
    tlExit.to(ch, { r: 4, fill: 0, stroke: 0, duration: 0.5, ease: 'power2.in' }, 0);
    if (note) tlExit.to(note, { autoAlpha: 0, y: -10, duration: 0.35, ease: 'power2.in' }, 0);

    if (seed && nextNum) {
      const box = home.getBoundingClientRect();
      const nb = nextNum.getBoundingClientRect();
      const ex = nb.left - box.left + nb.width / 2;
      const ey = nb.top - box.top + nb.height / 2;
      tlExit.to(seed, { autoAlpha: 1, duration: 0.1, ease: 'power2.out' }, 0.35);
      tlExit.to(seed, {
        keyframes: { x: [G.cx, G.cx + Math.min(120, W * 0.12), ex] },
        duration: 0.65,
        ease: 'sine.inOut',
      }, 0.35);
      tlExit.to(seed, { y: ey, duration: 0.65, ease: 'power2.in' }, 0.35);
      // 落點：下一個數字被這滴油墨印下去
      tlExit.to(seed, { scale: 3.2, autoAlpha: 0, duration: 0.16, ease: 'power2.out' }, 0.92);
      tlExit.to(nextNum, { scale: 1.05, duration: 0.1, ease: 'power2.out' }, 0.92);
      tlExit.to(nextNum, { scale: 1, duration: 0.3, ease: 'power3.out' }, 1.02);
    }

    /* 兩個 trigger，各管一件事。
       回顧模式的捲動容器是 scroll-snap: y mandatory，所以這一屏的靜止位置
       **正好等於** 'top top'，ScrollTrigger 在 progress 恰為 0 時不算 active，
       onEnter 永遠不會觸發。開播因此改用「這一屏進場了」的判斷，
       退場的 scrub 才用 'top top'（那時 progress 真的會離開 0）。 */
    stArrive = ScrollTrigger.create({
      trigger: home,
      scroller,
      start: 'top 75%',
      end: 'bottom top',
      invalidateOnRefresh: true,
      onEnter: () => { if (!played) { played = true; tl.play(); } },
      // 從下一屏往回捲上來：直接停在終值，不重播
      onEnterBack: () => { if (!played) { played = true; tl.progress(1).pause(); paint(); } },
      onLeaveBack: () => {
        played = false;
        tl.pause(0);
        tlExit.progress(0);
        num.textContent = finalCount;   // 還沒播的狀態下，螢幕閱讀器讀到的要是真實次數
        paint();
      },
    });

    stExit = ScrollTrigger.create({
      trigger: home,
      scroller,
      start: 'top top',
      end: 'bottom top',
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        const p = gsap.utils.clamp(0, 1, (self.progress - 0.04) / 0.96);
        if (p > 0.002 && tl.progress() < 1) { played = true; tl.progress(1).pause(); }
        tlExit.progress(p);
      },
      onLeave: () => { tlExit.progress(1); },
      onLeaveBack: () => { tlExit.progress(0); },
    });

    paint();
    ScrollTrigger.refresh();
  }

  build();

  // 視窗尺寸改變：重量一次幾何。已經播完的就停在終值，不重播。
  let rz = 0;
  function onResize() {
    clearTimeout(rz);
    rz = setTimeout(() => {
      const wasPlayed = played || (tl && tl.progress() >= 1);
      teardownTimelines();
      build();
      if (wasPlayed) { played = true; tl.progress(1).pause(); paint(); }
    }, 220);
  }
  window.addEventListener('resize', onResize);

  function teardownTimelines() {
    if (stArrive) { stArrive.kill(); stArrive = null; }
    if (stExit) { stExit.kill(); stExit = null; }
    if (tl) { tl.kill(); tl = null; }
    if (tlExit) { tlExit.kill(); tlExit = null; }
    gsap.killTweensOf([cloudNodes, cells, ch, ringScale]);
  }

  return {
    destroy() {
      clearTimeout(rz);
      window.removeEventListener('resize', onResize);
      teardownTimelines();
      stage.remove();
      ring.setReveal(null);
      ring.setRadiusScale(1);
      home.classList.remove('is-composed');
      gsap.set([logo, num, note, seed].filter(Boolean), { clearProps: 'all' });
      // 年輪 canvas 的 width/height 是 fitCanvas 寫的行內樣式，只能清 transform
      gsap.set(ringCanvas, { clearProps: 'transform' });
      if (nextNum) gsap.set(nextNum, { clearProps: 'transform' });
      num.textContent = finalCount;
    },
  };
}
