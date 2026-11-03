import { addTown } from './town.js?v=13'
// 空中出前の仕事の中身（注文・崩れ・遅れ・受け渡し・投げ入れ・お金）。three.js に依存しない。画面と bot で同じものが動く
// 固定ステップで stepShift を呼ぶ。runner（shared/runner.js）の状態を読むだけで、動きには触らない（投げた料理だけ自分で飛ばす）

export const JOB = {
  shiftSec: 240,          // 勤務時間（4分）。この間は注文が途切れない（2026-11-02 本人「時間内なら無限に。どれだけ稼げるか」）
  shop: { x: 30, y: 0, z: 842, r: 7 },   // 店（広場の角の町中華）
  // 受け取りの輪は1つ（暖簾の前）。近場か遠方かは注文しだい（2026-11-03 本人「輪で選ぶのをやめて、ランダムで出てくるように」）
  pick: { x: 29, z: 842, r: 5 },
  farOdds: 0.3,           // 遠方の注文が出る割合（近場多め・遠方ときどき）。1件目は必ず近場
  nearD: [70, 240],       // 近場の届け先（店からの直線距離 m）
  farD: [280, 580],       // 遠方（運河の向こう・街の外れ・高層の上の階）
  // 崩れ（0〜100）。運んでいる間だけ増える
  // 2026-11-02 本人「めっちゃ難しい」「地面走ってる方が早く感じる」: 崩れは速さでなく、急な揺さぶり・着地・壁ぶつけが中心。スイングは罰になりすぎないように
  speedFree: 30,          // これより速く飛ぶと、風でスープが波打つ（m/s）
  speedK: 0.25,           // その分 1m/s ごとに毎秒これだけ崩れる
  accelFree: 22,          // 空中で横に振られる加速がこれを超えると崩れる（m/s²）
  accelK: 0.04,
  landFree: 13,           // 着地の衝撃（落ちる速さ）がこれを超えると
  landK: 1.1,
  bonk: 10,               // 壁にぶつかった
  pedHit: 7, carHit: 10,  // 通行人・車にぶつかった
  crowHit: 6, ballHit: 9, // カラス・野球ボールに当たった（shared/air.js）
  climbK: 0.4,            // 壁を這っている間（毎秒）
  // 地上で運んだ時間だけ麺がのびる（2026-11-03 本人のワイヤー系の決まり「地面は不利に」。歩くだけが下手な飛び方と同じ稼ぎだった）
  soggyFree: 4,           // 着地して壁まで走る程度は見逃す（秒）
  soggyK: 30,             // それを超えた1秒ごとにチップから引く（円）
  angrySoggy: 18,         // 地上でこれだけ運ぶと「のびのび」で怒る（丁寧すぎる人・デュフフの人は怒らない）
  runFree: 6, runK: 0.45,  // 地面を走ると岡持ちが揺れる。6m/s を超えた分 ×これ（毎秒）
  // 受け渡し
  handR: 5,               // 届け先にこの距離まで寄れば手渡し
  handSpeed: 16,          // 手渡しできる速さの上限（速いと「止まって！」）
  netR: 10, netSpeed: 22, // 網で受け取る客は遠くからでも・少し速くても取れる
  throwR: 2.6, throwBase: 18, throwK: 1.6,   // 投げ入れ（ボタンは無い。処理だけ残す）
  // 時間（受け取った瞬間から数える）
  limitBase: 10, limitPerM: 0.1,
  farGrace: 10,           // 遠方は時間に余裕を足す
  firstGrace: 10,         // 1件目は操作に慣れる分だけ長め。さらに1件目は崩れても遅れても怒られない（練習）
  // お金（歩合が中心。遠いほど代金もチップも高い）
  wage: 400, hours: 3,    // 基本給（3時間の体験という設定）
  feeBase: 200, feePerM: 2.5,    // 配達手当 = 200円 + 2.5円/m（150mで580円、450mで1,330円）
  tipBase: 300, tipPerM: 1,      // チップの上限 = 300円 + 1円/m（崩れ0・間に合えば満額）
  farBonus: 1800,          // 遠方手当（1件ごと。遠い注文を選ぶ理由）
  lateK: 30,              // 遅れ1秒ごとにチップから引く
  earlySec: 4, early: 150,
  angryMess: 80, angryLate: 15, claim: 300,
  dropCost: 800,
  // 客の種類の出やすさ（残りは普通の客）。1件目は必ず普通の客
  custOdds: { duf: 0.07, polite: 0.11, coins: 0.11, photo: 0.11, net: 0.12 },
  normalChars: 6   // js/charmodel.js の CUST_CHARS.normal の人数
}
export const CUSTS = ['normal', 'duf', 'polite', 'coins', 'photo', 'net']

export const DISHES = [
  { id: 'ramen', ja: '醤油ラーメン', en: 'Shoyu ramen', soup: true },
  { id: 'tantan', ja: '担々麺', en: 'Tantanmen', soup: true },
  { id: 'chahan', ja: '炒飯', en: 'Fried rice', soup: false },
  { id: 'tenshin', ja: '天津飯', en: 'Tenshin-han', soup: false },
  { id: 'gyoza', ja: '餃子2人前', en: 'Gyoza x2', soup: false },
  { id: 'chanpon', ja: 'ちゃんぽん', en: 'Champon', soup: true },
  { id: 'mabo', ja: '麻婆豆腐', en: 'Mapo tofu', soup: false }
]

const PLACES = [
  ['事務所', 'office'], ['美容室', 'salon'], ['法律事務所', 'law firm'], ['歯医者', 'dentist'], ['ネイルサロン', 'nail salon'],
  ['設計事務所', 'design studio'], ['塾', 'cram school'], ['探偵事務所', 'detective agency'], ['会議室', 'meeting room'], ['ヨガ教室', 'yoga studio']
]
const FAR_PLACES = [['展望オフィス', 'sky office'], ['社長室', "CEO's office"], ['屋上の撮影スタジオ', 'rooftop studio'], ['工場の事務所', 'factory office'], ['倉庫の休憩室', 'warehouse break room']]

export function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

// 届け先になれる窓の一覧（街ごとに1回だけ作る）: ビルの、広い道に面した窓
export function windowPool(world) {
  if (world._dPool) return world._dPool
  const S = JOB.shop
  const town = addTown(world, S)
  const blds = world.colliders.filter(o => o.kind === 'building' && o.y1 > 14 && !o.small)
  const pool = []
  for (const o of blds) for (let side = 0; side < 4; side++) for (const along of [-0.55, 0, 0.55]) {
    const nx = [1, -1, 0, 0][side], nz = [0, 0, 1, -1][side]
    const x = o.cx + (nx ? nx * (o.hw + 0.7) : along * o.hw), z = o.cz + (nz ? nz * (o.hl + 0.7) : along * o.hl)
    if (!ok(o, x, z, nx, nz)) continue
    pool.push({ x, z, nx, nz, o, d: Math.hypot(x - S.x, z - S.z) })
  }
  function ok(o, x, z, nx, nz) {
    // 窓の前に別の建物が無いこと（道に面している）・前 7m と 12m が道の上
    if (world.colliders.some(b => b !== o && b.kind === 'building' && Math.abs(x + nx * 12 - b.cx) < b.hw + 1 && Math.abs(z + nz * 12 - b.cz) < b.hl + 1)) return false
    return world.surfaceAt(x + nx * 7, z + nz * 7) === 'road' && world.surfaceAt(x + nx * 12, z + nz * 12) === 'road'
  }
  const houses = town.houses.map(h => { const x = h.cx, z = h.cz + h.face * (h.hl + 0.7); return { x, z, nx: 0, nz: h.face, o: h, d: Math.hypot(x - S.x, z - S.z), house: true } })
  world._dPool = { pool, houses }
  return world._dPool
}

// 1件の注文を作る。tier = 'near' | 'far'
export function makeOrder(world, rnd, tier, avoid = [], first = false) {
  const P = windowPool(world), S = JOB.shop
  const [d0, d1] = tier === 'far' ? JOB.farD : JOB.nearD
  const used = new Set(avoid.map(a => a && a.bld))
  let w
  if (tier === 'near' && !first && rnd() < 0.15) { const hs = P.houses.filter(h => !used.has(h.o)); if (hs.length) w = hs[Math.floor(rnd() * hs.length)] }
  if (!w) {
    const c = P.pool.filter(p => p.d >= d0 && p.d <= d1 && !used.has(p.o))
    w = c[Math.floor(rnd() * c.length)]
  }
  let y, floor, zone = null
  if (w.house) { y = w.o.y0 + 4.3; floor = 2 }
  else {
    const maxF = Math.max(3, Math.floor((w.o.y1 - 6) / 3.3))   // 屋上から 6m 下まで
    let f
    if (tier === 'far' && w.o.y1 > 40) f = Math.min(maxF, 9 + Math.floor(rnd() * Math.min(8, maxF - 8)))   // 高層は上の階
    else f = Math.min(maxF, 3 + Math.floor(rnd() * Math.min(8, maxF - 2)))
    floor = f + 1; y = f * 3.3 + 0.8
  }
  if (tier === 'far') {
    const W = world.nav && world.nav.canal
    if (W && w.z < W.z0) zone = 'canal'
    else if (floor >= 10) zone = 'tower'
    else if (Math.abs(w.x) > 380 || w.z > 1200) zone = 'edge'
    else zone = 'far'
  }
  const pl = w.house ? ['お宅', 'house'] : tier === 'far' && rnd() < 0.5 ? FAR_PLACES[Math.floor(rnd() * FAR_PLACES.length)] : PLACES[Math.floor(rnd() * PLACES.length)]
  // 客の種類
  let cust = 'normal'
  if (!first) { let r = rnd(); for (const [k, p] of Object.entries(JOB.custOdds)) { if (r < p) { cust = k; break } r -= p } }
  const d = w.d
  const far = tier === 'far'
  return {
    x: w.x, y, z: w.z, nx: w.nx, nz: w.nz, floor, place: pl, house: !!w.house, bld: w.o, dist: d, tier, zone, cust,
    char: Math.floor(rnd() * JOB.normalChars), v: rnd(),
    dish: DISHES[Math.floor(rnd() * DISHES.length)],
    fee: Math.round((JOB.feeBase + d * JOB.feePerM) / 10) * 10, bonus: far ? JOB.farBonus : 0,
    tipMax: Math.round((JOB.tipBase + d * JOB.tipPerM) / 10) * 10,
    limit: JOB.limitBase + d * JOB.limitPerM + (far ? JOB.farGrace : 0),
    handR: cust === 'net' ? JOB.netR : JOB.handR, handSpeed: cust === 'net' ? JOB.netSpeed : JOB.handSpeed
  }
}

// 次の注文を1つ作る（近場が多め、遠方はときどき）
function refreshOffers(sh, world) {
  const first = sh.results.length === 0
  const tier = !first && sh.rnd() < JOB.farOdds ? 'far' : 'near'
  sh.offer = makeOrder(world, sh.rnd, tier, sh.targets.slice(-3), first)
  sh.events.push({ t: 'offers' })
}

export function createShift(world, seed = 1) {
  const sh = {
    t: 0, over: false, targets: [], idx: 0, cur: null, offer: null, rnd: mulberry(seed * 7919 + 13),
    carrying: false, mess: 0, limit: 0, held: 0, pvx: 0, pvy: 0, pvz: 0, pgr: true,
    thrown: null, results: [], events: [], warned: false, fast: 0, near: false, src: { speed: 0, accel: 0, land: 0, bonk: 0, climb: 0, run: 0 }
  }
  refreshOffers(sh, world)
  sh.events.length = 0
  sh.world = world
  return sh
}

export const curOrder = sh => sh.cur

// 客ごとのチップと怒り方
export function settle(o, mess, late, how, practice, soggy = 0) {
  const c = o.cust
  const angryMess = c === 'photo' ? 55 : JOB.angryMess
  const angryLate = c === 'polite' ? Infinity : JOB.angryLate
  const angrySoggy = c === 'polite' ? Infinity : JOB.angrySoggy, sog = Math.max(0, soggy - JOB.soggyFree)
  let angry = how === 'drop' || (!practice && (mess >= angryMess || late >= angryLate || soggy >= angrySoggy))
  if (c === 'duf' && how !== 'drop') angry = false   // 怒らない（クレームも言わない）
  let tip = how === 'drop' ? 0 : Math.max(0, Math.round(o.tipMax * (1 - mess / 100) - (practice ? 0 : late * JOB.lateK + sog * JOB.soggyK)))
  let style = ''
  if (c === 'photo' && !angry && mess < 20) { tip = Math.round(tip * 1.6); style = 'bae' }
  if (c === 'coins') { tip = angry ? 1 : Math.max(1, tip - (tip % 10) + 1 + Math.floor(o.v * 9)); style = 'coins' }   // 1円玉で払う（怒っても1枚だけ置いていく）
  if (c === 'duf') { const good = mess < 25 && late === 0 && sog === 0; tip = mess >= JOB.angryMess || late >= JOB.angryLate || soggy >= JOB.angrySoggy ? 22 : good && sog === 0 ? 2222 : 222; style = good ? 'jackpot' : '' }
  if (angry && c !== 'coins') tip = 0
  const reason = how === 'drop' ? 'drop' : !angry ? '' : mess >= angryMess ? 'mess' : late >= angryLate ? 'late' : soggy >= angrySoggy ? 'soggy' : ''
  return { angry, tip, reason, style }
}

function finish(sh, how) {
  const o = curOrder(sh), late = Math.max(0, sh.held - sh.limit)
  const practice = sh.idx === 0   // 1件目は練習: 崩れ・遅れでは怒られない（落とすのだけはだめ）
  const s = settle(o, sh.mess, late, how, practice, sh.soggy || 0)
  const early = how !== 'drop' && !s.angry && o.cust !== 'duf' && sh.limit - sh.held >= JOB.earlySec ? JOB.early : 0   // デュフフの人はきっかり 2,222円
  const r = { idx: sh.idx, dish: o.dish.id, how, mess: Math.round(sh.mess), late: +late.toFixed(1), held: +sh.held.toFixed(1), limit: +sh.limit.toFixed(1), tip: s.tip + early, early, fee: how === 'drop' ? 0 : o.fee, bonus: how === 'drop' || s.angry ? 0 : o.bonus, angry: s.angry, reason: s.reason, style: s.style, practice, soggy: +(sh.soggy || 0).toFixed(1), cust: o.cust, tier: o.tier, dist: Math.round(o.dist) }
  sh.results.push(r)
  sh.events.push({ t: 'deliver', ...r, x: o.x, y: o.y, z: o.z })
  sh.carrying = false; sh.mess = 0; sh.held = 0; sh.thrown = null; sh.idx++; sh.near = false
  sh.last = o; sh.cur = null
  refreshOffers(sh, sh.world)   // 届けたらすぐ次の注文が入る（時間内は無限）
}

// 1ステップ。r は runner、throwNow は「投げる」を押した瞬間
export function stepShift(sh, r, dt, { throwNow = false } = {}) {
  if (sh.over) return
  sh.t += dt
  if (sh.t >= JOB.shiftSec) { sh.over = true; sh.events.push({ t: 'timeUp', carrying: sh.carrying }); return }
  // 店の前の輪で受け取る
  if (!sh.carrying && !sh.thrown && sh.offer && r.y < 3) {
    const P = JOB.pick
    if (Math.hypot(r.x - P.x, r.z - P.z) < P.r) {
      const o = sh.offer
      sh.cur = o; sh.targets.push(o); sh.carrying = true; sh.mess = 0; sh.held = 0; sh.warned = false; sh.near = false; sh.soggy = 0
      sh.limit = o.limit + (sh.idx === 0 ? JOB.firstGrace : 0)
      sh.offer = null
      sh.events.push({ t: 'pickup', idx: sh.idx, tier: o.tier, limit: sh.limit, cust: o.cust })
    }
  }
  const o = curOrder(sh)
  // 運んでいる間: 崩れと時間
  if (sh.carrying) {
    sh.held += dt
    if (!sh.warned && sh.held > sh.limit) { sh.warned = true; sh.events.push({ t: 'late' }) }
    const v3 = Math.hypot(r.vx, r.vy, r.vz)
    let add = 0
    const S0 = sh.src
    if (v3 > JOB.speedFree) { const k = (v3 - JOB.speedFree) * JOB.speedK * dt; add += k; S0.speed += k }
    if (!r.grounded && !sh.pgr) {
      const ax = (r.vx - sh.pvx) / dt, az = (r.vz - sh.pvz) / dt, ah = Math.hypot(ax, az)
      if (ah > JOB.accelFree && ah < 400) { const k = (ah - JOB.accelFree) * JOB.accelK * dt; add += k; S0.accel += k }
    }
    if (r.climbing && Math.hypot(r.vx, r.vy, r.vz) > 2.5) { add += JOB.climbK * dt; S0.climb += JOB.climbK * dt }   // 動いている時だけ
    if (r.grounded) { sh.groundT = (sh.groundT || 0) + dt; const s0 = sh.soggy || 0; sh.soggy = s0 + dt; for (const th of [8, 16]) if (s0 < th && sh.soggy >= th) sh.events.push({ t: 'soggy', level: th }) }
    sh.carryT = (sh.carryT || 0) + dt
    if (r.grounded) { const vg = Math.hypot(r.vx, r.vz); if (vg > JOB.runFree) { const k = (vg - JOB.runFree) * JOB.runK * dt; add += k; S0.run += k } }
    for (const e of r.events) {
      if (e.t === 'land' && e.impact > JOB.landFree) { const k = (e.impact - JOB.landFree) * JOB.landK; add += k; S0.land += k }
      if (e.t === 'bonk') { add += JOB.bonk; S0.bonk += JOB.bonk }
      if (e.t === 'ped') { add += JOB.pedHit; S0.ped = (S0.ped || 0) + JOB.pedHit }
      if (e.t === 'car') { add += JOB.carHit; S0.car = (S0.car || 0) + JOB.carHit }
      if (e.t === 'crow') { add += JOB.crowHit; S0.crow = (S0.crow || 0) + JOB.crowHit }
      if (e.t === 'ball') { add += JOB.ballHit; S0.ball = (S0.ball || 0) + JOB.ballHit }
    }
    if (add > 0) {
      const before = sh.mess
      sh.mess = Math.min(100, sh.mess + add)
      for (const th of [25, 50, 75]) if (before < th && sh.mess >= th) sh.events.push({ t: 'spill', level: th })
    }
    // 手渡し
    const d = Math.hypot(r.x - o.x, r.y + 1.1 - o.y, r.z - o.z)
    if (!sh.near && d < 22) { sh.near = true; sh.events.push({ t: 'approach', cust: o.cust }) }
    if (d < o.handR) {
      if (Math.hypot(r.vx, r.vy, r.vz) <= o.handSpeed) finish(sh, 'hand')
      else if (sh.fast <= 0) { sh.fast = 1.2; sh.events.push({ t: 'tooFast' }) }
    }
    sh.fast -= dt
    // 投げる: 今の速さのまま、少し前と上へ
    if (sh.carrying && throwNow) {
      const fx = Math.sin(r.yaw), fz = Math.cos(r.yaw)
      sh.thrown = { x: r.x, y: r.y + 1.3, z: r.z, vx: r.vx + fx * 5, vy: Math.max(r.vy, 0) + 3.5, vz: r.vz + fz * 5, t: 0 }
      sh.carrying = false
      sh.events.push({ t: 'throw' })
    }
  }
  // 飛んでいる料理
  const th = sh.thrown
  if (th) {
    sh.held += dt; th.t += dt
    const steps = 3
    for (let i = 0; i < steps; i++) {
      const h = dt / steps
      th.vy -= 21 * h
      th.x += th.vx * h; th.y += th.vy * h; th.z += th.vz * h
      if (Math.hypot(th.x - o.x, th.y - o.y, th.z - o.z) < JOB.throwR) {
        const sp = Math.hypot(th.vx, th.vy, th.vz)
        sh.mess = Math.min(100, sh.mess + JOB.throwBase + Math.max(0, sp - 12) * JOB.throwK)
        finish(sh, 'throw')
        return
      }
      if (th.y < 0 || th.t > 6) { sh.events.push({ t: 'drop', x: th.x, z: th.z }); finish(sh, 'drop'); return }
    }
  }
  sh.pvx = r.vx; sh.pvy = r.vy; sh.pvz = r.vz; sh.pgr = r.grounded
}

// 給料明細の中身
export function payData(sh, lang = 'ja') {
  const R = sh.results, ja = lang === 'ja'
  const ok = R.filter(r => r.how !== 'drop')
  const tips = R.reduce((a, r) => a + r.tip, 0), fees = ok.reduce((a, r) => a + r.fee, 0)
  const far = ok.filter(r => r.tier === 'far').length
  const claims = R.filter(r => r.angry && r.how !== 'drop').length, drops = R.filter(r => r.how === 'drop').length
  const pay = ok.length ? [{ label: ja ? '配達手当' : 'Delivery fees', note: ja ? (far ? `${ok.length}件（遠方${far}）` : `${ok.length}件`) : (far ? `${ok.length} (${far} far)` : `${ok.length}`), yen: fees }] : []   // 0件の行は出さない
  const bonus = ok.reduce((a, r) => a + (r.bonus || 0), 0)
  if (bonus) pay.push({ label: ja ? '遠方手当' : 'Distance bonus', note: ja ? `${far}件` : `${far}`, yen: bonus })
  if (tips) pay.push({ label: ja ? 'チップ' : 'Tips', note: ja ? `${R.filter(r => r.tip > 0).length}件` : `${R.filter(r => r.tip > 0).length}`, yen: tips })
  const ded = []
  if (claims) ded.push({ label: ja ? 'クレーム対応' : 'Complaints', note: ja ? `${claims}件` : `${claims}`, yen: claims * JOB.claim })
  if (drops) ded.push({ label: ja ? '落とした料理' : 'Dropped food', note: ja ? `${drops}皿` : `${drops}`, yen: drops * JOB.dropCost })
  const undone = sh.over && (sh.carrying || sh.thrown) ? 1 : 0   // 時間切れの時に持っていた1件（遊んでいる間は数えない）
  if (undone) ded.push({ label: ja ? '待たせたお詫び' : 'Apology', note: ja ? '持ったまま時間切れ' : 'still in hand', yen: JOB.claim })
  return { pay, ded, ok: ok.length, far, claims, drops, undone, tips, fees }
}

// 時間内に稼いだ額（基本給を除く歩合とチップから引かれた分を引いたもの）
export function earned(sh) {
  const p = payData(sh)
  return p.pay.reduce((a, r) => a + r.yen, 0) - p.ded.reduce((a, r) => a + r.yen, 0)
}

export function money(sh) {
  return JOB.wage * JOB.hours + earned(sh)
}
