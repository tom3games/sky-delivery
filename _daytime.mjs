// 昼→夕方→夜を6サイズ×3時刻で撮る（開始直後・中盤・終了間際）。node _daytime.mjs
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const ROOT = import.meta.dirname; mkdirSync(ROOT + '/shots/day', { recursive: true })
const PORT = 5411
const srv = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch({ ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, '--use-angle=metal'] })
const SIZES = [['small', 360, 640, true], ['phone', 390, 844, true], ['land', 844, 390, true], ['land-se', 667, 375, true], ['tab', 768, 1024, true], ['pc', 1440, 900, false]]
for (const [n, w, h, touch] of SIZES) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'ja-JP', hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 })
  await muteContext(ctx)
  const p = await ctx.newPage(); const errs = []
  p.on('pageerror', e => errs.push(e.message))
  await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__skyReady, null, { timeout: 20000 }); await p.waitForTimeout(3000)
  await p.evaluate(() => sky.start(3)); await p.waitForTimeout(800)
  for (const [tag, t] of [['start', 2], ['mid', 95], ['end', 175]]) {
    await p.evaluate(t => { sky.sh.t = t; sky.dbg.teleport(-60, 0, 690, Math.PI / 2) }, t); await p.waitForTimeout(900)
    await p.screenshot({ path: `shots/day/${n}-${tag}.png` })
  }
  console.log(n, 'errs', errs.slice(0, 3))
  await ctx.close()
}
await b.close(); srv.kill()
