/* ==========================================================================
   HYPERKIT — hub 互動層

   這個頁面只有一個被創作的動效時刻：游標（或 focus，或在手機上的捲動）停在
   某一行時，整個櫃體換成那個工具的世界。它同時完成三件事——回饋（你選中了
   哪一行）、階層（被選中的行升起、其餘退開）、以及這個 hub 唯一想證明的事：
   六個工具是六個不同的世界。

   顏色在 OKLab 空間插值，不是 sRGB。sRGB 直線插值會讓 #0B0D17 → #F7F9FC 這種
   跨明度的過渡中途壓進一坨死灰；OKLab 的中途仍然是一個有生命的顏色。這是
   GradientKit 那一格在教的事，hub 自己得先做到。
   ========================================================================== */

const WORLDS = [
  {
    slug: 'invoice-wrapped-tw', zh: '發票回顧',
    line: '把財政部載具的消費明細丟進來，30 秒長出一份年度消費回顧。解析、統計、出圖全在這台電腦上完成。',
    bg: '#0B0D17', fg: '#F4F6FB', dim: '#AEB4CC', accent: '#FF4D2E',
  },
  {
    slug: 'mortgage-sandbox-tw', zh: '房貸沙盤',
    line: '年終獎金該提前還款、丟進市場、還是先用寬限期？三條淨資產曲線放在同一張三十年時間軸上對撞。',
    bg: '#F7F9FC', fg: '#12305C', dim: '#2E5C96', accent: '#E86A2B',
  },
  {
    slug: 'cutout-forge', zh: '去背熔爐',
    line: '整批商品圖在瀏覽器內去背。沒有上傳、沒有 credit、沒有張數上限，因為運算成本本來就在你這邊。',
    bg: '#0E0E10', fg: '#F4F6F6', dim: '#949B9B', accent: '#22E5C8',
  },
  {
    slug: 'mockup-loom', zh: '情境織機',
    line: '把設計稿套到商品情境上，圖案沿著布料的每一道皺褶彎折——不是貼紙式的平貼，是真的位移貼圖。',
    bg: '#E6E4E1', fg: '#1E1E1C', dim: '#55534F', accent: '#8E3320',
  },
  {
    slug: 'gradientkit', zh: '漸層工坊',
    line: 'OKLCH 感知均勻插值、mesh 漸層、顆粒噪點消色帶。一個顏色工具的介面不該有自己的顏色，所以它沒有。',
    bg: '#000000', fg: '#FFFFFF', dim: '#B4B4B4', accent: '#FFFFFF',
  },
  {
    slug: 'chatvault', zh: '對話金庫',
    line: '把 ChatGPT、Claude、Gemini 的匯出檔拖進來，幾萬則訊息秒開並可全文搜尋。對話不離開你的電腦。',
    bg: '#F2F2EF', fg: '#1C1C1A', dim: '#45453F', accent: '#8A5F06',
  },
  {
    slug: 'diff-warden', zh: '產碼審查台',
    line: '選一個本機資料夾，用你自己的 API key 審查 agent 剛寫進去的那批程式碼。誤報標一次，之後就不再出現。',
    bg: '#14100E', fg: '#F2F4F3', dim: '#A5AAA9', accent: '#C6F24E',
  },
  {
    slug: 'puzzle-press', zh: '益智書排版廠',
    line: '貼一份單字清單，生出題目與答案頁。數獨保證唯一解，迷宮保證唯一路徑，gutter 依頁數自動套 KDP 級距。',
    bg: '#F0F0EE', fg: '#111111', dim: '#5C5C58', accent: '#C4006A',
  },
]

const NEUTRAL = {
  slug: null, zh: '八個工具',
  line: '把游標移到任一行，整個頁面會變成那個工具的世界',
  bg: '#0A0A0B', fg: '#E8E8E6', dim: '#8E8E8C', accent: '#E8E8E6',
}

/* ------------------------------------------------------------ 色彩：OKLab */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const n = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h
  return [
    parseInt(n.slice(0, 2), 16),
    parseInt(n.slice(2, 4), 16),
    parseInt(n.slice(4, 6), 16),
  ]
}

const toLinear = (c) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

const toGamma = (v) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055
  return Math.round(clamp01(c) * 255)
}

function hexToOklab(hex) {
  const [r8, g8, b8] = hexToRgb(hex)
  const r = toLinear(r8), g = toLinear(g8), b = toLinear(b8)

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ]
}

function oklabToHex([L, A, B]) {
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B
  const s_ = L - 0.0894841775 * A - 1.2914855480 * B

  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_

  const r = toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
  const g = toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
  const b = toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)

  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}

const mixOklab = (a, b, t) => oklabToHex([
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
])

const KEYS = ['bg', 'fg', 'dim', 'accent']

function toLab(world) {
  const out = {}
  for (const k of KEYS) out[k] = hexToOklab(world[k])
  return out
}

const LAB = new Map()
for (const w of [...WORLDS, NEUTRAL]) LAB.set(w.slug, toLab(w))

/* ------------------------------------------------------------------- 元素 */

const root = document.documentElement
const rows = Array.from(document.querySelectorAll('.row'))
const shots = new Map(
  Array.from(document.querySelectorAll('.shot')).map((el) => [el.dataset.slug, el])
)
const edge = document.querySelector('.frame-edge')
const statusZh = document.getElementById('status-zh')
const statusLine = document.getElementById('status-line')
const indexEl = document.getElementById('index')

const hasGsap = typeof window.gsap !== 'undefined'
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

/* 截圖還沒放進來時不要留一個破圖框，改用該世界的底色撐住畫面 */
for (const [slug, img] of shots) {
  img.addEventListener('error', () => {
    img.dataset.failed = 'true'
    img.style.background = (WORLDS.find((w) => w.slug === slug) || NEUTRAL).bg
    img.removeAttribute('src')
  }, { once: true })
}

/* --------------------------------------------------------------- 世界切換 */

let current = null          // 目前生效的 slug（null = 中性態）
let paintTween = null
const painted = { ...NEUTRAL }

function paint(colors) {
  for (const k of KEYS) root.style.setProperty('--' + k, colors[k])
}

function applyWorld(world, { instant = false } = {}) {
  const from = KEYS.reduce((acc, k) => (acc[k] = hexToOklab(painted[k]), acc), {})
  const to = LAB.get(world.slug)

  if (instant || !hasGsap || reduceMotion.matches) {
    for (const k of KEYS) painted[k] = world[k]
    paint(painted)
    return
  }

  paintTween?.kill()
  const p = { t: 0 }
  paintTween = window.gsap.to(p, {
    t: 1,
    duration: 0.5,
    ease: 'power3.out',
    onUpdate() {
      for (const k of KEYS) painted[k] = mixOklab(from[k], to[k], p.t)
      paint(painted)
    },
  })
}

/* 預覽視窗：新截圖從舊截圖上由左往右擦出，一條 accent 色的線走在擦除前緣 */
function revealShot(slug) {
  const next = slug ? shots.get(slug) : null

  for (const [s, img] of shots) {
    if (s !== slug) img.classList.remove('is-current')
  }

  if (!next) {
    if (hasGsap) window.gsap.to(Array.from(shots.values()), { clipPath: 'inset(0 100% 0 0)', duration: 0.3, ease: 'power2.inOut', overwrite: true })
    else for (const img of shots.values()) img.style.clipPath = 'inset(0 100% 0 0)'
    return
  }

  next.classList.add('is-current')

  if (!hasGsap || reduceMotion.matches) {
    next.style.clipPath = 'inset(0 0 0 0)'
    for (const [s, img] of shots) if (s !== slug) img.style.clipPath = 'inset(0 100% 0 0)'
    return
  }

  const g = window.gsap
  g.killTweensOf([next, edge])
  g.set(next, { clipPath: 'inset(0 100% 0 0)', zIndex: 2 })
  for (const [s, img] of shots) if (s !== slug) g.set(img, { zIndex: 1 })

  const tl = g.timeline()
  tl.to(next, { clipPath: 'inset(0 0% 0 0)', duration: 0.55, ease: 'expo.out' }, 0)
    .fromTo(edge,
      { xPercent: 0, autoAlpha: 1 },
      { xPercent: 0, left: '100%', duration: 0.55, ease: 'expo.out' }, 0)
    .set(edge, { left: 0, autoAlpha: 0 })
}

/* 狀態列：文字逐字換掉，不是整段淡入淡出——換的是內容，不是圖層 */
let statusTween = null
function setStatus(world) {
  statusZh.textContent = world.zh

  if (!hasGsap || reduceMotion.matches) {
    statusLine.textContent = world.line
    return
  }

  statusTween?.kill()
  const g = window.gsap
  const text = world.line
  const state = { n: 0 }
  statusLine.textContent = ''

  statusTween = g.to(state, {
    n: text.length,
    duration: Math.min(0.42, text.length * 0.012),
    ease: 'power2.out',
    onUpdate() { statusLine.textContent = text.slice(0, Math.round(state.n)) },
    onComplete() { statusLine.textContent = text },
  })
}

function select(slug, { instant = false } = {}) {
  if (slug === current) return
  current = slug

  const world = WORLDS.find((w) => w.slug === slug) || NEUTRAL

  for (const row of rows) row.classList.toggle('is-active', row.dataset.slug === slug)

  applyWorld(world, { instant })
  revealShot(slug)
  setStatus(world)

  /* 其餘各行退到後面：這是階層，不是裝飾 */
  if (hasGsap && !reduceMotion.matches) {
    const g = window.gsap
    const others = rows.filter((r) => r.dataset.slug !== slug)
    const active = rows.find((r) => r.dataset.slug === slug)

    g.to(others.map((r) => r.querySelector('.row-en')), {
      autoAlpha: slug ? 0.34 : 0.58,
      filter: slug ? 'blur(1.4px)' : 'blur(0px)',
      x: slug ? -6 : 0,
      duration: 0.42,
      ease: 'power3.out',
      stagger: { each: 0.018, from: slug ? 'start' : 'end' },
      overwrite: 'auto',
    })

    if (active) {
      g.to(active.querySelector('.row-en'), {
        autoAlpha: 1, filter: 'blur(0px)', x: 0,
        duration: 0.42, ease: 'power3.out', overwrite: 'auto',
      })
    }
  }
}

/* ------------------------------------------------------------------- 事件 */

const isCoarse = window.matchMedia('(hover: none), (max-width: 900px)')

if (!isCoarse.matches) {
  for (const row of rows) {
    row.addEventListener('pointerenter', () => select(row.dataset.slug))
    row.querySelector('.row-link').addEventListener('focus', () => select(row.dataset.slug))
  }
  /* 游標離開索引時**不**收回世界。收回會讓預覽框變回空框，等於懲罰使用者把手移開；
     停在最後看的那一個，才讓人有時間把畫面看完。focus 仍然優先於游標。 */
  indexEl.addEventListener('pointerleave', () => {
    const focused = document.activeElement?.closest?.('.row')
    if (focused) select(focused.dataset.slug)
  })
}

/* 鍵盤：上下鍵在索引裡移動，Enter 由 <a> 自己處理 */
indexEl.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  const links = rows.map((r) => r.querySelector('.row-link'))
  const i = links.indexOf(document.activeElement)
  if (i === -1) return
  e.preventDefault()
  const next = links[(i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length]
  next.focus()
})

/* 手機沒有 hover：捲動就是換世界的動作 */
function initScrollWorlds() {
  if (!hasGsap || !window.ScrollTrigger) return
  window.gsap.registerPlugin(window.ScrollTrigger)
  for (const row of rows) {
    window.ScrollTrigger.create({
      trigger: row,
      start: 'top 62%',
      end: 'bottom 38%',
      onToggle: (self) => { if (self.isActive) select(row.dataset.slug) },
      invalidateOnRefresh: true,
    })
  }
}

if (isCoarse.matches) initScrollWorlds()

/* 首次載入：預先把每張截圖的裁切狀態設好，避免第一次 hover 時整張閃一下 */
if (hasGsap) {
  window.gsap.set(Array.from(shots.values()), { clipPath: 'inset(0 100% 0 0)' })
  window.gsap.set(edge, { autoAlpha: 0 })
}
paint(painted)

/* 開場就站在第一個工具的世界裡。空的預覽框加一句「把游標移過來」不是引導，是把
   證據留到第二步；直接把第一個世界穿在身上，機制自己會說話，而使用者移動游標的
   那一刻拿到的是驗證，不是說明。 */
select(WORLDS[0].slug, { instant: true })

/* 偏好在執行期被改掉時（作業系統切換減少動態），下一次切換就照新的規則走 */
reduceMotion.addEventListener?.('change', () => {
  paintTween?.kill()
  statusTween?.kill()
  const world = WORLDS.find((w) => w.slug === current) || NEUTRAL
  applyWorld(world, { instant: true })
  setStatus(world)
})
