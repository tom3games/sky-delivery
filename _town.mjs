// 店の周りの町を見て回る（検証の途中で目で見る用）。node _town.mjs [webkit]
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const ROOT = import.meta.dirname; mkdirSync(ROOT + '/shots/around', { recursive: true })
const PORT = 5397, wk = process.argv[2] === 'webkit'
const srv = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = wk ? await webkit.launch() : await chromium.launch({ ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], channel: 'chromium' })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', deviceScaleFactor: 2, hasTouch: true, ...(wk ? {} : { isMobile: true }) }); await muteContext(ctx)
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__skyReady, null, { timeout: 60000 }); await p.waitForTimeout(1200)
await p.evaluate(() => sky.start(3)); await p.waitForTimeout(600); await p.evaluate(() => sky.dbg.pause(true))
const tag = wk ? 'wk' : 'cr'
const view = async (name, x, y, z, deg, pitch = 0.3, night = false) => {
  await p.evaluate(([x, y, z, deg, pitch, night]) => {
    if (night) sky.sh.t = sky.JOB.shiftSec * 0.97; else sky.sh.t = 8
    sky.dbg.teleport(x, y, z, deg * Math.PI / 180); sky.me.grounded = y < 0.1; sky.me.vy = 0
    sky.cam.hd = deg * Math.PI / 180; sky.cam.pitch = pitch; sky.cam.userT = performance.now() + 1e8
    sky.dbg.step(1); sky.dbg.teleport(x, y, z, deg * Math.PI / 180); sky.dbg.render(30)
  }, [x, y, z, deg, pitch, night])
  await p.screenshot({ path: `shots/around/town-${tag}-${name}.png` })
}
await view('alley-east', 58, 0, 850, 90)
await view('fountain', 67, 0, 866, 0, 0.25)
await view('south', 70, 0, 915, 90, 0.3)
await view('west-col', 37, 0, 890, 20, 0.3)
await view('air', 30, 34, 835, 45, 0.75)
await view('vend', 39, 0, 852, 80, 0.2)
await view('night-start', 21, 0, 842, 80, 0.4, true)
await view('night-alley', 58, 0, 850, 90, 0.3, true)
console.log('errs', errs)
await b.close(); srv.kill()
