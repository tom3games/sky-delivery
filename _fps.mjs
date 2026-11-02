// 遊び中の FPS を測る（人物の見た目を新旧で比べる）。node _fps.mjs
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const PORT = 5395
const srv = spawn(process.execPath, ['server.mjs'], { cwd: import.meta.dirname, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
for (const [name, bt, opt] of [['chromium', chromium, { ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, '--use-angle=metal'] }], ['webkit', webkit, {}]]) {
  const b = await bt.launch(opt)
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: name === 'chromium', hasTouch: true }); await muteContext(ctx)
  const p = await ctx.newPage()
  await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__skyReady); await p.waitForTimeout(4000)
  await p.evaluate(() => sky.start(3)); await p.waitForTimeout(1500)
  const r = await p.evaluate(async () => {
    sky.dbg.keys.add('KeyW')
    const meas = () => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else res(+(n / 4).toFixed(1)) }; requestAnimationFrame(f) })
    const fNew = await meas()
    return { model: sky.dbg.model.constructor.name, fps: fNew }
  })
  console.log(name, JSON.stringify(r))
  await b.close()
}
srv.kill()
