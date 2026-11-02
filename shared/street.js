// 通りの賑わい: 電柱と街灯（ワイヤーを掛けられる）・一般車・通行人。three.js に依存しない（画面と bot で同じものが動く）
// 2026-11-02 本人「ワイヤーをもっと使わせたいから、なるべく地面にいたらダメみたいに。車と通行人を。ぶつかったらちょっとこぼれる。
//   電柱とか、ワイヤーを引っ掛けられる場所を増やして」
import { createTraffic, setTrafficSpeed } from './traffic.js?v=10'

export const STREET = {
  poleGap: 26,          // 電柱・街灯の間隔（m）
  poleH: 10.5, lampH: 8,
  area: 330,            // 店からこの範囲だけに立てる（遠くは要らない）
  peds: 60, pedRange: 150, pedWalk: 1.3,   // 36 から 60 に（2026-11-03 本人「交通量をもっと」）
  carGap: 210,          // 車線 210m に1台（WIRE ESCAPE は 340m。同上）
  pedR: 0.9,            // 通行人に当たる距離
  carHalfW: 1.2, carHalfL: 2.6,
  hitCd: 1.2,           // 続けて当たらない間
  trafficSpeed: 0.55
}

function mul(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

function insideBuilding(world, x, z, pad) {
  for (const o of world.nearby(x, z)) {
    if (o.slab || o.y1 == null || o.kind !== 'building') continue
    const c = Math.cos(o.yaw || 0), s = Math.sin(o.yaw || 0), dx = x - o.cx, dz = z - o.cz
    if (Math.abs(dx * c - dz * s) < o.hw + pad && Math.abs(dx * s + dz * c) < o.hl + pad) return true
  }
  return false
}

// 電柱と街灯の位置を決めて world.poles に入れる（runner.js の findAnchor / rayHit が掛け点として使う）
export function buildPoles(world, center) {
  if (world.poles) return world.poles
  const poles = [], G = world.cityGrid
  const lines = [...G.XS.map(x => ({ x })), ...G.ZS.map(z => ({ z }))]
  for (const sg of world.segs) {
    if (sg.surf !== 'road' || sg.hw < 6) continue
    const dx = sg.bx - sg.ax, dz = sg.bz - sg.az, L = Math.hypot(dx, dz)
    if (L < 30) continue
    const ux = dx / L, uz = dz / L, nx = -uz, nz = ux
    let k = 0
    for (let u = 10; u < L - 10; u += STREET.poleGap) {
      for (const side of [-1, 1]) {
        const off = sg.hw + 1.1
        const x = sg.ax + ux * u + nx * off * side, z = sg.az + uz * u + nz * off * side
        if (Math.abs(x - center.x) > STREET.area || Math.abs(z - center.z) > STREET.area) continue
        // 交差点の中には立てない
        if (lines.some(l => (l.x != null && Math.abs(l.x - x) < 14 && Math.abs(ux) > 0.5) || (l.z != null && Math.abs(l.z - z) < 14 && Math.abs(uz) > 0.5))) continue
        if (insideBuilding(world, x, z, 0.6)) continue
        const g = world.groundAt(x, z, 3).h
        if (g < -0.5 || g > 1.5) continue
        const kind = (k + (side > 0 ? 1 : 0)) % 2 ? 'lamp' : 'pole'
        poles.push({ x, z, y0: g, y1: g + (kind === 'pole' ? STREET.poleH : STREET.lampH), kind, nx: -nx * side, nz: -nz * side })
      }
      k++
    }
  }
  // 元からある街灯・信号・木（world.objects）も掛け点にする（見た目は scene.js が描いているので prop: true で区別）
  for (const o of world.objects) {
    if (!['lamp', 'signal', 'tree'].includes(o.type)) continue
    if (Math.abs(o.cx - center.x) > STREET.area + 60 || Math.abs(o.cz - center.z) > STREET.area + 60) continue
    poles.push({ x: o.cx, z: o.cz, y0: o.y0, y1: o.y0 + (o.type === 'tree' ? 9 : o.def.h), kind: o.type, prop: true })
  }
  world.poles = poles
  return poles
}

export function createStreet(world, seed = 1, center = { x: 30, z: 842 }) {
  buildPoles(world, center)
  setTrafficSpeed(STREET.trafficSpeed)
  const traffic = createTraffic(world, STREET.carGap)
  const rnd = mul(seed * 7 + 3)
  // 歩道の線（道の両側、道幅の半分 + 2.2m）
  const walks = []
  for (const sg of world.segs) {
    if (sg.surf !== 'road' || sg.hw < 6) continue
    const dx = sg.bx - sg.ax, dz = sg.bz - sg.az, L = Math.hypot(dx, dz)
    if (L < 20) continue
    const ux = dx / L, uz = dz / L, nx = -uz, nz = ux
    for (const s of [-1, 1]) walks.push({ ax: sg.ax + nx * (sg.hw + 2.6) * s, az: sg.az + nz * (sg.hw + 2.6) * s, ux, uz, L })
  }
  const peds = []
  for (let i = 0; i < STREET.peds; i++) peds.push({ id: i, x: 1e6, y: 0, z: 1e6, yaw: 0, w: null, u: 0, dir: 1, look: i % 6, speed: STREET.pedWalk * (0.8 + rnd() * 0.5), bumped: 0 })
  const place = (p, r) => {
    for (let k = 0; k < 16; k++) {
      const w = walks[Math.floor(rnd() * walks.length)], u = rnd() * w.L
      const x = w.ax + w.ux * u, z = w.az + w.uz * u, d = Math.hypot(x - r.x, z - r.z)
      if (d > STREET.pedRange || d < 25) continue
      if (insideBuilding(world, x, z, 0.4)) continue
      p.w = w; p.u = u; p.dir = rnd() < 0.5 ? 1 : -1; p.x = x; p.z = z; p.y = world.groundAt(x, z, 2).h
      return
    }
  }
  const S = { traffic, peds, walks, t: 0, cd: 0 }
  S.update = (dt, r) => {
    S.t += dt; S.cd -= dt
    traffic.update(S.t, dt, [[r.x, r.z]])
    for (const p of peds) {
      if (!p.w || Math.hypot(p.x - r.x, p.z - r.z) > STREET.pedRange + 10) { place(p, r); continue }
      if (p.bumped > 0) { p.bumped -= dt; continue }
      p.u += p.dir * p.speed * dt
      if (p.u < 0 || p.u > p.w.L) { p.dir *= -1; p.u = Math.max(0, Math.min(p.w.L, p.u)) }
      const nx = p.w.ax + p.w.ux * p.u, nz = p.w.az + p.w.uz * p.u
      if (insideBuilding(world, nx, nz, 0.3)) { p.dir *= -1; continue }
      p.x = nx; p.z = nz; p.yaw = Math.atan2(p.w.ux * p.dir, p.w.uz * p.dir)
    }
  }
  // 地面の近くで人や車に当たったら、よろけて押し返される。r.events に {t:'ped'|'car'} を足す（delivery.js が崩れにする）
  S.collide = (r) => {
    if (S.cd > 0 || r.y > 2.2 || r.climbing || r.rope) return null
    for (const p of peds) {
      if (!p.w || p.bumped > 0) continue
      const dx = r.x - p.x, dz = r.z - p.z, d = Math.hypot(dx, dz)
      if (d < STREET.pedR && Math.abs(r.y - p.y) < 1.5) {
        const v = Math.hypot(r.vx, r.vz)
        r.vx = dx / (d || 1) * 4; r.vz = dz / (d || 1) * 4; r.stun = Math.max(r.stun || 0, 0.45)
        p.bumped = 1.5; S.cd = STREET.hitCd
        r.events.push({ t: 'ped', speed: v, id: p.id, x: p.x, z: p.z })
        return 'ped'
      }
    }
    for (const c of traffic.cars) {
      const dx = r.x - c.x, dz = r.z - c.z
      if (dx * dx + dz * dz > 16) continue
      const cs = Math.sin(c.yaw), cc = Math.cos(c.yaw), along = dx * cs + dz * cc, side = dx * cc - dz * cs
      if (Math.abs(along) < STREET.carHalfL && Math.abs(side) < STREET.carHalfW + 0.4 && r.y < c.y + 1.4) {
        const sgn = side >= 0 ? 1 : -1
        r.vx = c.vx + cc * sgn * 7; r.vz = c.vz - cs * sgn * 7; r.vy = 6; r.grounded = false; r.stun = Math.max(r.stun || 0, 0.7)
        S.cd = STREET.hitCd
        r.events.push({ t: 'car', speed: Math.hypot(c.vx, c.vz), id: c.id, x: c.x, z: c.z })
        return 'car'
      }
    }
    return null
  }
  return S
}
