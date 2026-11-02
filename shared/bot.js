// CPU の出前バイト（釣り合いの検証とタイトルのデモ用）。3つの性格
//   careful: ワイヤーを使わず、道を走って壁を登って手渡し（丁寧だが遅い）
//   rush:    ずっとワイヤー＋巻き取り、近づいたら投げ入れる（速いが崩れる）
//   skilled: 巻き取らずにワイヤーで近くまで行き、最後は着地して壁を登って手渡し
import { JOB, curOrder } from './delivery.js'
import { findAnchor } from './runner.js'

const K = 130 / 80
const XS = [-320, -240, -160, -80, 0, 80, 160, 240, 320].map(x => x * K)
const ZS = [40, 120, 200, 280, 360, 440, 520, 600, 680, 760, 840].map(z => 40 + (z - 40) * K)
const near = (arr, v) => arr.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a)
const ang = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a }

// 道に沿った経路: いちばん近い交差点 → 目的地の前の道へ曲がる → 目的地の前。通り過ぎた交差点は捨てる
function route(r, goal) {
  const ix = near(XS, r.x), iz = near(ZS, r.z), gx = near(XS, goal.fx), gz = near(ZS, goal.fz)
  const F = { x: goal.fx, z: goal.fz }
  const onXroad = Math.abs(goal.fx - gx) < 14
  let pts = [{ x: ix, z: iz }, onXroad ? { x: gx, z: iz } : { x: ix, z: gz }, F]
  pts = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 1)
  while (pts.length > 1) {
    const p0 = pts[0], p1 = pts[1]
    if (Math.hypot(p0.x - r.x, p0.z - r.z) < 9 || Math.hypot(p1.x - r.x, p1.z - r.z) < Math.hypot(p1.x - p0.x, p1.z - p0.z) + 2) pts.shift(); else break
  }
  return pts
}

export function createBot(kind) { return { kind, plan: null, idx: 0, replan: 0, wT: 0, prevW: false, prevT: false, stuck: 0, lx: 0, lz: 0 } }

export function botInput(b, r, sh, world, dt) {
  const o = curOrder(sh)
  const inp = { throttle: 0, steer: 0 }
  if (!o || sh.over) return inp
  const S = JOB.shop
  const toShop = !sh.carrying && !sh.thrown
  const goal = toShop ? { fx: S.x - 6, fz: S.z, x: S.x, z: S.z, y: 0 } : { fx: o.x + o.nx * 7, fz: o.z + o.nz * 7, x: o.x, z: o.z, y: o.y }
  b.replan -= dt
  if (!b.plan || b.goalKey !== goal.fx + ',' + goal.fz || b.replan <= 0) {
    b.plan = route(r, goal); b.idx = 0; b.replan = 1.5; b.goalKey = goal.fx + ',' + goal.fz
  }
  while (b.idx < b.plan.length - 1 && Math.hypot(b.plan[b.idx].x - r.x, b.plan[b.idx].z - r.z) < 9) b.idx++
  const final = b.idx >= b.plan.length - 1 && Math.hypot(goal.fx - r.x, goal.fz - r.z) < 9
  let p = b.plan[b.idx]
  // 最後: 窓の真下の壁へ向かって走る（壁を登る）
  if (final && !toShop) p = { x: o.x - o.nx * 2, z: o.z - o.nz * 2 }
  if (final && toShop) p = { x: S.x, z: S.z }
  const want = Math.atan2(p.x - r.x, p.z - r.z)
  const diff = ang(want - r.yaw)
  inp.steer = Math.max(-1, Math.min(1, -diff * 2.5))
  inp.throttle = Math.abs(diff) > 1.6 && r.grounded ? 0.3 : 1
  // 登っていて窓の高さを過ぎたら離す（高すぎて落ちる前に）
  const dGoal = Math.hypot(goal.x - r.x, goal.z - r.z)
  const swingOK = (b.kind === 'rush' && dGoal > 14) || (b.kind === 'skilled' && dGoal > (toShop ? 20 : 30))
  b.wT += dt
  let wire = false
  if (swingOK && !r.rope && !r.climbing && b.wT > 0.35 && (r.grounded || r.vy < -1)) {
    // 行きたい向きの前の建物を狙う（人が画面の行きたい方をタッチするのと同じ）
    const v = Math.max(8, Math.hypot(r.vx, r.vz))
    const a = findAnchor(world, { ...r, yaw: want, vx: Math.sin(want) * v, vz: Math.cos(want) * v })
    if (a) { wire = true; b.wT = 0; b.aim = a }
  }
  if (b.kind === 'skilled' && r.rope && dGoal < 32 && r.y < 6) wire = true // 振り子の下（低い所）で外して、そっと着地する
  if (b.kind === 'rush' && r.rope && dGoal < 12) wire = true
  inp.wire = wire && !b.prevW; b.prevW = wire
  if (inp.wire && !r.rope && b.aim) inp.wireAt = b.aim
  b.aim = null
  // 巻き取り
  inp.boost = b.kind === 'rush' && !!r.rope && r.vy < 0
  // rush: 近づいたら投げる
  let th = false
  if (b.kind === 'rush' && sh.carrying) {
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
  // 登っている途中で窓を通り過ぎたら止める
  if (r.climbing && r.y + 1.1 > o.y + 3) inp.throttle = 0
  // 詰まったら跳ぶ
  b.stuck = Math.hypot(r.x - b.lx, r.z - b.lz) < 0.05 && !r.climbing ? b.stuck + dt : 0
  b.lx = r.x; b.lz = r.z
  if (b.stuck > 1.2) { inp.jump = true; b.stuck = 0; b.replan = 0 }
  return inp
}
