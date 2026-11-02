// 客の見た目を撮る（種類ごとに窓の前から1枚＋受け取った後の反応）。node _cust.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const ROOT = import.meta.dirname; mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = 5392 + Math.floor(Math.random() * 40)
const srv = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch({ ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, '--use-angle=metal', '--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
await muteContext(ctx)
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__skyReady, null, { timeout: 20000 })
await p.waitForTimeout(2500)
await p.evaluate(() => { sky.start(5); sky.dbg.pause(true); sky.dbg.teleport(sky.JOB.pick.near.x, 0, sky.JOB.pick.near.z); sky.dbg.step(2) })
const out = {}
for (const type of (process.argv[2] || 'normal,duf,polite,coins,photo,net').split(',')) {
  out[type] = await p.evaluate(([tp, dist]) => { const r = sky.dbg.lookAtWindow(tp, dist); sky.sh.near = true; sky.dbg.render(40); return r }, [type, +(process.env.DIST || 6)])
  await p.screenshot({ path: `shots/cust-${type}.png` })
  await p.evaluate(tp => { sky.dbg.react(tp === 'duf' ? 'good' : 'good', false); sky.dbg.render(12) }, type)
  await p.screenshot({ path: `shots/cust-${type}-react.png` })
}
await p.evaluate(() => { sky.dbg.react('mess', true); sky.dbg.render(10) })
await p.screenshot({ path: `shots/cust-angry.png` })
console.log(JSON.stringify(out), 'errs', errs.slice(0, 5))
await b.close(); srv.kill()
