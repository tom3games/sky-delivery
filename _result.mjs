// 結果（給料明細）を件数を変えて撮る。node _result.mjs
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const ROOT = import.meta.dirname, PORT = 5440 + Math.floor(Math.random() * 40)
const srv = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch({ ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, '--use-angle=metal', '--enable-unsafe-swiftshader'] })
for (const [n, w, h, lang] of [[3, 390, 844, 'ja'], [16, 390, 844, 'ja'], [16, 1440, 900, 'en']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'ja-JP' }); await muteContext(ctx)
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message))
  await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__skyReady, null, { timeout: 20000 })
  await p.evaluate(([n, lang]) => { sky.setLang(lang); sky.start(8); sky.dbg.pause(true); for (let i = 0; i < n; i++) { const t = i % 3 ? 'near' : 'far'; sky.dbg.teleport(sky.JOB.pick[t].x, 0, sky.JOB.pick[t].z); sky.dbg.step(2); if (i === 1) sky.dbg.lookAtWindow('duf', 15); const o = sky.sh.cur; sky.dbg.teleport(o.x + o.nx * 2, o.y - 1.1, o.z + o.nz * 2); sky.dbg.step(2) } sky.dbg.step(60 * 250); sky.dbg.pause(false) }, [n, lang])
  await p.waitForTimeout(2500)
  await p.screenshot({ path: `shots/result-${n}-${lang}-${w}.png` }); console.log(n, lang, w, 'errs', errs)
  await ctx.close()
}
await b.close(); srv.kill()
