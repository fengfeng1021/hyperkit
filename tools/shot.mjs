/**
 * CDP 驅動的截圖 + 主控台檢查工具。
 *
 *   node tools/shot.mjs <url> <outPng> [選項]
 *
 * 選項：
 *   --click "text:按鈕文字"   以文字內容尋找 button/a/label/summary 並點擊（可重複）
 *   --click ".css-selector"   以 CSS 選擇器點擊（可重複）
 *   --eval "<JS>"             截圖前在頁面裡執行一段 JS（可重複，在所有 click 之後）
 *   --after <ms>              每次 click / eval 之後的等待，預設 2500
 *   --wait <ms>               載入完成後的等待，預設 2500
 *   --w / --h                 視窗尺寸，預設 1440x900
 *   --full                    截整頁而非只有視窗
 *   --rm                      以 prefers-reduced-motion: reduce 開啟
 *
 * 跟 headless 的 --screenshot 差在：它會回報頁面的 console error / warning、
 * 未捕捉的例外、以及資源載入失敗，那些用 --screenshot 拿不到。
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

/* 依序找一個可用的 Chromium。CHROME 環境變數優先，方便在別台機器上覆寫。 */
const CHROME = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p))

if (!CHROME) {
  console.error('找不到 Chrome 或 Edge。用 CHROME=<執行檔路徑> 指定。')
  process.exit(1)
}

const args = process.argv.slice(2)
const url = args[0]
const out = args[1]
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name)
  return i === -1 ? dflt : args[i + 1]
}
const clicks = []
for (let i = 0; i < args.length; i++) if (args[i] === '--click') clicks.push(args[i + 1])
const evals = []
for (let i = 0; i < args.length; i++) if (args[i] === '--eval') evals.push(args[i + 1])

const W = +opt('w', 1440)
const H = +opt('h', 900)
const WAIT = +opt('wait', 2500)
const AFTER = +opt('after', 2500)
const PORT = 9333 + Math.floor(Math.random() * 400)
const FULL = args.includes('--full')

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--disable-gpu',
  '--no-sandbox',
  '--no-first-run',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  ...(args.includes('--rm') ? ['--force-prefers-reduced-motion'] : []),
  '--user-data-dir=' + (process.env.TEMP || '.') + '/hk-cdp-' + PORT,
  `--window-size=${W},${H}`,
  'about:blank',
], { stdio: 'ignore' })

const cleanup = () => { try { chrome.kill() } catch {} }
process.on('exit', cleanup)

async function getWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      const j = await r.json()
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl
    } catch {}
    await sleep(250)
  }
  throw new Error('chrome devtools endpoint never came up')
}

const wsUrl = await getWsUrl()
const ws = new WebSocket(wsUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

let id = 0
const pending = new Map()
const logs = []
let sessionId = null

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result)
    return
  }
  const m = msg.method
  if (m === 'Runtime.consoleAPICalled') {
    const t = msg.params.type
    if (t === 'error' || t === 'warning' || t === 'assert') {
      logs.push(`[${t}] ` + msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '))
    }
  } else if (m === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    logs.push('[exception] ' + (d.exception?.description || d.text) + ' @' + (d.url || '') + ':' + (d.lineNumber ?? ''))
  } else if (m === 'Log.entryAdded') {
    const e = msg.params.entry
    if (e.level === 'error') logs.push(`[net/${e.source}] ${e.text} ${e.url || ''}`)
  }
}

function send(method, params = {}, useSession = true) {
  const mid = ++id
  const payload = { id: mid, method, params }
  if (useSession && sessionId) payload.sessionId = sessionId
  ws.send(JSON.stringify(payload))
  return new Promise((res, rej) => pending.set(mid, { res, rej }))
}

// attach to a page target
const { targetInfos } = await send('Target.getTargets', {}, false)
let target = targetInfos.find((t) => t.type === 'page')
if (!target) {
  const c = await send('Target.createTarget', { url: 'about:blank' }, false)
  target = { targetId: c.targetId }
}
const att = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true }, false)
sessionId = att.sessionId

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: W, height: H, deviceScaleFactor: 1, mobile: W < 600,
})

const loaded = new Promise((res) => {
  const h = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.method === 'Page.loadEventFired') { ws.removeEventListener('message', h); res() }
  }
  ws.addEventListener('message', h)
})

await send('Page.navigate', { url })
await Promise.race([loaded, sleep(20000)])
await sleep(WAIT)

// 點擊：接受 CSS selector，或 "text:某段文字" 以文字內容尋找按鈕
for (const c of clicks) {
  const expr = c.startsWith('text:')
    ? `(() => {
         const t = ${JSON.stringify(c.slice(5))};
         const el = [...document.querySelectorAll('button,a,[role=button],label,summary')]
           .find(e => (e.textContent||'').replace(/\\s+/g,' ').trim().includes(t));
         if (!el) return 'NOT_FOUND: ' + t;
         el.scrollIntoView({block:'center'});
         el.click();
         return 'clicked: ' + (el.textContent||'').trim().slice(0,40);
       })()`
    : `(() => {
         const el = document.querySelector(${JSON.stringify(c)});
         if (!el) return 'NOT_FOUND: ' + ${JSON.stringify(c)};
         el.scrollIntoView({block:'center'});
         el.click();
         return 'clicked: ' + ${JSON.stringify(c)};
       })()`
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  console.log('  ' + (r.result?.value ?? JSON.stringify(r.result)))
  await sleep(AFTER)
}

// --eval：截圖前在頁面裡跑一段 JS（捲到某處、打開某個狀態）。點擊之後才執行。
for (const e of evals) {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })
  console.log('  eval: ' + JSON.stringify(r.result?.value ?? r.exceptionDetails?.text ?? null))
  await sleep(AFTER)
}

const shotParams = { format: 'png' }
if (FULL) shotParams.captureBeyondViewport = true
const shot = await send('Page.captureScreenshot', shotParams)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, Buffer.from(shot.data, 'base64'))

const title = await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true })
console.log('TITLE: ' + title.result.value)
console.log('SHOT: ' + out)
if (logs.length) {
  console.log('--- CONSOLE (' + logs.length + ') ---')
  for (const l of [...new Set(logs)].slice(0, 25)) console.log('  ' + l)
} else {
  console.log('--- CONSOLE CLEAN ---')
}

ws.close()
cleanup()
process.exit(0)
