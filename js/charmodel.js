// 人物の見た目（ボーン入りの CC0 キャラ）
// 配達員: KayKit Adventurers 2.0 の Ranger（CC0）を白い調理着と紺の色に塗り替え、Rig_Medium のアニメを当てる
// 窓の客: Kenney Mini Characters（CC0、現代の普段着）。待機アニメの上で右腕を振る
// 読み込みが終わる前と失敗した時は、前の手続きの人形（runnermodel.js）を使う
import * as THREE from 'three'
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js?v=8'
import { clone as skClone } from '../vendor/jsm/utils/SkeletonUtils.js?v=8'

const BASE = 'assets/chars/'
const A = { ready: false, failed: false, ranger: null, clips: {}, custs: {}, glasses: null }
// 窓の客の見た目（Kenney Mini Characters）。普通の客は6人を順に、変わった客は1人ずつ決めて小物で描き分ける
export const CUST_CHARS = { normal: ['female-b', 'male-e', 'female-d', 'female-f', 'male-a', 'male-c'], duf: 'male-f', polite: 'male-d', coins: 'female-c', photo: 'female-e', net: 'male-b' }
const CHAR_FILES = [...new Set([...CUST_CHARS.normal, CUST_CHARS.duf, CUST_CHARS.polite, CUST_CHARS.coins, CUST_CHARS.photo, CUST_CHARS.net])]
export const charAssets = A

// 色見本（8x4 のグラデーションの升）を塗り替える。升の位置は ranger_texture.png を見て決めた
function recolor(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
  const x = c.getContext('2d'); x.drawImage(img, 0, 0)
  const cw = img.width / 8, ch = img.height / 4
  const grad = (col, row, top, bot, cols = 1) => { const g = x.createLinearGradient(0, row * ch, 0, (row + 1) * ch); g.addColorStop(0, top); g.addColorStop(1, bot); x.fillStyle = g; x.fillRect(col * cw, row * ch, cw * cols, ch) }
  grad(5, 0, '#ffffff', '#cfd2d4', 2)   // 生成りの上着 → 白い調理着
  grad(2, 2, '#ffffff', '#c9ccce')      // 同じ生成りの別の升
  grad(0, 1, '#3a4766', '#151b2c')      // 青いスカーフ → 紺の手ぬぐい
  grad(1, 2, '#3a4766', '#151b2c')
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false
  return t
}

export function loadCharAssets() {
  if (A.loading) return A.loading
  const L = new GLTFLoader()
  const get = f => new Promise((ok, ng) => L.load(BASE + f, ok, undefined, ng))
  A.loading = Promise.all([get('Ranger.glb'), get('Rig_Medium_General.glb'), get('Rig_Medium_MovementBasic.glb'), get('aid-glasses.glb'),
    ...CHAR_FILES.map(n => get('character-' + n + '.glb'))])
    .then(([r, g1, g2, gl, ...cs]) => {
      r.scene.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true; o.frustumCulled = false
          if (/Quiver|Cape/.test(o.name)) o.visible = false
          if (o.material && o.material.map && !A._tex) A._tex = recolor(o.material.map.image)
          if (o.material && A._tex) { o.material = o.material.clone(); o.material.map = A._tex; o.material.roughness = 0.7; o.material.metalness = 0 }
        }
      })
      A.ranger = r.scene
      for (const cl of [...g1.animations, ...g2.animations]) A.clips[cl.name] = cl
      cs.forEach((c, i) => { A.custs[CHAR_FILES[i]] = { scene: c.scene, clips: c.animations }; c.scene.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false } }) })
      A.glasses = gl.scene
      A.ready = true
      return A
    }).catch(e => { A.failed = true; console.warn('char load failed', e); return A })
  return A.loading
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3()
// 骨を、子の骨が target の方を向くように回す（w は効き具合 0〜1）
function aimBone(bone, child, target, w) {
  bone.getWorldPosition(_a); child.getWorldPosition(_b)
  _c.subVectors(_b, _a).normalize(); _d.subVectors(target, _a).normalize()
  if (_c.lengthSq() < 1e-6 || _d.lengthSq() < 1e-6) return
  _q.setFromUnitVectors(_c, _d)
  bone.getWorldQuaternion(_q2)
  _q2.premultiply(_q)                      // 新しい世界の向き
  const pq = new THREE.Quaternion(); bone.parent.getWorldQuaternion(pq)
  _q2.premultiply(pq.invert())             // 親から見た向きに直す
  bone.quaternion.slerp(_q2, w)
  bone.updateMatrixWorld(true)
}

export class CharRunnerModel {
  constructor() {
    this.group = new THREE.Group()
    this.tilt = new THREE.Group(); this.group.add(this.tilt)   // 腰を中心に傾ける枠
    const ch = this.char = skClone(A.ranger)
    // 背の高さを 1.8m にそろえる
    const box = new THREE.Box3().setFromObject(ch); const hgt = box.max.y - box.min.y
    this.k = 1.8 / hgt; ch.scale.setScalar(this.k)
    this.hipY = 0.85
    this.tilt.position.y = this.hipY; ch.position.y = -this.hipY - box.min.y * this.k
    this.tilt.add(ch)
    this.bones = {}; ch.traverse(o => { if (o.isBone) this.bones[o.name] = this.bones[o.name.replace(/([lr])$/, '.$1')] = o })   // GLTFLoader は名前の . を消す（upperarm.l → upperarml）。両方で引けるようにする
    this.mixer = new THREE.AnimationMixer(ch)
    this.acts = {}
    for (const n of ['Idle_A', 'Running_A', 'Walking_A', 'Jump_Idle', 'Jump_Start', 'Jump_Land', 'Hit_A', 'Death_A', 'Throw', 'Interact']) {
      if (!A.clips[n]) continue
      const a = this.mixer.clipAction(A.clips[n]); this.acts[n] = a
      if (/Death|Jump_Land|Jump_Start|Throw|Hit/.test(n)) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true }
    }
    this.cur = null; this.play('Idle_A')
    // 岡持ち（銀の出前箱）。腰の横に下げる
    const ok = this.okamochi = new THREE.Group()
    const steel = new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.75, roughness: 0.3 })
    const boxM = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.24).translate(0, -0.2, 0), steel); boxM.castShadow = true
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 12, Math.PI).translate(0, -0.02, 0), steel)
    const label = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.005).translate(0, -0.18, 0.123), new THREE.MeshStandardMaterial({ color: 0xb22a22 }))
    ok.add(boxM, handle, label); this.group.add(ok)
    // 手首の作業用ワイヤー射出機（橙）
    this.guns = []
    for (const side of ['l', 'r']) {
      const w = this.bones['wrist.' + side]; if (!w) continue
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.14), new THREE.MeshStandardMaterial({ color: 0xd9772a, emissive: 0xd9772a, emissiveIntensity: 0.3 }))
      gun.scale.setScalar(1 / this.k); w.add(gun); this.guns.push(gun)
    }
    this.handWorld = new THREE.Vector3(); this.state = 'idle'; this.phase = 0; this.lastThrow = 0
    this._t = new THREE.Vector3()
  }
  play(name, fade = 0.18) {
    const a = this.acts[name]; if (!a || this.cur === a) return
    a.reset().setEffectiveWeight(1).fadeIn(fade).play()
    if (this.cur) this.cur.fadeOut(fade)
    this.cur = a
  }
  update(s, dt) {
    const g = this.group
    g.position.set(s.x, s.y, s.z)
    const v = Math.hypot(s.vx, s.vz)
    let pitch = 0, roll = 0, st
    if (s.wreck > 0) st = 'down'
    else if (s.climbing) st = 'climb'
    else if (s.rope) st = s.zipping ? 'zip' : 'swing'
    else if (!s.grounded) st = 'air'
    else if (v > 0.6) st = 'run'
    else st = 'idle'
    if (st !== this.state && this.state === 'air' && (st === 'run' || st === 'idle')) this.play('Jump_Land', 0.08)
    const landing = this.cur === this.acts.Jump_Land && this.cur.time < 0.35
    this.state = st
    let yaw = s.yaw
    if (st === 'down') { this.play('Death_A', 0.15) }
    else if (st === 'climb') { yaw = Math.atan2(-s.climbing.nx, -s.climbing.nz); this.play('Running_A'); this.acts.Running_A.timeScale = 0.55; pitch = 0.1 }
    else if (st === 'swing' || st === 'zip' || st === 'air') { this.play('Jump_Idle', 0.2) }
    else if (st === 'run' && !landing) { this.play('Running_A'); this.acts.Running_A.timeScale = Math.min(1.5, 0.55 + v * 0.09); pitch = Math.min(0.2, v * 0.015) }
    else if (st === 'idle' && !landing) this.play('Idle_A')
    g.rotation.set(0, yaw, 0)
    if (st === 'swing' || st === 'zip') {
      const dx = s.rope.x - s.x, dy = s.rope.y - (s.y + 1.2), dz = s.rope.z - s.z
      const cy = Math.cos(yaw), sy = Math.sin(yaw)
      const lx = dx * cy - dz * sy, lz = dx * sy + dz * cy
      pitch = Math.atan2(lz, Math.max(0.5, dy)) * 0.8
      roll = -Math.atan2(lx, Math.max(0.5, dy)) * 0.8
    }
    if (s.stun > 0 && st === 'air') { this.phase += dt * 14; roll = Math.sin(this.phase) * 0.8; pitch = Math.cos(this.phase * 0.7) * 0.9 }
    const kk = 1 - Math.exp(-dt * 10)
    this.tilt.rotation.x += (pitch - this.tilt.rotation.x) * kk
    this.tilt.rotation.z += (roll - this.tilt.rotation.z) * kk
    this.mixer.update(dt)
    g.updateMatrixWorld(true)
    // ワイヤーの腕: 掛けた点へまっすぐ伸ばす
    const B = this.bones
    if (s.rope && B['upperarm.l']) {
      this._t.set(s.rope.x, s.rope.y, s.rope.z)
      B['upperarm.l'].getWorldPosition(_a); B['upperarm.r'].getWorldPosition(_b)
      const left = _a.distanceToSquared(this._t) <= _b.distanceToSquared(this._t)
      const sd = left ? 'l' : 'r'
      aimBone(B['upperarm.' + sd], B['lowerarm.' + sd], this._t, 1)
      aimBone(B['lowerarm.' + sd], B['wrist.' + sd], this._t, 1)
      B['hand.' + sd].getWorldPosition(this.handWorld)
    } else if (st === 'climb' && B['upperarm.l']) {
      // 壁を登る: 両腕を上へ交互に伸ばす
      this.phase += dt * 9
      for (const [sd, ph] of [['l', 0], ['r', Math.PI]]) {
        const up = 0.5 + 0.5 * Math.sin(this.phase + ph)
        B['upperarm.' + sd].getWorldPosition(_a)
        this._t.set(_a.x, _a.y + 1, _a.z).addScaledVector(_c.set(Math.sin(yaw), 0, Math.cos(yaw)), 0.25 + up * 0.15)
        this._t.y += up * 0.3
        aimBone(B['upperarm.' + sd], B['lowerarm.' + sd], this._t, 0.9)
      }
    }
    // 岡持ち: 腰の横（左）に下げる。腕は使わない（ワイヤーで腕を上げても箱が空を向かないように）
    if (B.hips) {
      B.hips.getWorldPosition(_a); g.worldToLocal(_a)
      this.okamochi.position.set(_a.x + 0.36, _a.y + 0.38, _a.z + 0.04)
      this.okamochi.rotation.set(this.tilt.rotation.x * 0.4, 0, this.tilt.rotation.z * 0.4)
    }
  }
  updateParts() { return [] }
  applyDents() {}
  resetParts() {}
  dispose() { this.mixer.stopAllAction(); this.group.traverse(o => { if (o.geometry && !o.isSkinnedMesh) o.geometry.dispose() }) }
}

// 窓の客（上半身だけ見える）。客の種類ごとに人と小物と動きを変える
//   normal: 右腕を振る／duf: 眼鏡・両手を前に出して小刻みに揺れる／polite: 何度も深くお辞儀／coins: がま口を振る
//   photo: スマホを構えてフラッシュ／net: 長い柄の網を窓から突き出す
const steel = () => new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.4 })
// 小物は人の前に置く（客の足元が原点・メートル。+z が窓の外＝こちら側）。眼鏡だけ頭の骨に付ける
function makeProps(type, root, bones, holder) {
  const P = {}
  if (type === 'duf' && A.glasses) {
    const g = skClone(A.glasses); g.scale.setScalar(1.45); g.position.set(0, 0.44, 0.07)
    root.add(g); root.updateMatrixWorld(true); bones.head && bones.head.attach(g); P.glasses = g
  }
  if (type === 'coins') {
    // がま口（紫の布に金の口金）。胸の前でじゃらじゃら振る
    const purse = new THREE.Group()
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10).scale(1.25, 0.85, 0.6), new THREE.MeshStandardMaterial({ color: 0x8a2f6b, roughness: 0.8 }))
    const clasp = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.022, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: 0.8, roughness: 0.3 }))
    clasp.position.y = 0.1
    const balls = [-1, 1].map(sx => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), clasp.material); m.position.set(sx * 0.03, 0.2, 0); return m })
    purse.add(bag, clasp, ...balls); purse.position.set(-0.28, 0.62, 0.55); holder.add(purse); P.purse = purse
  }
  if (type === 'photo') {
    // スマホを顔の前に構える（こちらからは背面のレンズとフラッシュが見える）
    const phone = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.44, 0.03), new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.4 }))
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), new THREE.MeshBasicMaterial({ color: 0x999999 }))
    lens.position.set(0.07, 0.15, 0.017)
    const case_ = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.47, 0.02), new THREE.MeshStandardMaterial({ color: 0xe86a9a, roughness: 0.7 }))
    case_.position.z = -0.012
    phone.add(case_, body, lens); phone.position.set(0.12, 1.02, 0.62); phone.rotation.z = -0.08; holder.add(phone); P.phone = phone; P.lens = lens
  }
  if (type === 'net') {
    // 柄の長い網を窓から突き出す（こちらに輪が向く）
    const net = new THREE.Group()
    const wood = new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.8 })
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 8), wood)
    pole.rotation.x = Math.PI / 2; pole.position.z = 1.3
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.028, 6, 24), steel())
    hoop.position.z = 2.6
    const bag = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x2f8f6b, transparent: true, opacity: 0.7, side: THREE.DoubleSide, wireframe: true }))
    bag.rotation.x = -Math.PI / 2; bag.position.z = 2.6 - 0.35
    net.add(pole, hoop, bag); net.position.set(0.25, 0.55, 0.35); net.rotation.x = -0.12; holder.add(net); P.net = net
  }
  return P
}

export class Customer {
  constructor() {
    this.group = new THREE.Group(); this.slots = {}
    this.cur = null; this.t = 0; this.react = null; this.reactT = 0
    this.flash = new THREE.PointLight(0xffffff, 0, 9); this.flash.position.set(0, 1.4, 1.2); this.group.add(this.flash)
  }
  // o: 注文（cust・char）。読み込み前は false
  show(o) {
    if (!A.ready) return false
    const type = o.cust || 'normal', name = type === 'normal' ? CUST_CHARS.normal[(o.char || 0) % CUST_CHARS.normal.length] : CUST_CHARS[type]
    const key = type + ':' + name
    if (key === this.cur) return true
    if (!A.custs[name]) return false
    for (const k in this.slots) this.slots[k].holder.visible = false
    if (!this.slots[key]) {
      const c = A.custs[name], root = skClone(c.scene)
      const box = new THREE.Box3().setFromObject(root); const k = 1.9 / (box.max.y - box.min.y)
      root.scale.setScalar(k); root.position.y = -box.min.y * k
      const mixer = new THREE.AnimationMixer(root)
      const acts = {}
      for (const n of ['idle', 'holding-both', 'holding-right', 'emote-yes', 'emote-no']) { const cl = c.clips.find(a => a.name === n); if (cl) acts[n] = mixer.clipAction(cl) }
      for (const n of ['emote-yes', 'emote-no']) if (acts[n]) { acts[n].setLoop(THREE.LoopRepeat) }
      const bones = {}; root.traverse(o2 => { if (o2.name) bones[o2.name] = o2 })
      const holder = new THREE.Group(); holder.add(root); this.group.add(holder)
      const props = makeProps(type, root, bones, holder)
      const base = { duf: 'holding-both', photo: 'holding-both', net: 'holding-both', coins: 'holding-right' }[type] || 'idle'
      this.slots[key] = { root, holder, mixer, acts, base, cur: null, type, props, arm: bones['arm-right'], armL: bones['arm-left'], head: bones['head'], torso: bones['torso'] }
    }
    const sl = this.slots[key]
    sl.holder.visible = true; this.cur = key; this.react = null; this.reactT = 0; this.t = 0
    this.play(sl, sl.base)
    return true
  }
  play(sl, name) {
    const a = sl.acts[name] || sl.acts.idle; if (!a || sl.cur === a) return
    a.reset().fadeIn(0.15).play(); if (sl.cur) sl.cur.fadeOut(0.15); sl.cur = a
  }
  // 受け取った後の反応: good / ok / mess / late（怒っているかは angry）
  setReact(kind, angry) {
    const sl = this.slots[this.cur]; if (!sl) return
    this.react = { kind, angry }; this.reactT = 0
    this.play(sl, angry ? 'emote-no' : sl.type === 'duf' ? sl.base : 'emote-yes')
    if (sl.type === 'photo' && !angry) this.flashT = 0
  }
  update(dt, near = false) {
    const s = this.slots[this.cur]; if (!s) return
    this.t += dt; this.reactT += dt
    s.mixer.update(dt)
    const t = this.t, R = this.react
    s.holder.rotation.set(0, 0, 0); s.holder.position.x = 0
    if (s.torso) s.torso.rotation.x = 0
    this.flash.intensity = 0
    if (R && R.angry) {
      // 怒る: 両腕を振り上げて首を振る（どの客も。デュフフの人は怒らない）
      if (s.arm) s.arm.rotation.set(-2.6 + Math.sin(t * 18) * 0.5, 0, 0)
      if (s.armL) s.armL.rotation.set(-2.6 + Math.sin(t * 18 + 1.5) * 0.5, 0, 0)
      return
    }
    if (s.type === 'normal') {
      if (!R && s.arm) s.arm.rotation.set(-2.75 + Math.sin(t * 9) * 0.35, 0, 0)   // 右腕を頭の横まで上げて振る
      if (s.head) s.head.rotation.z = Math.sin(t * 2.3) * 0.08
    } else if (s.type === 'duf') {
      // 小刻みに揺れて頷き続ける。受け取ると窓の中でくるっと回る
      if (s.head) s.head.rotation.x = Math.sin(t * 16) * 0.13
      s.holder.rotation.z = Math.sin(t * 3.1) * 0.07
      s.holder.position.x = Math.sin(t * 1.7) * 0.12
      if (R && R.kind === 'good') s.holder.rotation.y = Math.min(1, this.reactT / 0.8) * Math.PI * 2
      if (R && (R.kind === 'mess' || R.kind === 'late') && s.head) s.head.rotation.x = 0.45
    } else if (s.type === 'polite') {
      // 何度も深くお辞儀（受け取ったらさらに深く・速く）
      const sp = R ? 4.2 : 2.4, deep = R ? 0.85 : 0.6
      if (s.torso) s.torso.rotation.x = Math.pow(Math.max(0, Math.sin(t * sp)), 2) * deep
    } else if (s.type === 'coins') {
      if (s.props.purse) { s.props.purse.rotation.z = Math.sin(t * 14) * 0.25; s.props.purse.position.y = 0.62 + Math.abs(Math.sin(t * 7)) * 0.06 }   // がま口をじゃらじゃら振る
    } else if (s.type === 'photo') {
      // 近づくと連写のフラッシュ。受け取ったら大きく1回
      const k = (t * 3.3) % 1
      if (near && k < 0.12) this.flash.intensity = 30
      if (R && this.reactT < 0.15) this.flash.intensity = 60
      if (s.props.lens) s.props.lens.material.color.setScalar(this.flash.intensity > 0 ? 1 : 0.6)
    } else if (s.type === 'net') {
      if (s.props.net) { s.props.net.rotation.y = Math.sin(t * 1.6) * 0.12; s.props.net.rotation.x = -0.12 + Math.sin(t * 2.3) * 0.05 }   // 網をゆらゆら
    }
  }
}
