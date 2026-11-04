// 通りの見た目: 電柱・街灯・電線（InstancedMesh）、一般車（WIRE ESCAPE の ProcCar）、通行人（Kenney Mini の歩くアニメ）、一軒家
// 位置と当たりは shared/street.js / shared/town.js。ここは描くだけ
import * as THREE from 'three'
import { clone as skClone } from '../vendor/jsm/utils/SkeletonUtils.js?v=15'
import { ProcCar } from './carmodel.js?v=15'
import { charAssets } from './charmodel.js?v=15'
import { HOUSE, APT, VEND } from '../shared/town.js?v=15'
import { Builder } from './geo.js?v=15'

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

// 店の周りの町を1つのジオメトリにまとめて描く（一軒家・アパート・自動販売機）。窓とジュースの面だけ別の材質（夜に灯る）
// 1軒ずつ Mesh にすると 9 ドローコール × 29 軒になる。頂点色で焼いて、全部で本体1・窓1・自販機の面1
const WALLS = [0xe8e0d0, 0xd9cbb0, 0xc9d3d6, 0xe3d6c8, 0xd2c4a8, 0xdfe2dc, 0xc8b8a0, 0xe6dccb, 0xb9c2b4]
const ROOFS = [0x4a3a32, 0x2f4a5a, 0x5a3228, 0x3a3f46, 0x6a4a2a, 0x2a3a2a, 0x54575c]
const APT_WALLS = [0xb7a58c, 0xa9b0b3, 0xc3b299, 0x9fa89f]
const VEND_BODY = [0xb3262a, 0x1f5aa8, 0xe2e4e6]

// 建物の向きの座標（u=間口の右、v=前）を世界へ。b.box(.., yaw) と同じ変換
function frame(cx, y0, cz, fx, fz) {
  const yaw = Math.atan2(fx, fz), c = Math.cos(yaw), s = Math.sin(yaw)
  return { yaw, at: (u, y, v) => [cx + u * c + v * s, y0 + y, cz - u * s + v * c] }
}
function addBoxAt(b, f, u, y, v, hu, hy, hv, color, opts) { const p = f.at(u, y, v); b.box(p[0], p[1], p[2], hu, hy, hv, color, f.yaw, opts) }

function addHouse(b, lit, h, i) {
  const f = frame(h.cx, h.y0, h.cz, h.fx, h.fz)
  const W = HOUSE.hw * 2, D = HOUSE.hl * 2, H = HOUSE.wall, R = HOUSE.roof, wall = WALLS[i % WALLS.length], roof = ROOFS[(i * 3 + 1) % ROOFS.length]
  addBoxAt(b, f, 0, H / 2, 0, W / 2, H / 2, D / 2, wall)
  // 切妻屋根（棟は間口と平行）
  const U = W / 2 + 0.5, Ve = D / 2 + 0.6, t = 0.08
  b.hexa([f.at(-U, H + R - t, 0), f.at(U, H + R - t, 0), f.at(U, H - t, Ve), f.at(-U, H - t, Ve), f.at(-U, H + R + t, 0), f.at(U, H + R + t, 0), f.at(U, H + t, Ve), f.at(-U, H + t, Ve)], roof, { top: roof })
  b.hexa([f.at(-U, H - t, -Ve), f.at(U, H - t, -Ve), f.at(U, H + R - t, 0), f.at(-U, H + R - t, 0), f.at(-U, H + t, -Ve), f.at(U, H + t, -Ve), f.at(U, H + R + t, 0), f.at(-U, H + R + t, 0)], roof, { top: roof })
  b.tri(f.at(W / 2, H, -D / 2), f.at(W / 2, H + R, 0), f.at(W / 2, H, D / 2), wall)
  b.tri(f.at(-W / 2, H, D / 2), f.at(-W / 2, H + R, 0), f.at(-W / 2, H, -D / 2), wall)
  const v = D / 2 + 0.03, flip = i % 2 ? -1 : 1
  addBoxAt(b, f, -W / 4 * flip, 1.05, v, 0.55, 1.05, 0.04, 0x6a4a30)                // 玄関
  addBoxAt(b, f, -W / 4 * flip, 2.35, D / 2 + 0.45, 0.9, 0.05, 0.45, 0x3a3a3a)      // 庇
  for (const [u, y] of [[W / 4, 1.6], [-W / 4, 4.3], [W / 4, 4.3]]) addBoxAt(lit, f, u * flip, y, v, 0.75, 0.6, 0.03, 0xffffff)
  // 側面の窓とエアコンの室外機（1軒おき）
  addBoxAt(lit, f, W / 2 + 0.02, 4.3, 0, 0.03, 0.55, 0.7, 0xffffff)
  if (i % 2 === 0) addBoxAt(b, f, W / 4 * flip, 0.35, v + 0.3, 0.42, 0.35, 0.2, 0xd8d8d2)
}

function addApartment(b, lit, a, i) {
  const f = frame(a.cx, a.y0, a.cz, a.fx, a.fz)
  const W = APT.hw * 2, D = APT.hl * 2, H = APT.h, fl = H / APT.floors, wall = APT_WALLS[i % APT_WALLS.length]
  addBoxAt(b, f, 0, H / 2, 0, W / 2, H / 2, D / 2, wall)
  addBoxAt(b, f, 0, H + 0.2, 0, W / 2 + 0.1, 0.2, D / 2 + 0.1, 0x6b6e70)            // 屋上の縁
  addBoxAt(b, f, W / 4, H + 1, -1, 1.1, 0.8, 1.1, 0x9a9c9e)                          // 貯水槽
  for (let k = 0; k < APT.floors; k++) {
    const y = k * fl
    for (const u of [-5, -1.7, 1.7, 5]) {
      addBoxAt(lit, f, u, y + 1.8, D / 2 + 0.03, 1.05, 0.75, 0.03, 0xffffff)
      if (k > 0) {
        addBoxAt(b, f, u, y + 0.15, D / 2 + 0.55, 1.45, 0.08, 0.55, 0xbfbfb8)        // ベランダの床
        addBoxAt(b, f, u, y + 0.65, D / 2 + 1.08, 1.45, 0.45, 0.03, 0x5a5f63)        // 手すり
      } else if (u === -1.7 || u === 1.7) addBoxAt(b, f, u, 1.05, D / 2 + 0.05, 0.55, 1.05, 0.04, 0x5a4634)
    }
    addBoxAt(lit, f, W / 2 + 0.02, y + 1.8, 0, 0.03, 0.55, 1, 0xffffff)
    addBoxAt(lit, f, -W / 2 - 0.02, y + 1.8, 0, 0.03, 0.55, 1, 0xffffff)
  }
}

function vendTexture() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 216
  const x = cv.getContext('2d')
  x.fillStyle = '#10151c'; x.fillRect(0, 0, 128, 216)
  x.fillStyle = '#e9f2f6'; x.fillRect(8, 8, 112, 118)
  const cans = ['#c8341f', '#1f6fb8', '#e8b52a', '#2d9a58', '#f07d2a', '#7a4a2a', '#d84a7a', '#e8e8e0']
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
    const X = 13 + c * 17.6, Y = 13 + r * 38
    x.fillStyle = cans[(r * 5 + c * 3) % cans.length]; x.fillRect(X, Y, 13, 26)
    x.fillStyle = 'rgba(255,255,255,0.55)'; x.fillRect(X + 2, Y + 2, 2.5, 22)
    x.fillStyle = r === 2 ? '#c8341f' : '#1f6fb8'; x.fillRect(X + 1, Y + 29, 11, 3)
  }
  x.fillStyle = '#c7ccd0'; x.fillRect(84, 134, 34, 30)
  x.fillStyle = '#2a2f36'; x.fillRect(90, 140, 22, 7)
  x.fillStyle = '#2a2f36'; x.fillRect(16, 176, 96, 26)
  x.fillStyle = '#54595f'; x.fillRect(20, 180, 88, 8)
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function buildHouses3d(scene, town) {
  const grp = new THREE.Group()
  const body = new Builder(), lit = new Builder()
  town.houses.forEach((h, i) => addHouse(body, lit, { ...h, fx: 0, fz: h.face }, i))
  town.fill.houses.forEach((h, i) => addHouse(body, lit, h, i + town.houses.length))
  town.fill.apts.forEach((a, i) => addApartment(body, lit, a, i))
  // 広場の真ん中の噴水（前は黒い箱に見えていた）。当たりは city.js の箱のまま
  const fo = town.fountain
  if (fo) {
    const y = fo.y0, h = fo.y1 - fo.y0
    body.box(fo.cx, y + h / 2, fo.cz, fo.hw + 0.05, h / 2 + 0.01, fo.hl + 0.05, 0x9c988e, 0, { top: 0xb0aca2 })
    body.box(fo.cx, y + h + 0.02, fo.cz, fo.hw - 0.5, 0.02, fo.hl - 0.5, 0x5a93a8)
    body.box(fo.cx, y + h + 0.6, fo.cz, 0.5, 0.6, 0.5, 0xa8a49a)
    body.box(fo.cx, y + h + 1.25, fo.cz, 1.1, 0.08, 1.1, 0x9c988e, 0, { top: 0x5a93a8 })
  }
  // 自動販売機: 本体とゴミ箱は本体のジオメトリへ、ジュースの面は1枚の画像の InstancedMesh（夜に灯る）
  const V = town.fill.vends, tex = vendTexture()
  const vendMat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.3, roughness: 0.35 })
  const faces = new THREE.InstancedMesh(new THREE.PlaneGeometry(VEND.hw * 2 - 0.1, VEND.h - 0.2), vendMat, V.length)
  V.forEach((v, i) => {
    const f = frame(v.cx, v.y0, v.cz, v.fx, v.fz)
    addBoxAt(body, f, 0, VEND.h / 2, 0, VEND.hw, VEND.h / 2, VEND.hl, VEND_BODY[v.c % VEND_BODY.length], { top: 0x33373c })
    addBoxAt(body, f, VEND.hw + 0.28, 0.4, 0.05, 0.2, 0.4, 0.2, 0x4a5a4a)   // 空き缶入れ
    const p = f.at(0, VEND.h / 2 + 0.03, VEND.hl + 0.015)
    _m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(0, f.yaw, 0)), _s.set(1, 1, 1)); faces.setMatrixAt(i, _m)
  })
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.02 })
  const winMat = new THREE.MeshStandardMaterial({ color: 0x2b3a4a, emissive: 0xffc070, emissiveIntensity: 0, roughness: 0.2 })
  const bodyMesh = new THREE.Mesh(body.geometry(), bodyMat), litMesh = new THREE.Mesh(lit.geometry(), winMat)
  bodyMesh.castShadow = bodyMesh.receiveShadow = true
  faces.frustumCulled = false
  grp.add(bodyMesh, litMesh, faces)
  scene.add(grp)
  return { grp, winMat, vendMat }
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
