// 空の邪魔の見た目: カラス（低ポリの自作。胴・頭・くちばし・扇の尾を1つにまとめ、羽は肩から羽ばたく）と野球ボール・落下点の印
// 素材集にカラスの3Dが無かったので自作（箱と球にしない: 先細りの胴・段のついた羽先）。InstancedMesh で何羽でも描画は3回
import * as THREE from 'three'

const MAXC = 40

// 先細りの胴（頭から尾まで）を、断面の輪を並べて作る
function crowBodyGeo() {
  const rings = [   // [z, 幅, 高さ, 中心の高さ]（+z が頭）
    [0.42, 0.001, 0.001, 0.12], [0.36, 0.05, 0.04, 0.11],   // くちばしの先と根元
    [0.3, 0.09, 0.1, 0.12], [0.22, 0.1, 0.11, 0.11],        // 頭
    [0.14, 0.08, 0.08, 0.08],                                // 首
    [0.04, 0.13, 0.13, 0.04], [-0.1, 0.14, 0.13, 0.03],     // 胸と腹
    [-0.24, 0.09, 0.08, 0.04], [-0.32, 0.05, 0.04, 0.05]    // 尾の付け根
  ]
  const seg = 8, pos = [], idx = []
  for (const [z, w, h, cy] of rings) for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2; pos.push(Math.cos(a) * w, cy + Math.sin(a) * h, z) }
  for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < seg; i++) {
    const a = r * seg + i, b = r * seg + (i + 1) % seg, c = a + seg, d = b + seg
    idx.push(a, c, b, b, c, d)
  }
  // 尾: 扇形に開いた平たい板
  const t0 = pos.length / 3
  pos.push(0, 0.05, -0.3, -0.12, 0.04, -0.56, -0.04, 0.035, -0.6, 0.04, 0.035, -0.6, 0.12, 0.04, -0.56)
  idx.push(t0, t0 + 1, t0 + 2, t0, t0 + 2, t0 + 3, t0, t0 + 3, t0 + 4)
  idx.push(t0, t0 + 2, t0 + 1, t0, t0 + 3, t0 + 2, t0, t0 + 4, t0 + 3)   // 裏
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals()
  return g
}
// 羽: 肩（原点）から外へ。先は段になった風切り羽（指のように分かれる）
function wingGeo(side) {
  const s = new THREE.Shape()
  s.moveTo(0, 0.1); s.lineTo(0.22, 0.09); s.lineTo(0.42, 0.04)
  s.lineTo(0.52, -0.02); s.lineTo(0.46, -0.04); s.lineTo(0.5, -0.08); s.lineTo(0.42, -0.09); s.lineTo(0.45, -0.13); s.lineTo(0.36, -0.13)
  s.lineTo(0.36, -0.16); s.lineTo(0.26, -0.15); s.lineTo(0.12, -0.13); s.lineTo(0, -0.1)
  const g = new THREE.ShapeGeometry(s)
  g.rotateX(-Math.PI / 2)        // 平らに寝かせる（x が外、z が前後）
  if (side < 0) g.scale(-1, 1, 1)
  g.translate(0, 0.1, 0.02)
  return g
}

export function airPool(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x101014, roughness: 0.6, metalness: 0, side: THREE.DoubleSide })   // 濡れ羽色
  const body = new THREE.InstancedMesh(crowBodyGeo(), mat, MAXC)
  const wl = new THREE.InstancedMesh(wingGeo(1), mat, MAXC), wr = new THREE.InstancedMesh(wingGeo(-1), mat, MAXC)
  for (const m of [body, wl, wr]) { m.count = 0; m.frustumCulled = false; m.castShadow = true; scene.add(m) }
  const M = new THREE.Matrix4(), W = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), S = new THREE.Vector3(1.5, 1.5, 1.5)
  // ボール（縫い目つき）と、地面の影・落下点の印
  const bc = document.createElement('canvas'); bc.width = 128; bc.height = 64
  { const x = bc.getContext('2d'); x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, 128, 64); x.strokeStyle = '#c0302a'; x.lineWidth = 3; for (const o of [20, 84]) { x.beginPath(); for (let i = 0; i <= 64; i += 2) x.lineTo(o + Math.sin(i / 64 * Math.PI * 2) * 10, i); x.stroke() } }
  const btex = new THREE.CanvasTexture(bc); btex.colorSpace = THREE.SRGBColorSpace
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ map: btex, roughness: 0.6 }))
  ball.visible = false; scene.add(ball)
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }))
  shadow.rotation.x = -Math.PI / 2; shadow.visible = false; scene.add(shadow)
  const mk = document.createElement('canvas'); mk.width = mk.height = 128
  { const x = mk.getContext('2d'); x.strokeStyle = '#ff3b2f'; x.lineWidth = 10; x.beginPath(); x.arc(64, 64, 52, 0, Math.PI * 2); x.stroke(); x.fillStyle = '#ff3b2f'; x.font = '900 72px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('!', 64, 68) }
  const mtex = new THREE.CanvasTexture(mk); mtex.colorSpace = THREE.SRGBColorSpace
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: mtex, transparent: true, depthTest: false, depthWrite: false }))
  marker.renderOrder = 6; marker.visible = false; scene.add(marker)
  // ボールの通り道（打った瞬間から見える点線）
  const N = 24, trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3))
  const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.7, depthWrite: false }))
  trail.visible = false; trail.frustumCulled = false; scene.add(trail)
  return {
    draw(A, cam, dt, groundAt) {
      let n = 0
      if (A) for (const c of A.crows) {
        if (n >= MAXC) break
        if ((c.x - cam.x) ** 2 + (c.z - cam.z) ** 2 > 160 * 160) continue
        const pitch = c.mode === 'scatter' ? c.t * 14 : c.mode === 'takeoff' ? -0.35 : 0
        e.set(pitch, c.yaw, c.mode === 'scatter' ? c.t * 9 : 0, 'YXZ'); q.setFromEuler(e)
        M.compose(p.set(c.x, c.y, c.z), q, S)
        body.setMatrixAt(n, M)
        // 休んでいる時は羽をたたむ（下へ垂らして胴に沿わせる）。飛ぶ時は肩から上下に
        const fl = c.mode === 'perch' ? -1.25 : Math.sin(c.flap) * (c.mode === 'fly' ? 0.75 : 1.05) + 0.1
        const fold = c.mode === 'perch' ? 0.55 : 0
        W.makeRotationFromEuler(e.set(0, -fold, fl, 'XYZ')); W.setPosition(0.07, 0.04, 0.02); wl.setMatrixAt(n, W.premultiply(M).clone())
        W.makeRotationFromEuler(e.set(0, fold, -fl, 'XYZ')); W.setPosition(-0.07, 0.04, 0.02); wr.setMatrixAt(n, W.premultiply(M).clone())
        n++
      }
      for (const m of [body, wl, wr]) { m.count = n; m.instanceMatrix.needsUpdate = true }
      const b = A && A.balls[0]
      ball.visible = shadow.visible = marker.visible = trail.visible = !!b
      if (b) {
        ball.position.set(b.x, b.y, b.z); ball.rotation.x += dt * 20
        shadow.position.set(b.x, groundAt(b.x, b.z) + 0.05, b.z)
        marker.position.set(b.tx, b.ty, b.tz)
        const k = 0.9 + Math.sin(performance.now() / 90) * 0.15, d = cam.distanceTo(marker.position)
        marker.scale.setScalar(Math.max(1.2, d * 0.05) * k)
        // 残りの通り道を点で
        const a = trailGeo.attributes.position.array, rest = Math.max(0.05, b.T - b.t)
        for (let i = 0; i < N; i++) { const tt = rest * i / (N - 1); a[i * 3] = b.x + b.vx * tt; a[i * 3 + 1] = b.y + b.vy * tt - 0.5 * A.g * tt * tt; a[i * 3 + 2] = b.z + b.vz * tt }
        trailGeo.attributes.position.needsUpdate = true
      }
    }
  }
}
