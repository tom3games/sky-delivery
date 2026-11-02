// 空中出前 宙吊軒（1日だけ職場体験 #4）。WIRE ESCAPE のワイヤーと街を使った出前ゲーム
// 速く飛ぶと料理が崩れて怒られる、ゆっくりだと遅れて怒られる
import * as THREE from 'three'
import { GAME } from '../shared/config.js'
import { createWorld } from '../shared/track.js'
import { buildScene } from './scene.js'
import { FX } from './fx.js'
import { loadSky, setAniso } from './look.js'
import { Q } from './quality.js'
import { RunnerModel } from './runnermodel.js'
import { CharRunnerModel, Customer, loadCharAssets, charAssets } from './charmodel.js'
import { createRunner, stepRunner, findAnchor, rayHit, RUN } from '../shared/runner.js'
import { JOB, createShift, stepShift, curOrder, payData, money } from '../shared/delivery.js'
import { createBot, botInput } from '../shared/bot.js'
import { drawPayslip, totals } from './payslip.js'
import { createStreet, buildPoles } from '../shared/street.js'
import { addTown } from '../shared/town.js'
import { buildPoles3d, buildHouses3d, trafficPool, pedPool } from './street3d.js'
import { carLights } from './carmodel.js'
import { LOW } from './quality.js'

const $ = id => document.getElementById(id)
const STEP = GAME.step
const URL_ = 'https://tom3games.github.io/sky-delivery/'
const store = { get: k => { try { return localStorage.getItem(k) } catch (e) { return null } }, set: (k, v) => { try { localStorage.setItem(k, v) } catch (e) {} } }

// ---------------------------------------------------------------- 文言（日英）
const T = {
  ja: {
    series: '1日だけ職場体験 #4', logo: '空中出前', masterName: '店主', masterLine: '出前は空から行ってくれ。のびても崩れても文句言われるで。',
    start: '出勤する', how: '仕事の説明', lang: 'EN', more: 'ほかのゲーム', muteOn: '音 入', muteOff: '音 切', loading: '仕込み中',
    howTitle: '出前の心得', ok: 'わかった',
    howItems: [
      'ビルを<b>タッチ</b>でワイヤー。大きいボタンなら前の上へ自動で',
      '急ぐほど<b>丼の中身が減る</b>。遅れても怒られる',
      '赤い提灯の窓に<b>そっと寄れば</b>手渡し。<b>投げる</b>のは賭け'
    ],
    hintWire: '<small>こつ</small>ビルをタッチするとワイヤーが出る', hintWirePc: '<small>こつ</small>ビルをクリック（か E）でワイヤー',
    keysPc: 'PC: WASD・矢印で移動　クリックでワイヤー（E は前の上へ自動）　Space ジャンプ　F 投げる　ドラッグで見回す',
    keysTouch: '左のスティックで移動、画面をタッチでワイヤー、なぞると見回す。壁に向かって走ると登れる',
    credit: '音: Kenney, rubberduck, artisticdude, poinl, Almitory ほか（CC0）。詳しくは CREDITS.md',
    ticketHead: '御伝票', shiftLeft: 'シフト残り', toShop: '店に戻って受け取る', shopName: '宙吊軒',
    floor: (p, f) => `${p}（${f}階の窓）`, dist: d => `あと${d}m`, sec: s => `${s}秒`, late: s => `${s}秒遅れ`,
    pause: '休憩', paused: '休憩中', resume: '戻る', quit: '店を出る（やめる）',
    jump: '跳ぶ', throw: '投げる', tooFar: '届かない', bumpPed: '<small>通行人</small>ちょっと！ 前見て！', bumpCar: '<small>運転手</small>危ないやろ！ 歩道歩け！',
    spill: { 25: 'スープが揺れてる', 50: '半分こぼれた', 75: 'ほとんど残ってない' },
    pickup: (d, p, f) => `はい次、${d}。${p}の${f}階や`,
    custLine: { '事務所': '昼休み終わる前に頼むで', '美容室': 'パーマ中で動かれへん。窓まで頼むわ', '法律事務所': '一滴でもこぼれてたら訴えるからな', '歯医者': '麻酔切れる前に食べたいねん', 'ネイルサロン': '爪乾かしてるから、そっと渡してな', '設計事務所': '徹夜明けや。熱いうちに頼む', '塾': '休み時間10分しかないねん', '探偵事務所': '張り込み中や。目立たんように来てくれ', '会議室': '会議の前に来てや。遅れたら気まずい', 'ヨガ教室': 'ゆっくりでええ。でも麺はのばさんといて', 'お宅': '子どもが寝とるから、玄関やなくて2階の窓に頼むわ' },
    tooFast: '速すぎて受け取れん！', lateMsg: '遅れてるで！',
    react: { good: '早っ！ 熱いうちにいただきます', ok: 'ちょっと減ってるけど、まあええわ', throwOk: '窓から入ってきた！？', mess: 'スープどこいったん？ もう頼まん', late: 'のびのびやん…', drop: '下に落ちたで！' },
    tip: y => `チップ ${y}円`, noTip: 'チップなし', allDone: '全部届けた！', timeUp: 'シフト終わり',
    job: '空中出前', boss: '店主', again: 'もう一回', save: '画像を保存', post: 'Xでポスト', toTitle: 'タイトル',
    comments: { great: 'ようやった。明日も来てくれ', mess: '速いのはええけど、丼の中身が旅に出とる', late: '丁寧なんはええけど、麺がのびきっとるで', drop: '人の頭の上に料理を降らすな', few: '空ばっかり見とらんと、出前もしてくれ', ok: 'まあまあや。次は崩さず早く' },
    stamps: ['不採用', '要研修', '採用', '即採用'],
    postText: (y, n) => `空中出前のバイトで${n}件届けて手取り${y.toLocaleString()}円でした`
  },
  en: {
    series: 'ONE-DAY JOB #4', logo: 'Sky Delivery', masterName: 'Chef', masterLine: 'Take the orders by air. They complain if it spills, and they complain if it is late.',
    start: 'Clock in', how: 'How to work', lang: 'JP', more: 'More games', muteOn: 'Sound on', muteOff: 'Muted', loading: 'Prepping',
    howTitle: 'Delivery rules', ok: 'Got it',
    howItems: [
      '<b>Tap</b> a building to shoot a wire. The big button aims ahead for you',
      'The faster you go, <b>the more soup you lose</b>. Late is bad too',
      'Ease up to the window with the red lantern to <b>hand it over</b>. <b>Throwing</b> is a gamble'
    ],
    hintWire: '<small>Tip</small>Tap a building to shoot a wire', hintWirePc: '<small>Tip</small>Click a building (or E) to wire',
    keysPc: 'PC: WASD / arrows move · click to wire (E auto-aims) · Space jump · F throw · drag to look',
    keysTouch: 'Left stick moves, tap to wire, drag to look around. Run into a wall to climb it',
    credit: 'Sounds: Kenney, rubberduck, artisticdude, poinl, Almitory and others (CC0). See CREDITS.md',
    ticketHead: 'ORDER', shiftLeft: 'Shift', toShop: 'Back to the shop', shopName: 'Chuzuri-ken',
    floor: (p, f) => `${p} (floor ${f} window)`, dist: d => `${d} m`, sec: s => `${s}s`, late: s => `${s}s late`,
    pause: 'Break', paused: 'On break', resume: 'Back to work', quit: 'Leave (quit)',
    jump: 'Jump', throw: 'Throw', tooFar: 'Too far', bumpPed: '<small>Passer-by</small>Hey! Watch it!', bumpCar: '<small>Driver</small>Get off the road!',
    spill: { 25: 'Soup is sloshing', 50: 'Half of it is gone', 75: 'Almost nothing left' },
    pickup: (d, p) => `Next: ${d} for the ${p}`,
    custLine: { '事務所': 'Before my lunch break ends, please', '美容室': 'I am mid-perm. Bring it to the window', '法律事務所': 'One drop spilled and I will sue', '歯医者': 'I want to eat before the anesthetic wears off', 'ネイルサロン': 'My nails are drying. Hand it over gently', '設計事務所': 'Up all night. Bring it hot', '塾': 'I only have a 10-minute break', '探偵事務所': 'I am on a stakeout. Do not make a scene', '会議室': 'Before the meeting starts, please', 'ヨガ教室': 'Take it easy. Just do not let the noodles go soggy', 'お宅': 'The baby is asleep. Bring it to the upstairs window, not the door' },
    tooFast: 'Too fast to grab it!', lateMsg: 'You are late!',
    react: { good: 'Already? Still hot, thanks!', ok: 'A bit spilled, but fine', throwOk: 'It flew in the window!?', mess: 'Where did the soup go?', late: 'The noodles are soggy…', drop: 'It fell on the street!' },
    tip: y => `Tip ¥${y}`, noTip: 'No tip', allDone: 'All delivered!', timeUp: 'Shift over',
    job: 'Sky delivery', boss: 'Chef', again: 'Again', save: 'Save image', post: 'Post on X', toTitle: 'Title',
    comments: { great: 'Good work. Come back tomorrow', mess: 'Fast, sure. The soup went on its own trip', late: 'Careful is nice. The noodles are mush', drop: 'Stop raining food on people', few: 'Stop sightseeing and deliver', ok: 'Not bad. Faster and cleaner next time' },
    stamps: ['REJECT', 'TRAINING', 'HIRED', 'HIRED!'],
    postText: (y, n) => `I delivered ${n} orders by wire and took home ¥${y.toLocaleString()}`
  }
}
const PLACE_EN = {}
let lang = store.get('sky.lang') || ((navigator.language || 'ja').startsWith('ja') ? 'ja' : 'en')
const t = k => T[lang][k]
function applyLang() {
  document.documentElement.lang = lang
  for (const el of document.querySelectorAll('[data-t]')) { const v = t(el.dataset.t); if (typeof v === 'string') el.textContent = v }
  $('howList').innerHTML = t('howItems').map((s, i) => `<li data-n="${'一二三四五'[i]}"><span>${s}</span></li>`).join('')
  $('howKeys').textContent = touchMode ? '' : t('keysPc')   // スマホは上の3行で足りる（同じ説明を繰り返さない）
  $('btnMute').textContent = Snd.muted ? t('muteOff') : t('muteOn')
}

// ---------------------------------------------------------------- 音（録音素材だけ）
Snd.muted = store.get('sky.mute') === '1'
Snd.def({
  wire: ['snd/swish-1.mp3', 'snd/swish-2.mp3', 'snd/swish-3.mp3'], hook: ['snd/metalClick.mp3', 'snd/metal_02.mp3'],
  throw: 'snd/swish-5.mp3', land: ['snd/footstep_01.mp3', 'snd/footstep_02.mp3'], bonk: ['snd/thwack-01.mp3', 'snd/thwack-03.mp3'],
  slosh: ['snd/splash_01.mp3', 'snd/splash_02.mp3'], dish: ['snd/dishes_01.mp3', 'snd/dishes_02.mp3', 'snd/dishes_03.mp3'],
  ding: 'snd/bell_ding1.mp3', coin: 'snd/coin_drop.mp3', grunt: ['snd/grunt_01.mp3', 'snd/grunt_02.mp3', 'snd/grunt_03.mp3', 'snd/grunt_04.mp3'],
  crash: 'snd/glass_breaking_01.mp3', shop: 'snd/bell_01.mp3', click: 'snd/click_001.mp3', tick: 'snd/tick_002.mp3',
  win: 'snd/jingles_SAX01.mp3', meh: 'snd/jingles_SAX03.mp3', lose: 'snd/jingles_PIZZA07.mp3'
})
const sfx = (n, o) => Snd.play(n, o)

// ---------------------------------------------------------------- 描画の土台
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true })
renderer.setPixelRatio(Q.pixelRatio)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0
setAniso(renderer)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
$('view').appendChild(renderer.domElement)
const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2(0xc9d6e2, 0.0022)
scene.background = new THREE.Color(0xa9c4e0)
const sun = new THREE.DirectionalLight(0xfff1dc, 3.0)
sun.userData.dir = new THREE.Vector3(-0.45, 0.62, -0.64).normalize()
sun.castShadow = true
sun.shadow.mapSize.set(Q.shadow, Q.shadow)
Object.assign(sun.shadow.camera, { left: -Q.shadowRange, right: Q.shadowRange, top: Q.shadowRange, bottom: -Q.shadowRange, near: 1, far: 400 })
sun.shadow.normalBias = 0.04; sun.shadow.bias = -0.0004
scene.add(sun, sun.target)
const hemi = new THREE.HemisphereLight(0xc4d8ff, 0x6a5a48, 1.8)
scene.add(hemi)
loadSky(renderer, scene, sun, () => { hemiBase = 0.4; hemi.intensity = 0.4; dayK = -1 })
const camera = new THREE.PerspectiveCamera(64, 1, 0.3, 2400)
const world = createWorld('city')
const built = buildScene(scene, world)
for (const g of built.gates) g.grp.visible = false
const fx = new FX(scene, world)

// ---------------------------------------------------------------- 店と届け先の見た目
const S = JOB.shop
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx }
const shopGroup = new THREE.Group()
{
  const wall = new THREE.MeshStandardMaterial({ color: 0xd8cdb6, roughness: 0.9 })
  const roofM = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.7 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(7, 3.6, 5), wall); body.position.set(0, 1.8, 0); body.castShadow = body.receiveShadow = true
  const roof = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.35, 5.8), roofM); roof.position.set(0, 3.75, 0)
  // 看板
  const sign = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.1, 0.15), new THREE.MeshStandardMaterial({ map: canvasTex(512, 104, (x, w, h) => { x.fillStyle = '#2b1d10'; x.fillRect(0, 0, w, h); x.fillStyle = '#f3ead2'; x.font = '72px "Yuji Syuku", serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('町中華 宙吊軒', w / 2, h / 2 + 4) }), roughness: 0.8 }))
  sign.position.set(0, 4.4, -2.55); sign.rotation.y = Math.PI
  // 暖簾（入口は西＝道の側）
  const norenTex = canvasTex(256, 128, (x, w, h) => { x.fillStyle = '#1f2a44'; x.fillRect(0, 0, w, h); x.fillStyle = '#f3ead2'; x.font = '64px "Yuji Syuku", serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; ['ら', 'ー', 'め'].forEach((c, i) => x.fillText(c, w * (i + 0.5) / 3, h * 0.45)); x.fillStyle = '#16203a'; for (let i = 1; i < 3; i++) x.fillRect(w * i / 3 - 2, 0, 4, h) })
  const noren = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.4), new THREE.MeshStandardMaterial({ map: norenTex, side: THREE.DoubleSide, roughness: 1 }))
  noren.position.set(-3.52, 2.6, 0); noren.rotation.y = -Math.PI / 2
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 14), new THREE.MeshStandardMaterial({ color: 0xc8341f, emissive: 0xc8341f, emissiveIntensity: 0.9 }))
  lantern.position.set(-3.7, 2.6, 2.1)
  const lamp = new THREE.PointLight(0xffb070, 6, 10); lamp.position.set(-4.2, 2.6, 0)
  shopGroup.add(body, roof, sign, noren, lantern, lamp)
  // 受け取りの場所（地面の丸）
  const ring = new THREE.Mesh(new THREE.RingGeometry(S.r - 0.5, S.r, 48), new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.55, depthWrite: false }))
  ring.rotation.x = -Math.PI / 2; ring.position.set(-6, 0.05, 0)
  shopGroup.add(ring)
  shopGroup.userData.ring = ring
  shopGroup.position.set(S.x + 6, 0, S.z)
}
scene.add(shopGroup)
// 店と一軒家の当たり判定・掛け点、通り沿いの電柱と街灯（2026-11-02 本人「通り抜けできてまう」「一軒家も」「電柱とか掛けられる場所を」）
const town = addTown(world, JOB.shop)
const poles3d = buildPoles3d(scene, buildPoles(world, JOB.shop))
const houses3d = buildHouses3d(scene, town.houses)
const carsDraw = trafficPool(scene, LOW), pedsDraw = pedPool(scene, LOW)
let street = createStreet(world, 1)
// 昼→夕方→夜（2026-11-02 本人「時間が経つとだんだん背景も暗くなっていくように」）。空の上に色の膜を重ねる
const skyTint = new THREE.Mesh(new THREE.SphereGeometry(1800, 24, 12), new THREE.MeshBasicMaterial({ color: 0xff8a3c, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false }))
skyTint.renderOrder = -1; scene.add(skyTint)
const DAY = { fog: new THREE.Color(0xc9d6e2), dusk: new THREE.Color(0xd99a6a), night: new THREE.Color(0x141c33), sunDay: new THREE.Color(0xfff1dc), sunDusk: new THREE.Color(0xffa060), sunNight: new THREE.Color(0x9fb4ff), tDusk: new THREE.Color(0xff7a30), tNight: new THREE.Color(0x0b1430) }
const _c1 = new THREE.Color()
let dayK = -1, hemiBase = 1.8
function applyDayTime(k) {
  if (Math.abs(k - dayK) < 0.002) return
  dayK = k
  const dusk = Math.max(0, Math.min(1, (k - 0.35) / 0.3)), night = Math.max(0, Math.min(1, (k - 0.65) / 0.3))
  _c1.copy(DAY.fog).lerp(DAY.dusk, dusk).lerp(DAY.night, night); scene.fog.color.copy(_c1)
  sun.color.copy(DAY.sunDay).lerp(DAY.sunDusk, dusk).lerp(DAY.sunNight, night)
  sun.intensity = 3.0 - dusk * 1.3 - night * 1.35
  hemi.intensity = hemiBase * (1 - night * 0.45)
  scene.environmentIntensity = 1 - dusk * 0.25 - night * 0.45
  scene.backgroundIntensity = 1 - dusk * 0.2 - night * 0.55
  skyTint.material.color.copy(DAY.tDusk).lerp(DAY.tNight, night)
  skyTint.material.opacity = dusk * 0.5 * (1 - night) + night * 0.8
  renderer.toneMappingExposure = 1 + night * 0.18   // 真っ黒にしない
  const lit = Math.max(0, Math.min(1, (k - 0.55) / 0.2))
  poles3d.bulbMat.emissiveIntensity = lit * 2.4
  houses3d.winMat.emissiveIntensity = lit * 1.6
  shopGroup.children.forEach(o => { if (o.isPointLight) o.intensity = 6 + lit * 10 })
  carLights(lit)
}
// 届け先: 赤い提灯＋明かりのついた窓＋手を振る客
const custTex = canvasTex(128, 160, (x, w, h) => {
  x.fillStyle = '#2a2420'
  x.beginPath(); x.arc(64, 48, 26, 0, Math.PI * 2); x.fill()
  x.beginPath(); x.moveTo(20, 160); x.quadraticCurveTo(24, 82, 64, 80); x.quadraticCurveTo(104, 82, 108, 160); x.fill()
  x.lineWidth = 14; x.lineCap = 'round'; x.strokeStyle = '#2a2420'; x.beginPath(); x.moveTo(96, 100); x.lineTo(118, 30); x.stroke()
})
const target = new THREE.Group()
{
  const win = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.2), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }))
  const frame = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.5), new THREE.MeshStandardMaterial({ color: 0x3a3632 }))
  frame.position.z = -0.01
  // 客: 窓辺に立つ3Dの人（腰から下は窓の下の壁で隠す）。読み込み前は影絵の板
  const cust = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.4), new THREE.MeshBasicMaterial({ map: custTex, transparent: true }))
  cust.position.set(0, -0.25, 0.02)
  const person = new Customer(); person.group.position.set(0, -0.45, 0.25); person.group.visible = false
  const sill = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.95, 0.12), new THREE.MeshStandardMaterial({ color: 0x8c8378, roughness: 0.85 }))
  sill.position.set(0, -0.68, 0.5)
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.08, 0.35), new THREE.MeshStandardMaterial({ color: 0xb8b1a6, roughness: 0.7 }))
  ledge.position.set(0, -0.2, 0.5)
  target.add(person.group, sill, ledge)
  const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 14), new THREE.MeshStandardMaterial({ color: 0xc8341f, emissive: 0xe0401f, emissiveIntensity: 1.4 }))
  lan.position.set(1.9, 0.4, 0.5)
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0x1d1a16 }))
  cap.position.set(1.9, 0.96, 0.5)
  const glow = new THREE.PointLight(0xff8040, 8, 14); glow.position.set(0, 0, 1.4)
  target.add(frame, win, cust, lan, cap, glow)
  target.userData = { cust, lan, person }
}
scene.add(target)
// 投げた料理
const flying = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.22), new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.75, roughness: 0.3 }))
flying.visible = false; scene.add(flying)
// ワイヤー
const ropeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 5).rotateX(Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0x2b2b2b }))
ropeMesh.visible = false; scene.add(ropeMesh)
// 狙い（キーボードの E で掛かる所）
const aimMark = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 24), new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.9, depthTest: false }))
aimMark.renderOrder = 5; aimMark.visible = false; scene.add(aimMark)

// ---------------------------------------------------------------- 状態
let mode = 'title'        // title | play | result
let me = null, sh = null, model = null
let demo = null           // タイトルの後ろで飛ぶ CPU
let paused = false, dbgPause = false, endAt = 0, photo = null, photoScore = -1
const touchMode = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
document.body.classList.toggle('is-touch', touchMode)
const cam = { hd: -Math.PI / 2, pitch: 0.15, userT: -1e9, pos: new THREE.Vector3(), off: new THREE.Vector3(-6, 3, 0), look: new THREE.Vector3(), lookOff: new THREE.Vector3(), fov: 64 }
const _v = new THREE.Vector3(), _w = new THREE.Vector3()

function spawnRunner(id) { return createRunner({ id, spawn: { x: S.x - 4, y: 0, z: S.z, yaw: -Math.PI / 2 } }) }
function newModel() { if (model) { scene.remove(model.group); model.dispose() } model = charAssets.ready ? new CharRunnerModel() : new RunnerModel(); scene.add(model.group); return model }
// 人物の素材は裏で読む。読み終わったら今の人形と差し替える
loadCharAssets().then(() => { if (charAssets.ready && model && !(model instanceof CharRunnerModel)) newModel() })

// ---------------------------------------------------------------- 入力
const keys = new Set()
const press = { wire: false, jump: false, throw: false }
let pendingWire = null
addEventListener('keydown', e => {
  if (mode !== 'play') return
  if (e.repeat) return
  keys.add(e.code)
  if (e.code === 'KeyE') pendingWire = { at: null, key: true }
  if (e.code === 'Space') { press.jump = true; e.preventDefault() }
  if (e.code === 'KeyF') press.throw = true
  if (e.code === 'Escape' || e.code === 'KeyP') setPause(!paused)
})
addEventListener('keyup', e => keys.delete(e.code))
// 画面: 軽くタッチ = その建物へワイヤー、なぞる = 見回す
const gest = new Map()
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
renderer.domElement.addEventListener('pointerdown', e => {
  Snd.init()
  if (mode !== 'play' || paused) return
  gest.set(e.pointerId, { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), moved: false })
})
addEventListener('pointermove', e => {
  const g = gest.get(e.pointerId); if (!g) return
  const dx = e.clientX - g.lx, dy = e.clientY - g.ly; g.lx = e.clientX; g.ly = e.clientY
  if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 12) g.moved = true
  if (!g.moved) return
  cam.hd -= dx * 0.006; cam.pitch = Math.max(-0.35, Math.min(1, cam.pitch + dy * 0.004)); cam.userT = performance.now()
})
addEventListener('pointerup', e => {
  const g = gest.get(e.pointerId); if (!g) return
  gest.delete(e.pointerId)
  if (!g.moved && performance.now() - g.t < 450 && mode === 'play' && !paused) aimAt(e.clientX, e.clientY)
})
addEventListener('pointercancel', e => gest.delete(e.pointerId))
function aimAt(cx, cy) {
  const rc = renderer.domElement.getBoundingClientRect()
  ndc.set((cx - rc.left) / rc.width * 2 - 1, -((cy - rc.top) / rc.height) * 2 + 1)
  ray.setFromCamera(ndc, camera)
  const o = ray.ray.origin, d = ray.ray.direction
  pendingWire = { at: me && me.rope ? null : rayHit(world, o.x, o.y, o.z, d.x, d.y, d.z, 400), sx: cx, sy: cy }
}
// スティックとボタン
const stick = { x: 0, y: 0, id: null }
{
  // 左の広い範囲のどこを触ってもスティックが出る（WIRE ESCAPE と同じ）
  const zone = $('stickZone'), el = $('stick'), knob = el.querySelector('.knob')
  let ox = 0, oy = 0
  const R = () => el.getBoundingClientRect().width / 2
  const upd = e => {
    let dx = (e.clientX - ox) / R(), dy = (e.clientY - oy) / R()
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l }
    stick.x = dx; stick.y = dy; knob.style.transform = `translate(${dx * 36}px,${dy * 36}px)`
  }
  zone.addEventListener('pointerdown', e => {
    Snd.init(); if (stick.id != null) return
    stick.id = e.pointerId; try { zone.setPointerCapture(e.pointerId) } catch (er) {}
    const zr = zone.getBoundingClientRect(); ox = e.clientX; oy = e.clientY
    el.style.left = (ox - zr.left) + 'px'; el.style.top = (oy - zr.top) + 'px'; el.classList.add('held'); upd(e)
  })
  zone.addEventListener('pointermove', e => { if (e.pointerId === stick.id) upd(e) })
  const end = e => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; el.classList.remove('held'); el.style.left = el.style.top = '' }
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end)
  for (const b of document.querySelectorAll('.tbtn')) b.addEventListener('pointerdown', e => {
    e.preventDefault(); Snd.init()
    const k = b.dataset.k
    if (k === 'wire') pendingWire = { at: null, key: true }   // 大きいボタン: 前の上へ自動で（ワイヤー中なら外す）
    else press[k] = true
  })
}
function gather() {
  let thr = 0, brk = 0, steer = 0, wallY = null, wallX = null
  if (keys.has('KeyW') || keys.has('ArrowUp')) thr = 1
  if (keys.has('KeyS') || keys.has('ArrowDown')) brk = 1
  if (keys.has('KeyA') || keys.has('ArrowLeft')) steer -= 1
  if (keys.has('KeyD') || keys.has('ArrowRight')) steer += 1
  if (stick.id != null) {
    // スティックはカメラの向きに対して倒した方へ走る
    // WIRE ESCAPE と同じ効き方: 倒した向き（カメラから見て）へ走る。少し倒すだけで全力
    const mag = Math.min(1, Math.hypot(stick.x, stick.y))
    if (mag > 0.15) {
      const want = cam.hd + Math.atan2(-stick.x, -stick.y)
      let d = want - me.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2
      steer = Math.max(-1, Math.min(1, -d * 2.5)); thr = Math.max(thr, Math.min(1, mag * 1.3))
    }
    // 壁に張り付いている時: スティックの上下で登り降り、左右で壁沿いに横へ（画面で見た左右に合わせる）
    if (me.climbing) {
      const cl = me.climbing, sideSign = (-Math.cos(cam.hd)) * cl.nz + Math.sin(cam.hd) * -cl.nx >= 0 ? 1 : -1
      wallY = Math.abs(stick.y) > 0.25 ? -stick.y : 0; wallX = Math.abs(stick.x) > 0.25 ? stick.x * sideSign : 0
    }
  }
  const inp = { throttle: thr, brake: brk, steer, jump: press.jump, wire: false, wallY, wallX }
  if (pendingWire) { inp.wire = true; if (pendingWire.at) inp.wireAt = pendingWire.at; me._tap = pendingWire; pendingWire = null }
  const th = press.throw
  press.jump = press.throw = false
  return { inp, th }
}

// ---------------------------------------------------------------- 画面の切り替え
function show(id) { for (const s of ['title', 'how', 'pause', 'result']) $(s).classList.toggle('hidden', s !== id); $('hud').classList.toggle('hidden', mode !== 'play') }
function toTitle() {
  mode = 'title'; paused = false; me = null; sh = null
  demo = { r: spawnRunner('demo'), b: createBot('skilled'), sh: createShift(world, 7) }
  newModel()
  show('title'); $('touch').classList.add('hidden')
  Snd.loop('bgm', 'snd/bgm_title.mp3', 0.22); Snd.loop('amb', 'snd/loop_highway.mp3', 0.12)
}
function startShift(seed = Math.floor(Math.random() * 1e6)) {
  Snd.init(); sfx('click')
  mode = 'play'; paused = false; demo = null; photo = null; photoScore = -1; endAt = 0
  me = spawnRunner('me'); sh = createShift(world, seed); sh.seed = seed; street = createStreet(world, seed)
  newModel()
  cam.hd = -Math.PI / 2; cam.pitch = 0.15; cam.userT = -1e9
  show(null); $('touch').classList.toggle('hidden', !touchMode)
  Snd.loop('bgm', 'snd/bgm_play.mp3', 0.16); Snd.loop('amb', 'snd/loop_highway.mp3', 0.16); Snd.loop('wind', 'snd/air_01.mp3', 0.0001)
  say(t('masterName') + '「' + t('masterLine') + '」', 2.6)
  hintAt = 4.6
}
let hintAt = 0
function setPause(p) { if (mode !== 'play') return; paused = p; $('pause').classList.toggle('hidden', !p) }

// ---------------------------------------------------------------- 画面の文字
let sayT = 0
function say(html, sec = 1.8, cls = '') { const el = $('say'); el.className = 'say ' + cls; el.innerHTML = html; sayT = sec }
let bowlWordT = 0
function bowlWord(s) { $('bowlWord').textContent = s; bowlWordT = 1.8 }
function fmt(s) { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const placeName = o => lang === 'ja' ? o.place[0] : o.place[1]
const dishName = o => o.dish[lang]
function updateHud(dt) {
  const o = curOrder(sh)
  $('tNo').textContent = `${Math.min(sh.idx + 1, JOB.orders)} / ${JOB.orders}`
  $('tShift').textContent = fmt(JOB.shiftSec - sh.t)
  const tTime = $('tTime')
  if (!o) { $('tDish').textContent = ''; $('tTo').textContent = ''; $('tDist').textContent = ''; tTime.textContent = ''; return }
  $('tDish').textContent = dishName(o)
  if (sh.carrying || sh.thrown) {
    $('tTo').textContent = t('floor')(placeName(o), o.floor)
    $('tDist').textContent = t('dist')(Math.round(Math.hypot(o.x - me.x, o.z - me.z)))
    const left = sh.limit - sh.held
    tTime.textContent = left >= 0 ? t('sec')(Math.ceil(left)) : t('late')(Math.ceil(-left))
    tTime.classList.toggle('late', left < 0)
  } else {
    $('tTo').textContent = t('toShop')
    $('tDist').textContent = t('dist')(Math.round(Math.hypot(S.x - me.x, S.z - me.z)))
    tTime.textContent = ''
  }
  // 丼
  const m = sh.carrying ? sh.mess : 0
  $('soup').setAttribute('y', (36 + m * 0.4).toFixed(1))
  $('toppings').setAttribute('transform', `translate(0,${(m * 0.42).toFixed(1)})`)
  $('toppings').style.opacity = m > 70 ? 0 : 1
  $('steam').style.opacity = sh.carrying ? Math.max(0, 0.75 - sh.held / 60) : 0
  $('bowl').classList.toggle('empty', !sh.carrying)
  if (bowlWordT > 0) { bowlWordT -= dt; if (bowlWordT <= 0) $('bowlWord').textContent = '' }
  if (sayT > 0) { sayT -= dt; $('say').classList.toggle('hidden', sayT <= 0) }
  document.querySelector('.tbtn[data-k=throw]').classList.toggle('off', !sh.carrying)
  // 画面の外の届け先へ矢印
  const goal = sh.carrying || sh.thrown ? _w.set(o.x, o.y + 1.8, o.z) : _w.set(S.x, 2, S.z)   // 窓の上に出す（客の顔に重ねない）
  const p = _v.copy(goal).project(camera)
  const W = innerWidth, H = innerHeight
  const behind = p.z > 1
  let sx = (p.x * 0.5 + 0.5) * W, sy = (-p.y * 0.5 + 0.5) * H
  const off = behind || sx < 30 || sx > W - 30 || sy < 30 || sy > H - 30
  const ar = $('arrow')
  ar.classList.remove('hidden')
  $('arrowD').textContent = Math.round(Math.hypot(goal.x - me.x, goal.z - me.z)) + 'm'
  if (!off) {
    // 画面の中: 届け先の真上に下向きの印（遠いと窓が小さくて見つけにくい）
    ar.style.left = sx + 'px'; ar.style.top = Math.max(40, sy - 44) + 'px'
    ar.querySelector('svg').style.transform = 'rotate(180deg)'
  } else {
    let dx = sx - W / 2, dy = sy - H / 2
    if (behind) { dx = -dx; dy = -dy; if (Math.abs(dy) < 1) dy = H }
    const k = Math.min((W / 2 - 40) / Math.abs(dx || 1e-6), (H / 2 - 60) / Math.abs(dy || 1e-6))
    sx = W / 2 + dx * k; sy = H / 2 + dy * k
    const tk = $('ticket').getBoundingClientRect(), bw = $('bowl').getBoundingClientRect()
    for (const rc of [tk, bw]) if (sx > rc.left - 30 && sx < rc.right + 30 && sy > rc.top - 30 && sy < rc.bottom + 30) sy = rc.bottom + 34
    ar.style.left = sx + 'px'; ar.style.top = sy + 'px'
    ar.querySelector('svg').style.transform = `rotate(${Math.atan2(dx, -dy)}rad)`
  }
}

// ---------------------------------------------------------------- 出来事
function onRunnerEvent(e) {
  log.push({ src: 'r', ...e, at: sh ? +sh.t.toFixed(2) : 0 })
  if (e.t === 'wire') { sfx('wire', { vol: 0.7 }); sfx('hook', { vol: 0.5, delay: 0.06 }) }
  else if (e.t === 'wireMiss') {
    sfx('wire', { vol: 0.4, rate: 1.3 })
    const tp = me._tap
    if (e.far && tp && tp.sx != null) { const el = $('miss'); el.style.left = tp.sx + 'px'; el.style.top = tp.sy + 'px'; el.classList.remove('hidden'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('hidden'), 800) }
  }
  else if (e.t === 'land') { sfx('land', { vol: Math.min(1, 0.3 + e.impact / 20) }); if (e.impact > 14) { sfx('bonk', { vol: 0.5 }); fx.addShake(Math.min(0.6, e.impact / 40)) } }
  else if (e.t === 'bonk') { sfx('bonk', { vol: 0.8 }); fx.addShake(0.4) }
  else if (e.t === 'ped') { sfx('bonk', { vol: 0.6, rate: 1.2 }); fx.addShake(0.3); say(t('bumpPed'), 1.4) }
  else if (e.t === 'car') { sfx('bonk', { vol: 1, rate: 0.8 }); fx.addShake(0.7); say(t('bumpCar'), 1.6) }
}
function onShiftEvent(e) {
  log.push({ src: 's', ...e, at: +sh.t.toFixed(2) })
  const o = curOrder(sh)
  if (e.t === 'pickup') { sfx('shop', { vol: 0.8 }); const cl = t('custLine')[o.place[0]]; say(cl ? `<small>${placeName(o)}${lang === 'ja' ? 'のお客' : ''}</small>${cl}` : `<small>${t('masterName')}</small>${t('pickup')(dishName(o), placeName(o), o.floor)}`, 2.6) }
  else if (e.t === 'spill') {
    sfx('slosh', { vol: 0.5 + e.level / 200 }); if (e.level >= 50) sfx('dish', { vol: 0.6 })
    bowlWord(t('spill')[e.level]); const b = $('bowl'); b.classList.remove('tilt'); void b.offsetWidth; b.classList.add('tilt')
    const m = model.group.position; fx.debrisAt(m.x, m.y + 0.9, m.z, 6, 0xc9862f, { speed: 3, up: 2, size: 0.08 })
  } else if (e.t === 'tooFast') say(t('tooFast'), 1.2)
  else if (e.t === 'late') { sfx('tick', { vol: 0.7 }); say(t('lateMsg'), 1.2) }
  else if (e.t === 'throw') sfx('throw')
  else if (e.t === 'drop') { sfx('crash', { vol: 0.9 }); sfx('dish'); fx.debrisAt(e.x, 0.5, e.z, 14, 0xc9ced3, { speed: 6, up: 5, size: 0.15 }) }
  else if (e.t === 'deliver') {
    const R = T[lang].react
    const line = e.how === 'drop' ? R.drop : e.reason === 'mess' ? R.mess : e.reason === 'late' ? R.late : e.how === 'throw' ? R.throwOk : e.mess < 25 && e.late === 0 ? R.good : R.ok
    if (e.angry) { sfx('grunt', { vol: 0.9 }); } else { sfx('ding', { vol: 0.8 }); if (e.tip) sfx('coin', { vol: 0.7, delay: 0.25 }) }
    say(`${line}<small>${e.tip ? t('tip')(e.tip) : t('noTip')}</small>`, 2.4)
    // 一番いい受け渡しの瞬間を明細の写真にする
    const score = (e.angry ? 0 : 100) + (e.how === 'throw' ? 30 : 0) - e.mess
    if (score > photoScore) { photoScore = score; snapNext = true }
  } else if (e.t === 'allDone' || e.t === 'timeUp') { say(e.t === 'allDone' ? t('allDone') : t('timeUp'), 2); endAt = 1.6 }
}
let snapNext = false
const log = []

// ---------------------------------------------------------------- 結果
function showResult() {
  mode = 'result'
  Snd.loop('wind', null); Snd.loop('bgm', null)
  const p = payData(sh, lang), d = { lang, no: 4, job: t('job'), date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'), wage: JOB.wage, hours: JOB.hours, pay: p.pay, ded: p.ded, boss: t('boss') }
  const net = totals(d).net
  const C = t('comments'), R = sh.results
  const messy = R.filter(r => r.reason === 'mess').length, late = R.filter(r => r.reason === 'late').length
  d.comment = p.drops ? C.drop : p.ok <= 1 ? C.few : messy > late && messy ? C.mess : late ? C.late : p.ok >= 4 && !p.claims ? C.great : C.ok
  const st = t('stamps'); d.stamp = net >= 7000 ? st[3] : net >= 5000 ? st[2] : net >= 3500 ? st[1] : st[0]
  d.stampK = 1; d.photo = photo; d.footer = 'tom3games.github.io/sky-delivery'
  // 出前の記録: 1件ずつ、何をどう届けて客がどうだったか
  const ja = lang === 'ja', RL = T[lang].react
  d.logTitle = ja ? '今日の出前' : "Today's orders"
  d.log = sh.targets.slice(0, JOB.orders).map((o, i) => {
    const r = R[i]
    if (!r) return { no: i + 1, text: ja ? `${placeName(o)}へ ${dishName(o)}` : `${dishName(o)} to ${placeName(o)}`, note: ja ? '届かず' : 'never arrived', bad: true }
    const how = r.how === 'drop' ? (ja ? '落とした' : 'dropped') : r.how === 'throw' ? (ja ? '投げ入れ' : 'thrown in') : (ja ? '手渡し' : 'handed')
    const note = r.how === 'drop' ? how : r.reason === 'mess' ? (ja ? `${how}・こぼれすぎ` : `${how}, spilled`) : r.reason === 'late' ? (ja ? `${how}・${r.late}秒遅れ` : `${how}, ${r.late}s late`) : r.tip ? (ja ? `${how}・チップ${r.tip}円` : `${how}, tip ¥${r.tip}`) : how
    return { no: i + 1, text: ja ? `${placeName(o)}へ ${dishName(o)}` : `${dishName(o)} to ${placeName(o)}`, note, bad: r.angry }
  })
  drawPayslip($('slip'), d, { main: '#1f2a44', dark: '#121a2e', accent: '#c8341f', bg: '#2a2016' })
  sfx(net >= 5000 ? 'win' : net >= 3500 ? 'meh' : 'lose', { vol: 0.8 })
  $('btnPost').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(t('postText')(net, p.ok)) + '&url=' + encodeURIComponent(URL_)
  $('touch').classList.add('hidden')
  show('result')
  window.__lastNet = net
}
$('btnSave').onclick = () => { $('slip').toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'sky-delivery-payslip.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) }) }
$('btnStart').onclick = () => startShift()
$('btnAgain').onclick = () => startShift()
$('btnTitle').onclick = () => toTitle()
$('btnHow').onclick = () => { Snd.init(); show('how') }
for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => show('title')
$('btnLang').onclick = () => { lang = lang === 'ja' ? 'en' : 'ja'; store.set('sky.lang', lang); applyLang() }
$('btnMute').onclick = () => { Snd.init(); Snd.setMute(!Snd.muted); store.set('sky.mute', Snd.muted ? '1' : '0'); applyLang() }
$('btnPause').onclick = () => setPause(true)
$('btnResume').onclick = () => setPause(false)
$('btnQuit').onclick = () => { setPause(false); toTitle() }

// ---------------------------------------------------------------- カメラ
const lerpAngle = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k }
function updateCamera(dt, c) {
  if (window.__freeze) return
  const pos = model.group.position
  const v = Math.hypot(c.vx, c.vz)
  let hx = Math.sin(c.yaw), hz = Math.cos(c.yaw)
  if (v > 8) { const k = c.grounded ? 0.25 : 0.45; hx = hx * (1 - k) + (c.vx / v) * k; hz = hz * (1 - k) + (c.vz / v) * k; const l = Math.hypot(hx, hz); hx /= l; hz /= l }
  // スマホはカメラを自分で回す（追いかけない。WIRE ESCAPE と同じ。スティックの向きがぶれない）。PC はなぞってから 1.8 秒で後ろへ戻る
  const manual = touchMode || performance.now() - cam.userT < 1800
  if (!manual) { cam.hd = lerpAngle(cam.hd, Math.atan2(hx, hz), 1 - Math.exp(-dt * (touchMode ? 2.2 : 5))); cam.pitch += (0.15 - cam.pitch) * (1 - Math.exp(-dt * 1.5)) }
  hx = Math.sin(cam.hd); hz = Math.cos(cam.hd)
  let back = 5.2 + Math.min(2.4, v * 0.07), up = 2.1
  if (camera.aspect < 1) { back += 0.6; up += 0.5 }
  up += cam.pitch * 4.2; back *= 1 - Math.max(0, cam.pitch) * 0.15
  let tx = pos.x - hx * back, tz = pos.z - hz * back, ty = pos.y + up
  // 建物に埋まらないよう手前に寄せる
  for (let i = 1; i <= 6; i++) {
    const f = i / 6, px = pos.x + (tx - pos.x) * f, pz = pos.z + (tz - pos.z) * f, py = pos.y + (ty - pos.y) * f
    let hit = false
    for (const o of world.nearby(px, pz)) {
      if (o.slab || o.kind === 'bound' || o.y0 == null || py < o.y0 || py > o.y1) continue
      const cs = Math.cos(o.yaw || 0), sn = Math.sin(o.yaw || 0), dx = px - o.cx, dz = pz - o.cz
      if (Math.abs(dx * cs - dz * sn) < o.hw + 0.4 && Math.abs(dx * sn + dz * cs) < o.hl + 0.4) { hit = true; break }
    }
    if (hit) { const ff = Math.max(0.25, (i - 1) / 6); tx = pos.x + (tx - pos.x) * ff; tz = pos.z + (tz - pos.z) * ff; ty = pos.y + up * 0.8 + (1 - ff) * 2; break }
  }
  const gy = world.groundAt(tx, tz, ty).h + 0.8
  if (ty < gy) ty = gy
  cam.off.lerp(_v.set(tx - pos.x, ty - pos.y, tz - pos.z), 1 - Math.exp(-dt * 10))
  cam.pos.set(pos.x + cam.off.x, pos.y + cam.off.y, pos.z + cam.off.z)
  cam.lookOff.lerp(_v.set(hx * 10, (camera.aspect < 1 ? 0.4 : 1.1) + 1.3 - cam.pitch * 1.2, hz * 10), 1 - Math.exp(-dt * 12))
  cam.look.set(pos.x + cam.lookOff.x, pos.y + cam.lookOff.y, pos.z + cam.lookOff.z)
  camera.position.copy(cam.pos)
  const sh_ = fx.shake
  if (sh_ > 0) camera.position.add(_v.set((Math.random() - 0.5) * sh_, (Math.random() - 0.5) * sh_ * 0.7, (Math.random() - 0.5) * sh_))
  camera.lookAt(cam.look)
  const asp = camera.aspect
  const base = asp >= 1 ? 60 : Math.min(84, 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(37)) / asp) * 180 / Math.PI)
  const fov = base + Math.min(12, Math.hypot(c.vx, c.vy, c.vz) * 0.28)
  cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 4))
  camera.fov = cam.fov; camera.updateProjectionMatrix()
}

// ---------------------------------------------------------------- ループ
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); fx.setScale && fx.setScale(h) }
addEventListener('resize', resize); resize()
let last = performance.now(), acc = 0, frameN = 0
function stepOnce() {
  if (mode === 'play' && !paused && me && !sh.over) {
    const { inp, th } = gather()
    me.events.length = 0
    street.update(STEP, me)
    stepRunner(me, inp, STEP, world)
    street.collide(me)
    stepShift(sh, me, STEP, { throwNow: th })
    for (const e of me.events) onRunnerEvent(e)
    for (const e of sh.events) onShiftEvent(e)
    sh.events.length = 0
  } else if (mode === 'title' && demo) {
    const inp = botInput(demo.b, demo.r, demo.sh, world, STEP)
    demo.r.events.length = 0
    street.update(STEP, demo.r)
    stepRunner(demo.r, inp, STEP, world)
    street.collide(demo.r)
    stepShift(demo.sh, demo.r, STEP, { throwNow: !!inp.throw })
    demo.sh.events.length = 0
    if (demo.sh.over) demo.sh = createShift(world, Math.floor(Math.random() * 1000))
  }
}
function frame() {
  requestAnimationFrame(frame)
  const now = performance.now()
  let dt = Math.min(0.1, (now - last) / 1000); last = now
  if (!dbgPause) { acc += dt; let n = 0; while (acc >= STEP && n < 6) { stepOnce(); acc -= STEP; n++ } if (n >= 6) acc = 0 }
  else dt = 0
  render(dt || 0.016)
}
function render(dt) {
  const c = mode === 'title' ? demo && demo.r : me
  const shift = mode === 'title' ? demo && demo.sh : sh
  if (c && model) {
    model.update(c, dt)
    model.okamochi.visible = !!(shift && shift.carrying)
    if (c.rope) { const h = model.handWorld; ropeMesh.visible = true; ropeMesh.position.copy(h); ropeMesh.lookAt(c.rope.x, c.rope.y, c.rope.z); ropeMesh.scale.set(1, 1, Math.max(0.1, h.distanceTo(_v.set(c.rope.x, c.rope.y, c.rope.z)))) }
    else ropeMesh.visible = false
    updateCamera(dt, c)
    // 太陽の影を人の周りに合わせる
    const d = sun.userData.dir; sun.position.set(c.x + d.x * 150, c.y + d.y * 150, c.z + d.z * 150); sun.target.position.set(c.x, c.y, c.z)
  }
  // 届け先と投げた料理
  const o = shift && curOrder(shift)
  target.visible = !!(o && (shift.carrying || shift.thrown))
  if (target.visible) {
    target.position.set(o.x - o.nx * 0.65, o.y, o.z - o.nz * 0.65)
    target.rotation.y = Math.atan2(o.nx, o.nz)
    const k = performance.now() / 1000
    const ud = target.userData
    if (ud.person.show(o.idx != null ? o.idx : shift.idx)) { ud.cust.visible = false; ud.person.group.visible = true; ud.person.update(dt) }
    else { ud.cust.visible = true; ud.cust.rotation.z = Math.sin(k * 6) * 0.08 }
    target.userData.lan.position.y = 0.4 + Math.sin(k * 2) * 0.05
    const dT = camera.position.distanceTo(target.position); target.userData.lan.scale.setScalar(Math.max(1, dT / 30))
  }
  shopGroup.userData.ring.material.opacity = shift && !shift.carrying && !shift.thrown ? 0.55 + Math.sin(performance.now() / 250) * 0.25 : 0.15
  const th = shift && shift.thrown
  flying.visible = !!th
  if (th) { flying.position.set(th.x, th.y, th.z); flying.rotation.x += dt * 8; flying.rotation.y += dt * 5 }
  // キーボードの狙い（PCだけ）
  aimMark.visible = false
  // 大きいボタン（E）で掛かる所に輪を出す（スマホも。WIRE ESCAPE と同じ）
  if (mode === 'play' && me && !me.rope && frameN % 4 === 0) aimMark.userData.p = findAnchor(world, me)
  const aimOn = mode === 'play' && me && !me.rope && !!aimMark.userData.p
  if (aimOn) { const p = aimMark.userData.p; aimMark.visible = true; aimMark.position.set(p.x, p.y, p.z); aimMark.lookAt(camera.position); aimMark.scale.setScalar(Math.max(1, camera.position.distanceTo(aimMark.position) * 0.04)) }
  const wb = document.querySelector('.tbtn[data-k=wire]'); if (wb && wb._aim !== aimOn) { wb._aim = aimOn; wb.classList.toggle('aim', aimOn) }
  // 風の音は速さで
  if (mode === 'play' && me) { const v3 = Math.hypot(me.vx, me.vy, me.vz); const wl = Snd.loops.wind; if (wl && wl.g) wl.g.gain.value = Math.min(0.5, Math.max(0, (v3 - 8) / 40)) }
  // 車と通行人（カメラの近くだけ描く）、昼→夜
  carsDraw.draw(street.traffic.cars, camera.position, dt); pedsDraw.draw(street.peds, camera.position, dt)
  applyDayTime(mode === 'play' && sh ? Math.min(1, sh.t / JOB.shiftSec) : mode === 'result' && sh ? 1 : 0)
  skyTint.position.copy(camera.position)
  fx.update(dt)
  fx.shake = Math.max(0, fx.shake - dt * 2.5)
  if (mode === 'play' && sh) {
    if (hintAt > 0 && !paused) { hintAt -= dt; if (hintAt <= 0 && sh.results.length === 0) say(touchMode ? t('hintWire') : t('hintWirePc'), 3.2) }
    updateHud(dt)
    if (endAt > 0) { endAt -= dt; if (endAt <= 0) { showResult() } }
  }
  renderer.render(scene, camera)
  if (snapNext) { snapNext = false; const c2 = document.createElement('canvas'); c2.width = 640; c2.height = Math.round(640 * innerHeight / innerWidth); c2.getContext('2d').drawImage(renderer.domElement, 0, 0, c2.width, c2.height); photo = c2 }
  frameN++
}

// ---------------------------------------------------------------- 検証用の窓口
window.sky = {
  get mode() { return mode }, log, get me() { return me }, get sh() { return sh }, JOB, RUN, world, camera, touchMode,
  start: seed => startShift(seed), toTitle, showResult, setLang: l => { lang = l; applyLang() }, get lang() { return lang },
  dbg: {
    pause: on => { dbgPause = on }, step: n => { for (let i = 0; i < n; i++) stepOnce(); render(STEP) },
    teleport: (x, y, z, yaw) => { Object.assign(me, { x, y, z, vx: 0, vy: 0, vz: 0, rope: null, climbing: null, grounded: y < 0.1 }); if (yaw != null) me.yaw = yaw },
    pressWire: (sx, sy) => aimAt(sx, sy), pressJump: () => { press.jump = true }, pressThrow: () => { press.throw = true }, wireAuto: () => { pendingWire = { at: null, key: true } },
    keys, stick, say, setMess: m => { sh.mess = m }, target, get model() { return model }
  }
}
applyLang()
toTitle()
requestAnimationFrame(frame)
setTimeout(() => { $('boot').classList.add('hidden'); window.__skyReady = true }, 50)
