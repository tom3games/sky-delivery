// 人物と客の見た目を近くで撮る（検証の途中で目で見る用）。node _look.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const ROOT = import.meta.dirname; mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = 5393
const srv = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch({ ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, '--use-angle=metal', '--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
await muteContext(ctx)
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()) })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__skyReady, null, { timeout: 20000 })
await p.waitForTimeout(4000)
await p.screenshot({ path: 'shots/look-title.png' })
await p.evaluate(() => sky.start(3)); await p.waitForTimeout(1500)
// 走る
await p.evaluate(() => sky.dbg.keys.add('KeyW')); await p.waitForTimeout(1200)
await p.screenshot({ path: 'shots/look-run.png' })
// 振り子
await p.evaluate(() => sky.dbg.keys.delete('KeyW'))
const sw = await p.evaluate(() => {
  sky.dbg.pause(true); sky.dbg.teleport(0, 0, 700, 0); sky.dbg.step(30)
  const cam = sky.camera, V = new cam.position.constructor(18.2, 14, 716).project(cam)
  sky.dbg.pressWire((V.x * 0.5 + 0.5) * innerWidth, (-V.y * 0.5 + 0.5) * innerHeight); sky.dbg.step(2)
  sky.dbg.step(25)
  return !!sky.me.rope
})
console.log('rope', sw)
await p.screenshot({ path: 'shots/look-swing.png' })
console.log(await p.evaluate(() => { const m = sky.dbg.model; return { cls: m.constructor.name, hand: m.handWorld.toArray().map(v => +v.toFixed(1)), rope: sky.me.rope && [sky.me.rope.x, sky.me.rope.y, sky.me.rope.z].map(v => +v.toFixed(1)), me: [sky.me.x, sky.me.y, sky.me.z].map(v => +v.toFixed(1)) } }))
await p.evaluate(() => sky.dbg.pause(false))
// 届け先の窓の前へ
await p.evaluate(() => {
  const sh = sky.sh; sky.dbg.teleport(sky.JOB.pick.near.x, 0, sky.JOB.pick.near.z); sky.dbg.step(2); const o = sh.cur
  sky.dbg.teleport(o.x + o.nx * 7, o.y - 1, o.z + o.nz * 7, Math.atan2(-o.nx, -o.nz))
  sky.me.grounded = false; sky.me.vy = 0
  sky.dbg.pause(true)
})
for (let i = 0; i < 40; i++) { await p.evaluate(() => { sky.me.vy = 0; sky.me.vx = 0; sky.me.vz = 0; sky.dbg.step(1) }); }
await p.waitForTimeout(300)
await p.screenshot({ path: 'shots/look-target.png' })
console.log(await p.evaluate(() => { const P = sky.dbg.target.userData.person, sl = P.slots[P.cur]; return { cur: P.cur, arm: sl && sl.arm && [sl.arm.type, sl.arm.rotation.x.toFixed(2), sl.arm.rotation.z.toFixed(2)], names: sl && Object.keys(sl) } }))
console.log('errs', errs.slice(0, 8))
await b.close(); srv.kill()
