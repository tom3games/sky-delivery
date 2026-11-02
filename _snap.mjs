// 撮影（検証の途中で目で見る用）。node _snap.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const ROOT = import.meta.dirname; mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = 5391
const srv = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch({ ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, '--use-angle=metal', '--enable-unsafe-swiftshader'] })
const sizes = process.argv[2] === 'all' ? [['phone', 390, 844, true], ['pc', 1440, 900, false], ['land', 844, 390, true]] : [['phone', 390, 844, true]]
for (const [n, w, h, touch] of sizes) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'ja-JP', hasTouch: touch, isMobile: touch, deviceScaleFactor: 2 })
  await muteContext(ctx)
  const p = await ctx.newPage(); const errs = []
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__skyReady, null, { timeout: 20000 })
  await p.waitForTimeout(3500)
  await p.screenshot({ path: `shots/${n}-title.png` })
  await p.evaluate(() => sky.start(3)); await p.waitForTimeout(2500)
  await p.screenshot({ path: `shots/${n}-play.png` })
  // ワイヤーを掛けて飛ぶ
  await p.evaluate(() => { sky.dbg.keys.add('KeyW') }); await p.waitForTimeout(600)
  await p.keyboard.down('KeyE'); await p.keyboard.up('KeyE'); await p.waitForTimeout(900)
  await p.screenshot({ path: `shots/${n}-swing.png` })
  await p.evaluate(() => sky.showResult()); await p.waitForTimeout(800)
  await p.screenshot({ path: `shots/${n}-result.png` })
  console.log(n, 'errs', errs.slice(0, 5))
  await ctx.close()
}
await b.close(); srv.kill()
