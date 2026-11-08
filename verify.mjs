// 空中出前の検証。node verify.mjs（テスト中は無音: mute.mjs）
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium, webkit } from 'playwright'
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { createWorld } from './shared/track.js'
import { createRunner, stepRunner, RUN, rayHit, findAnchor } from './shared/runner.js'
import { addTown } from './shared/town.js'
import { createStreet, buildPoles } from './shared/street.js'
import { JOB, createShift, stepShift, makeOrder, mulberry, settle, payData, money, earned, windowPool } from './shared/delivery.js'
import { AIR, createAir, stepAir } from './shared/air.js'
import { STREET } from './shared/street.js'
import { sweep } from './tools/reach.mjs'
const ROOT = import.meta.dirname
execFileSync(process.execPath, ['tools/build.mjs'], { cwd: ROOT, stdio: 'inherit' })   // 公開するのは1つにまとめた dist/game.js。先に作り直す
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = 5390
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const results = []
async function t(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) return   // ONLY=正規表現 で一部だけ回す
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${e.message.split('\n')[0]}`) }
}
const expect = (c, msg) => { if (!c) throw new Error(msg) }
const GL = ['--use-angle=metal', '--enable-unsafe-swiftshader']
async function open(browser, opts = {}) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await muteContext(ctx)
  await ctx.addInitScript(() => { try { localStorage.clear() } catch (e) {} })
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error' && !/GL Driver|WebGL|GPU stall/.test(m.text())) p.errs.push('console ' + m.text()) })
  // GLB は three の FileLoader が中身を読み切ったあと Chromium が ERR_ABORTED（canceled）と報告することがある（データは届いて使えている）。成否は下の charAssets で見る
  p.on('requestfailed', r => { const e = r.failure() && r.failure().errorText; if (/fonts\.(googleapis|gstatic)/.test(r.url()) || (/\.glb/.test(r.url()) && e === 'net::ERR_ABORTED')) return; p.errs.push('reqfail ' + r.url() + ' ' + e) })
  await p.goto(URL0); await p.waitForFunction(() => window.__skyReady, null, { timeout: 60000 })
  return p
}
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = []
  for (const el of document.querySelectorAll('.screen:not(.hidden) *, #hud:not(.hidden) *')) {
    if (el.closest('.hidden') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue
    if (el.closest('#arrow,#miss,#say')) continue
    const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push((el.id || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right))
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 5) }
})
const fit = q => q.evaluate(() => {
  const H = innerHeight, de = document.documentElement, over = []
  if (de.scrollHeight > H + 1) over.push('page:' + de.scrollHeight)
  for (const el of document.querySelectorAll('.screen:not(.hidden) button,.screen:not(.hidden) a,.screen:not(.hidden) canvas,#hud:not(.hidden) button,#ticket,#bowl')) {
    if (el.closest('.hidden')) continue
    const r = el.getBoundingClientRect(); if (!r.width) continue
    if (r.bottom > H + 1 || r.top < -1) over.push((el.id || el.className) + ':' + Math.round(r.top) + '-' + Math.round(r.bottom))
  }
  // 伝票・丼・ボタン同士が重ならない
  const rs = [...document.querySelectorAll('#hud:not(.hidden) #ticket,#hud:not(.hidden) #bowl,#hud:not(.hidden) #btnPause,#touch:not(.hidden) .tbtn,#touch:not(.hidden) .stick')].map(e => [e.id || e.dataset.k || e.className, e.getBoundingClientRect()])
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i][1], b = rs[j][1]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) over.push('overlap ' + rs[i][0] + '×' + rs[j][0]) }
  return { H, over: over.slice(0, 6) }
})

// ---------------------------------------------------------------- 仕組み（node だけ）
const world = createWorld('city')
await t('ワイヤー: 届く距離は75m。遠すぎる所を狙うと、その向きで届く所に掛かるか×（75mより遠くには掛からない）', () => {
  const r = createRunner({ id: 'a', spawn: { x: 0, y: 0, z: 700, yaw: 0 } })
  stepRunner(r, { wire: true, wireAt: { x: 18, y: 30, z: 900 } }, 1 / 60, world)
  const miss = r.events.find(e => e.t === 'wireMiss'), w = r.events.find(e => e.t === 'wire')
  const d = w ? Math.hypot(w.x - r.x, w.y - r.y, w.z - r.z) : 0
  expect((w && d <= RUN.wireRange + 2) || (!r.rope && miss && miss.far), JSON.stringify(r.events)); return { got: !!w, d: Math.round(d) }
})
await t('ワイヤー: 75m以内なら掛かる', () => {
  const r = createRunner({ id: 'a', spawn: { x: 0, y: 0, z: 700, yaw: 0 } })
  stepRunner(r, { wire: true, wireAt: { x: 18, y: 18, z: 715 } }, 1 / 60, world)
  expect(r.rope, JSON.stringify(r.events)); return { len: +r.rope.len.toFixed(1) }
})
await t('巻き取り: ボタンは無い（押しても同じ）。振り子の下で自動で少しずつ縮むだけで、引き寄せない', () => {
  const mk = () => { const r = createRunner({ id: 'a', spawn: { x: 0, y: 12, z: 700, yaw: 0 } }); r.grounded = false; r.vz = 12; r.rope = { x: 0, y: 30, z: 712, len: 21, t: 0 }; return r }
  const a = mk(), b = mk()
  for (let i = 0; i < 40; i++) { stepRunner(a, { boost: true }, 1 / 60, world); stepRunner(b, {}, 1 / 60, world) }
  const va = Math.hypot(a.vx, a.vy, a.vz), vb = Math.hypot(b.vx, b.vy, b.vz)
  expect(a.rope && b.rope, 'rope lost')
  expect(Math.abs(a.rope.len - b.rope.len) < 1e-6 && Math.abs(va - vb) < 1e-6, `boost が効いている ${a.rope.len} vs ${b.rope.len}`)
  expect(b.rope.len < 21 - 0.3 && b.rope.len > 21 - 8, 'auto reel ' + b.rope.len)
  expect(va < 30, 'too fast ' + va)
  return { len: +b.rope.len.toFixed(1), v: +vb.toFixed(1) }
})
await t('スイングの方が走るより速い（6秒で進む距離）', () => {
  const run = (wire) => { const r = createRunner({ id: 'a', spawn: { x: 0, y: 0, z: 300, yaw: 0 } }); let t = 0; while (t < 6) { stepRunner(r, { throttle: 1, wire: wire && Math.floor(t * 4) % 3 === 0 && !r.rope }, 1 / 60, world); t += 1 / 60 } return Math.hypot(r.x, r.z - 300) }
  const runD = run(false), swingD = run(true)
  expect(swingD > runD * 1.4, JSON.stringify({ runD, swingD })); return { run: Math.round(runD), swing: Math.round(swingD) }
})
await t('壁に張り付いて止まれる・左右上下に這える・跳ぶと離れる', () => {
  const b = world.colliders.find(o => o.kind === 'building' && o.y1 > 20 && !o.small && Math.abs(o.cx - 30) < 300 && Math.abs(o.cz - 842) < 300 && o.hw > 10)
  const r = createRunner({ id: 'a', spawn: { x: b.cx, y: 0, z: b.cz - b.hl - 5, yaw: 0 } })
  const run = (sec, inp) => { for (let i = 0; i < sec * 60; i++) stepRunner(r, inp, 1 / 60, world) }
  run(1.2, { throttle: 1 }); const c0 = !!r.climbing, y0 = r.y
  run(1, {}); const hang = !!r.climbing && Math.abs(r.y - y0) < 0.5
  let x = r.x; run(0.8, { wallX: 1 }); const right = Math.abs(r.x - x)
  x = r.x; run(0.8, { wallX: -1 }); const left = Math.abs(r.x - x)
  let y = r.y; run(0.5, { wallY: -1 }); const down = y - r.y
  y = r.y; run(0.4, { wallY: 1 }); const up = r.y - y
  const on = !!r.climbing; run(0.1, { jump: true })
  const res = { c0, hang, right: +right.toFixed(1), left: +left.toFixed(1), down: +down.toFixed(1), up: +up.toFixed(1), off: !r.climbing }
  expect(c0 && hang && right > 2 && left > 2 && down > 1.5 && up > 1.5 && on && !r.climbing, JSON.stringify(res)); return res
})
await t('店（宙吊軒）は通り抜けできない・店と一軒家にワイヤーが掛かる', () => {
  addTown(world, JOB.shop)
  const sp = world.town.shop
  const r = createRunner({ id: 'a', spawn: { x: sp.cx - sp.hw - 4, y: 0, z: sp.cz, yaw: Math.PI / 2 } })
  let through = false
  for (let i = 0; i < 120; i++) { stepRunner(r, { throttle: 1, steer: 0 }, 1 / 60, world); if (Math.abs(r.x - sp.cx) < sp.hw - 0.2 && Math.abs(r.z - sp.cz) < sp.hl - 0.2 && r.y < sp.y1 - 0.3) through = true }   // 壁を登って屋根を越えるのはよい。中を通るのはだめ
  const hit = rayHit(world, sp.cx - 20, 2, sp.cz, 1, 0.05, 0, 60)
  const shopWire = !!hit && Math.abs(hit.x - (sp.cx - sp.hw)) < 0.6
  const h = world.town.houses[0]
  const r2 = createRunner({ id: 'b', spawn: { x: h.cx, y: 0, z: h.cz + h.face * (h.hl + 12), yaw: h.face > 0 ? Math.PI : 0 } })
  stepRunner(r2, { wire: true, wireAt: { x: h.cx, y: h.y1 - 1, z: h.cz + h.face * h.hl } }, 1 / 60, world)
  const houseWire = !!r2.rope
  expect(!through && shopWire && houseWire && world.town.houses.length >= 3, JSON.stringify({ through, x: r.x, shopWire, houseWire, houses: world.town.houses.length })); return { houses: world.town.houses.length }
})
// ---- 店の周りの町（2026-11-04 本人「店の周りが空き地すぎる。引っ掛けるものがどこにも無い。自動販売機や一軒家とかも含めてある程度埋めて」）
const townW = createWorld('city'); addTown(townW, JOB.shop); buildPoles(townW, JOB.shop)
const fillAll = () => { const F = townW.town.fill; return [...F.houses, ...F.apts, ...F.vends, ...F.posts] }
const gapBox = (o, x, z) => Math.hypot(Math.max(0, Math.abs(x - o.cx) - o.hw), Math.max(0, Math.abs(z - o.cz) - o.hl))
await t('店の周りの町: 一軒家20軒以上・アパート4棟・自動販売機8台以上・路地の電柱と街灯10本以上。全部に当たり判定がある', () => {
  const F = townW.town.fill, n = { houses: F.houses.length, apts: F.apts.length, vends: F.vends.length, posts: F.posts.length }
  expect(n.houses >= 20 && n.apts >= 4 && n.vends >= 8 && n.posts >= 10, JSON.stringify(n))
  // 東から走ってぶつけて、中へ入れない
  const inside = []
  for (const o of fillAll()) {
    const r = createRunner({ id: 'c', spawn: { x: o.cx - o.hw - 3, y: 0, z: o.cz, yaw: Math.PI / 2 } })
    for (let i = 0; i < 40; i++) { stepRunner(r, { throttle: 1, steer: 0 }, 1 / 60, townW); if (Math.abs(r.x - o.cx) < o.hw - 0.05 && Math.abs(r.z - o.cz) < o.hl - 0.05 && r.y < o.y1 - 0.3) { inside.push(o.kind + '@' + o.cx + ',' + o.cz); break } }
  }
  expect(!inside.length, inside.join(' ')); return n
})
await t('店の周りの町: 一軒家・アパート・電柱・街灯は全部ワイヤーが掛かる（低い物の周りから掛けて、タップの判定で）', () => {
  const bad = [], F = townW.town.fill
  for (const o of [...F.houses, ...F.apts]) {
    const hx = o.cx + (o.fx || 0) * (o.hw + 14), hz = o.cz + (o.fz || 0) * (o.hl + 14)
    const dx = o.cx - hx, dz = o.cz - hz, L = Math.hypot(dx, o.y1 - 1 - 1.5, dz)
    const h = rayHit(townW, hx, 1.5, hz, dx / L, (o.y1 - 1 - 1.5) / L, dz / L, RUN.wireRange)
    const r = createRunner({ id: 'w', spawn: { x: hx, y: 0, z: hz, yaw: 0 } })
    if (h) stepRunner(r, { wire: true, wireAt: h }, 1 / 60, townW)
    if (!h || !r.rope || r.rope.low) bad.push('box@' + o.cx + ',' + o.cz)
  }
  for (const q of F.posts) {
    const r = createRunner({ id: 'w', spawn: { x: q.cx + 9, y: 0, z: q.cz, yaw: -Math.PI / 2 } })
    const a = { x: q.cx, y: q.y1 - 0.4, z: q.cz }, L = Math.hypot(9, a.y - 1.5)
    const h = rayHit(townW, q.cx + 9, 1.5, q.cz, -9 / L, (a.y - 1.5) / L, 0, RUN.wireRange)
    if (!h || !h.pole) { bad.push('post-ray@' + q.cx + ',' + q.cz); continue }
    stepRunner(r, { wire: true, wireAt: h }, 1 / 60, townW)
    if (!r.rope) bad.push('post@' + q.cx + ',' + q.cz)
  }
  expect(!bad.length, bad.join(' ')); return { boxes: F.houses.length + F.apts.length, posts: F.posts.length }
})
await t('店の周りの町: 店に入れる。開始位置・受け取りの輪・立て看板に重ならない／道と歩道（車・通行人）を塞がない／配達先の窓は1つも減らない', () => {
  const P = JOB.pick, S = JOB.shop, bad = []
  const st = createStreet(townW, 1)
  for (const o of [...fillAll(), townW.town.fountain]) {
    const tag = o.kind + '@' + o.cx + ',' + o.cz
    if (gapBox(o, P.x, P.z) < P.r + 0.5) bad.push('輪:' + tag)
    if (gapBox(o, S.x - 9, S.z) < 2.5) bad.push('開始位置:' + tag)
    if (gapBox(o, P.x + P.r - 0.6, P.z + 3.2) < 1) bad.push('看板:' + tag)
    if (o !== townW.town.shop && gapBox(townW.town.shop, o.cx, o.cz) < Math.max(o.hw, o.hl) + 1.2) bad.push('店:' + tag)
    for (const sg of townW.segs) {
      if (sg.surf !== 'road') continue
      const L = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az), u = Math.max(0, Math.min(L, ((o.cx - sg.ax) * (sg.bx - sg.ax) + (o.cz - sg.az) * (sg.bz - sg.az)) / L))
      const d = Math.hypot(o.cx - (sg.ax + (sg.bx - sg.ax) * u / L), o.cz - (sg.az + (sg.bz - sg.az) * u / L))
      if (d < sg.hw + Math.min(o.hw, o.hl)) bad.push('道:' + tag)
    }
    for (const w of st.walks) {
      const u = (o.cx - w.ax) * w.ux + (o.cz - w.az) * w.uz; if (u < -6 || u > w.L + 6) continue
      const px = w.ax + w.ux * u, pz = w.az + w.uz * u
      if (o.kind === 'building' || o.kind === 'vending') { if (gapBox(o, px, pz) < 0.6) bad.push('歩道:' + tag) }
    }
  }
  const pool = windowPool(townW)
  for (const w of [...pool.pool, ...pool.houses]) for (const o of fillAll()) {
    if (o === w.o) continue
    if (gapBox(o, w.x + w.nx * 3.6, w.z + w.nz * 3.6) < 0.5) bad.push('窓の前:' + o.kind + '@' + o.cx + ',' + o.cz)
  }
  // 町を足す前と同じ窓の数（924）で、家の配達先も6軒のまま
  expect(pool.pool.length === 924 && pool.houses.length === 6, 'pool ' + pool.pool.length + '/' + pool.houses.length)
  expect(!bad.length, [...new Set(bad)].slice(0, 8).join(' '))
  // 実際に輪まで歩いて注文を受け取れる
  const sh = createShift(townW, 5), r = createRunner({ id: 'a', spawn: { x: S.x - 9, y: 0, z: S.z, yaw: Math.PI / 2 } })
  for (let i = 0; i < 180 && !sh.carrying; i++) { r.events.length = 0; stepRunner(r, { throttle: 1, steer: 0 }, 1 / 60, townW); stepShift(sh, r, 1 / 60, {}) }
  expect(sh.carrying, 'pickup'); return { windows: pool.pool.length, houses: pool.houses.length }
})
await t('開始地点の全方位: 5度ごとの72向きすべて、ワイヤーの届く距離（75m）の中に掛かる物がある（タップ）。ワイヤーボタンも全向きで不発なし', () => {
  const rows = sweep(townW, JOB.shop.x - 9, 0, JOB.shop.z, RUN.wireRange, 5)
  const miss = rows.filter(r => !r.hit).map(r => r.deg), btn = rows.filter(r => r.btn == null).map(r => r.deg)
  const near = sweep(townW, JOB.shop.x - 9, 0, JOB.shop.z, 35, 5).filter(r => r.hit).length
  expect(!miss.length && !btn.length && near >= 68, JSON.stringify({ miss, btn, near })); return { hit75: rows.length, hit35: near }
})
await t('自動販売機: 全台タップで掛かる（地面から）。引かれて跳び越して外れ、詰まらない・壁にぶつからない・張り付かない。ワイヤーボタンの自動の狙いには入らない', () => {
  const out = []
  for (const v of townW.town.fill.vends) {
    const sx = v.cx + (v.fx || 0) * 22 + (v.fz || 0) * 5, sz = v.cz + (v.fz || 0) * 22 + (v.fx || 0) * 5   // 真正面だと路地の電柱が間に立つ台がある
    const dx = v.cx - sx, dz = v.cz - sz, dy = v.y1 - 0.4 - 1.5, L = Math.hypot(dx, dy, dz)
    const h = rayHit(townW, sx, 1.5, sz, dx / L, dy / L, dz / L, RUN.wireRange)
    const r = createRunner({ id: 'v', spawn: { x: sx, y: 0, z: sz, yaw: Math.atan2(dx, dz) } })
    const btn = findAnchor(townW, { ...r, y: -0 }, Math.atan2(dx, dz))
    if (!h || !h.low) { out.push({ v: [v.cx, v.cz], noHit: true }); continue }
    stepRunner(r, { wire: true, wireAt: h }, 1 / 60, townW)
    const hooked = !!(r.rope && r.rope.low)
    let t1 = -1, bonk = false, stuckT = 0, maxStep = 0, lx = r.x, lz = r.z
    for (let i = 0; i < 300; i++) {
      r.events.length = 0
      stepRunner(r, { throttle: 0.0, steer: 0 }, 1 / 60, townW)
      if (r.events.some(e => e.t === 'bonk')) bonk = true
      maxStep = Math.max(maxStep, Math.hypot(r.x - lx, r.z - lz)); lx = r.x; lz = r.z
      if (t1 < 0 && !r.rope) t1 = i / 60
      if (r.climbing) stuckT += 1 / 60
    }
    // 外れた後は走り出せる（機械の前で止まらない）
    const x0 = r.x, z0 = r.z
    for (let i = 0; i < 60; i++) stepRunner(r, { throttle: 1, steer: 0, moveDir: { x: -dx / Math.hypot(dx, dz), z: -dz / Math.hypot(dx, dz) } }, 1 / 60, townW)   // 来た方へ走って戻る
    const run = Math.hypot(r.x - x0, r.z - z0)
    const ok = hooked && t1 > 0 && t1 < 3 && !bonk && stuckT === 0 && !r.rope && maxStep < RUN.maxSpeed / 60 + 0.1 && run > 3
    const nearV = gapBox(v, lx, lz)
    if (!ok || nearV < 0) out.push({ v: [v.cx, v.cz], hooked, t1, bonk, stuckT, maxStep: +maxStep.toFixed(2), run: +run.toFixed(1) })
    if (btn && btn.y < 2.5) out.push({ v: [v.cx, v.cz], autoAimedLow: btn })
  }
  expect(!out.length, JSON.stringify(out.slice(0, 3))); return { vends: townW.town.fill.vends.length }
})
await t('自動販売機: 走ってぶつかっても乗り越えて先へ進める（張り付いたまま止まらない）', () => {
  const bad = []
  for (const v of townW.town.fill.vends) {
    const yaw = Math.atan2(-(v.fx || 0), -(v.fz || 0))
    const r = createRunner({ id: 'v', spawn: { x: v.cx + (v.fx || 0) * 8, y: 0, z: v.cz + (v.fz || 0) * 8, yaw } })
    let top = false
    for (let i = 0; i < 180; i++) { stepRunner(r, { throttle: 1, steer: 0 }, 1 / 60, townW); if (r.y > v.y1 - 0.1 && gapBox(v, r.x, r.z) < 0.5) top = true }
    if (!top) bad.push([v.cx, v.cz, +r.x.toFixed(1), +r.z.toFixed(1), +r.y.toFixed(1), !!r.climbing])
  }
  expect(!bad.length, JSON.stringify(bad.slice(0, 3)))
})
await t('低い物に遠くから掛けても瞬間移動しない（ロープを 30m/s で縮めて寄せる。直す前は電柱で1フレームに 25m 飛んでいた）。寄せ終わったら振り子になり、地面で詰まらない', () => {
  const F = townW.town.fill, res = []
  for (const o of [F.posts[0], F.houses[3], F.apts[1], townW.town.houses[0]]) {
    const isPost = o.kind === 'post', ax = o.cx, ay = isPost ? o.y1 - 0.4 : o.y1 - 0.5, az = o.cz
    const r = createRunner({ id: 'p', spawn: { x: ax + 34, y: 0, z: az + 6, yaw: -Math.PI / 2 } })
    stepRunner(r, { wire: true, wireAt: { x: ax, y: ay, z: az } }, 1 / 60, townW)
    const x0 = r.x, z0 = r.z, y0 = r.y; let maxStep = Math.hypot(x0 - (ax + 34), z0 - (az + 6), y0), lx = x0, ly = y0, lz = z0, freed = -1, lastPull = -1
    for (let i = 0; i < 360; i++) {
      r.events.length = 0
      stepRunner(r, { throttle: 0, steer: 0 }, 1 / 60, townW)
      maxStep = Math.max(maxStep, Math.hypot(r.x - lx, r.y - ly, r.z - lz)); lx = r.x; ly = r.y; lz = r.z
      if (r.rope && r.rope.pull != null) lastPull = i / 60
      if (!r.rope && freed < 0) freed = i / 60
    }
    res.push({ k: o.kind, maxStep: +maxStep.toFixed(2), lastPull: +lastPull.toFixed(2), freed: +freed.toFixed(2) })
  }
  const lim = (RUN.lowPull + RUN.maxSpeed) / 60 + 0.5
  expect(res.every(a => a.maxStep < lim && a.lastPull > 0.2 && a.freed > 0 && a.freed < 6.1), JSON.stringify({ lim, res })); return res
})
await t('カメラと自分の間の電柱・街灯には掛からない（開始地点で前をタップすると、背後の街灯や見えない木に吸われていた）／抜いた木は掛け点に残っていない', () => {
  const S = JOB.shop, px = S.x - 9, cx = px - 6, cy = 3.2
  const minT = 6.5   // カメラから自分まで
  const tx = 42, ty = 1.5, tz = 849, L = Math.hypot(tx - cx, ty - cy, tz - S.z)
  const h = rayHit(townW, cx, cy, S.z, (tx - cx) / L, (ty - cy) / L, (tz - S.z) / L, 400, minT)
  const ghosts = townW.objects.filter(o => o.gone && o.type === 'tree').filter(o => townW.poles.some(q => Math.abs(q.x - o.cx) < 0.01 && Math.abs(q.z - o.cz) < 0.01))
  const removed = townW.objects.filter(o => o.gone && o.type === 'tree').length
  expect(h && h.low && Math.abs(h.x - 42) < 0.1 && !ghosts.length && removed >= 1, JSON.stringify({ h, ghosts: ghosts.length, removed })); return { removed }
})
await t('一軒家の屋根: 見えている屋根の上にも掛かる（壁の高さで切らない）・乗ると棟まで上がる（屋根に埋まらない）・アパートの貯水槽は通り抜けない', () => {
  const out = []
  for (const h of [...townW.town.fill.houses.slice(0, 2), townW.town.fill.houses[12], townW.town.houses[0]]) {
    const hit = rayHit(townW, h.cx + 30, h.y1 + 1.9, h.cz + 0.2, -1, 0, 0, 60), rx = h.ridgeX
    const r = createRunner({ id: 'g', spawn: { x: h.cx, y: h.y1 + 6, z: h.cz, yaw: 0 } }); r.grounded = false
    for (let i = 0; i < 90; i++) stepRunner(r, { throttle: 0, steer: 0 }, 1 / 60, townW)
    if (!(r.y > h.y1 + h.gable - 0.2 && r.grounded)) out.push(['ridge', h.cx, h.cz, r.y])
    if (rx && !hit) out.push(['ray', h.cx, h.cz])
  }
  const a = townW.town.fill.apts[0], tk = townW.colliders.find(o => o.kind === 'tank')
  const r2 = createRunner({ id: 't', spawn: { x: tk.cx - 3, y: a.y1, z: tk.cz, yaw: Math.PI / 2 } })
  for (let i = 0; i < 40; i++) stepRunner(r2, { throttle: 1, steer: 0 }, 1 / 60, townW)
  if (Math.abs(r2.x - tk.cx) < 1 && Math.abs(r2.z - tk.cz) < 1 && r2.y < tk.y1 - 0.3) out.push(['tank', r2.x, r2.y])
  expect(!out.length, JSON.stringify(out))
})
await t('電柱・街灯にワイヤーが掛かる（地面に降りずにつなげる掛け点）', () => {
  const poles = buildPoles(world, JOB.shop)
  const q = poles.find(p => Math.hypot(p.x - 30, p.z - 842) < 120)
  const r = createRunner({ id: 'a', spawn: { x: q.x + 15, y: 0, z: q.z, yaw: -Math.PI / 2 } })
  stepRunner(r, { wire: true, wireAt: { x: q.x, y: q.y1 - 0.4, z: q.z } }, 1 / 60, world)
  expect(poles.length > 200 && r.rope && Math.abs(r.rope.x - q.x) < 0.5, JSON.stringify({ n: poles.length, rope: r.rope })); return { poles: poles.length }
})
await t('通行人・車にぶつかると少しこぼれてよろける（空中なら当たらない）', () => {
  const st = createStreet(world, 2)
  const r = createRunner({ id: 'a', spawn: { x: 0, y: 0, z: 700 } })
  st.update(1 / 60, r)
  const p = st.peds.find(q => q.w)
  Object.assign(r, { x: p.x + 0.3, z: p.z, y: p.y, vx: 5, vz: 0 }); r.events.length = 0
  const pedHit = st.collide(r)
  const c = st.traffic.cars[0]; st.cd = 0
  Object.assign(r, { x: c.x, z: c.z, y: c.y, vx: 0, vz: 0, grounded: true, stun: 0 }); r.events.length = 0
  const carHit = st.collide(r)
  st.cd = 0; Object.assign(r, { x: c.x, z: c.z, y: c.y + 6 }); const air = st.collide(r)
  const sh = createShift(world, 1); const r2 = createRunner({ id: 'b', spawn: { x: JOB.pick.x, y: 0, z: JOB.pick.z } }); stepShift(sh, r2, 1 / 60)
  const m0 = sh.mess; r2.events = [{ t: 'ped' }]; stepShift(sh, r2, 1 / 60); const mPed = sh.mess - m0
  const m1 = sh.mess; r2.events = [{ t: 'car' }]; stepShift(sh, r2, 1 / 60); const mCar = sh.mess - m1
  expect(pedHit === 'ped' && carHit === 'car' && !air && mPed >= 5 && mCar >= 8 && mCar < JOB.angryMess, JSON.stringify({ pedHit, carHit, air, mPed, mCar })); return { mPed, mCar }
})
// 店の輪に立って受け取り、窓の前へ瞬間移動して手渡しする（node だけで1件まわす）
const forceRnd = mulberry(77)
function deliverOnce(sh, tier = null) {
  if (tier && sh.offer && sh.offer.tier !== tier) sh.offer = makeOrder(world, forceRnd, tier)   // 検証用に近場・遠方を決める（本番はランダム）
  const r = createRunner({ id: 'v', spawn: { x: JOB.pick.x, y: 0, z: JOB.pick.z } })
  stepShift(sh, r, 1 / 60); const o = sh.cur
  if (!o) return null
  Object.assign(r, { x: o.x + o.nx * 2, y: o.y - 1.1, z: o.z + o.nz * 2, vx: 0, vy: 0, vz: 0 }); r.events = []
  stepShift(sh, r, 1 / 60)
  return o
}
await t('注文は時間内なら途切れない: 30件続けて届けても次の注文が必ず出ている（2026-11-03 本人「時間内なら無限に」）', () => {
  const sh = createShift(world, 4); const bad = []
  for (let i = 0; i < 30; i++) { const o = deliverOnce(sh); if (!o) bad.push('pick' + i); if (!sh.offer) bad.push('offer' + i) }
  expect(!bad.length && sh.results.length === 30 && !sh.over && sh.results.every(r => r.how === 'hand'), JSON.stringify({ bad, n: sh.results.length, over: sh.over })); return { delivered: sh.results.length }
})
await t('注文はランダム（輪は1つ）: 1件目は必ず近場、2件目からは遠方が2〜4割（2026-11-03 本人「輪で選ぶのをやめてランダムに」）', () => {
  const tiers = []; let firstNear = 0
  for (let s = 1; s <= 60; s++) { const sh = createShift(world, s); if (sh.offer.tier === 'near') firstNear++; for (let i = 0; i < 8; i++) { deliverOnce(sh); tiers.push(sh.offer.tier) } }
  const far = tiers.filter(x => x === 'far').length / tiers.length
  expect(firstNear === 60 && far > 0.2 && far < 0.4 && JOB.pick.r >= 4 && !('near' in JOB.pick), JSON.stringify({ firstNear, far })); return { firstNear, far: Math.round(far * 100) + '%' }
})
await t('遠い注文: 近場 70〜240m、遠方 280〜580m。遠方は運河の向こう・高層の上の階・街の外れが出て、代金も時間も多い', () => {
  const rnd = mulberry(9), zones = {}, bad = []
  let nf = 0, ff = 0, nl = 0, fl = 0
  for (let i = 0; i < 400; i++) {
    const n = makeOrder(world, rnd, 'near'), f = makeOrder(world, rnd, 'far')
    if (!n.house && (n.dist < 70 || n.dist > 240)) bad.push('n' + Math.round(n.dist))
    if (f.dist < 280 || f.dist > 580) bad.push('f' + Math.round(f.dist))
    if (world.surfaceAt(f.x + f.nx * 7, f.z + f.nz * 7) !== 'road') bad.push('road')
    zones[f.zone] = (zones[f.zone] || 0) + 1
    nf += n.fee + n.tipMax; ff += f.fee + f.bonus + f.tipMax; nl += n.limit; fl += f.limit
  }
  const r = { zones, nearYen: Math.round(nf / 400), farYen: Math.round(ff / 400), nearSec: Math.round(nl / 400), farSec: Math.round(fl / 400) }
  expect(!bad.length && zones.canal > 20 && zones.tower > 20 && zones.edge > 20 && r.farYen > r.nearYen * 2.2 && r.farSec > r.nearSec * 1.8, JSON.stringify({ bad: bad.slice(0, 5), ...r })); return r
})
await t('客の種類: デュフフの人はたまに（4〜10%）、ほか5種もそれぞれ出る。1件目は普通の客', () => {
  const rnd = mulberry(3), c = {}
  for (let i = 0; i < 4000; i++) { const o = makeOrder(world, rnd, i % 2 ? 'far' : 'near'); c[o.cust] = (c[o.cust] || 0) + 1 }
  const firsts = Array.from({ length: 50 }, (_, s) => createShift(world, s + 1)).every(sh => sh.offer.cust === 'normal')
  const p = k => (c[k] || 0) / 4000
  expect(p('duf') > 0.04 && p('duf') < 0.1 && ['polite', 'coins', 'photo', 'net'].every(k => p(k) > 0.07) && p('normal') > 0.4 && firsts, JSON.stringify({ c, firsts })); return { duf: +(p('duf') * 100).toFixed(1) + '%', ...c }
})
await t('客ごとの払い方と怒り方（地上で運ぶと麺がのびてチップが減り、18秒で怒る）: デュフフは怒らず 2222/222/22円、小銭は端数・怒っても1円、撮る人は崩れ55で怒り・きれいなら1.6倍、丁寧な人は遅れで怒らない、網の人は10m先から受け取る', () => {
  const o = c => ({ cust: c, tipMax: 500, limit: 30, v: 0.5 })
  const r = {
    dufGood: settle(o('duf'), 10, 0, 'hand', false), dufOk: settle(o('duf'), 40, 2, 'hand', false), dufBad: settle(o('duf'), 95, 20, 'hand', false),
    coins: settle(o('coins'), 30, 0, 'hand', false), coinsAngry: settle(o('coins'), 90, 0, 'hand', false),
    photoClean: settle(o('photo'), 10, 0, 'hand', false), photoNormal: settle(o('normal'), 10, 0, 'hand', false), photo60: settle(o('photo'), 60, 0, 'hand', false),
    politeLate: settle(o('polite'), 10, 40, 'hand', false), normalLate: settle(o('normal'), 10, 40, 'hand', false),
    soggy10: settle(o('normal'), 0, 0, 'hand', false, 10), soggy20: settle(o('normal'), 0, 0, 'hand', false, 20), politeSoggy: settle(o('polite'), 0, 0, 'hand', false, 20)
  }
  const rnd = mulberry(1); let net = null; for (let i = 0; i < 300 && !net; i++) { const q = makeOrder(world, rnd, 'near'); if (q.cust === 'net') net = q }
  const ok = r.dufGood.tip === 2222 && !r.dufGood.angry && r.dufGood.style === 'jackpot' && r.dufOk.tip === 222 && r.dufBad.tip === 22 && !r.dufBad.angry
    && r.coins.tip % 10 !== 0 && r.coinsAngry.angry && r.coinsAngry.tip === 1
    && r.photoClean.tip === Math.round(r.photoNormal.tip * 1.6) && r.photo60.angry && !settle(o('normal'), 60, 0, 'hand', false).angry
    && !r.politeLate.angry && r.normalLate.angry && r.soggy10.tip === 500 - (10 - JOB.soggyFree) * JOB.soggyK && !r.soggy10.angry && r.soggy20.angry && r.soggy20.reason === 'soggy' && !r.politeSoggy.angry && net && net.handR === JOB.netR && JOB.netR >= 10
  expect(ok, JSON.stringify(r)); return { duf: [2222, 222, 22], coins: r.coins.tip, photo: r.photoClean.tip }
})
await t('網の人には窓から8m・少し速くても渡せる。普通の客は8mでは渡せない', () => {
  const sh = createShift(world, 2); deliverOnce(sh)   // 1件目（練習）を済ませる
  const r = createRunner({ id: 'n', spawn: { x: JOB.pick.x, y: 0, z: JOB.pick.z } }); stepShift(sh, r, 1 / 60)
  const o = sh.cur
  const at8 = c => { o.cust = c; o.handR = c === 'net' ? JOB.netR : JOB.handR; o.handSpeed = c === 'net' ? JOB.netSpeed : JOB.handSpeed; const n0 = sh.results.length; Object.assign(r, { x: o.x + o.nx * 8, y: o.y - 1.1, z: o.z + o.nz * 8, vx: 18 * o.nz, vy: 0, vz: -18 * o.nx, grounded: false }); r.events = []; stepShift(sh, r, 1 / 60); return sh.results.length > n0 }
  const normal = at8('normal'), net = at8('net')
  expect(!normal && net, JSON.stringify({ normal, net })); return { normal, net }
})
await t('稼ぎの計算: 手取り = 基本給 + 配達手当 + 遠方手当 + チップ − クレーム。持ったまま時間切れの1件は終わった時だけ引く', () => {
  const sh = createShift(world, 6)
  deliverOnce(sh, 'near'); deliverOnce(sh, 'far'); deliverOnce(sh, 'far')
  const R = sh.results, want = JOB.wage * JOB.hours + R.reduce((a, r) => a + r.fee + r.bonus + r.tip - (r.angry ? JOB.claim : 0), 0)
  const r = createRunner({ id: 'x', spawn: { x: JOB.pick.x, y: 0, z: JOB.pick.z } }); stepShift(sh, r, 1 / 60)
  const during = money(sh)
  sh.t = JOB.shiftSec; stepShift(sh, r, 1 / 60)
  const after = money(sh), p = payData(sh)
  expect(during === want && after === want - JOB.claim && sh.over && p.undone === 1 && R[1].bonus === JOB.farBonus && earned(sh) === after - JOB.wage * JOB.hours, JSON.stringify({ during, want, after, p })); return { net: after, rows: p.pay.map(x => x.label) }
})
await t('崩れ: 速く飛ぶ・強い着地は崩れる、ゆっくり歩くのは崩れない', () => {
  const sh = createShift(world, 1)
  const r = createRunner({ id: 'a', spawn: { x: JOB.pick.x, y: 0, z: JOB.pick.z } })
  stepShift(sh, r, 1 / 60); expect(sh.carrying, 'no pickup')
  r.vx = 3; for (let i = 0; i < 120; i++) { r.events.length = 0; stepShift(sh, r, 1 / 60) }
  const walk = sh.mess
  r.grounded = false; r.vx = 36; for (let i = 0; i < 60; i++) { r.events.length = 0; stepShift(sh, r, 1 / 60) }
  const fly = sh.mess
  r.events = [{ t: 'land', impact: 24 }]; stepShift(sh, r, 1 / 60)
  const land = sh.mess - fly
  expect(walk === 0 && fly > 1 && land > 10, JSON.stringify({ walk, fly, land })); return { walk, fly: +fly.toFixed(1), land: +land.toFixed(1) }
})
await t('bot（16日ずつ）: 下手な人も平均3件以上で4,500円超え／歩くだけは下手な人の8割以下・上手い人の半分以下（地面は不利。2026-11-04 店の周りの町で下手な bot が約1割下がったので 5,000→4,500、7割→8割）／カラスとボールで上手い人の稼ぎが1割以上落ちない（2026-11-03 本人「理不尽にならない頻度に」）', () => {
  const run = (env = {}) => execFileSync(process.execPath, ['tools/sim.mjs', '16', ...(env.k ? [env.k] : [])], { cwd: ROOT, encoding: 'utf8', timeout: 900000, env: { ...process.env, ...(env.noair ? { NOAIR: '1' } : {}) } })
  const out = run(), outN = run({ k: 'skilled', noair: true })
  const avg = (o, k) => +o.match(new RegExp(k + '\\s+平均 (\\d+)'))[1]
  const done = (o, k) => +o.match(new RegExp(k + '\\s+平均.*?届けた 平均([\\d.]+)件'))[1]
  const r = { careful: avg(out, 'careful'), clumsy: avg(out, 'clumsy'), skilled: avg(out, 'skilled'), rush: avg(out, 'rush'), skilledNoAir: avg(outN, 'skilled'), clumsyDone: done(out, 'clumsy') }
  expect(r.clumsyDone >= 3 && r.clumsy > 4500, '初めての人が稼げない ' + JSON.stringify(r))
  expect(r.careful <= r.clumsy * 0.8 && r.careful <= r.skilled * 0.5, '歩くだけが強すぎる ' + JSON.stringify(r))
  expect(r.skilled >= r.skilledNoAir * 0.9, 'カラスとボールが理不尽 ' + JSON.stringify(r))
  return r
})
await t('交通量を増やした（2026-11-03 本人「車・通行人をもっと」）: 車 250台以上・通行人 60人', () => {
  const st = createStreet(world, 1)
  expect(st.traffic.cars.length >= 250 && st.peds.length === 60 && STREET.carGap < 340, JSON.stringify({ cars: st.traffic.cars.length, peds: st.peds.length })); return { cars: st.traffic.cars.length, peds: st.peds.length }
})
await t('カラス: 運んでいる時に当たると、はじかれて崩れる（カァ）。地面では群れもボールも来ない', () => {
  const A = createAir(world, 3), sh = createShift(world, 1)
  const r = createRunner({ id: 'c', spawn: { x: JOB.pick.x, y: 0, z: JOB.pick.z } }); stepShift(sh, r, 1 / 60)
  for (let i = 0; i < 60 * 40; i++) { r.events = []; stepAir(A, r, 1 / 60) }
  const groundSpawn = A.crows.filter(c => c.mode === 'fly').length + A.balls.length
  Object.assign(r, { x: 0, y: 30, z: 700, vx: 12, vy: 0, vz: 0, grounded: false }); A.cd = 0
  A.crows.push({ id: 999, x: 0.5, y: 31.1, z: 700, vx: 0, vy: 0, vz: 0, yaw: 0, mode: 'fly', t: 0, flap: 0 })
  r.events = []; const v0 = r.vx; stepAir(A, r, 1 / 60); const ev = r.events.slice(); const m0 = sh.mess; stepShift(sh, r, 1 / 60)
  const hit = ev.some(e => e.t === 'crow')
  expect(groundSpawn === 0 && hit && r.vx < v0 && sh.mess - m0 >= JOB.crowHit && JOB.crowHit < 15, JSON.stringify({ groundSpawn, hit, v0, vx: r.vx, mess: sh.mess - m0 })); return { mess: +(sh.mess - m0).toFixed(1), vx: +r.vx.toFixed(1) }
})
await t('カラス: 電柱の上で休んでいて、近づくと飛び立つ。空中を飛んでいると群れが横切る（何秒か先の自分の位置）', () => {
  const A = createAir(world, 5), r = createRunner({ id: 'p', spawn: { x: JOB.shop.x, y: 0, z: JOB.shop.z } })
  stepAir(A, r, 1 / 60)
  const perched = A.crows.filter(c => c.mode === 'perch').length
  const c = A.crows.find(c => c.mode === 'perch')
  Object.assign(r, { x: c.x + 5, y: c.y - 1, z: c.z, grounded: false }); r.events = []; stepAir(A, r, 1 / 60)
  const scared = c.mode === 'takeoff' && A.events.some(e => e.t === 'scare')
  const B = createAir(world, 6), q = createRunner({ id: 'f', spawn: { x: 0, y: 30, z: 700 } }); let flocks = 0, minD = 1e9
  for (let i = 0; i < 60 * 40; i++) { Object.assign(q, { y: 30, vx: 0, vy: 0, vz: 20, grounded: false }); q.z += 20 / 60; q.events = []; B.cd = 9; stepAir(B, q, 1 / 60, true); flocks += B.events.filter(e => e.t === 'flock').length; B.events.length = 0; for (const k of B.crows) if (k.mode === 'fly') minD = Math.min(minD, Math.hypot(k.x - q.x, k.y - q.y - 1.1, k.z - q.z)) }
  expect(perched >= 5 && scared && flocks >= 2 && minD < 3, JSON.stringify({ perched, scared, flocks, minD })); return { perched, flocks, minD: +minD.toFixed(1) }
})
await t('野球ボール: 打った瞬間に「危ない」の予告（落下点つき）、2秒以上あとに届く。止まっていると当たって崩れ、動けばよけられる', () => {
  const mk = () => { const A = createAir(world, 8); A.nextFlock = 1e9; A.nextBall = 0; return A }
  const A = mk(), r = createRunner({ id: 'b', spawn: { x: 0, y: 30, z: 700 } })
  let warnAt = -1, hitAt = -1
  for (let i = 0; i < 60 * 5 && hitAt < 0; i++) { Object.assign(r, { x: 0, y: 30, z: 700, vx: 0, vy: 0, vz: 0, grounded: false }); r.events = []; stepAir(A, r, 1 / 60); if (warnAt < 0 && A.events.some(e => e.t === 'ballWarn')) warnAt = i; if (A.events.some(e => e.t === 'ball')) hitAt = i; A.events.length = 0 }
  const B = mk(), q = createRunner({ id: 'd', spawn: { x: 0, y: 30, z: 700 } }); let dodgedHit = false
  for (let i = 0; i < 60 * 5; i++) { const z = i < 30 ? 700 : 700 + (i - 30) * 0.25; Object.assign(q, { x: 0, y: 30, z, vx: 0, vy: 0, vz: i < 30 ? 0 : 15, grounded: false }); q.events = []; stepAir(B, q, 1 / 60); if (B.events.some(e => e.t === 'ball')) dodgedHit = true; B.events.length = 0 }
  const lead = (hitAt - warnAt) / 60
  expect(warnAt >= 0 && hitAt > 0 && lead >= 2 && !dodgedHit && JOB.ballHit < 15, JSON.stringify({ warnAt, hitAt, lead, dodgedHit })); return { lead: +lead.toFixed(2), dodged: !dodgedHit }
})
await t('本体は1つにまとめた dist/game.js（index から読む・importmap も元のファイルの先読みも無い）／元のファイルで同じファイルを違う ?v= で読んでいない', async () => {
  const fs = await import('node:fs'), h = fs.readFileSync(ROOT + '/index.html', 'utf8')
  expect(/<script type="module" src="dist\/game\.js\?v=\d+"/.test(h) && !/src="js\/game\.js/.test(h) && !/importmap/.test(h) && !/modulepreload" href="(js|shared|vendor)\//.test(h), 'index')
  const seen = {}, bad = []
  for (const f of execFileSync('/bin/sh', ['-c', 'ls js/*.js shared/*.js'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n'))
    for (const m of fs.readFileSync(ROOT + '/' + f, 'utf8').matchAll(/from '([^']+\.js)\?v=(\d+)'/g)) { const k = m[1].split('/').pop(); (seen[k] ||= new Set()).add(m[2]) }
  for (const [k, v] of Object.entries(seen)) if (v.size > 1) bad.push(k + ':' + [...v])
  expect(!bad.length, bad.join(' ')); return true
})
await t('文字だけのフォント（自前の fonts/）: fonts.css と woff2 が今の文字で作られている（node tools/fontlink.mjs）・index から fonts.css?v= を読む・Google には取りに行かない・canvas に筆の書体で書くのは3か所だけ', async () => {
  const fs = await import('node:fs'), { plan, fontsCss } = await import('./tools/fontlink.mjs')
  const h = fs.readFileSync(ROOT + '/index.html', 'utf8'), man = JSON.parse(fs.readFileSync(ROOT + '/fonts/manifest.json', 'utf8'))
  const stale = plan().filter(q => man[q.file] !== q.txt || !fs.existsSync(ROOT + '/' + q.file)).map(q => q.file)
  expect(!stale.length && fs.readFileSync(ROOT + '/fonts.css', 'utf8') === fontsCss() && /<link id="gfonts" rel="stylesheet" href="fonts\.css\?v=[0-9a-f]{8}">/.test(h) && !/fonts\.(googleapis|gstatic)/.test(h), 'node tools/fontlink.mjs を回す ' + stale.join(' '))
  const n = (h + fs.readFileSync(ROOT + '/js/game.js', 'utf8')).split('"Yuji Syuku"').length - 1
  expect(n === 3, 'Yuji Syuku in canvas: ' + n)
  return plan().map(q => q.file.slice(6, -6) + ':' + q.txt.length).join(' ')
})
await t('地面ワイヤー（2026-11-03 本人「空中に浮いてる間は地面にもワイヤーつけて加速」「地面をちゃんとタップしなあかん感じに」）: 地面に立っている時は地面に掛からない／空中では掛かってすぐ速くなり（0.3秒で25m/s）、近く（4m）で外れる。地面の近くで外れても着地しても跳ね返らない／1ステップで最高速×dt より動かない（瞬間移動しない）／ワイヤーボタン（狙いなし）では空中でも地面に掛からない', () => {
  const DT = 1 / 60
  const findOpen = () => { for (let x = -200; x <= 200; x += 7) for (let z = 300; z <= 1200; z += 7) { if (world.surfaceAt(x, z) !== 'road') continue; const g = world.groundAt(x, z, 50).h; if (Math.abs(g) > 0.5) continue; let ok = true; for (let k = 0; k <= 40 && ok; k += 4) { const zz = z + k; if (world.surfaceAt(x, zz) !== 'road' || Math.abs(world.groundAt(x, zz, 50).h) > 0.5) ok = false } if (ok) return { x, z } } return null }
  const P = findOpen(), out = {}
  // 1) 地面に立っている
  const a = createRunner({ id: 'g1', spawn: { x: P.x, y: 0, z: P.z, yaw: 0 } })
  for (let i = 0; i < 20; i++) stepRunner(a, {}, DT, world)
  a.events.length = 0; stepRunner(a, { wire: true, wireAt: { x: P.x, y: 0, z: P.z + 20, ground: true } }, DT, world)
  out.groundBlocked = !(a.rope && a.rope.ground) && a.events.some(e => e.t === 'wireMiss' && e.ground)
  // 2) 空中: 高さ 22m、前（+z）へ 10m/s。斜め前の地面に掛ける
  const b = createRunner({ id: 'g2', spawn: { x: P.x, y: 22, z: P.z, yaw: 0 } })
  Object.assign(b, { grounded: false, vx: 0, vy: 0, vz: 10 })
  stepRunner(b, { wire: true, wireAt: { x: P.x, y: 0, z: P.z + 30, ground: true } }, DT, world)
  out.hooked = !!(b.rope && b.rope.ground)
  let maxV = 0, maxStep = 0, released = -1, relD = null, relVy = null, relY = null, t25 = null, upAfter = 0, landed = false, vyAfterLand = -99, px = b.x, py = b.y, pz = b.z
  for (let i = 1; i < 60 * 4; i++) {
    stepRunner(b, {}, DT, world)
    if (b.rope) maxStep = Math.max(maxStep, Math.hypot(b.x - px, b.y - py, b.z - pz)); px = b.x; py = b.y; pz = b.z
    const v = Math.hypot(b.vx, b.vy, b.vz)
    if (b.rope) maxV = Math.max(maxV, v)
    if (t25 === null && v >= 25) t25 = i * DT
    if (!b.rope && released < 0) { released = i; relD = +Math.hypot(P.x - b.x, 0 - (b.y + 1.2), P.z + 30 - b.z).toFixed(1); relVy = +b.vy.toFixed(1); relY = b.y }
    if (released > 0) upAfter = Math.max(upAfter, b.y - relY)
    if (b.grounded) landed = true
    if (landed) vyAfterLand = Math.max(vyAfterLand, b.vy)
  }
  out.t25 = t25 && +t25.toFixed(2); out.upAfter = +upAfter.toFixed(2); out.landed = landed; out.vyAfterLand = +vyAfterLand.toFixed(2)
  out.released = released > 0; out.relD = relD; out.relVy = relVy; out.maxV = +maxV.toFixed(1); out.maxStep = +maxStep.toFixed(2); out.stepLimit = +(RUN.maxSpeed * DT * 1.05).toFixed(2)
  out.unwire = b.events.length >= 0
  // 3) ワイヤーボタン（狙いなし）を空中で押しても地面には掛からない
  const c = createRunner({ id: 'g3', spawn: { x: P.x, y: 22, z: P.z, yaw: 0 } })
  Object.assign(c, { grounded: false, vx: 0, vy: 0, vz: 10 })
  stepRunner(c, { wire: true }, DT, world)
  out.buttonNotGround = !(c.rope && c.rope.ground)
  // 2026-11-03 本人「あんまり加速できない」「地面に着いてからバウンドするのはおかしい」: 0.3秒で 25m/s・掛けている間に 30m/s 以上（速さの線が出る）、地面の近くで外れても着地しても上へ跳ね返らない
  expect(out.groundBlocked && out.hooked && out.released && relD <= RUN.groundWireRelease + 1.5 && maxV >= 30 && maxV <= RUN.maxSpeed + 1 && out.t25 !== null && out.t25 <= 0.3 && out.upAfter <= 0.05 && out.landed && out.vyAfterLand <= 0.01 && maxStep <= out.stepLimit && out.buttonNotGround, JSON.stringify(out))
  return out
})
await t('AI臭さチェック NG 0', () => {
  const out = execFileSync(process.execPath, [process.env.HOME + '/Desktop/claudecode/_shared/ai_tells.mjs', ROOT, '--json'], { encoding: 'utf8' })
  const j = JSON.parse(out); expect(j.ng === 0, JSON.stringify(j.items)); return j.items.map(i => i.key)
})

// ---------------------------------------------------------------- ブラウザ
const browser = await chromium.launch({ ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, ...GL] })
const p = await open(browser)
await t('起動時にエラーが出ない（後から読む窓の客まで全部読めている）', async () => { await p.waitForFunction(() => __bootDbg().cust, null, { timeout: 30000 }); const d = await p.evaluate(() => __bootDbg()); expect(p.errs.length === 0 && d.ch && !d.chFail, p.errs.join('|') + JSON.stringify(d)) })
await t('文字だけのフォント: 画面に出る文字（日英・全部の画面）が、その書体の読み込みに全部入っている（足りないと一部の字だけ別の書体になる）', async () => {
  const { usedChars, brushChars } = await import('./tools/fontlink.mjs')
  const main = new Set(usedChars()), brush = new Set(brushChars()), miss = { main: new Set(), brush: new Set() }
  for (const lang of ['ja', 'en']) {
    const got = await p.evaluate(l => {
      sky.setLang(l); const out = []
      for (const el of document.querySelectorAll('body *')) {
        if (/^(SCRIPT|STYLE|svg|path|g|rect|circle|ellipse|line|polyline|polygon|text|defs)$/i.test(el.tagName) && el.tagName !== 'text') continue
        const fam = getComputedStyle(el).fontFamily
        let txt = ''; for (const nd of el.childNodes) if (nd.nodeType === 3) txt += nd.textContent
        const bf = getComputedStyle(el, '::before').content; if (bf && bf !== 'none' && bf !== 'normal') out.push([getComputedStyle(el, '::before').fontFamily, bf.replace(/^"|"$/g, '')])
        if (txt.trim()) out.push([fam, txt])
      }
      return out
    }, lang)
    for (const [fam, txt] of got) for (const c of txt) { if (c.codePointAt(0) <= 32) continue; if (/Yuji/.test(fam.split(',')[0])) { if (!brush.has(c)) miss.brush.add(c) } else if (/Klee|BIZ/.test(fam.split(',')[0]) && !main.has(c)) miss.main.add(c) }
  }
  await p.evaluate(() => sky.setLang('ja'))
  expect(!miss.main.size && !miss.brush.size, JSON.stringify({ main: [...miss.main].join(''), brush: [...miss.brush].join('') })); return true
})
await t('先読み（index.html の preload）: 最初の画面の素材を本体の実行前に取り始める・同じ物を2回取らない・先読みして使わない物が無い（スマホとPC）', async () => {
  const out = {}
  for (const touch of [true, false]) {
    const ctx = await browser.newContext({ locale: 'ja-JP', viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 900 }, hasTouch: touch, isMobile: touch }); await muteContext(ctx)
    const q = await ctx.newPage(), n = {}, warn = []
    q.on('request', r => { const u = r.url().replace(URL0, ''); if (/^assets\//.test(u) && !/colormap\.png/.test(u)) n[u] = (n[u] || 0) + 1 })   // colormap は窓の客の GLB が中で読む共有の画像（後から読む・前から同じ）
    q.on('console', m => { if (/preload/i.test(m.text())) warn.push(m.text().slice(0, 120)) })
    await q.goto(URL0); await q.waitForFunction(() => window.__skyReady, null, { timeout: 30000 })
    const pre = await q.evaluate(() => [...document.querySelectorAll('link[rel=preload]')].map(l => l.getAttribute('href')))
    await q.waitForTimeout(3500); await ctx.close()
    const dups = Object.entries(n).filter(([, v]) => v > 1), unused = pre.filter(u => !n[u])
    out[touch ? 'phone' : 'pc'] = { pre: pre.length, dups, unused, warn }
  }
  expect(Object.values(out).every(o => o.pre >= 16 && !o.dups.length && !o.unused.length && !o.warn.length), JSON.stringify(out)); return { phone: out.phone.pre, pc: out.pc.pre }
})
await t('フォントの読み込み: 準備完了までに取るのは最初の画面の字（l と a）だけ・残りは準備完了のあとで全部読み終わる', async () => {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 } }); await muteContext(ctx)
  const q = await ctx.newPage()
  await q.goto(URL0); await q.waitForFunction(() => window.__skyReady, null, { timeout: 30000 })
  await q.waitForFunction(() => { let n = 0, ok = 0; document.fonts.forEach(f => { n++; if (f.status === 'loaded') ok++ }); return n >= 12 && ok === n }, null, { timeout: 20000 })
  // 準備完了の印（performance.mark）より前に取り始めた woff2
  const atReady = await q.evaluate(() => { const t = performance.getEntriesByName('skyReady')[0].startTime; return performance.getEntriesByType('resource').filter(e => /fonts\/.*woff2/.test(e.name) && e.startTime < t).map(e => e.name.match(/fonts\/([a-z0-9]+-[lab])/)[1]) })
  await ctx.close()
  expect(atReady.length && atReady.every(f => !/-b$/.test(f)), JSON.stringify(atReady)); return { atReady: atReady.join(' ') }
})
await t('ロード画面（2026-11-03 本人「開いた最初に、いい感じのロード中の画面を」）: 開いた瞬間に世界観の絵と文字と進み具合が出て、読み込み（人物の GLB）が終わるまで消えない。終わったら消える', async () => {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 } }); await muteContext(ctx)
  let release; const gate = new Promise(r => { release = r })
  await ctx.route('**/assets/chars/Ranger.glb*', async route => { await gate; await route.continue() })   // 人物の読み込みを止めておく
  const q = await ctx.newPage(); const errs = []; q.on('pageerror', e => errs.push(e.message))
  await q.goto(URL0, { waitUntil: 'domcontentloaded' })
  const first = await q.evaluate(() => { const b = document.getElementById('boot'); const r = b.getBoundingClientRect(); return { shown: r.width > 0 && !b.classList.contains('hidden'), msg: b.querySelector('.boot-msg').textContent, art: !!b.querySelector('svg') } })
  await q.waitForTimeout(2500)
  const mid = await q.evaluate(() => ({ shown: !document.getElementById('boot').classList.contains('hidden'), ready: !!window.__skyReady, pct: document.getElementById('bootPct').textContent }))
  release()
  await q.waitForFunction(() => window.__skyReady, null, { timeout: 30000 }); await q.waitForTimeout(600)
  const after = await q.evaluate(() => ({ hidden: document.getElementById('boot').classList.contains('hidden'), pct: document.getElementById('bootPct').textContent, err: !!document.getElementById('boot-err') }))
  await ctx.close()
  expect(first.shown && first.art && first.msg.length >= 6 && mid.shown && !mid.ready && parseInt(mid.pct) > 0 && parseInt(mid.pct) < 100 && after.hidden && after.pct === '100%' && !after.err && !errs.length, JSON.stringify({ first, mid, after, errs })); return { msg: first.msg, mid: mid.pct }
})
await t('後から読む物（窓の客の GLB・壁の法線と粗さ）が届く前に始めても遊べる: 準備完了は待たない／窓は影絵の板で出る／届いたら 3D の客に替わる／届かなくても止まらずエラーなし', async () => {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 } }); await muteContext(ctx)
  let release; const gate = new Promise(r => { release = r })
  const late = /character-|aid-glasses|_nor_gl\.webp|_rough\.webp/
  await ctx.route(u => late.test(u.toString()), async route => { await gate; await route.continue() })
  const q = await ctx.newPage(); const errs = []; q.on('pageerror', e => errs.push(e.message))
  await q.goto(URL0, { waitUntil: 'commit' }); await q.waitForFunction(() => window.__skyReady, null, { timeout: 30000 })
  const before = await q.evaluate(() => { sky.start(3); sky.dbg.pause(true); sky.dbg.step(3); sky.dbg.teleport(sky.JOB.pick.x, 0, sky.JOB.pick.z); sky.dbg.step(3); const u = sky.dbg.target.userData; return { cust: __bootDbg().cust, board: u.cust.visible, person: u.person.group.visible, order: !!sky.sh.cur && sky.dbg.target.visible } })
  // 届かないまま 6 秒走らせる（自動で飛ばして配達も進める）
  const mid = await q.evaluate(() => { sky.dbg.keys.add('KeyW'); for (let i = 0; i < 6; i++) { sky.dbg.wireAuto(); sky.dbg.step(60) } sky.dbg.keys.delete('KeyW'); return { mode: sky.mode } })
  release()
  await q.waitForFunction(() => __bootDbg().cust, null, { timeout: 30000 })
  const after = await q.evaluate(() => { if (!sky.sh.carrying) { sky.dbg.teleport(sky.JOB.pick.x, 0, sky.JOB.pick.z); sky.dbg.step(3); } sky.dbg.step(2); const u = sky.dbg.target.userData; return { vis: sky.dbg.target.visible, board: u.cust.visible, person: u.person.group.visible } })
  await ctx.close()
  // 届かないまま（失敗）でも止まらない
  const c2 = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 } }); await muteContext(c2)
  await c2.route(u => late.test(u.toString()), r => r.abort())
  const q2 = await c2.newPage(); const errs2 = []; q2.on('pageerror', e => errs2.push(e.message))
  await q2.goto(URL0, { waitUntil: 'commit' }); await q2.waitForFunction(() => window.__skyReady, null, { timeout: 30000 })
  const fail = await q2.evaluate(() => { sky.start(4); sky.dbg.pause(true); sky.dbg.step(3); sky.dbg.teleport(sky.JOB.pick.x, 0, sky.JOB.pick.z); sky.dbg.step(3); sky.dbg.step(60); const u = sky.dbg.target.userData; return { mode: sky.mode, board: u.cust.visible } })
  await q2.waitForTimeout(1500); await c2.close()
  expect(!before.cust && before.order && before.board && !before.person && mid.mode === 'play' && !after.board && after.person && fail.mode === 'play' && fail.board && !errs.length && !errs2.length, JSON.stringify({ before, mid, after, fail, errs, errs2 })); return { before, after }
})
await t('起動失敗の保険: 本体のファイルが読めないと、9秒で原因の表示が出る', async () => {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 } }); await muteContext(ctx)
  await ctx.route('**/dist/game.js*', route => route.fulfill({ status: 404, body: 'nope' }))
  const q = await ctx.newPage(); await q.goto(URL0)
  await q.waitForSelector('#boot-err', { timeout: 15000 }).catch(() => null)
  const r = await q.evaluate(() => { const d = document.getElementById('boot-err'); return { shown: !!d, text: d ? d.textContent.slice(0, 80) : '' } })
  await ctx.close()
  expect(r.shown && /起動できません/.test(r.text), JSON.stringify(r)); return r
})
await t('ブラウザの拡大が起きない', async () => {
  const r = await p.evaluate(() => {
    const vp = document.querySelector('meta[name=viewport]').content
    const g = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(g)
    const w = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }); window.dispatchEvent(w)
    const k = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(k)
    return { vp, gesture: g.defaultPrevented, wheel: w.defaultPrevented, key: k.defaultPrevented, ta: getComputedStyle(document.documentElement).touchAction, us: getComputedStyle(document.body).userSelect }
  })
  expect(/user-scalable=no/.test(r.vp) && r.gesture && r.wheel && r.key && r.ta === 'manipulation' && r.us === 'none', JSON.stringify(r))
})
await t('OGP 一式がある', async () => {
  const r = await p.evaluate(() => ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].map(k => !!document.querySelector(`meta[property="${k}"]`)).concat(!!document.querySelector('meta[name="twitter:card"]')))
  expect(r.every(Boolean), JSON.stringify(r))
})
await t('タイトルの後ろで CPU が飛んでいる', async () => {
  const a = await p.evaluate(() => { const r = sky.world && null; return 0 })
  await p.waitForTimeout(1500)
  const moved = await p.evaluate(() => document.querySelector('#title').classList.contains('hidden') === false)
  expect(moved, 'title hidden')
})
await t('出勤: 伝票に次の注文（1件目は近場）が出る。店の前の輪に入ると受け取り、品名・届け先・残り時間が出る', async () => {
  await p.click('#btnStart')
  await p.evaluate(() => sky.dbg.pause(true)); await p.evaluate(() => sky.dbg.step(3))
  const before = await p.evaluate(() => ({ carrying: sky.sh.carrying, dish: document.getElementById('tDish').textContent, to: document.getElementById('tTo').textContent, note: document.getElementById('tNote').textContent, earn: document.getElementById('tEarn').textContent }))
  await p.evaluate(() => { sky.dbg.teleport(sky.JOB.pick.x, 0, sky.JOB.pick.z); sky.dbg.step(3) })
  const r = await p.evaluate(() => ({ carrying: sky.sh.carrying, tier: sky.sh.cur && sky.sh.cur.tier, dish: document.getElementById('tDish').textContent, to: document.getElementById('tTo').textContent, time: document.getElementById('tTime').textContent, pick: sky.log.some(e => e.t === 'pickup') }))
  expect(!before.carrying && /近場/.test(before.to) && /次の注文/.test(before.dish) && /稼ぎ/.test(before.earn) && r.carrying && r.tier === 'near' && r.pick && r.dish.length > 1 && /階/.test(r.to) && /秒/.test(r.time), JSON.stringify({ before, r })); return { before: before.to + ' / ' + before.note, to: r.to }
})
await t('音（2026-11-03 本人「謎の水の音がずっと鳴ってる」）: 鳴りっぱなしは BGM・街の音・風の3つだけ。風は録音のループ（WAV）で、地面では0、空中で速い時だけ鳴り、上限 0.35', async () => {
  await p.waitForFunction(() => Snd.loops.wind && Snd.loops.wind.g, null, { timeout: 10000 }).catch(() => {})   // ループは読み込み後に鳴り始める
  const r = await p.evaluate(() => {
    const me = sky.me, wl = Snd.loops.wind, slots = Object.keys(Snd.loops).filter(k => Snd.loops[k])
    const urls = Object.fromEntries(slots.map(k => [k, Snd.loops[k].url]))
    const gain = () => wl && wl.g ? +wl.g.gain.value.toFixed(3) : null
    Object.assign(me, { grounded: true, vx: 12, vy: 0, vz: 0 }); sky.dbg.render ? sky.dbg.render(1) : sky.dbg.step(1); const ground = gain()
    me.y += 30; Object.assign(me, { grounded: false, vx: 12, vy: 0, vz: 0 }); sky.dbg.render ? sky.dbg.render(1) : sky.dbg.step(0); const slow = gain()
    Object.assign(me, { grounded: false, vx: 60, vy: 0, vz: 0 }); sky.dbg.render ? sky.dbg.render(1) : sky.dbg.step(0); const fast = gain()
    me.y -= 30; Object.assign(me, { vx: 0 })
    return { slots, urls, ground, slow, fast, hasWind: !!wl }
  })
  expect(r.slots.every(k => ['bgm', 'amb', 'wind'].includes(k)) && /wind_loop\.wav/.test(r.urls.wind || '') && /city_street_loop\.wav/.test(r.urls.amb || '') && !Object.values(r.urls).some(u => /air_01|loop_highway/.test(u)) && r.ground === 0 && r.slow === 0 && r.fast > 0 && r.fast <= 0.35, JSON.stringify(r)); return r
})
await t('矢印は方角だけ（2026-11-03 本人「高さを表現すると分かりづらい。方角だけでいい」）: 画面の上（伝票と丼のあいだ）に固定・届け先が真上でも真下でも向きは水平の方角だけで決まる・正面0°/右90°/後ろ180°', async () => {
  const r = await p.evaluate(() => {
    const ar = document.getElementById('arrow'), svg = ar.querySelector('svg')
    const ang = () => { const m = /rotate\(([-\d.e]+)rad\)/.exec(svg.style.transform); return m ? +m[1] : NaN }
    const o = sky.sh.cur, y0 = o.y, me = sky.me, still = () => Object.assign(me, { vx: 0, vy: 0, vz: 0 })
    still(); o.y = y0 + 150; sky.dbg.step(1); const hi = ang(), wantHi = sky.dbg.compass(o.x, o.z), rcHi = ar.getBoundingClientRect()
    still(); o.y = -50; sky.dbg.step(1); const lo = ang(), want = sky.dbg.compass(o.x, o.z), rcLo = ar.getBoundingClientRect()
    o.y = y0
    const e = sky.camera.matrixWorld.elements, fx = -e[8], fz = -e[10], L = Math.hypot(fx, fz)
    const ahead = sky.dbg.compass(me.x + fx / L * 30, me.z + fz / L * 30), right = sky.dbg.compass(me.x - fz / L * 30, me.z + fx / L * 30), back = sky.dbg.compass(me.x - fx / L * 30, me.z - fz / L * 30)
    const tk = document.getElementById('ticket').getBoundingClientRect(), bw = document.getElementById('bowl').getBoundingClientRect()
    return { hi: +hi.toFixed(3), lo: +lo.toFixed(3), want: +want.toFixed(3), wantHi: +wantHi.toFixed(3), sameSpot: Math.abs(rcHi.left - rcLo.left) < 1 && Math.abs(rcHi.top - rcLo.top) < 1, top: Math.round(rcHi.top), clear: rcHi.left >= tk.right - 2 && rcHi.right <= bw.left + 2, ahead: +ahead.toFixed(2), right: +(right * 180 / Math.PI).toFixed(0), back: +(Math.abs(back) * 180 / Math.PI).toFixed(0) }
  })
  expect(Math.abs(r.hi - r.lo) < 0.05 && Math.abs(r.hi - r.wantHi) < 0.03 && Math.abs(r.lo - r.want) < 0.03 && r.sameSpot && r.top < 80 && r.clear && Math.abs(r.ahead) < 0.02 && Math.abs(r.right - 90) <= 1 && Math.abs(r.back - 180) <= 1, JSON.stringify(r)); return r
})
await t('高さ（2026-11-03 本人「やっぱ高さがわからん」）: 方角の矢印の下に階数・上か下かの山形・差のm。届け先が上なら上向き「上に 18m」、下なら下向き「下に 12m」、差が小さいと「同じ高さ」', async () => {
  const r = await p.evaluate(() => {
    const o = sky.sh.cur, me = sky.me, hb = document.getElementById('heightBox'), out = {}
    const y0 = me.y
    for (const [k, d] of [['up', 18], ['down', -12], ['same', 1]]) { me.y = o.y - 1.1 - d; sky.dbg.render(1); out[k] = { dir: hb.dataset.dir, text: hb.textContent, chev: getComputedStyle(hb.querySelector('.chev')).transform, shown: getComputedStyle(hb.querySelector('.chev')).display !== 'none' } }
    me.y = y0; sky.dbg.render(1)
    const rc = hb.getBoundingClientRect(), ar = document.getElementById('arrow').getBoundingClientRect()
    out.below = rc.top >= ar.bottom - 2 && Math.abs((rc.left + rc.right) / 2 - (ar.left + ar.right) / 2) < 3
    out.floor = o.floor
    return out
  })
  expect(r.up.dir === 'up' && /上に 18m/.test(r.up.text) && r.up.shown && r.up.chev === 'none' && r.down.dir === 'down' && /下に 12m/.test(r.down.text) && r.down.chev !== 'none' && r.same.dir === 'same' && /同じ高さ/.test(r.same.text) && !r.same.shown && r.up.text.includes(r.floor + '階') && r.below, JSON.stringify(r)); return { up: r.up.text, down: r.down.text, same: r.same.text }
})
await t('光の柱: 届け先の窓の前（壁の外 1.6m）に、地面から屋上より上まで立つ。窓の高さに光る輪', async () => {
  const r = await p.evaluate(() => {
    sky.dbg.render(1)
    const o = sky.sh.cur, b = sky.beam, col = b.children[0], band = b.children[1]
    return { vis: b.visible, dx: +(b.position.x - (o.x + o.nx * 1.6)).toFixed(2), dz: +(b.position.z - (o.z + o.nz * 1.6)).toFixed(2), bottom: +b.position.y.toFixed(1), top: +(b.position.y + col.scale.y).toFixed(1), roof: o.bld && o.bld.y1, bandY: +(b.position.y + band.position.y).toFixed(1), winY: +o.y.toFixed(1) }
  })
  expect(r.vis && Math.abs(r.dx) < 0.01 && Math.abs(r.dz) < 0.01 && r.bottom < 2 && r.top > Math.max(r.winY, r.roof || 0) + 5 && Math.abs(r.bandY - r.winY) < 0.01, JSON.stringify(r)); return r
})
await t('地面ワイヤー（画面）: 空中で画面の道をタップすると地面に掛かる／建物をタップすると建物（地面より優先）／地面に立っている時に道をタップしても地面には掛からない', async () => {
  const r = await p.evaluate(() => {
    const me = sky.me, W = sky.world, c = sky.camera
    let P = null; for (let x = -200; x <= 200 && !P; x += 7) for (let z = 300; z <= 1200 && !P; z += 7) { let ok = true; for (let k = 0; k <= 40 && ok; k += 4) if (W.surfaceAt(x, z + k) !== 'road' || Math.abs(W.groundAt(x, z + k, 50).h) > 0.5) ok = false; if (ok) P = { x, z } }
    const scr = (x, y, z) => { const v = c.position.clone().set(x, y, z).project(c); return { sx: (v.x * 0.5 + 0.5) * innerWidth, sy: (-v.y * 0.5 + 0.5) * innerHeight, ok: v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95 } }
    const air = () => { sky.dbg.teleport(P.x, 22, P.z, 0); Object.assign(me, { grounded: false, vy: 0 }); sky.cam.hd = 0; sky.cam.pitch = 0.8; sky.cam.userT = performance.now() + 1e7; for (let i = 0; i < 40; i++) sky.dbg.step(0); c.updateMatrixWorld() }
    air(); const g = scr(P.x, 0, P.z + 18); sky.dbg.pressWire(g.sx, g.sy); sky.dbg.step(1)
    const ground = { ok: g.ok, rope: !!me.rope, isGround: !!(me.rope && me.rope.ground) }
    // 建物: 一番近い建物の壁の真ん中あたり
    air(); const B = W.colliders.filter(o => o.kind === 'building' && o.y1 > 20).map(o => ({ o, d: Math.hypot(o.cx - me.x, o.cz - me.z) })).sort((a, b) => a.d - b.d)[0].o
    let bp = null; for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const s = scr(B.cx + nx * B.hw, Math.min(B.y1 - 3, 18), B.cz + nz * B.hl); if (s.ok) { bp = s; break } }
    let bld = null
    if (bp) { sky.dbg.pressWire(bp.sx, bp.sy); sky.dbg.step(1); bld = { rope: !!me.rope, isGround: !!(me.rope && me.rope.ground) } }
    // 地面に立って道をタップ
    sky.dbg.teleport(P.x, 0, P.z, 0); for (let i = 0; i < 10; i++) sky.dbg.step(1); for (let i = 0; i < 30; i++) sky.dbg.step(0); c.updateMatrixWorld()
    const g2 = scr(P.x, 0, P.z + 8); sky.dbg.pressWire(g2.sx, g2.sy); sky.dbg.step(1)
    const onGround = { isGround: !!(me.rope && me.rope.ground) }
    sky.dbg.teleport(P.x, 0, P.z, 0); sky.cam.userT = -1e9; sky.cam.pitch = 0.15; sky.dbg.step(2)
    return { ground, bld, onGround }
  })
  expect(r.ground.ok && r.ground.isGround && (!r.bld || (r.bld.rope && !r.bld.isGround)) && !r.onGround.isGround, JSON.stringify(r)); return r
})
await t('画面タッチ: 近くのビルに掛かる／遠すぎる所は、その向きの届く所に掛かるか×', async () => {
  const r = await p.evaluate(() => {
    const me = sky.me
    sky.dbg.teleport(0, 0, 700, 0); sky.dbg.step(30)
    const cam = sky.camera
    const toScreen = (x, y, z) => { const v = { x, y, z }; const V = new cam.position.constructor(x, y, z).project(cam); return { sx: (V.x * 0.5 + 0.5) * innerWidth, sy: (-V.y * 0.5 + 0.5) * innerHeight, z: V.z } }
    // 近い: 右の歩道の上のビルの壁（x=18 付近、15m 先）
    const near = toScreen(18.2, 14, 716)
    sky.log.length = 0
    sky.dbg.pressWire(near.sx, near.sy); sky.dbg.step(2)
    const gotNear = !!me.rope, lenNear = me.rope ? Math.hypot(me.rope.x - me.x, me.rope.y - me.y, me.rope.z - me.z) : 0
    // 外してから、通りのずっと奥（100m以上先）を狙う
    sky.dbg.teleport(0, 0, 700, 0); sky.dbg.step(30)
    const far = toScreen(18.2, 30, 860)
    sky.log.length = 0
    sky.dbg.pressWire(far.sx, far.sy); sky.dbg.step(2)
    const miss = sky.log.find(e => e.t === 'wireMiss')
    const farLen = me.rope ? Math.hypot(me.rope.x - me.x, me.rope.y - me.y, me.rope.z - me.z) : 0
    return { gotNear, lenNear: Math.round(lenNear), near, farRope: !!me.rope, farLen: Math.round(farLen), miss: miss && miss.far, missShown: !document.getElementById('miss').classList.contains('hidden') }
  })
  expect(r.gotNear && r.lenNear <= 76 && ((r.farRope && r.farLen <= 77) || (r.miss && r.missShown)), JSON.stringify(r)); return r
})
await t('手渡し: 窓の前でゆっくり寄ると届く。チップと客の一言が出る', async () => {
  const r = await p.evaluate(() => {
    const o = sky.sh.cur; sky.log.length = 0
    sky.dbg.teleport(o.x + o.nx * 2, o.y - 1.1, o.z + o.nz * 2); sky.dbg.step(2)
    const d = sky.log.find(e => e.t === 'deliver')
    return { d, say: document.getElementById('say').textContent, idx: sky.sh.idx, offers: !!sky.sh.offer, stay: sky.dbg.target.visible, earn: document.getElementById('tEarn').textContent }
  })
  expect(r.d && r.d.how === 'hand' && !r.d.angry && r.d.tip > 0 && r.say.length > 3 && r.idx === 1 && r.offers && r.stay && /[1-9]/.test(r.earn), JSON.stringify(r)); return { tip: r.d.tip, say: r.say, earn: r.earn }
})
await t('店に戻らないと次を受け取れない／戻ると受け取る', async () => {
  const r = await p.evaluate(() => {
    const before = sky.sh.carrying
    const want = sky.sh.offer && sky.sh.offer.tier
    sky.dbg.teleport(sky.JOB.pick.x, 0, sky.JOB.pick.z); sky.dbg.step(2)
    return { before, want, after: sky.sh.carrying, tier: sky.sh.cur && sky.sh.cur.tier, to: document.getElementById('tTo').textContent }
  })
  expect(!r.before && r.after && r.tier === r.want && (r.tier !== 'far' || /運河|高層|外れ|遠く/.test(r.to)), JSON.stringify(r)); return r.to
})
await t('速すぎると受け取れない（止まって）', async () => {
  const r = await p.evaluate(() => {
    const o = sky.sh.cur; o.cust = 'normal'; o.handR = sky.JOB.handR; o.handSpeed = sky.JOB.handSpeed; sky.log.length = 0
    sky.dbg.teleport(o.x + o.nx * 2, o.y - 1.1, o.z + o.nz * 2); Object.assign(sky.me, { vx: -o.nx * 25 + o.nz * 10, vz: -o.nz * 25 + o.nx * 10, grounded: false }); sky.dbg.step(1)
    return { fast: sky.log.some(e => e.t === 'tooFast'), deliv: sky.log.some(e => e.t === 'deliver') }
  })
  expect(r.fast && !r.deliv, JSON.stringify(r))
})
await t('投げるボタンが無い・F キーでも投げない（2026-11-02 本人「投げるボタンいらない」）', async () => {
  const btn = await p.$('.tbtn[data-k=throw]')
  await p.keyboard.press('KeyF')
  const r = await p.evaluate(() => { sky.log.length = 0; sky.dbg.step(30); return { thrown: !!sky.sh.thrown, ev: sky.log.some(e => e.t === 'throw') } })
  expect(!btn && !r.thrown && !r.ev, JSON.stringify({ btn: !!btn, ...r }))
})
await t('デュフフの人: 窓の客がその人（眼鏡）になり、近づくと「デュフ」、渡すと台詞もデュフフで、チップは 2222/222/22 円のどれか', async () => {
  const r = await p.evaluate(() => {
    if (!sky.sh.cur) { sky.dbg.teleport(sky.JOB.pick.x, 0, sky.JOB.pick.z); sky.dbg.step(2) }
    sky.log.length = 0
    sky.dbg.lookAtWindow('duf', 15); sky.dbg.step(1)
    const near = document.getElementById('say').textContent
    const o = sky.sh.cur; sky.dbg.teleport(o.x + o.nx * 2, o.y - 1.1, o.z + o.nz * 2); sky.dbg.step(2)
    const d = sky.log.find(e => e.t === 'deliver'), say = document.getElementById('say').textContent
    const ps = sky.dbg.target.userData.person
    return { near, say, tip: d && d.tip - (d.early || 0), cust: d && d.cust, slot: ps.cur, glasses: !!(ps.slots[ps.cur] && ps.slots[ps.cur].props.glasses), stay: sky.dbg.target.visible }
  })
  expect(/デュフ/.test(r.near) && /デュ/.test(r.say) && [2222, 222, 22].includes(r.tip) && r.cust === 'duf' && /^duf:/.test(r.slot) && r.glasses && r.stay, JSON.stringify(r)); return { say: r.say, tip: r.tip }
})
await t('ほかの客も見た目と台詞が変わる（丁寧・小銭・撮る・網）。小銭の人のチップは「1円玉 N枚」', async () => {
  const out = {}
  for (const c of ['polite', 'coins', 'photo', 'net']) {
    out[c] = await p.evaluate(c => {
      sky.dbg.teleport(sky.JOB.pick.x, 0, sky.JOB.pick.z); sky.dbg.step(2)
      sky.log.length = 0; sky.dbg.lookAtWindow(c, 15); sky.dbg.step(1)
      const near = document.getElementById('say').textContent, note = document.getElementById('tNote').textContent
      const o = sky.sh.cur; sky.dbg.teleport(o.x + o.nx * 2, o.y - 1.1, o.z + o.nz * 2); sky.dbg.step(2)
      const ps = sky.dbg.target.userData.person
      return { near, note, say: document.getElementById('say').textContent, slot: ps.cur, props: Object.keys((ps.slots[ps.cur] || {}).props || {}) }
    }, c)
  }
  const ok = /恐れ入|ようこそ/.test(out.polite.near) && /1円玉 \d+枚/.test(out.coins.say) && out.coins.props.includes('purse') && out.photo.props.includes('phone') && out.net.props.includes('net') && /網/.test(out.net.note)
    && new Set(Object.values(out).map(v => v.slot)).size === 4
  expect(ok, JSON.stringify(out)); return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.say]))
})
await t('最後まで行くと給料明細が出る（件数が多い日も、画像の保存・Xのリンク）', async () => {
  await p.evaluate(() => { for (let i = 0; i < 9; i++) { sky.dbg.teleport(sky.JOB.pick.x, 0, sky.JOB.pick.z); sky.dbg.step(2); const o = sky.sh.cur; sky.dbg.teleport(o.x + o.nx * 2, o.y - 1.1, o.z + o.nz * 2); sky.dbg.step(2) } })
  await p.evaluate(() => { sky.dbg.step(60 * (sky.JOB.shiftSec + 5)) }); await p.evaluate(() => sky.dbg.pause(false)); await p.waitForTimeout(2500)
  const r = await p.evaluate(() => ({ mode: sky.mode, shown: !document.getElementById('result').classList.contains('hidden'), w: document.getElementById('slip').width, post: decodeURIComponent(document.getElementById('btnPost').href), net: window.__lastNet, n: sky.sh.results.length }))
  await p.screenshot({ path: ROOT + '/shots/result-many.png' })
  expect(r.mode === 'result' && r.shown && r.w === 1080 && /twitter\.com\/intent/.test(r.post) && r.n >= 15 && /4分間に\d+件/.test(r.post), JSON.stringify(r)); return { net: r.net, delivered: r.n }
})
await t('何もしない1日は最低の判定（不採用・届けた0件）', async () => {
  await p.click('#btnAgain'); await p.evaluate(() => sky.dbg.pause(true))
  await p.evaluate(() => { sky.dbg.teleport(200, 0, 1300); sky.dbg.step(60 * (sky.JOB.shiftSec + 2)) }); await p.evaluate(() => sky.dbg.pause(false)); await p.waitForTimeout(2500)
  const r = await p.evaluate(() => ({ mode: sky.mode, net: window.__lastNet, done: sky.sh.results.length }))
  expect(r.mode === 'result' && r.done === 0 && r.net < 5000, JSON.stringify(r)); return r
})
await t('音: 鳴らした回数が数えられ、テスト中は実際に無音', async () => {
  const r = await p.evaluate(() => ({ calls: window.__soundCalls, played: Object.keys(Snd.played).length, ok: window.__muteOk() }))
  expect(r.calls > 0 && r.played >= 5 && r.ok, JSON.stringify(r)); return r
})
await t('英語に切り替わる', async () => {
  await p.click('#btnTitle'); await p.click('#btnLang')
  const r = await p.evaluate(() => ({ start: document.getElementById('btnStart').textContent, logo: document.querySelector('.logo').textContent, lang: document.documentElement.lang }))
  expect(r.start === 'Clock in' && r.lang === 'en', JSON.stringify(r))
  await p.click('#btnLang')
})
await t('エラーが出ていない（通しのあと）', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await p.close()

// ---------------------------------------------------------------- 6サイズ × 全画面
const SIZES = [[360, 640, 'small'], [390, 844, 'phone'], [844, 390, 'land'], [667, 375, 'land-se'], [768, 1024, 'tab'], [1440, 900, 'pc']]
for (const [w, h, name] of SIZES) {
  const touch = name !== 'pc'
  const q = await open(browser, { viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch && name !== 'tab' })
  const views = {}
  await q.waitForTimeout(600)
  views.title = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-title.png` })
  await q.click('#btnHow'); views.how = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-how.png` }); await q.click('[data-close]')
  await q.click('#btnStart'); await q.waitForTimeout(900); views.play = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-play.png` })
  await q.click('#btnPause'); views.pause = await fit(q); await q.click('#btnResume')
  await q.evaluate(() => sky.showResult()); await q.waitForTimeout(500); views.result = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-result.png` })
  for (const [v, r] of Object.entries(views)) await t(`一画面に収まる・重ならない ${name} ${w}x${h} ${v}`, async () => { expect(!r.over.length, JSON.stringify(r)) })
  await t(`${name}: はみ出し・エラーなし`, async () => { const o = await overflow(q); expect(o.sw <= o.W && !o.bad.length && !q.errs.length, JSON.stringify(o) + q.errs.join('|')) })
  await q.close()
}
await browser.close()

// ---------------------------------------------------------------- WebKit（iPhone 相当）
const wb = await webkit.launch(), wp = await open(wb, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await t('WebKit: 2本指の touchmove を止める', async () => {
  const r = await wp.evaluate(() => { const e = new Event('touchmove', { cancelable: true, bubbles: true }); Object.defineProperty(e, 'touches', { value: [{}, {}] }); document.body.dispatchEvent(e); return e.defaultPrevented })
  expect(r, r)
})
await t('WebKit: タップで出勤してスマホ操作が出る・実際には無音', async () => {
  await wp.tap('#btnStart'); await wp.waitForTimeout(1200)
  const r = await wp.evaluate(() => ({ mode: sky.mode, touch: !document.getElementById('touch').classList.contains('hidden'), mute: window.__muteOk(), calls: window.__soundCalls }))
  expect(r.mode === 'play' && r.touch && r.mute, JSON.stringify(r)); return r
})
await t('WebKit: 左スティックは左下に固定（2026-11-03 本人「左スティックは固定で」）: 別の所を触っても出てこない・動かない／円に触れて倒すと走る／画面をなぞった指が円に入るとその時点から倒した扱い', async () => {
  const r = await wp.evaluate(async () => {
    const el = document.getElementById('stick'), cv = document.querySelector('#view canvas'), c0 = window.__stickCenter()
    const ev = (tg, type, id, cx, cy) => tg.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: cx, clientY: cy, bubbles: true, pointerType: 'touch' }))
    // 1) 左の広い所（円の外）を触る: スティックは出ない・動かない
    const fx = c0.x + c0.R * 2.2, fy = c0.y - c0.R * 2.2
    ev(cv, 'pointerdown', 11, fx, fy); const away = { held: el.classList.contains('held'), moved: Math.hypot(window.__stickCenter().x - c0.x, window.__stickCenter().y - c0.y) }; ev(window, 'pointerup', 11, fx, fy)
    // 2) 円の中を触って上へ倒す
    const p0 = [sky.me.x, sky.me.z]
    ev(el, 'pointerdown', 12, c0.x, c0.y); ev(window, 'pointermove', 12, c0.x, c0.y - 50)
    await new Promise(r => setTimeout(r, 1200))
    const d = Math.hypot(sky.me.x - p0[0], sky.me.z - p0[1]), c1 = window.__stickCenter()
    ev(window, 'pointerup', 12, c0.x, c0.y - 50)
    // 3) 外から指をすべらせて入る
    ev(cv, 'pointerdown', 13, c0.x + c0.R * 2.5, c0.y); for (let k = 2.4; k >= 0.3; k -= 0.3) ev(window, 'pointermove', 13, c0.x + c0.R * k, c0.y)
    const slid = el.classList.contains('held'); ev(window, 'pointerup', 13, c0.x, c0.y)
    return { away, moved: +d.toFixed(1), fixed: Math.hypot(c1.x - c0.x, c1.y - c0.y) < 1, slid, released: !el.classList.contains('held'), left: Math.round(c0.x), fromBottom: Math.round(innerHeight - c0.y) }
  })
  expect(!r.away.held && r.away.moved < 1 && r.moved > 3 && r.fixed && r.slid && r.released, JSON.stringify(r)); return r
})
await t('WebKit: 巻き取りボタンが無い・大きいワイヤーボタンで前の上へ掛かる（WIRE ESCAPE と同じ並び）', async () => {
  const r = await wp.evaluate(async () => {
    const reel = !!document.querySelector('.tbtn[data-k=reel]')
    sky.dbg.teleport(0, 0, 700, 0); await new Promise(f => setTimeout(f, 300))
    const b = document.querySelector('.tbtn[data-k=wire]'), rc = b.getBoundingClientRect()
    b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, clientX: rc.x + 10, clientY: rc.y + 10, bubbles: true, pointerType: 'touch' }))
    await new Promise(f => setTimeout(f, 250))
    return { reel, rope: !!sky.me.rope, right: innerWidth - rc.right, bottom: innerHeight - rc.bottom, size: rc.width }
  })
  expect(!r.reel && r.rope && r.right < 40 && r.bottom < 40 && r.size >= 80, JSON.stringify(r)); return r
})
await t('WebKit: 店の周りの町の画面: 開始地点でタップして、自動販売機・一軒家・路地の電柱に実際に掛かる。開始地点のドローコールは 175 以下（車と通行人の数で揺れる。同じ条件の比較は _around.mjs で 135→140）', async () => {
  const r = await wp.evaluate(async () => {
    sky.start(3); await new Promise(f => setTimeout(f, 400))
    const out = {}, F = sky.world.town.fill, me = () => sky.me, V = sky.camera.position.constructor
    sky.dbg.pause(true)
    const at = (x, y, z) => { const v = new V(x, y, z).project(sky.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight] }
    const aim = (fx, fy, fz, sx, sz) => {
      sky.dbg.teleport(sx, 0, sz, Math.atan2(fx - sx, fz - sz)); sky.cam.hd = Math.atan2(fx - sx, fz - sz); sky.cam.pitch = 0.42; sky.cam.userT = performance.now() + 1e8
      sky.dbg.step(1); sky.dbg.teleport(sx, 0, sz, Math.atan2(fx - sx, fz - sz)); sky.dbg.render(4); sky.camera.updateMatrixWorld()
      const [px, py] = at(fx, fy, fz); sky.dbg.pressWire(px, py); sky.dbg.step(1)
      return { rope: !!me().rope, low: !!(me().rope && me().rope.low), hook: me().rope && [+me().rope.x.toFixed(1), +me().rope.y.toFixed(1), +me().rope.z.toFixed(1)] }
    }
    const v = F.vends[0]; out.vend = aim(v.cx, v.y1 - 0.5, v.cz, sky.JOB.shop.x - 9, sky.JOB.shop.z)
    const h = F.houses[12]; out.house = aim(h.cx + h.hw, h.y1 - 1, h.cz, h.cx + 24, h.cz)
    const q = F.posts[0]; out.post = aim(q.cx, q.y1 - 0.4, q.cz, q.cx + 20, q.cz + 1)
    sky.dbg.teleport(sky.JOB.shop.x - 9, 0, sky.JOB.shop.z, Math.PI / 2); sky.dbg.render(2)
    sky.cam.hd = Math.PI / 2; sky.cam.pitch = 0.4; sky.dbg.render(3); out.startCalls = sky.renderer.info.render.calls; out.want = { house: [h.cx + h.hw, h.cz], post: [q.cx, q.cz] }
    sky.dbg.pause(false)
    return out
  })
  const near = (a, x, z, m) => a && Math.hypot(a[0] - x, a[2] - z) < m
  expect(r.vend.low && near(r.vend.hook, 42, 849, 0.5) && r.house.rope && !r.house.low && near(r.house.hook, r.want.house[0], r.want.house[1], 1.5) && near(r.post.hook, r.want.post[0], r.want.post[1], 0.5) && r.startCalls > 0 && r.startCalls <= 175, JSON.stringify(r)); return r
})
await t('WebKit: エラーなし', async () => { expect(wp.errs.length === 0, wp.errs.join('|')) })
await wb.close()
server.kill()
await t('向き: カメラを0〜720°以上回しても、地上・空中・ワイヤー中でスティックの上下左右＝画面の上下左右（84通り。2026-11-02 しっぽ取りで見つかった不具合）', () => {
  const out = execFileSync(process.execPath, ['_dir.mjs'], { cwd: ROOT, encoding: 'utf8', timeout: 600000 })
  const j = JSON.parse(out.trim().split('\n').pop()); expect(j.ng === 0 && !j.errs.length, out.slice(-400)); return { cases: j.total }
})
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
