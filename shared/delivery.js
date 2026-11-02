import { addTown } from './town.js'
// 空中出前の仕事の中身（注文・崩れ・遅れ・受け渡し・投げ入れ・お金）。three.js に依存しない。画面と bot で同じものが動く
// 固定ステップで stepShift を呼ぶ。runner（shared/runner.js）の状態を読むだけで、動きには触らない（投げた料理だけ自分で飛ばす）

export const JOB = {
  shiftSec: 180,          // 1日の長さ（3分）
  orders: 5,
  shop: { x: 30, y: 0, z: 842, r: 7 },   // 店（広場の角の町中華）。ここに来ると次の料理を受け取る
  // 崩れ（0〜100）。運んでいる間だけ増える
  // 2026-11-02 本人「めっちゃ難しい」「地面走ってる方が早く感じる」: 崩れは速さでなく、急な揺さぶり・着地・壁ぶつけが中心。スイングは罰になりすぎないように
  speedFree: 30,          // これより速く飛ぶと、風でスープが波打つ（m/s）。18→30（スイングの普通の速さでは崩れない）
  speedK: 0.25,           // その分 1m/s ごとに毎秒これだけ崩れる
  accelFree: 22,          // 空中で横に振られる加速がこれを超えると崩れる（m/s²）
  accelK: 0.04,
  landFree: 13,           // 着地の衝撃（落ちる速さ）がこれを超えると
  landK: 1.1,
  bonk: 10,               // 壁にぶつかった
  pedHit: 7, carHit: 10,  // 通行人・車にぶつかった（よろける。壁より軽め）
  climbK: 0.4,            // 壁を這っている間（毎秒）。横移動でも罰になりすぎないよう 1.2→0.8→0.4
  runFree: 6, runK: 0.45,  // 地面を走ると岡持ちが揺れる。6m/s を超えた分 ×これ（毎秒）
  // 受け渡し
  handR: 5,               // 届け先にこの距離まで寄れば手渡し（3.6→5）
  handSpeed: 16,          // 手渡しできる速さの上限（12→16。速いと「止まって！」）
  throwR: 2.6,            // 投げた料理がこの距離を通れば入る
  throwBase: 18,          // 投げ入れると必ずこれだけ崩れる
  throwK: 1.6,            // 当たった時の速さ 12m/s を超えた分 ×これ
  // 時間（受け取った瞬間から数える）
  limitBase: 10, limitPerM: 0.1,   // 6+0.075m → 10+0.1m
  firstGrace: 10,         // 1件目は操作に慣れる分だけ長め。さらに1件目は崩れても遅れても怒られない（練習）
  // お金
  wage: 1100, hours: 3,   // 基本給（昼の3時間の体験という設定）
  fee: 500,               // 1件届けるごとの配達手当
  tipMax: 500,            // 崩れ0・間に合えば満額
  lateK: 30,              // 遅れ1秒ごとにチップから引く
  earlySec: 4, early: 150,
  angryMess: 80, angryLate: 15, claim: 300,
  dropCost: 800           // 投げて落とした料理代
}

export const DISHES = [
  { id: 'ramen', ja: '醤油ラーメン', en: 'Shoyu ramen', soup: true },
  { id: 'tantan', ja: '担々麺', en: 'Tantanmen', soup: true },
  { id: 'chahan', ja: '炒飯', en: 'Fried rice', soup: false },
  { id: 'tenshin', ja: '天津飯', en: 'Tenshin-han', soup: false },
  { id: 'gyoza', ja: '餃子2人前', en: 'Gyoza x2', soup: false }
]

const PLACES = [
  ['事務所', 'office'], ['美容室', 'salon'], ['法律事務所', 'law firm'], ['歯医者', 'dentist'], ['ネイルサロン', 'nail salon'],
  ['設計事務所', 'design studio'], ['塾', 'cram school'], ['探偵事務所', 'detective agency'], ['会議室', 'meeting room'], ['ヨガ教室', 'yoga studio']
]

export function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

// 届け先の候補: 店から 90〜300m の建物の、道に面した窓（高さ 9〜34m）
export function makeTargets(world, seed = 1, n = JOB.orders) {
  const rnd = mulberry(seed), S = JOB.shop
  const town = addTown(world, S)
  const blds = world.colliders.filter(o => o.kind === 'building' && o.y1 > 14)
  const out = []
  let guard = 0
  while (out.length < n && guard++ < 500) {
    const o = blds[Math.floor(rnd() * blds.length)]
    const side = Math.floor(rnd() * 4)
    const nx = [1, -1, 0, 0][side], nz = [0, 0, 1, -1][side]
    const along = (rnd() * 2 - 1) * 0.7
    const x = o.cx + (nx ? nx * (o.hw + 0.7) : along * o.hw), z = o.cz + (nz ? nz * (o.hl + 0.7) : along * o.hl)
    const d = Math.hypot(x - S.x, z - S.z)
    if (d < 70 || d > 210) continue
    // 窓の前に別の建物が無いこと（道に面している）
    if (world.colliders.some(b => b !== o && b.kind === 'building' && Math.abs(x + nx * 12 - b.cx) < b.hw + 1 && Math.abs(z + nz * 12 - b.cz) < b.hl + 1)) continue
    // 窓の前は広い道（路地ではない）。前 7m と 12m が道の上
    if (world.surfaceAt(x + nx * 7, z + nz * 7) !== 'road' || world.surfaceAt(x + nx * 12, z + nz * 12) !== 'road') continue
    if (out.some(t => Math.hypot(t.x - x, t.z - z) < 70)) continue
    const floor = 3 + Math.floor(rnd() * Math.min(8, (o.y1 - 6) / 3.3 - 2))
    const y = floor * 3.3 + 0.8
    const p = PLACES[Math.floor(rnd() * PLACES.length)]
    out.push({ x, y, z, nx, nz, floor: floor + 1, place: p, dish: DISHES[out.length % DISHES.length], dist: d, bld: o })
  }
  // 1件は一軒家の2階の窓（2026-11-02 本人「一軒家もいくつか」）。低いので電柱とワイヤーで寄る
  if (town.houses.length && out.length >= 3) {
    const h = town.houses[Math.floor(rnd() * town.houses.length)]
    const x = h.cx + (rnd() * 2 - 1) * (h.hw - 1.5), z = h.cz + h.face * (h.hl + 0.7)
    out[out.length - 2] = { x, y: h.y0 + 4.3, z, nx: 0, nz: h.face, floor: 2, place: ['お宅', 'house'], house: true, dish: DISHES[0], dist: Math.hypot(x - S.x, z - S.z), bld: h }
  }
  // 近い順に並べる（1件目で操作に慣れてから遠くへ）
  out.sort((a, b) => a.dist - b.dist)
  out.forEach((t, i) => { t.dish = DISHES[i % DISHES.length] })
  return out
}

export function createShift(world, seed = 1) {
  return {
    t: 0, over: false, targets: makeTargets(world, seed), idx: 0,
    carrying: false, mess: 0, limit: 0, held: 0, pvx: 0, pvy: 0, pvz: 0, pgr: true,
    thrown: null, results: [], events: [], warned: false, fast: 0, src: { speed: 0, accel: 0, land: 0, bonk: 0, climb: 0, run: 0 }
  }
}

export const curOrder = sh => sh.targets[sh.idx] || null

function finish(sh, how) {
  const o = curOrder(sh), late = Math.max(0, sh.held - sh.limit)
  const practice = sh.idx === 0   // 1件目は練習: 崩れ・遅れでは怒られない（落とすのだけはだめ）
  const angry = how === 'drop' || (!practice && (sh.mess >= JOB.angryMess || late >= JOB.angryLate))
  let tip = how === 'drop' ? 0 : Math.max(0, Math.round(JOB.tipMax * (1 - sh.mess / 100) - (practice ? 0 : late * JOB.lateK)))
  if (angry) tip = 0
  const early = how !== 'drop' && sh.limit - sh.held >= JOB.earlySec ? JOB.early : 0
  const r = { idx: sh.idx, dish: o.dish.id, how, mess: Math.round(sh.mess), late: +late.toFixed(1), held: +sh.held.toFixed(1), limit: +sh.limit.toFixed(1), tip: tip + (angry ? 0 : early), fee: how === 'drop' ? 0 : JOB.fee, angry, reason: how === 'drop' ? 'drop' : !angry ? '' : sh.mess >= JOB.angryMess ? 'mess' : late >= JOB.angryLate ? 'late' : '', practice }
  sh.results.push(r)
  sh.events.push({ t: 'deliver', ...r, x: o.x, y: o.y, z: o.z })
  sh.carrying = false; sh.mess = 0; sh.held = 0; sh.thrown = null; sh.idx++
  if (sh.idx >= sh.targets.length) { sh.over = true; sh.events.push({ t: 'allDone' }) }
}

// 1ステップ。r は runner、throwNow は「投げる」を押した瞬間
export function stepShift(sh, r, dt, { throwNow = false } = {}) {
  if (sh.over) return
  sh.t += dt
  if (sh.t >= JOB.shiftSec) { sh.over = true; sh.events.push({ t: 'timeUp' }); return }
  const o = curOrder(sh)
  // 店で受け取る
  if (!sh.carrying && !sh.thrown && o) {
    const S = JOB.shop
    if (Math.hypot(r.x - S.x, r.z - S.z) < S.r && r.y < 3) {
      sh.carrying = true; sh.mess = 0; sh.held = 0
      sh.limit = JOB.limitBase + o.dist * JOB.limitPerM + (sh.idx === 0 ? JOB.firstGrace : 0)
      sh.events.push({ t: 'pickup', idx: sh.idx, limit: sh.limit })
    }
  }
  // 運んでいる間: 崩れと時間
  if (sh.carrying) {
    sh.held += dt
    if (!sh.warned && sh.held > sh.limit) { sh.warned = true; sh.events.push({ t: 'late' }) }
    const v3 = Math.hypot(r.vx, r.vy, r.vz)
    let add = 0
    const S0 = sh.src, a0 = add
    if (v3 > JOB.speedFree) { const k = (v3 - JOB.speedFree) * JOB.speedK * dt; add += k; S0.speed += k }
    if (!r.grounded && !sh.pgr) {
      const ax = (r.vx - sh.pvx) / dt, az = (r.vz - sh.pvz) / dt, ah = Math.hypot(ax, az)
      if (ah > JOB.accelFree && ah < 400) { const k = (ah - JOB.accelFree) * JOB.accelK * dt; add += k; S0.accel += k }
    }
    if (r.climbing && Math.hypot(r.vx, r.vy, r.vz) > 2.5) { add += JOB.climbK * dt; S0.climb += JOB.climbK * dt }   // 動いている時だけ（張り付いて止まっている間は崩れない）
    if (r.grounded) { const vg = Math.hypot(r.vx, r.vz); if (vg > JOB.runFree) { const k = (vg - JOB.runFree) * JOB.runK * dt; add += k; S0.run += k } }
    for (const e of r.events) {
      if (e.t === 'land' && e.impact > JOB.landFree) { const k = (e.impact - JOB.landFree) * JOB.landK; add += k; S0.land += k }
      if (e.t === 'bonk') { add += JOB.bonk; S0.bonk += JOB.bonk }
      if (e.t === 'ped') { add += JOB.pedHit; S0.ped = (S0.ped || 0) + JOB.pedHit }
      if (e.t === 'car') { add += JOB.carHit; S0.car = (S0.car || 0) + JOB.carHit }
    }
    if (add > 0) {
      const before = sh.mess
      sh.mess = Math.min(100, sh.mess + add)
      for (const th of [25, 50, 75]) if (before < th && sh.mess >= th) sh.events.push({ t: 'spill', level: th })
    }
    // 手渡し
    const d = Math.hypot(r.x - o.x, r.y + 1.1 - o.y, r.z - o.z)
    if (d < JOB.handR) {
      if (Math.hypot(r.vx, r.vy, r.vz) <= JOB.handSpeed) finish(sh, 'hand')
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
  const tips = R.reduce((a, r) => a + r.tip, 0)
  const claims = R.filter(r => r.angry && r.how !== 'drop').length, drops = R.filter(r => r.how === 'drop').length
  const pay = ok.length ? [{ label: ja ? '配達手当' : 'Delivery fee', note: ja ? `${ok.length}件` : `${ok.length}`, yen: ok.length * JOB.fee }] : []   // 0件の行は出さない
  if (tips) pay.push({ label: ja ? 'チップ' : 'Tips', note: ja ? `${R.filter(r => r.tip > 0).length}件` : `${R.filter(r => r.tip > 0).length}`, yen: tips })
  const ded = []
  if (claims) ded.push({ label: ja ? 'クレーム対応' : 'Complaints', note: ja ? `${claims}件` : `${claims}`, yen: claims * JOB.claim })
  if (drops) ded.push({ label: ja ? '落とした料理' : 'Dropped food', note: ja ? `${drops}皿` : `${drops}`, yen: drops * JOB.dropCost })
  const undone = JOB.orders - R.length
  if (undone) ded.push({ label: ja ? '待たせたお詫び' : 'Apologies', note: ja ? `${undone}件 届かず` : `${undone} never arrived`, yen: undone * JOB.claim })
  return { pay, ded, ok: ok.length, claims, drops, undone, tips }
}

export function money(sh) {
  const p = payData(sh)
  return JOB.wage * JOB.hours + p.pay.reduce((a, r) => a + r.yen, 0) - p.ded.reduce((a, r) => a + r.yen, 0)
}
