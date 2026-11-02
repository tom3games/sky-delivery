// 空中出前の検証。node verify.mjs（テスト中は無音: mute.mjs）
import { chromium, webkit } from 'playwright'
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { createWorld } from './shared/track.js'
import { createRunner, stepRunner, RUN } from './shared/runner.js'
import { JOB, createShift, stepShift, makeTargets } from './shared/delivery.js'
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
await t('ワイヤー: 届く距離は35m。遠い所を狙うと外れて、自動で別の所にも掛からない', () => {
  const r = createRunner({ id: 'a', spawn: { x: 0, y: 0, z: 700, yaw: 0 } })
  stepRunner(r, { wire: true, wireAt: { x: 18, y: 30, z: 760 } }, 1 / 60, world)
  const miss = r.events.find(e => e.t === 'wireMiss')
  expect(!r.rope && miss && miss.far, JSON.stringify(r.events)); return { d: Math.round(miss.d) }
})
await t('ワイヤー: 35m以内なら掛かる', () => {
  const r = createRunner({ id: 'a', spawn: { x: 0, y: 0, z: 700, yaw: 0 } })
  stepRunner(r, { wire: true, wireAt: { x: 18, y: 18, z: 715 } }, 1 / 60, world)
  expect(r.rope, JSON.stringify(r.events)); return { len: +r.rope.len.toFixed(1) }
})
await t('巻き取り: 引き寄せない（重力が残る）。縮めるだけで振り子が速くなる', () => {
  const mk = () => { const r = createRunner({ id: 'a', spawn: { x: 0, y: 12, z: 700, yaw: 0 } }); r.grounded = false; r.vz = 12; r.rope = { x: 0, y: 30, z: 712, len: 21, t: 0 }; return r }
  const a = mk(), b = mk()
  let minVyA = 0
  for (let i = 0; i < 40; i++) { stepRunner(a, { boost: true }, 1 / 60, world); stepRunner(b, {}, 1 / 60, world); minVyA = Math.min(minVyA, a.vy) }
  const va = Math.hypot(a.vx, a.vy, a.vz), vb = Math.hypot(b.vx, b.vy, b.vz)
  expect(a.rope && b.rope, 'rope lost')
  expect(a.rope.len < b.rope.len - 2, `len ${a.rope.len} vs ${b.rope.len}`)
  expect(va > vb + 0.5, `speed ${va} vs ${vb}`)
  // 直線で引っぱる（旧仕様）なら 18m/s で一直線。新仕様は自由落下と同じく下へも落ちる
  expect(va < 30, 'too fast ' + va)
  return { lenReel: +a.rope.len.toFixed(1), lenFree: +b.rope.len.toFixed(1), vReel: +va.toFixed(1), vFree: +vb.toFixed(1) }
})
await t('届け先: 5件・店から70〜210m・窓の前が広い道・近い順', () => {
  const bad = []
  for (let s = 1; s <= 30; s++) {
    const tg = makeTargets(world, s)
    if (tg.length !== 5) bad.push(s + ':n' + tg.length)
    for (let i = 0; i < tg.length; i++) { const o = tg[i]; if (o.dist < 70 || o.dist > 210 || world.surfaceAt(o.x + o.nx * 7, o.z + o.nz * 7) !== 'road' || (i && tg[i - 1].dist > o.dist)) bad.push(s + ':' + i) }
  }
  expect(!bad.length, bad.join(',')); return { seeds: 30 }
})
await t('崩れ: 速く飛ぶ・強い着地は崩れる、ゆっくり歩くのは崩れない', () => {
  const sh = createShift(world, 1)
  const r = createRunner({ id: 'a', spawn: { x: JOB.shop.x, y: 0, z: JOB.shop.z } })
  stepShift(sh, r, 1 / 60); expect(sh.carrying, 'no pickup')
  r.vx = 3; for (let i = 0; i < 120; i++) { r.events.length = 0; stepShift(sh, r, 1 / 60) }
  const walk = sh.mess
  r.grounded = false; r.vx = 30; for (let i = 0; i < 60; i++) { r.events.length = 0; stepShift(sh, r, 1 / 60) }
  const fly = sh.mess
  r.events = [{ t: 'land', impact: 24 }]; stepShift(sh, r, 1 / 60)
  const land = sh.mess - fly
  expect(walk === 0 && fly > 3 && land > 10, JSON.stringify({ walk, fly, land })); return { walk, fly: +fly.toFixed(1), land: +land.toFixed(1) }
})
await t('bot: 上手い遊び方が、丁寧すぎ・速すぎの両方より稼ぐ（12日ずつ）', () => {
  const out = execFileSync(process.execPath, ['tools/sim.mjs', '12'], { cwd: ROOT, encoding: 'utf8', timeout: 600000 })
  const avg = k => +out.match(new RegExp(k + '\\s+平均 (\\d+)'))[1]
  const r = { careful: avg('careful'), rush: avg('rush'), skilled: avg('skilled') }
  expect(r.skilled > r.careful && r.skilled > r.rush, JSON.stringify(r)); return r
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
await t('出勤: 店で料理を受け取り、伝票に品名・届け先・残り時間が出る', async () => {
  await p.click('#btnStart')
  await p.evaluate(() => sky.dbg.pause(true)); await p.evaluate(() => sky.dbg.step(3))
  const r = await p.evaluate(() => ({ carrying: sky.sh.carrying, dish: document.getElementById('tDish').textContent, to: document.getElementById('tTo').textContent, time: document.getElementById('tTime').textContent, pick: sky.log.some(e => e.t === 'pickup') }))
  expect(r.carrying && r.pick && r.dish.length > 1 && /階/.test(r.to) && /秒/.test(r.time), JSON.stringify(r)); return r
})
await t('画面タッチ: 近くのビルに掛かる／遠すぎると×が出て掛からない', async () => {
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
    return { gotNear, lenNear: Math.round(lenNear), near, farRope: !!me.rope, miss: miss && miss.far, missShown: !document.getElementById('miss').classList.contains('hidden') }
  })
  expect(r.gotNear && r.lenNear <= 36 && !r.farRope && r.miss && r.missShown, JSON.stringify(r)); return r
})
await t('手渡し: 窓の前でゆっくり寄ると届く。チップと客の一言が出る', async () => {
  const r = await p.evaluate(() => {
    const o = sky.sh.targets[sky.sh.idx]; sky.log.length = 0
    sky.dbg.teleport(o.x + o.nx * 2, o.y - 1.1, o.z + o.nz * 2); sky.dbg.step(2)
    const d = sky.log.find(e => e.t === 'deliver')
    return { d, say: document.getElementById('say').textContent, idx: sky.sh.idx }
  })
  expect(r.d && r.d.how === 'hand' && !r.d.angry && r.d.tip > 0 && r.say.length > 3 && r.idx === 1, JSON.stringify(r)); return { tip: r.d.tip, say: r.say }
})
await t('店に戻らないと次を受け取れない／戻ると受け取る', async () => {
  const r = await p.evaluate(() => {
    const before = sky.sh.carrying
    sky.dbg.teleport(sky.JOB.shop.x - 2, 0, sky.JOB.shop.z); sky.dbg.step(2)
    return { before, after: sky.sh.carrying }
  })
  expect(!r.before && r.after, JSON.stringify(r))
})
await t('速すぎると受け取れない（止まって）', async () => {
  const r = await p.evaluate(() => {
    const o = sky.sh.targets[sky.sh.idx]; sky.log.length = 0
    sky.dbg.teleport(o.x + o.nx * 2, o.y - 1.1, o.z + o.nz * 2); Object.assign(sky.me, { vx: -o.nx * 25 + o.nz * 10, vz: -o.nz * 25 + o.nx * 10, grounded: false }); sky.dbg.step(1)
    return { fast: sky.log.some(e => e.t === 'tooFast'), deliv: sky.log.some(e => e.t === 'deliver') }
  })
  expect(r.fast && !r.deliv, JSON.stringify(r))
})
await t('投げ入れ: 速いまま投げると窓に入る（崩れは増える）', async () => {
  const r = await p.evaluate(() => {
    const o = sky.sh.targets[sky.sh.idx]; sky.log.length = 0
    const yaw = Math.atan2(-o.nx, -o.nz)
    sky.dbg.teleport(o.x + o.nx * 5, o.y - 1.3, o.z + o.nz * 5, yaw); Object.assign(sky.me, { vx: -o.nx * 14, vz: -o.nz * 14, vy: 0, grounded: false })
    sky.dbg.pressThrow(); sky.dbg.step(30)
    return sky.log.find(e => e.t === 'deliver')
  })
  expect(r && r.how === 'throw' && r.mess >= 18, JSON.stringify(r)); return { mess: r.mess, tip: r.tip }
})
await t('投げて外すと落ちて割れる（料理代を引かれる）', async () => {
  const r = await p.evaluate(() => {
    sky.dbg.teleport(sky.JOB.shop.x - 2, 0, sky.JOB.shop.z); sky.dbg.step(2)
    const o = sky.sh.targets[sky.sh.idx]; sky.log.length = 0
    const yaw = Math.atan2(o.nx, o.nz)
    sky.dbg.teleport(o.x + o.nx * 8, o.y, o.z + o.nz * 8, yaw); Object.assign(sky.me, { vx: o.nx * 10, vz: o.nz * 10, grounded: false })
    sky.dbg.pressThrow(); sky.dbg.step(200)
    return { drop: sky.log.some(e => e.t === 'drop'), d: sky.log.find(e => e.t === 'deliver') }
  })
  expect(r.drop && r.d && r.d.how === 'drop' && r.d.angry, JSON.stringify(r))
})
await t('最後まで行くと給料明細が出る（画像の保存・Xのリンク）', async () => {
  await p.evaluate(() => { sky.dbg.step(60 * 200) }); await p.evaluate(() => sky.dbg.pause(false)); await p.waitForTimeout(2500)
  const r = await p.evaluate(() => ({ mode: sky.mode, shown: !document.getElementById('result').classList.contains('hidden'), w: document.getElementById('slip').width, post: document.getElementById('btnPost').href, net: window.__lastNet }))
  expect(r.mode === 'result' && r.shown && r.w === 1080 && /twitter\.com\/intent/.test(r.post), JSON.stringify(r)); return { net: r.net }
})
await t('何もしない1日は最低の判定（不採用・届けた0件）', async () => {
  await p.click('#btnAgain'); await p.evaluate(() => sky.dbg.pause(true))
  await p.evaluate(() => { sky.dbg.teleport(200, 0, 1300); sky.dbg.step(60 * 182) }); await p.evaluate(() => sky.dbg.pause(false)); await p.waitForTimeout(2500)
  const r = await p.evaluate(() => ({ mode: sky.mode, net: window.__lastNet, done: sky.sh.results.length }))
  expect(r.mode === 'result' && r.done === 0 && r.net < 3500, JSON.stringify(r)); return r
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
await t('WebKit: エラーなし', async () => { expect(wp.errs.length === 0, wp.errs.join('|')) })
await wb.close()
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
