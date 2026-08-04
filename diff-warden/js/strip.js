/* strip.js — 探傷帶。
   橫軸 = 被選檔案（欄寬正比於 sqrt(位元組)，最小 28px），縱軸 = 該檔案的行號。
   canvas 只是視覺化：所有資訊在缺陷清單裡都有等價的文字形式。

   動效介面：預設 animate = false，此時每一筆都以「終值」畫出，
   關掉動效（或 GSAP 沒載到）不會少掉任何一條資訊。
   motion.js 把 animate 打開之後，addStrike 進來的那一條會從 0 開始，
   由 motion.js 的時間軸把 fx 的三個值推到 1；本檔案不自己開任何計時器。 */

const SEV_TOKEN = { blocker: '--sev-1', high: '--sev-2', medium: '--sev-3', low: '--sev-4' };
const SEV_R = { blocker: 9, high: 7, medium: 5.5, low: 4 };
const SEV_W = { blocker: 2.5, high: 2, medium: 1.5, low: 1 };
const SEV_LABEL = { blocker: '阻斷', high: '高', medium: '中', low: '低' };

export function sevLabel(s) { return SEV_LABEL[s] || '中'; }
export function sevRank(s) { return ({ blocker: 1, high: 2, medium: 3, low: 4 })[s] || 3; }

export class Strip {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.files = [];
    this.defects = [];
    this.cols = [];
    this.progress = null;
    this.hoverIndex = -1;
    this.focusIndex = -1;
    this.onSelect = null;
    this.onHover = null;
    this.css = getComputedStyle(document.documentElement);

    /* 動效狀態。全部預設在「已完成」的值上，所以沒有 motion.js 也一樣完整。 */
    this.animate = false;
    this.fx = new Map();      // defect.id -> { ring, hair, arc }  0..1
    this.colFx = new Map();   // file path  -> { flash, count }
    this.cornerFx = 1;        // 取景框的四個角標，bed -> deck 時由 0 畫出

    this._bind();
    this._resizeObserver();
  }

  tok(name) { return this.css.getPropertyValue(name).trim() || '#888'; }

  fxOf(id) {
    let f = this.fx.get(id);
    if (!f) { f = { ring: 1, hair: 1, arc: 1 }; this.fx.set(id, f); }
    return f;
  }

  colFxOf(path) {
    let f = this.colFx.get(path);
    if (!f) { f = { flash: 0, count: 1 }; this.colFx.set(path, f); }
    return f;
  }

  _bind() {
    this.c.addEventListener('mousemove', (e) => {
      const r = this.c.getBoundingClientRect();
      const i = this.hitTest(e.clientX - r.left, e.clientY - r.top);
      if (i !== this.hoverIndex) {
        this.hoverIndex = i;
        this.draw();
        this.onHover && this.onHover(i >= 0 ? this.defects[i] : null);
      }
    });
    this.c.addEventListener('mouseleave', () => {
      if (this.hoverIndex !== -1) { this.hoverIndex = -1; this.draw(); this.onHover && this.onHover(null); }
    });
    this.c.addEventListener('click', () => {
      if (this.hoverIndex >= 0 && this.onSelect) this.onSelect(this.defects[this.hoverIndex]);
    });
    this.c.addEventListener('keydown', (e) => {
      if (!this.defects.length) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const d = e.key === 'ArrowRight' ? 1 : -1;
        this.focusIndex = (this.focusIndex + d + this.defects.length) % this.defects.length;
        this.hoverIndex = this.focusIndex;
        this.draw();
        this.onHover && this.onHover(this.defects[this.focusIndex]);
      } else if (e.key === 'Enter' && this.focusIndex >= 0) {
        e.preventDefault();
        this.onSelect && this.onSelect(this.defects[this.focusIndex]);
      }
    });
  }

  _resizeObserver() {
    if (typeof ResizeObserver === 'undefined') return;
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(this.c);
  }

  setFiles(files) {
    this.files = files || [];
    this.layout();
    this.draw();
  }

  setDefects(defects) {
    // 整批換上（載入舊報告、重新排序、回收略過的）不是「新發現」，一律直接是終值。
    this.defects = defects || [];
    this.fx.clear();
    this.draw();
    this.updateAria();
  }

  addStrike(defect) {
    this.defects.push(defect);
    if (this.animate) this.fx.set(defect.id, { ring: 0, hair: 0, arc: 0 });
    this.draw();
    this.updateAria();
  }

  /** 動效被卸下（切到 reduced-motion）時把所有中途狀態推到終值，資訊不留在半路 */
  settle() {
    this.fx.clear();
    this.colFx.forEach((f) => { f.flash = 0; f.count = 1; });
    this.cornerFx = 1;
    this.draw();
  }

  setProgress(p) { this.progress = p; this.draw(); }

  clear() {
    this.files = []; this.defects = []; this.progress = null;
    this.cols = []; this.hoverIndex = -1; this.focusIndex = -1;
    this.fx.clear(); this.colFx.clear();
    this.draw(); this.updateAria();
  }

  layout() {
    const w = this.c.clientWidth || 600;
    const n = this.files.length;
    if (!n) { this.cols = []; return; }
    const weights = this.files.map((f) => Math.sqrt(Math.max(f.size || 1, 1)));
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    const gap = 2;
    const avail = Math.max(w - gap * (n - 1), n * 28);
    let x = 0;
    this.cols = this.files.map((f, i) => {
      const cw = Math.max(28, (weights[i] / sum) * avail);
      const col = { file: f.path, lines: f.lines || 1, x, w: cw };
      x += cw + gap;
      return col;
    });
    const total = x - gap;
    if (total > w) {
      const k = w / total;
      let cx = 0;
      this.cols.forEach((c) => { c.w = Math.max(6, c.w * k); c.x = cx; cx += c.w + gap * k; });
    }
  }

  colFor(path) { return this.cols.find((c) => c.file === path) || null; }

  pointFor(defect) {
    const col = this.colFor(defect.file);
    if (!col) return null;
    const h = this.c.clientHeight || 128;
    const pad = 18;
    const frac = Math.min(Math.max((defect.line || 1) / Math.max(col.lines, 1), 0), 1);
    return { x: col.x + col.w / 2, y: pad + frac * (h - pad - 16) };
  }

  hitTest(px, py) {
    for (let i = this.defects.length - 1; i >= 0; i -= 1) {
      const p = this.pointFor(this.defects[i]);
      if (!p) continue;
      const r = (SEV_R[this.defects[i].severity] || 5) + 4;
      if ((px - p.x) ** 2 + (py - p.y) ** 2 <= r * r) return i;
    }
    return -1;
  }

  draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.c.clientWidth || 600;
    const h = this.c.clientHeight || 128;
    if (this.c.width !== Math.round(w * dpr) || this.c.height !== Math.round(h * dpr)) {
      this.c.width = Math.round(w * dpr);
      this.c.height = Math.round(h * dpr);
      this.layout();
    }
    const g = this.ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    g.fillStyle = this.tok('--well');
    g.fillRect(0, 0, w, h);

    // 1px 量測網格
    g.strokeStyle = this.tok('--grid');
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 32; x < w; x += 32) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); }
    for (let y = 32; y < h; y += 32) { g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); }
    g.stroke();

    // 縱軸 25 / 50 / 75% 刻度
    g.strokeStyle = this.tok('--rule');
    g.beginPath();
    [0.25, 0.5, 0.75].forEach((f) => { const y = Math.round(h * f) + 0.5; g.moveTo(0, y); g.lineTo(w, y); });
    g.stroke();

    // 檔案欄。欄身是機殼色，只有欄底那一道是 --strip-idle：
    // 酸黃綠色相不做大面積，這裡也不例外。
    const pad = 18;
    this.cols.forEach((c) => {
      const cw = Math.max(Math.round(c.w), 2);
      const cx = Math.round(c.x);
      const cfx = this.colFxOf(c.file);
      g.fillStyle = this.tok('--panel');
      g.fillRect(cx, pad, cw, h - pad - 14);
      // 欄底那一道就是這一欄的狀態燈：被擊中時往 --strip-hit 靠，再自己回落
      g.fillStyle = cfx.flash > 0
        ? mix(this.tok('--strip-idle'), this.tok('--strip-hit'), cfx.flash)
        : this.tok('--strip-idle');
      g.fillRect(cx, h - 17 - cfx.flash * 2, cw, 3 + cfx.flash * 2);
      if (c.w >= 46) {
        g.fillStyle = this.tok('--fg-4');
        g.font = '11px "Chivo Mono", ui-monospace, monospace';
        g.textBaseline = 'top';
        const name = shorten(c.file.split('/').pop(), c.w - 8, g);
        g.fillText(name, cx + 4, 5);
      }
      const n = this.defects.filter((d) => d.file === c.file).length;
      if (n && c.w >= 20) {
        g.save();
        g.globalAlpha = cfx.count;
        g.fillStyle = this.tok('--accent-dim');
        g.font = '11px "Chivo Mono", ui-monospace, monospace';
        g.textBaseline = 'bottom';
        g.fillText(String(n), Math.round(c.x) + 3, h - 1);
        g.restore();
      }
    });

    // 跨檔案弧線。這是「跨檔案」唯一的視覺證明，所以 reduced-motion 下是永久靜態畫出；
    // 動效開著時它由 fx.arc 描繪出來，畫完就永遠留在那裡。
    g.strokeStyle = this.tok('--accent-dim');
    g.lineWidth = 1;
    this.defects.forEach((d) => {
      if (!d.related || !d.related.length) return;
      const a = this.pointFor(d);
      if (!a) return;
      const p = this.fxOf(d.id).arc;
      if (p <= 0) return;
      d.related.forEach((r) => {
        const b = this.pointFor({ file: r.file, line: r.line });
        if (!b) return;
        const cxm = (a.x + b.x) / 2;
        const cym = Math.min(a.y, b.y) - 22;
        g.save();
        if (p < 1) {
          const len = Math.hypot(cxm - a.x, cym - a.y) + Math.hypot(b.x - cxm, b.y - cym);
          g.setLineDash([len * p, len]);
        }
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.quadraticCurveTo(cxm, cym, b.x, b.y);
        g.stroke();
        g.restore();
      });
    });

    // 圈記
    this.defects.forEach((d, i) => {
      const p = this.pointFor(d);
      if (!p) return;
      const fx = this.fxOf(d.id);
      this.mark(g, p.x, p.y, d.severity, i === this.hoverIndex, false, fx);
      if (d.related) {
        d.related.forEach((r) => {
          const q = this.pointFor({ file: r.file, line: r.line });
          if (q) this.mark(g, q.x, q.y, d.severity, i === this.hoverIndex, true, fx);
        });
      }
    });

    // 掃描游標：1px 垂直線 + 向左 24px 的亮度衰減拖尾（不是光暈）
    if (this.progress !== null && this.progress >= 0) {
      const x = Math.round(this.progress * w) + 0.5;
      const trail = parseInt(this.tok('--strip-trail'), 10) || 24;
      const grad = g.createLinearGradient(x - trail, 0, x, 0);
      grad.addColorStop(0, this.tok('--strip-idle'));
      grad.addColorStop(1, this.tok('--accent'));
      g.fillStyle = grad;
      g.fillRect(Math.max(0, x - trail), pad, Math.min(trail, x), h - pad - 14);
      g.strokeStyle = this.tok('--accent');
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
    }

    // 角標畫在最後：它是儀器的取景框，要蓋在內容之上
    this.corners(g, w, h);
  }

  corners(g, w, h) {
    const t = this.cornerFx;
    if (t <= 0) return;
    g.strokeStyle = this.tok('--accent');
    g.lineWidth = 2;
    const L = 12 * t;
    const pts = [[1, 1, 1, 1], [w - 1, 1, -1, 1], [1, h - 1, 1, -1], [w - 1, h - 1, -1, -1]];
    pts.forEach(([x, y, dx, dy]) => {
      g.beginPath();
      g.moveTo(x + dx * L, y); g.lineTo(x, y); g.lineTo(x, y + dy * L);
      g.stroke();
    });
  }

  /* 圈記幾何是嚴重度的第二個冗餘通道（第三個是文字標籤），所以它的形狀不能因為
     動效而改變，只有「畫到多少」會變：ring 控制描邊繪出的比例，hair 控制十字準星
     的臂長。fx 省略時等於已完成。 */
  mark(g, x, y, sev, hot, secondary, fx) {
    const ring = fx ? fx.ring : 1;
    const hair = fx ? fx.hair : 1;
    if (ring <= 0) return;
    const col = this.tok(SEV_TOKEN[sev] || '--sev-3');
    const r = SEV_R[sev] || 5.5;
    const lw = SEV_W[sev] || 1.5;
    const circ = 2 * Math.PI * r;
    g.save();
    g.strokeStyle = col;
    g.fillStyle = col;
    g.lineWidth = hot ? lw + 0.75 : lw;
    // 繪出中用描繪式虛線；畫完之後才交還「中」這一階本身的虛線識別
    g.setLineDash(ring < 1 ? [circ * ring, circ] : (sev === 'medium' ? [3, 2] : []));
    if (sev === 'blocker' && !secondary) {
      g.globalAlpha = ring;
      g.setLineDash([]);
      g.beginPath(); g.arc(x, y, r - 4, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      g.setLineDash(ring < 1 ? [circ * ring, circ] : []);
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    } else if (sev === 'low') {
      g.beginPath(); g.arc(x, y, r, -Math.PI * 0.7, Math.PI * 1.4); g.stroke();
    } else {
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    }
    if ((sev === 'blocker' || sev === 'high') && hair > 0) {
      const a = 1;
      const b = 5 * hair;
      g.setLineDash([]);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x - r - b, y); g.lineTo(x - r - a, y);
      g.moveTo(x + r + a, y); g.lineTo(x + r + b, y);
      g.moveTo(x, y - r - b); g.lineTo(x, y - r - a);
      g.moveTo(x, y + r + a); g.lineTo(x, y + r + b);
      g.stroke();
    }
    g.restore();
  }

  updateAria() {
    const n = this.defects.length;
    if (!this.files.length) { this.c.setAttribute('aria-label', '探傷帶：尚未掃描'); return; }
    if (!n) { this.c.setAttribute('aria-label', `探傷帶：${this.files.length} 個檔案，沒有缺陷落點`); return; }
    const worst = [...this.defects].sort((a, b) => sevRank(a.severity) - sevRank(b.severity))[0];
    this.c.setAttribute('aria-label',
      `探傷帶：${this.files.length} 個檔案，${n} 個缺陷落點，最嚴重在 ${worst.file} 第 ${worst.line} 行`);
  }
}

/* 兩個 token 之間的明度插值。canvas 不吃 CSS 的顏色運算，而擊點的欄底閃動是
   --strip-idle 到 --strip-hit 的一段真實插值，不是換色。 */
function mix(a, b, t) {
  const pa = hex(a);
  const pb = hex(b);
  if (!pa || !pb) return b;
  const k = Math.min(Math.max(t, 0), 1);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function hex(s) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(s).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shorten(text, maxW, g) {
  if (g.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 3 && g.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}
