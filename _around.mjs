// 開始地点から8方向を撮り、ドローコールと fps を測る（店の周りの確認用）。node _around.mjs <ラベル>
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const ROOT = import.meta.dirname, label = process.argv[2] || 'now'; mkdirSync(ROOT + '/shots/around', { recursive: true })
const PORT = 5396
const srv = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const fpsOf = p => p.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(f); else res(+(n / 5).toFixed(1)) }; requestAnimationFrame(f) }))
const blank = async b => { const c = await b.newContext(); const q = await c.newPage(); await q.goto('about:blank'); const v = await fpsOf(q); await c.close(); return v }
for (const [name, bt, opt] of [['chromium', chromium, { ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], channel: 'chromium' }], ['webkit', webkit, {}]]) {
  const b = await bt.launch(opt)
  console.log(name, '空ページ fps', await blank(b))
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', deviceScaleFactor: 2, hasTouch: true, ...(name === 'chromium' ? { isMobile: true } : {}) }); await muteContext(ctx)
  const p = await ctx.newPage(); const errs = []
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__skyReady, null, { timeout: 60000 }); await p.waitForTimeout(1500)
  await p.evaluate(() => sky.start(3)); await p.waitForTimeout(1200)
  await p.waitForTimeout(800)
  const fps = await fpsOf(p)
  const stat = await p.evaluate(() => { const i = sky.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geo: i.memory.geometries, tex: i.memory.textures } })
  console.log(name, label, 'fps', fps, JSON.stringify(stat), 'errs', errs.slice(0, 5))
  if (name === 'chromium' || process.argv[3] === 'all') {
    await p.evaluate(() => sky.dbg.pause(true))
    for (const [nm, deg] of [['E', 90], ['SE', 45], ['S', 0], ['SW', -45], ['W', -90], ['NW', -135], ['N', 180], ['NE', 135]]) {
      await p.evaluate(a => { sky.cam.hd = a * Math.PI / 180; sky.cam.pitch = 0.42; sky.cam.userT = performance.now() + 1e8; sky.dbg.render(25) }, deg)
      await p.screenshot({ path: `shots/around/${label}-${name}-${nm}.png` })
    }
  }
  await b.close()
}
srv.kill()
