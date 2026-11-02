// 向き: カメラを何周回しても、スティックの上下左右＝画面の上下左右か（地上・空中・ワイヤー中・壁）。node _dir.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const ROOT = import.meta.dirname, PORT = 5401 + Math.floor(Math.random() * 50)
const srv = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch({ ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, '--use-angle=metal', '--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'ja-JP' })
await muteContext(ctx)
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message))
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__skyReady || window.__ttReady || window.__catchReady, null, { timeout: 20000 })
const out = await p.evaluate(() => {
  const G = window.sky, res = []
  const hds = [0, 1.2, Math.PI, 4.4, Math.PI * 2 + 0.5, -2.5, Math.PI * 4 + 2]
  const dirs = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }
  let X = 0, Z = 0
  const run = (scen, hd, sx, sy) => {
    const r = G.me, Y = scen === 'ground' ? 0 : 25
    G.cam.hd = hd; G.cam.userT = performance.now()
    for (let i = 0; i < 90; i++) { G.dbg.teleport(X, Y, Z, 0); G.dbg.step(1) }
    G.dbg.teleport(X, Y, Z, 0)
    if (scen !== 'ground') { r.vz = 12; r.vx = 0; r.vy = 0; r.grounded = false }
    if (scen === 'rope') r.rope = { x: X, y: 50, z: Z + 8, len: Math.hypot(50 - 26.2, 8) + 0.3, t: 1 }
    G.dbg.step(1)
    const e = G.camera.matrixWorld.elements
    let rx = e[0], rz = e[2], fx = -e[8], fz = -e[10]; const l1 = Math.hypot(rx, rz), l2 = Math.hypot(fx, fz); rx /= l1; rz /= l1; fx /= l2; fz /= l2
    const x0 = r.x, z0 = r.z
    if (sx || sy) { G.dbg.stick.id = 99; G.dbg.stick.x = sx; G.dbg.stick.y = sy }
    G.dbg.step(36)
    G.dbg.stick.id = null; G.dbg.stick.x = G.dbg.stick.y = 0
    return { side: (r.x - x0) * rx + (r.z - z0) * rz, fwd: (r.x - x0) * fx + (r.z - z0) * fz }
  }
  for (const scen of ['ground', 'air', 'rope']) for (const hd of hds) {
    G.toTitle(); G.start(3); G.dbg.pause(true)
    // 開けた所: 一番近い建物から離れた通り（出発点の近くで、上空 40m まで建物が無い所を探す）
    const cols = G.world.colliders.filter(o => o.y1 > 1.5 && o.y0 < 45)
    let best = null
    for (let dx = -120; dx <= 120; dx += 6) for (let dz = -120; dz <= 120; dz += 6) {
      const x = G.me.x + dx, z = G.me.z + dz
      let dmin = 1e9; for (const o of cols) { const c = Math.cos(o.yaw || 0), s = Math.sin(o.yaw || 0), px = x - o.cx, pz = z - o.cz, u = Math.abs(px * c - pz * s) - o.hw, v = Math.abs(px * s + pz * c) - o.hl; const d = Math.hypot(Math.max(u, 0), Math.max(v, 0)); if (d < dmin) dmin = d }
      if (!best || dmin > best.d) best = { x, z, d: dmin }
    }
    X = best.x; Z = best.z
    const base = run(scen, hd, 0, 0)
    for (const [nm, [sx, sy]] of Object.entries(dirs)) { const m = run(scen, hd, sx, sy); res.push({ scen, hd: +hd.toFixed(2), nm, side: m.side - base.side, fwd: m.fwd - base.fwd, clear: +best.d.toFixed(1) }) }
  }
  G.dbg.pause(false)
  return res
})
const bad = out.filter(o => { const main = o.nm === 'left' ? -o.side : o.nm === 'right' ? o.side : o.nm === 'up' ? o.fwd : -o.fwd; const other = o.nm === 'left' || o.nm === 'right' ? Math.abs(o.fwd) : Math.abs(o.side); return !(main > 0.3 && main > other * 0.6) })
for (const o of bad.slice(0, 8)) console.log('NG', JSON.stringify(o))
console.log(JSON.stringify({ total: out.length, ng: bad.length, errs: errs.slice(0, 3) }))
await b.close(); srv.kill()
process.exit(bad.length || errs.length ? 1 : 0)
