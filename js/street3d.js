// 通りの見た目: 電柱・街灯・電線（InstancedMesh）、一般車（WIRE ESCAPE の ProcCar）、通行人（Kenney Mini の歩くアニメ）、一軒家
// 位置と当たりは shared/street.js / shared/town.js。ここは描くだけ
import * as THREE from 'three'
import { clone as skClone } from '../vendor/jsm/utils/SkeletonUtils.js?v=8'
import { ProcCar } from './carmodel.js?v=8'
import { charAssets } from './charmodel.js?v=8'
import { HOUSE } from '../shared/town.js?v=8'

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler()

export function buildPoles3d(scene, allPoles) {
  const poles = allPoles.filter(q => !q.prop)   // 元からある街灯・信号・木は scene.js が描く
  const grp = new THREE.Group()
  const n = poles.length
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: 0.85 })
  const metal = new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.5, metalness: 0.6 })
  const shaft = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.19, 1, 8).translate(0, 0.5, 0), concrete, n)
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.12, 0.12), metal, n)
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.16, 0.32), metal, n)
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffd89a, emissiveIntensity: 0 })
  const bulbs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.06, 0.24), bulbMat, n)
  let ai = 0, hi = 0
  const wirePts = []
  poles.forEach((q, i) => {
    const h = q.y1 - q.y0
    _m.compose(_p.set(q.x, q.y0, q.z), _q.identity(), _s.set(q.kind === 'pole' ? 1 : 0.8, h, q.kind === 'pole' ? 1 : 0.8)); shaft.setMatrixAt(i, _m)
    const yaw = Math.atan2(q.nx, q.nz)
    if (q.kind === 'pole') {
      _m.compose(_p.set(q.x, q.y1 - 0.6, q.z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(1, 1, 1)); arms.setMatrixAt(ai++, _m)
    } else {
      // 街灯: 道の側へ腕を出して、先に灯り
      const hx = q.x + q.nx * 0.9, hz = q.z + q.nz * 0.9
      _m.compose(_p.set(hx, q.y1 - 0.05, hz), _q.setFromEuler(_e.set(0, yaw + Math.PI / 2, 0)), _s.set(1, 1, 1)); heads.setMatrixAt(hi, _m)
      _m.compose(_p.set(hx, q.y1 - 0.15, hz), _q.setFromEuler(_e.set(0, yaw + Math.PI / 2, 0)), _s.set(1, 1, 1)); bulbs.setMatrixAt(hi++, _m)
    }
  })
  // 電線: 同じ側の電柱どうし（26m 間隔）を、たるませた3本の線でつなぐ
  const P = poles.filter(q => q.kind === 'pole')
  for (const a of P) {
    let best = null, bd = 1e9
    for (const b of P) { if (b === a) continue; const d = Math.hypot(b.x - a.x, b.z - a.z); if (d < bd && d < 60 && d > 20 && (b.x > a.x + 1 || (Math.abs(b.x - a.x) < 1 && b.z > a.z))) { bd = d; best = b } }
    if (!best) continue
    for (const off of [-0.7, 0, 0.7]) {
      const ox = a.nz * off, oz = -a.nx * off
      let px = a.x + ox, py = a.y1 - 0.55, pz = a.z + oz
      for (let k = 1; k <= 6; k++) {
        const t = k / 6, x = a.x + (best.x - a.x) * t + ox, z = a.z + (best.z - a.z) * t + oz, y = a.y1 - 0.55 + (best.y1 - a.y1) * t - Math.sin(t * Math.PI) * 0.9
        wirePts.push(px, py, pz, x, y, z); px = x; py = y; pz = z
      }
    }
  }
  arms.count = ai; heads.count = hi; bulbs.count = hi
  for (const m of [shaft, arms, heads]) { m.castShadow = true; m.receiveShadow = true }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3))
  const wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1e1f22 }))
  grp.add(shaft, arms, heads, bulbs, wires)
  scene.add(grp)
  return { grp, bulbMat }
}

// 一軒家: 壁・切妻屋根・玄関・窓（窓は夜に灯る）
export function buildHouses3d(scene, houses) {
  const grp = new THREE.Group()
  const walls = [0xe8e0d0, 0xd9cbb0, 0xc9d3d6, 0xe3d6c8, 0xd2c4a8, 0xdfe2dc]
  const roofs = [0x4a3a32, 0x2f4a5a, 0x5a3228, 0x3a3f46, 0x6a4a2a, 0x2a3a2a]
  const winMat = new THREE.MeshStandardMaterial({ color: 0x2b3a4a, emissive: 0xffc070, emissiveIntensity: 0, roughness: 0.2 })
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.7 })
  houses.forEach((h, i) => {
    const g = new THREE.Group(); g.position.set(h.cx, h.y0, h.cz)
    const W = HOUSE.hw * 2, D = HOUSE.hl * 2, Hh = HOUSE.wall
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, Hh, D), new THREE.MeshStandardMaterial({ color: walls[i % walls.length], roughness: 0.9 }))
    body.position.y = Hh / 2; body.castShadow = body.receiveShadow = true
    // 切妻屋根（棟は道と平行）
    const shape = new THREE.Shape(); shape.moveTo(-D / 2 - 0.6, 0); shape.lineTo(0, HOUSE.roof); shape.lineTo(D / 2 + 0.6, 0); shape.lineTo(-D / 2 - 0.6, 0)
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: W + 1, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: roofs[i % roofs.length], roughness: 0.75 }))
    roof.rotation.y = Math.PI / 2; roof.position.set(-W / 2 - 0.5, Hh, 0); roof.castShadow = true
    g.add(body, roof)
    const f = h.face, fz = f * (D / 2 + 0.02)
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.1), doorMat); door.position.set(-W / 4, 1.05, fz); door.rotation.y = f > 0 ? 0 : Math.PI
    g.add(door)
    for (const [x, y] of [[W / 4, 1.6], [-W / 4, 4.3], [W / 4, 4.3]]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.2), winMat); w.position.set(x, y, fz); w.rotation.y = f > 0 ? 0 : Math.PI; g.add(w)
    }
    // 玄関の庇と小さい門灯
    const eave = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.9), new THREE.MeshStandardMaterial({ color: 0x3a3a3a })); eave.position.set(-W / 4, 2.35, f * (D / 2 + 0.45)); g.add(eave)
    grp.add(g)
  })
  scene.add(grp)
  return { grp, winMat }
}

// 一般車: カメラの近くの車にだけ見た目を割り当てる（スマホは少なめ）
export function trafficPool(scene, low) {
  const n = low ? { sedan: 8, van: 3, taxi: 3 } : { sedan: 14, van: 6, taxi: 4 }   // 2026-11-03 交通量を増やした分
  const pool = new Map()
  for (const [kind, k] of Object.entries(n)) {
    const list = []
    for (let i = 0; i < k; i++) { const m = new ProcCar(kind, 0xffffff); m.group.visible = false; scene.add(m.group); list.push(m) }
    pool.set(kind, list)
  }
  const col = new THREE.Color()
  return {
    draw(cars, cam, dt) {
      const R2 = (low ? 150 : 200) ** 2, near = []
      for (const c of cars) { const d = (c.x - cam.x) ** 2 + (c.z - cam.z) ** 2; if (d < R2) near.push([c, d]) }
      near.sort((a, b) => a[1] - b[1])
      const used = {}
      for (const [c] of near) {
        const list = pool.get(c.kind); if (!list) continue
        const i = used[c.kind] || 0; if (i >= list.length) continue
        used[c.kind] = i + 1
        const m = list[i]; m.group.visible = true
        if (m.paintColor.getHex() !== c.color) { m.paintColor.setHex(c.color); m.paintMat.color.copy(col.setHex(c.color)) }
        m.update(c, dt, {})
      }
      for (const [kind, list] of pool) for (let i = used[kind] || 0; i < list.length; i++) list[i].group.visible = false
    }
  }
}

// 通行人: Kenney Mini の6人を使い回して、近い人から歩くアニメで置く
export function pedPool(scene, low) {
  const N = low ? 12 : 16, slots = []
  const grp = new THREE.Group(); scene.add(grp)
  const ensure = () => {
    if (slots.length || !charAssets.ready || !charAssets.custs.length) return slots.length > 0
    for (let i = 0; i < N; i++) {
      const c = charAssets.custs[i % charAssets.custs.length], root = skClone(c.scene)
      const box = new THREE.Box3().setFromObject(root); const k = 1.65 / (box.max.y - box.min.y)
      root.scale.setScalar(k)
      const holder = new THREE.Group(); root.position.y = -box.min.y * k; holder.add(root); holder.visible = false
      const mixer = new THREE.AnimationMixer(root)
      const walk = c.clips.find(a => a.name === 'walk'), fall = c.clips.find(a => a.name === 'fall')
      const aw = walk ? mixer.clipAction(walk) : null; if (aw) { aw.play(); aw.time = Math.random() }
      const af = fall ? mixer.clipAction(fall) : null
      grp.add(holder); slots.push({ holder, mixer, aw, af, look: i % charAssets.custs.length })
    }
    return true
  }
  return {
    draw(peds, cam, dt) {
      if (!ensure()) return
      const R2 = (low ? 70 : 100) ** 2, near = []
      for (const p of peds) { if (!p.w) continue; const d = (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2; if (d < R2) near.push([p, d]) }
      near.sort((a, b) => a[1] - b[1])
      slots.forEach((s, i) => {
        const e = near[i]
        if (!e) { s.holder.visible = false; return }
        const p = e[0]; s.holder.visible = true
        s.holder.position.set(p.x, p.y, p.z); s.holder.rotation.y = p.yaw
        const bumped = p.bumped > 0
        if (s.af && s.aw) { s.af.enabled = bumped; s.aw.enabled = !bumped; if (bumped && !s.af.isRunning()) s.af.reset().play() }
        s.mixer.update(dt * (bumped ? 1 : p.speed / 1.3))
      })
    }
  }
}
