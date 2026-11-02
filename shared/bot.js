// CPU の出前バイト（釣り合いの検証とタイトルのデモ用）。3つの性格
//   careful: ワイヤーを使わず、道を走って壁を登って手渡し（丁寧だが遅い）
//   rush:    ずっとワイヤーで全速力、近づいたら投げ入れる（速いが崩れる）
//   skilled: ワイヤーで近くまで行き、最後は着地して壁を登って手渡し
//   clumsy:  下手な人。skilled と同じ考えだが、反応が0.35秒遅れ、向きがぶれ、ワイヤーを掛け損ねる（3回に1回）
import { JOB, curOrder } from './delivery.js?v=10'
import { findAnchor } from './runner.js?v=10'

const K = 130 / 80
const XS = [-320, -240, -160, -80, 0, 80, 160, 240, 320].map(x => x * K)
const ZS = [40, 120, 200, 280, 360, 440, 520, 600, 680, 760, 840].map(z => 40 + (z - 40) * K)
const near = (arr, v) => arr.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a)
const ang = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a }

// 道に沿った経路: いちばん近い交差点 → 目的地の前の道へ曲がる → 目的地の前。通り過ぎた交差点は捨てる
// 地上で a→b をまっすぐ走って建物に当たらないか
function clearLine(world, ax, az, bx, bz) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 4)
  for (let i = 1; i < n; i++) {
    const px = ax + (bx - ax) * i / n, pz = az + (bz - az) * i / n
    for (const o of world.nearby(px, pz)) {
      if (o.kind !== 'building' || o.y0 > 1 || o.y1 < 2) continue
      if (Math.abs(px - o.cx) < o.hw + 0.5 && Math.abs(pz - o.cz) < o.hl + 0.5) return false
    }
  }
  return true
}

function gridPath(ax, az, F) {
  const ix = near(XS, ax), iz = near(ZS, az), gx = near(XS, F.x), gz = near(ZS, F.z)
  const onXroad = Math.abs(F.x - gx) < 14
  return [{ x: ix, z: iz }, onXroad ? { x: gx, z: iz } : { x: ix, z: gz }, onXroad ? { x: gx, z: F.z } : { x: F.x, z: gz }, F]   // 最後は目的地のいちばん近くの道に出てから
}

function route(r, goal, world) {
  const F = { x: goal.fx, z: goal.fz }
  let pts
  // 運河をまたぐ時は橋を渡る（橋の無い通りは運河で切れている）
  const C = world && world.nav && world.nav.canal, BR = world && world.nav && world.nav.bridges
  const mid = C && (C.z0 + C.z1) / 2, inBand = C && r.z > C.z0 - 12 && r.z < C.z1 + 12
  const nb = BR && BR.reduce((a, x) => Math.abs(r.x - x) < Math.abs(r.x - a) ? x : a)
  if (inBand && BR && Math.abs(r.x - nb) < 12 && !(F.z > C.z0 - 12 && F.z < C.z1 + 12)) {
    const side = F.z < mid ? C.z0 - 12 : C.z1 + 12   // 橋の上: 目的地の側へ渡りきる
    pts = [{ x: nb, z: side }, ...gridPath(nb, side, F).slice(1)]
  } else if (C && BR && (r.z < mid) !== (F.z < mid)) {
    const bx = BR.reduce((a, x) => Math.abs(r.x - x) + Math.abs(x - F.x) < Math.abs(r.x - a) + Math.abs(a - F.x) ? x : a)
    const sideA = r.z < mid ? C.z0 - 12 : C.z1 + 12, sideB = r.z < mid ? C.z1 + 12 : C.z0 - 12
    pts = [{ x: near(XS, r.x), z: near(ZS, r.z) }, { x: bx, z: near(ZS, r.z) }, { x: bx, z: sideA }, { x: bx, z: sideB }, ...gridPath(bx, sideB, F).slice(1)]
  } else pts = gridPath(r.x, r.z, F)
  pts = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 1)
  while (pts.length > 1) {
    const p0 = pts[0], p1 = pts[1]
    if (Math.hypot(p0.x - r.x, p0.z - r.z) < 9 || (Math.hypot(p1.x - r.x, p1.z - r.z) < Math.hypot(p1.x - p0.x, p1.z - p0.z) + 2 && (!world || clearLine(world, r.x, r.z, p1.x, p1.z)))) pts.shift(); else break
  }
  return pts
}

export function createBot(kind, seed = 1) { let q = seed * 9301 + 49297; return { rnd: () => ((q = (q * 9301 + 49297) % 233280) / 233280), lag: [], kind, plan: null, idx: 0, replan: 0, wT: 0, prevW: false, prevT: false, stuck: 0, lx: 0, lz: 0 } }


export function botInput(b, r, sh, world, dt) {
  const o = curOrder(sh)
  const inp = { throttle: 0, steer: 0 }
  if (sh.over || (!o && !sh.offer)) return inp
  const toShop = !sh.carrying && !sh.thrown
  const PK = toShop ? JOB.pick : null
  const goal = toShop ? { fx: PK.x - 4, fz: PK.z, x: PK.x, z: PK.z, y: 0 } : { fx: o.x + o.nx * 7, fz: o.z + o.nz * 7, x: o.x, z: o.z, y: o.y }
  b.replan -= dt
  if (!b.plan || b.goalKey !== goal.fx + ',' + goal.fz || b.replan <= 0) {
    b.plan = route(r, goal, world); b.idx = 0; b.replan = 1.5; b.goalKey = goal.fx + ',' + goal.fz
  }
  while (b.idx < b.plan.length - 1 && Math.hypot(b.plan[b.idx].x - r.x, b.plan[b.idx].z - r.z) < 9) b.idx++
  const final = b.idx >= b.plan.length - 1 && Math.hypot(goal.fx - r.x, goal.fz - r.z) < 9
  let p = b.plan[b.idx]
  // 最後: 窓の真下の壁へ向かって走る（壁を登る）
  if (final && !toShop) p = { x: o.x - o.nx * 2, z: o.z - o.nz * 2 }
  if (final && toShop) p = { x: PK.x, z: PK.z }
  const want = Math.atan2(p.x - r.x, p.z - r.z)
  const diff = ang(want - r.yaw)
  inp.steer = Math.max(-1, Math.min(1, -diff * 2.5))
  inp.throttle = Math.abs(diff) > 1.6 && r.grounded ? 0.3 : 1
  // 登っていて窓の高さを過ぎたら離す（高すぎて落ちる前に）
  const dGoal = Math.hypot(goal.x - r.x, goal.z - r.z)
  const swingOK = (b.kind === 'rush' && dGoal > 14) || ((b.kind === 'skilled' || b.kind === 'clumsy') && dGoal > (toShop ? 45 : 30))
  b.wT += dt
  let wire = false
  b.jumpOff = Math.max(0, (b.jumpOff || 0) - dt)
  // 空中で行ったり来たりして近づけていない（同じ壁の前で振り子になる）なら、いったん降りて走る
  b.noWire = Math.max(0, (b.noWire || 0) - dt)
  b.progT = (b.progT || 0) + dt
  if (b.progRef == null || b.goalKey2 !== b.goalKey) { b.progRef = dGoal; b.progT = 0; b.goalKey2 = b.goalKey }
  if (b.progT > 3) {
    const stuck = dGoal > b.progRef - 8 && dGoal > 20
    b.progRef = dGoal; b.progT = 0
    if (stuck) { b.noWire = 4; if (r.rope) wire = true; if (r.climbing) inp.jump = true }
  }
  const CN = world.nav && world.nav.canal, nearCanal = CN && Math.abs(r.z - (CN.z0 + CN.z1) / 2) < 45 && Math.abs(goal.z - (CN.z0 + CN.z1) / 2) > 45   // 運河の近くは歩いて橋を渡る（掛けた先が運河の向こうに戻ることがある）
  if (swingOK && !nearCanal && !(b.noWire > 0) && !(b.jumpOff > 0) && !(b.jumpOff > 0) && !r.rope && !r.climbing && b.wT > 0.35 && (r.grounded || r.vy < -1)) {
    // 行きたい向きの前の建物を狙う（人が画面の行きたい方をタッチするのと同じ）
    const v = Math.max(8, Math.hypot(r.vx, r.vz))
    const a = findAnchor(world, { ...r, yaw: want, vx: Math.sin(want) * v, vz: Math.cos(want) * v })
    if (a && !(b.kind === 'clumsy' && b.rnd() < 0.33)) { wire = true; b.wT = 0; b.aim = a } else if (a) b.wT = 0
  }
  if ((b.kind === 'skilled' || b.kind === 'clumsy') && r.rope && dGoal < 32 && r.y < 6) wire = true // 振り子の下（低い所）で外して、そっと着地する
  if (b.kind === 'rush' && r.rope && dGoal < 12) wire = true
  inp.wire = wire && !b.prevW; b.prevW = wire
  if (inp.wire && !r.rope && b.aim) inp.wireAt = b.aim
  b.aim = null
  // rush: 近づいたら投げる
  let th = false
  if (false && b.kind === 'rush' && sh.carrying) {   // 2026-11-02 本人「投げるボタンいらない」で投げは無し
    const d3 = Math.hypot(o.x - r.x, o.y - (r.y + 1.3), o.z - r.z)
    if (d3 < 16 && Math.hypot(r.vx, r.vy, r.vz) > JOB.handSpeed) {
      // 投げた後の軌道が窓の近くを通るかを先に見てから投げる（人が狙うのと同じくらいの精度）
      const fx = Math.sin(r.yaw), fz = Math.cos(r.yaw)
      let x = r.x, y = r.y + 1.3, z = r.z, vx = r.vx + fx * 5, vy = Math.max(r.vy, 0) + 3.5, vz = r.vz + fz * 5, best = 99
      for (let i = 0; i < 90; i++) { vy -= 21 / 60; x += vx / 60; y += vy / 60; z += vz / 60; best = Math.min(best, Math.hypot(x - o.x, y - o.y, z - o.z)) }
      if (best < JOB.throwR * 1.6) th = true
    }
  }
  inp.throw = th && !b.prevT; b.prevT = th
  if (!r.climbing) b.crawlBest = null
  // 壁に張り付いたら、窓の高さと横位置へ這って寄る（上下左右に動ける）
  if (r.climbing && !toShop) {
    const cl = r.climbing, rx = cl.nz, rz = -cl.nx
    const dy = o.y - (r.y + 1.1), dx = (o.x - r.x) * rx + (o.z - r.z) * rz
    inp.wallY = Math.max(-1, Math.min(1, dy * 0.6)); inp.wallX = Math.max(-1, Math.min(1, dx * 0.6))
    if (Math.abs(dy) < 0.4) inp.wallY = 0
    if (Math.abs(dx) < 0.4) inp.wallX = 0
    // 壁の角や別の建物で横へ進めない時は、跳んで離れてやり直す
    // 窓に近づけていない（角・別の建物・別の面）なら、跳んで離れてやり直す
    const dW = Math.hypot(o.x - r.x, o.y - (r.y + 1.1), o.z - r.z)
    if (b.crawlBest == null || dW < b.crawlBest - 0.3) { b.crawlBest = dW; b.crawlT = 0 } else b.crawlT = (b.crawlT || 0) + dt
    if (b.crawlT > 1.2) { inp.jump = true; b.crawlT = 0; b.crawlBest = null; b.replan = 0; b.jumpOff = 1.6 }
  }
  // 渡し終えて壁に張り付いている時は、壁から離れて降りる（壁を登り続けて戻れなくなっていた）
  if (toShop && r.climbing) { inp.throttle = 0; inp.wire = false; inp.jump = !b.prevJ; b.prevJ = inp.jump } else b.prevJ = false   // 張り付きは止まるだけなので、跳んで離れる
  // 詰まったら跳ぶ
  b.stuck = Math.hypot(r.x - b.lx, r.z - b.lz) < 0.05 && !r.climbing ? b.stuck + dt : 0
  b.lx = r.x; b.lz = r.z
  if (b.stuck > 1.2) { inp.jump = true; b.stuck = 0; b.replan = 0 }
  if (b.kind === 'clumsy') {
    // 反応が遅い（0.35秒前の判断で動く）・向きがぶれる
    inp.steer = Math.max(-1, Math.min(1, inp.steer + (b.rnd() - 0.5) * 0.8))
    b.lag.push(inp); const n = Math.round(0.35 / dt)
    if (b.lag.length <= n) return { throttle: 0, steer: 0 }
    const old = b.lag.shift()
    if (toShop && r.climbing) return { ...old, throttle: 0, wire: false, jump: inp.jump }   // 壁から離れるのは遅れずに（人も手を離すだけ）
    return { ...old, wireAt: old.wireAt }
  }
  return inp
}
