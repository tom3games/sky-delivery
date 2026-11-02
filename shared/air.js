// 空の邪魔: カラス（群れで横切る・電柱の上で休んでいて近づくと飛び立つ）と、河川敷や空き地から飛んでくる野球ボール。
// 2026-11-03 本人「空中の邪魔を足して。カラスが飛んでいてぶつかる。野球ボールが飛んでくる。避けられるように予告を」
// three.js に依存しない（画面と bot で同じものが動く）。当たると r.events に {t:'crow'|'ball'} を足し、delivery.js が崩れにする。
// 動きは自分の乱数だけで決まる（Math.random を使わない）。固定ステップで stepAir を呼ぶ。

export const AIR = {
  minY: 6,               // これより低い所（地面・低い壁）では群れもボールも来ない
  crowR: 1.35,           // カラスと胸（足 + 1.1m）がこれより近いと当たる
  crowKick: 5,           // 当たった時にはじかれる速さ（m/s）
  crowSlow: 0.85,        // 当たった時に今の速さに掛ける
  flockEvery: [10, 16],  // 群れが来る間隔（秒）
  flockN: [4, 6],        // 群れの数
  flockSpeed: 13,        // 群れの速さ（m/s）
  flockLead: 2.6,        // 何秒後の自分の位置を横切るか（見えてから避けるまでの間）
  perchN: 10,            // 電柱の上で休んでいるカラスの数（自分の周りに置き直す）
  perchRange: [25, 110], // 休ませる電柱の距離
  perchScare: 11,        // これより近づくと飛び立つ
  ballEvery: [16, 25],   // ボールが来る間隔（秒）。空中にいる時だけ
  ballT: 2.5,            // 打ってから届くまで（秒）。この間「危ない！」と落下点の印が出る
  ballG: 14,             // ボールの重力（見やすい山なりにする）
  ballR: 1.1,           // 当たり
  ballKick: 6,
  hitCd: 1.4             // 続けて当たらない間
}

function mul(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const range = (rnd, [a, b]) => a + (b - a) * rnd()

export function createAir(world, seed = 1) {
  const rnd = mul(seed * 31 + 17)
  const A = { world, rnd, t: 0, crows: [], balls: [], cd: 0, nextFlock: range(rnd, AIR.flockEvery) * 0.6, nextBall: range(rnd, AIR.ballEvery), events: [], idN: 0, hits: { crow: 0, ball: 0 }, g: AIR.ballG }
  return A
}

function newCrow(A, x, y, z, mode) {
  return { id: A.idN++, x, y, z, vx: 0, vy: 0, vz: 0, yaw: 0, mode, t: 0, flap: A.rnd() * 6, pole: null }
}

// 自分の周りの電柱の上にカラスを休ませる（遠くへ行ったものは消して置き直す）
function keepPerched(A, r) {
  const P = (A.world.poles || []).filter(p => p.kind === 'pole')
  if (!P.length) return
  const used = new Set(A.crows.filter(c => c.pole).map(c => c.pole))
  let perched = A.crows.filter(c => c.mode === 'perch')
  for (const c of perched) if (Math.hypot(c.x - r.x, c.z - r.z) > AIR.perchRange[1] + 40) c.dead = true
  perched = perched.filter(c => !c.dead)
  for (let k = 0; perched.length < AIR.perchN && k < 200; k++) {
    const p = P[Math.floor(A.rnd() * P.length)], d = Math.hypot(p.x - r.x, p.z - r.z)
    if (used.has(p) || d < AIR.perchRange[0] || d > AIR.perchRange[1]) continue
    const c = newCrow(A, p.x + (A.rnd() - 0.5) * 0.4, p.y1 + 0.15, p.z + (A.rnd() - 0.5) * 0.4, 'perch')
    c.pole = p; c.yaw = A.rnd() * Math.PI * 2; used.add(p)
    A.crows.push(c); perched.push(c)
  }
}

// 何秒か後に自分がいそうな所を、横から群れが横切る
function spawnFlock(A, r) {
  const T = AIR.flockLead, sp = Math.hypot(r.vx, r.vz)
  const px = r.x + r.vx * T, pz = r.z + r.vz * T, py = Math.max(AIR.minY + 2, r.y + 1.1 + Math.max(-4, Math.min(4, r.vy * T * 0.5)))
  // 進む向きに直角（遅い時は向いている方に直角）
  let fx = sp > 3 ? r.vx / sp : Math.sin(r.yaw), fz = sp > 3 ? r.vz / sp : Math.cos(r.yaw)
  const side = A.rnd() < 0.5 ? 1 : -1, dx = -fz * side, dz = fx * side
  const n = Math.round(range(A.rnd, AIR.flockN)), V = AIR.flockSpeed
  const lead = V * T
  for (let i = 0; i < n; i++) {
    const back = i * 1.6 + A.rnd() * 1.2, lat = (A.rnd() - 0.5) * 5, up = (A.rnd() - 0.5) * 2.6
    const c = newCrow(A, px - dx * (lead + back) + fx * lat, py + up, pz - dz * (lead + back) + fz * lat, 'fly')
    c.vx = dx * V; c.vz = dz * V; c.vy = 0; c.yaw = Math.atan2(dx, dz)
    A.crows.push(c)
  }
  A.events.push({ t: 'flock', x: px, y: py, z: pz, n })
}

// 地面から打ったボールが、T 秒後の自分の位置へ山なりで飛んでくる
function spawnBall(A, r) {
  const T = AIR.ballT, g = AIR.ballG
  const P = { x: r.x + r.vx * T, y: Math.max(AIR.minY, r.y + 1.1), z: r.z + r.vz * T }
  // 打った所: 進む向きの横〜斜め前、45〜60m 先の地面
  const sp = Math.hypot(r.vx, r.vz), fx = sp > 3 ? r.vx / sp : Math.sin(r.yaw), fz = sp > 3 ? r.vz / sp : Math.cos(r.yaw)
  const a = (A.rnd() < 0.5 ? 1 : -1) * (0.9 + A.rnd() * 0.9), D = 45 + A.rnd() * 15
  const ca = Math.cos(a), sa = Math.sin(a), ux = fx * ca - fz * sa, uz = fx * sa + fz * ca
  const S = { x: P.x + ux * D, y: 1, z: P.z + uz * D }
  const b = { id: A.idN++, x: S.x, y: S.y, z: S.z, vx: (P.x - S.x) / T, vy: (P.y - S.y) / T + 0.5 * g * T, vz: (P.z - S.z) / T, t: 0, T, tx: P.x, ty: P.y, tz: P.z, sx: S.x, sz: S.z, from: A.world.nav && A.world.nav.canal && Math.abs(S.z - (A.world.nav.canal.z0 + A.world.nav.canal.z1) / 2) < 120 ? 'river' : 'lot' }
  A.balls.push(b)
  A.events.push({ t: 'ballWarn', id: b.id, x: P.x, y: P.y, z: P.z, sx: S.x, sz: S.z, from: b.from })
}

function hit(A, r, kind, ox, oy, oz) {
  const cx = r.x, cy = r.y + 1.1, cz = r.z
  let nx = cx - ox, ny = cy - oy, nz = cz - oz; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L
  const k = kind === 'crow' ? AIR.crowKick : AIR.ballKick, s = kind === 'crow' ? AIR.crowSlow : 0.8
  r.vx = r.vx * s + nx * k; r.vy = r.vy * s + Math.max(0, ny) * k * 0.5; r.vz = r.vz * s + nz * k
  A.cd = AIR.hitCd; A.hits[kind]++
  const e = { t: kind, x: ox, y: oy, z: oz }
  r.events.push(e); A.events.push(e)
  return e
}

// active: 遊んでいる間だけ群れとボールを出す（タイトルのデモでは休んでいるカラスだけ）
export function stepAir(A, r, dt, active = true) {
  A.t += dt; A.cd -= dt
  const high = !r.grounded && r.y > AIR.minY
  A.perchT = (A.perchT || 0) - dt
  if (A.perchT <= 0) { A.perchT = 0.5; keepPerched(A, r) }
  if (active) {
    A.nextFlock -= dt; A.nextBall -= dt
    if (A.nextFlock <= 0 && high && Math.hypot(r.vx, r.vz) > 5) { spawnFlock(A, r); A.nextFlock = range(A.rnd, AIR.flockEvery) }
    if (A.nextBall <= 0 && high && !A.balls.length) { spawnBall(A, r); A.nextBall = range(A.rnd, AIR.ballEvery) }
  }
  const cx = r.x, cy = r.y + 1.1, cz = r.z
  for (const c of A.crows) {
    c.t += dt; c.flap += dt * (c.mode === 'perch' ? 0 : c.mode === 'fly' ? 9 : 16)
    if (c.mode === 'perch') {
      if (Math.hypot(c.x - cx, c.y - cy, c.z - cz) < AIR.perchScare) {
        // 近づいたら飛び立つ（自分から離れる向きへ、上へ）
        const dx = c.x - r.x, dz = c.z - r.z, d = Math.hypot(dx, dz) || 1
        c.mode = 'takeoff'; c.t = 0; c.vx = dx / d * 7; c.vz = dz / d * 7; c.vy = 5.5; c.yaw = Math.atan2(c.vx, c.vz); c.pole = null
        A.events.push({ t: 'scare', x: c.x, y: c.y, z: c.z })
      }
    } else {
      if (c.mode === 'takeoff') { c.vy = Math.max(1.5, c.vy - 3 * dt); if (c.t > 7) c.dead = true }
      else if (c.mode === 'fly') { c.vy = Math.sin(c.t * 2 + c.id) * 0.4; if (c.t > 9) c.dead = true }
      else if (c.mode === 'scatter') { c.vy -= 6 * dt; if (c.t > 0.8) { c.mode = 'takeoff'; c.t = 0; c.vy = 4 } }
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt
      if (c.y < 1) { c.y = 1; c.vy = Math.abs(c.vy) }
    }
    if (active && A.cd <= 0 && c.mode !== 'scatter' && Math.hypot(c.x - cx, c.y - cy, c.z - cz) < AIR.crowR) {
      hit(A, r, 'crow', c.x, c.y, c.z)
      // はじかれたカラスはくるっと飛ばされてから逃げる
      const dx = c.x - cx, dz = c.z - cz, d = Math.hypot(dx, dz) || 1
      c.mode = 'scatter'; c.t = 0; c.vx = dx / d * 6 + r.vx * 0.3; c.vz = dz / d * 6 + r.vz * 0.3; c.vy = 3; c.pole = null
    }
  }
  A.crows = A.crows.filter(c => !c.dead)
  for (const b of A.balls) {
    const steps = 3, h = dt / steps
    for (let i = 0; i < steps && !b.dead; i++) {
      b.vy -= AIR.ballG * h; b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h; b.t += h
      if (active && A.cd <= 0 && Math.hypot(b.x - cx, b.y - cy, b.z - cz) < AIR.ballR) { hit(A, r, 'ball', b.x, b.y, b.z).id = b.id; b.dead = true; b.hitMe = true }
    }
    if (b.y < -1 || b.t > b.T + 2.5) b.dead = true
    if (b.dead && !b.hitMe) A.events.push({ t: 'ballGone', id: b.id })
  }
  A.balls = A.balls.filter(b => !b.dead)
}
