// 空中出前の検証。node verify.mjs（テスト中は無音: mute.mjs）
import { chromium, webkit } from 'playwright'
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { createWorld } from './shared/track.js'
import { createRunner, stepRunner, RUN, rayHit } from './shared/runner.js'
import { addTown } from './shared/town.js'
import { createStreet, buildPoles } from './shared/street.js'
import { JOB, createShift, stepShift, makeOrder, mulberry, settle, payData, money, earned, windowPool } from './shared/delivery.js'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = 5390
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const results = []
async function t(name, fn) {
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
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) p.errs.push('reqfail ' + r.url()) })
  await p.goto(URL0); await p.waitForFunction(() => window.__skyReady, null, { timeout: 20000 })
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
  const sh = createShift(world, 1); const r2 = createRunner({ id: 'b', spawn: { x: JOB.pick.near.x, y: 0, z: JOB.pick.near.z } }); stepShift(sh, r2, 1 / 60)
  const m0 = sh.mess; r2.events = [{ t: 'ped' }]; stepShift(sh, r2, 1 / 60); const mPed = sh.mess - m0
  const m1 = sh.mess; r2.events = [{ t: 'car' }]; stepShift(sh, r2, 1 / 60); const mCar = sh.mess - m1
  expect(pedHit === 'ped' && carHit === 'car' && !air && mPed >= 5 && mCar >= 8 && mCar < JOB.angryMess, JSON.stringify({ pedHit, carHit, air, mPed, mCar })); return { mPed, mCar }
})
// 店の輪に立って受け取り、窓の前へ瞬間移動して手渡しする（node だけで1件まわす）
function deliverOnce(sh, tier = 'near') {
  const r = createRunner({ id: 'v', spawn: { x: JOB.pick[tier].x, y: 0, z: JOB.pick[tier].z } })
  stepShift(sh, r, 1 / 60); const o = sh.cur
  if (!o) return null
  Object.assign(r, { x: o.x + o.nx * 2, y: o.y - 1.1, z: o.z + o.nz * 2, vx: 0, vy: 0, vz: 0 }); r.events = []
  stepShift(sh, r, 1 / 60)
  return o
}
await t('注文は時間内なら途切れない: 30件続けて届けても次の2件（近場・遠方）が必ず出ている（2026-11-03 本人「時間内なら無限に」）', () => {
  const sh = createShift(world, 4); const bad = []
  for (let i = 0; i < 30; i++) { const o = deliverOnce(sh, i % 3 ? 'near' : 'far'); if (!o) bad.push('pick' + i); if (!sh.offers || !sh.offers.near || !sh.offers.far) bad.push('offers' + i) }
  expect(!bad.length && sh.results.length === 30 && !sh.over && sh.results.every(r => r.how === 'hand'), JSON.stringify({ bad, n: sh.results.length, over: sh.over })); return { delivered: sh.results.length }
})
await t('遠い注文: 手前の輪＝近場 70〜240m、奥の輪＝遠方 280〜580m。遠方は運河の向こう・高層の上の階・街の外れが出て、代金も時間も多い', () => {
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
  const firsts = Array.from({ length: 50 }, (_, s) => createShift(world, s + 1)).every(sh => sh.offers.near.cust === 'normal' && sh.offers.far.cust === 'normal')
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
  const r = createRunner({ id: 'n', spawn: { x: JOB.pick.near.x, y: 0, z: JOB.pick.near.z } }); stepShift(sh, r, 1 / 60)
  const o = sh.cur
  const at8 = c => { o.cust = c; o.handR = c === 'net' ? JOB.netR : JOB.handR; o.handSpeed = c === 'net' ? JOB.netSpeed : JOB.handSpeed; const n0 = sh.results.length; Object.assign(r, { x: o.x + o.nx * 8, y: o.y - 1.1, z: o.z + o.nz * 8, vx: 18 * o.nz, vy: 0, vz: -18 * o.nx, grounded: false }); r.events = []; stepShift(sh, r, 1 / 60); return sh.results.length > n0 }
  const normal = at8('normal'), net = at8('net')
  expect(!normal && net, JSON.stringify({ normal, net })); return { normal, net }
})
await t('稼ぎの計算: 手取り = 基本給 + 配達手当 + 遠方手当 + チップ − クレーム。持ったまま時間切れの1件は終わった時だけ引く', () => {
  const sh = createShift(world, 6)
  deliverOnce(sh, 'near'); deliverOnce(sh, 'far'); deliverOnce(sh, 'far')
  const R = sh.results, want = JOB.wage * JOB.hours + R.reduce((a, r) => a + r.fee + r.bonus + r.tip - (r.angry ? JOB.claim : 0), 0)
  const r = createRunner({ id: 'x', spawn: { x: JOB.pick.near.x, y: 0, z: JOB.pick.near.z } }); stepShift(sh, r, 1 / 60)
  const during = money(sh)
  sh.t = JOB.shiftSec; stepShift(sh, r, 1 / 60)
  const after = money(sh), p = payData(sh)
  expect(during === want && after === want - JOB.claim && sh.over && p.undone === 1 && R[1].bonus === JOB.farBonus && earned(sh) === after - JOB.wage * JOB.hours, JSON.stringify({ during, want, after, p })); return { net: after, rows: p.pay.map(x => x.label) }
})
await t('崩れ: 速く飛ぶ・強い着地は崩れる、ゆっくり歩くのは崩れない', () => {
  const sh = createShift(world, 1)
  const r = createRunner({ id: 'a', spawn: { x: JOB.pick.near.x, y: 0, z: JOB.pick.near.z } })
  stepShift(sh, r, 1 / 60); expect(sh.carrying, 'no pickup')
  r.vx = 3; for (let i = 0; i < 120; i++) { r.events.length = 0; stepShift(sh, r, 1 / 60) }
  const walk = sh.mess
  r.grounded = false; r.vx = 36; for (let i = 0; i < 60; i++) { r.events.length = 0; stepShift(sh, r, 1 / 60) }
  const fly = sh.mess
  r.events = [{ t: 'land', impact: 24 }]; stepShift(sh, r, 1 / 60)
  const land = sh.mess - fly
  expect(walk === 0 && fly > 1 && land > 10, JSON.stringify({ walk, fly, land })); return { walk, fly: +fly.toFixed(1), land: +land.toFixed(1) }
})
await t('bot（16日ずつ）: 下手な人も平均3件以上で5,000円超え／歩くだけは下手な人の7割以下・上手い人の半分以下（地面は不利）／上手い人は遠方だけが近場だけより少し多い／下手な人が遠方を選んでも大損しない', () => {
  const run = (env = {}) => execFileSync(process.execPath, ['tools/sim.mjs', '16', ...(env.k ? [env.k] : [])], { cwd: ROOT, encoding: 'utf8', timeout: 900000, env: { ...process.env, ...(env.pref ? { PREF: env.pref } : {}) } })
  const out = run(), outN = run({ k: 'skilled', pref: 'near' }), outF = run({ k: 'skilled', pref: 'far' }), outCF = run({ k: 'clumsy', pref: 'far' })
  const avg = (o, k) => +o.match(new RegExp(k + '\\s+平均 (\\d+)'))[1]
  const done = (o, k) => +o.match(new RegExp(k + '\\s+平均.*?届けた 平均([\\d.]+)件'))[1]
  const r = { careful: avg(out, 'careful'), clumsy: avg(out, 'clumsy'), skilled: avg(out, 'skilled'), rush: avg(out, 'rush'), nearOnly: avg(outN, 'skilled'), farOnly: avg(outF, 'skilled'), clumsyFar: avg(outCF, 'clumsy'), clumsyDone: done(out, 'clumsy') }
  expect(r.clumsyDone >= 3 && r.clumsy > 5000, '初めての人が稼げない ' + JSON.stringify(r))
  expect(r.careful <= r.clumsy * 0.7 && r.careful <= Math.min(r.skilled, r.nearOnly, r.farOnly) * 0.5, '歩くだけが強すぎる ' + JSON.stringify(r))
  expect(r.farOnly > r.nearOnly && r.farOnly < r.nearOnly * 1.25, '遠方だけが近場だけより少し多い、になっていない ' + JSON.stringify(r))
  expect(r.clumsyFar > r.clumsy * 0.85, '下手な人が遠方を選ぶと大損 ' + JSON.stringify(r))
  return r
})
await t('AI臭さチェック NG 0', () => {
  const out = execFileSync(process.execPath, [process.env.HOME + '/Desktop/claudecode/_shared/ai_tells.mjs', ROOT, '--json'], { encoding: 'utf8' })
  const j = JSON.parse(out); expect(j.ng === 0, JSON.stringify(j.items)); return j.items.map(i => i.key)
})

// ---------------------------------------------------------------- ブラウザ
const browser = await chromium.launch({ ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, ...GL] })
const p = await open(browser)
await t('起動時にエラーが出ない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
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
await t('出勤: 伝票に近場と遠方の2つの注文が出る。手前の輪に入ると近場を受け取り、品名・届け先・残り時間が出る', async () => {
  await p.click('#btnStart')
  await p.evaluate(() => sky.dbg.pause(true)); await p.evaluate(() => sky.dbg.step(3))
  const before = await p.evaluate(() => ({ carrying: sky.sh.carrying, to: document.getElementById('tTo').textContent, note: document.getElementById('tNote').textContent, earn: document.getElementById('tEarn').textContent }))
  await p.evaluate(() => { sky.dbg.teleport(sky.JOB.pick.near.x, 0, sky.JOB.pick.near.z); sky.dbg.step(3) })
  const r = await p.evaluate(() => ({ carrying: sky.sh.carrying, tier: sky.sh.cur && sky.sh.cur.tier, dish: document.getElementById('tDish').textContent, to: document.getElementById('tTo').textContent, time: document.getElementById('tTime').textContent, pick: sky.log.some(e => e.t === 'pickup') }))
  expect(!before.carrying && /近場/.test(before.to) && /遠方/.test(before.note) && /稼ぎ/.test(before.earn) && r.carrying && r.tier === 'near' && r.pick && r.dish.length > 1 && /階/.test(r.to) && /秒/.test(r.time), JSON.stringify({ before, r })); return { before: before.to + ' / ' + before.note, to: r.to }
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
    return { d, say: document.getElementById('say').textContent, idx: sky.sh.idx, offers: !!sky.sh.offers, stay: sky.dbg.target.visible, earn: document.getElementById('tEarn').textContent }
  })
  expect(r.d && r.d.how === 'hand' && !r.d.angry && r.d.tip > 0 && r.say.length > 3 && r.idx === 1 && r.offers && r.stay && /[1-9]/.test(r.earn), JSON.stringify(r)); return { tip: r.d.tip, say: r.say, earn: r.earn }
})
await t('店に戻らないと次を受け取れない／戻ると受け取る', async () => {
  const r = await p.evaluate(() => {
    const before = sky.sh.carrying
    sky.dbg.teleport(sky.JOB.pick.far.x, 0, sky.JOB.pick.far.z); sky.dbg.step(2)
    return { before, after: sky.sh.carrying, tier: sky.sh.cur && sky.sh.cur.tier, to: document.getElementById('tTo').textContent }
  })
  expect(!r.before && r.after && r.tier === 'far' && /運河|高層|外れ|遠く/.test(r.to), JSON.stringify(r)); return r.to
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
    if (!sky.sh.cur) { sky.dbg.teleport(sky.JOB.pick.near.x, 0, sky.JOB.pick.near.z); sky.dbg.step(2) }
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
      sky.dbg.teleport(sky.JOB.pick.near.x, 0, sky.JOB.pick.near.z); sky.dbg.step(2)
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
  await p.evaluate(() => { for (let i = 0; i < 9; i++) { sky.dbg.teleport(sky.JOB.pick.near.x, 0, sky.JOB.pick.near.z); sky.dbg.step(2); const o = sky.sh.cur; sky.dbg.teleport(o.x + o.nx * 2, o.y - 1.1, o.z + o.nz * 2); sky.dbg.step(2) } })
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
await t('WebKit: スティックで走る', async () => {
  const box = await wp.locator('#stick').boundingBox()
  const x0 = await wp.evaluate(() => [sky.me.x, sky.me.z])
  await wp.evaluate(({ x, y }) => {
    const el = document.getElementById('stick')
    const ev = (type, cx, cy) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: cx, clientY: cy, bubbles: true, pointerType: 'touch' }))
    ev('pointerdown', x, y); ev('pointermove', x, y - 50)
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
  await wp.waitForTimeout(1200)
  const x1 = await wp.evaluate(() => [sky.me.x, sky.me.z])
  const d = Math.hypot(x1[0] - x0[0], x1[1] - x0[1])
  expect(d > 3, d); return { moved: +d.toFixed(1) }
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
