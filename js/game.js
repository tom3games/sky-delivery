// 空中出前 宙吊軒（1日だけ職場体験 #4）。WIRE ESCAPE のワイヤーと街を使った出前ゲーム
// 速く飛ぶと料理が崩れて怒られる、ゆっくりだと遅れて怒られる
import * as THREE from 'three'
import { GAME } from '../shared/config.js?v=13'
import { createWorld } from '../shared/track.js?v=13'
import { buildScene } from './scene.js?v=13'
import { FX } from './fx.js?v=13'
import { loadSky, setAniso } from './look.js?v=13'
import { Q } from './quality.js?v=13'
import { RunnerModel } from './runnermodel.js?v=13'
import { CharRunnerModel, Customer, loadCharAssets, charAssets } from './charmodel.js?v=13'
import { createRunner, stepRunner, findAnchor, rayHit, floorAt, RUN } from '../shared/runner.js?v=13'
import { JOB, createShift, stepShift, curOrder, payData, money, earned } from '../shared/delivery.js?v=13'
import { createBot, botInput } from '../shared/bot.js?v=13'
import { drawPayslip, totals } from './payslip.js?v=13'
import { createStreet, buildPoles } from '../shared/street.js?v=13'
import { addTown, clearShopFront } from '../shared/town.js?v=13'
import { buildPoles3d, buildHouses3d, trafficPool, pedPool } from './street3d.js?v=13'
import { carLights } from './carmodel.js?v=13'
import { LOW } from './quality.js?v=13'
import { createAir, stepAir } from '../shared/air.js?v=13'
import { airPool } from './air3d.js?v=13'

const $ = id => document.getElementById(id)
// ---------------------------------------------------------------- 読み込みの進み具合（ロード画面）
const LM = THREE.DefaultLoadingManager, bootP = { done: 0, total: 0 }
LM.onStart = LM.onProgress = (url, a, b) => { bootP.done = a; bootP.total = b; bootP.at = performance.now(); window.__bootSet && window.__bootSet(0.2 + 0.8 * (b ? a / b : 0)) }
window.__bootDbg = () => ({ ...bootP, ch: charAssets.ready, chFail: charAssets.failed, now: Math.round(performance.now()) })   // 検証用
function bootWatch(onReady) {
  const t0 = performance.now()
  const tick = () => {
    // three は同じ画像を何体ぶんも読む時に数が合わなくなることがある（72% で止まった）。人物が読めて、1.5秒新しい読み込みが無ければ終わりとみなす
    const quiet = performance.now() - (bootP.at || 0) > 1500
    const done = bootP.total > 0 && (bootP.done >= bootP.total || quiet) && (charAssets.ready || charAssets.failed)
    if (done || performance.now() - t0 > 40000) {   // 40 秒たっても終わらない時は遊べる所まで進める
      window.__bootDone = true; window.__bootSet && window.__bootSet(1)
      const b = $('boot'); b.classList.add('out'); setTimeout(() => b.classList.add('hidden'), 380)
      onReady(); return
    }
    setTimeout(tick, 120)
  }
  tick()
}
const STEP = GAME.step
const URL_ = 'https://tom3games.github.io/sky-delivery/'
const store = { get: k => { try { return localStorage.getItem(k) } catch (e) { return null } }, set: (k, v) => { try { localStorage.setItem(k, v) } catch (e) {} } }

// ---------------------------------------------------------------- 文言（日英）
const T = {
  ja: {
    series: '1日だけ職場体験 #4', logo: '空中出前', masterName: '店主', masterLine: '4分で稼げるだけ稼いでこい。遠いほど高いで',
    start: '出勤する', how: '仕事の説明', lang: 'EN', more: 'ほかのゲーム', muteOn: '音 入', muteOff: '音 切', loading: 'スープを仕込んでいます',
    howTitle: '出前の心得', ok: 'わかった',
    howItems: [
      'ビルを<b>タッチ</b>でワイヤー。大きいボタンなら前の上へ自動で',
      '注文は<b>近場</b>が多く、ときどき<b>遠方</b>。遠いほど高い',
      '急ぐほど<b>丼の中身が減る</b>。地面を走ると<b>麺がのびる</b>',
      '4分のあいだ注文は途切れない。<b>稼げるだけ稼ぐ</b>'
    ],
    hintWire: '<small>こつ</small>ビルをタッチするとワイヤーが出る', hintWirePc: '<small>こつ</small>ビルをクリック（か E）でワイヤー',
    keysPc: 'PC: WASD・矢印で移動　クリックでワイヤー（E は前の上へ自動）　Space ジャンプ　ドラッグで見回す',
    keysTouch: '左のスティックで移動、画面をタッチでワイヤー、なぞると見回す。壁に向かって走ると登れる',
    credit: '音: Kenney, rubberduck, artisticdude, poinl, Almitory ほか（CC0）。詳しくは CREDITS.md',
    hUp: m => `上に ${m}m`, hDown: m => `下に ${m}m`, hSame: '同じ高さ', hFloor: f => `${f}階`, hShop: '店先',
    ticketHead: '御伝票', shiftLeft: '残り', toShop: '店に戻って受け取る', shopName: '宙吊軒', nth: n => `${n}件目`, earn: y => `稼ぎ ${y.toLocaleString()}円`,
    pickHead: '次の注文', offerNear: (d, m, y) => `近場 ${m}m ${y.toLocaleString()}円`, offerFar: (d, m, y) => `遠方 ${m}m ${y.toLocaleString()}円`,
    signNear: '近場', signFar: '遠方', signWait: '出前中', yen: y => `${y.toLocaleString()}円`,
    zone: { canal: '運河の向こう', tower: '高層の上の階', edge: '街の外れ', far: '遠くのビル' },
    custNote: { duf: '※デュフ', polite: '※遅れても怒らない', coins: '※小銭で払う', photo: '※写真を撮る。崩すな', net: '※網で受け取る' },
    floor: (p, f) => `${p}（${f}階の窓）`, dist: d => `あと${d}m`, sec: s => `${s}秒`, late: s => `${s}秒遅れ`,
    pause: '休憩', paused: '休憩中', resume: '戻る', quit: '店を出る（やめる）',
    jump: '跳ぶ', throw: '投げる', tooFar: '届かない', bumpPed: '<small>通行人</small>ちょっと！ 前見て！', bumpCar: '<small>運転手</small>危ないやろ！ 歩道歩け！',
    crowHit: '<small>カラス</small>カァッ！', ballWarn: { river: '<small>河川敷の少年野球</small>危なーい！', lot: '<small>空き地の草野球</small>危なーい！' },
    ballSorry: ['<small>打った子</small>すみませーん！', '<small>打った子</small>すみませーん！ ボール取ってくださーい！', '<small>打った子</small>ナイスキャッチ…すみませーん！'],
    spill: { 25: 'スープが揺れてる', 50: '半分こぼれた', 75: 'ほとんど残ってない' }, soggy: { 8: '麺がのびてきた', 16: '麺がのびのび' },
    pickup: (d, p, f) => `はい次、${d}。${p}の${f}階や`,
    pickupFar: (z) => `${z}や。気張って行け`,
    custPick: { duf: 'デュフ…デュフフ…デュフ', polite: 'お忙しいところ誠に恐れ入ります。どうか、お気をつけて', coins: '小銭しかないけど、ええかな？', photo: '映えるように持ってきてな。崩したらあかんで', net: '網で取るから、窓の近くまででええよ' },
    dufMaster: '…いつもの人や',
    custNear: { duf: 'デュフフフッ', polite: 'ようこそ、ようこそお越しくださいました', coins: '（ジャラジャラ…数えてる）', photo: '（カシャカシャカシャ）', net: '網、こっちやで！ ほら！' },
    custReact: {
      duf: { good: 'デュフフフフフッ！！', ok: 'デュフ', mess: 'デュ…フ…', late: '……デュフ' },
      polite: { good: '誠に、誠にありがとうございます', ok: '大変結構でございます', mess: '…大変、個性的な盛り付けで', late: 'いえいえ、待つのも修行でございます' },
      coins: { good: '1円玉で払うわ。数えてな', ok: 'はい、1円玉で', mess: '1円玉1枚で十分やろ', late: '遅れた分、1円玉抜いとくで' },
      photo: { good: '映えるー！ 100枚撮るわ', ok: '加工したらいける', mess: 'これは撮られへん…', late: '湯気が映らへんやん' },
      net: { good: '網でキャッチ！ 大漁や', ok: '網に麺が絡まった', mess: '網からスープが全部漏れた', late: '網持ったまま腕つったわ' }
    },
    coinTip: n => `1円玉 ${n.toLocaleString()}枚`,
    custLine: { '事務所': '昼休み終わる前に頼むで', '美容室': 'パーマ中で動かれへん。窓まで頼むわ', '法律事務所': '一滴でもこぼれてたら訴えるからな', '歯医者': '麻酔切れる前に食べたいねん', 'ネイルサロン': '爪乾かしてるから、そっと渡してな', '設計事務所': '徹夜明けや。熱いうちに頼む', '塾': '休み時間10分しかないねん', '探偵事務所': '張り込み中や。目立たんように来てくれ', '会議室': '会議の前に来てや。遅れたら気まずい', 'ヨガ教室': 'ゆっくりでええ。でも麺はのばさんといて', 'お宅': '子どもが寝とるから、玄関やなくて2階の窓に頼むわ' },
    tooFast: '速すぎて受け取れん！', lateMsg: '遅れてるで！',
    react: { good: '早っ！ 熱いうちにいただきます', ok: 'ちょっと減ってるけど、まあええわ', throwOk: '窓から入ってきた！？', mess: 'スープどこいったん？ もう頼まん', late: 'のびのびやん…', drop: '下に落ちたで！' },
    tip: y => `チップ ${y.toLocaleString()}円`, noTip: 'チップなし', allDone: '全部届けた！', timeUp: 'シフト終わり', timeUpHand: '時間切れ。持ったままや',
    job: '空中出前', boss: '店主', again: 'もう一回', save: '画像を保存', post: 'Xでポスト', toTitle: 'タイトル',
    comments: { great: 'ようやった。明日も来てくれ', mess: '速いのはええけど、丼の中身が旅に出とる', late: '丁寧なんはええけど、麺がのびきっとるで', drop: '人の頭の上に料理を降らすな', few: '空ばっかり見とらんと、出前もしてくれ', ok: 'まあまあや。次は崩さず早く', far: '運河の向こうまでようやった。足が速いな', duf: 'デュフフの人からチップもろたんか。あの人、ええ人やで', hand: '持ったまま帰ってくるな。時計も見てくれ' },
    stamps: ['不採用', '要研修', '採用', '即採用'],
    postText: (y, n) => `空中出前のバイトで4分間に${n}件届けて${y.toLocaleString()}円稼いだ`
  },
  en: {
    series: 'ONE-DAY JOB #4', logo: 'Sky Delivery', masterName: 'Chef', masterLine: 'Four minutes. Earn what you can. Far pays more.',
    start: 'Clock in', how: 'How to work', lang: 'JP', more: 'More games', muteOn: 'Sound on', muteOff: 'Muted', loading: 'Simmering the soup',
    howTitle: 'Delivery rules', ok: 'Got it',
    howItems: [
      '<b>Tap</b> a building to shoot a wire. The big button aims ahead for you',
      'Most orders are <b>near</b>, now and then a <b>far</b> one. Far pays more',
      'Rush and <b>the soup spills</b>. Run on the ground and <b>the noodles go soggy</b>',
      'Orders never stop for 4 minutes. <b>Earn as much as you can</b>'
    ],
    hintWire: '<small>Tip</small>Tap a building to shoot a wire', hintWirePc: '<small>Tip</small>Click a building (or E) to wire',
    keysPc: 'PC: WASD / arrows move · click to wire (E auto-aims) · Space jump · drag to look',
    keysTouch: 'Left stick moves, tap to wire, drag to look around. Run into a wall to climb it',
    credit: 'Sounds: Kenney, rubberduck, artisticdude, poinl, Almitory and others (CC0). See CREDITS.md',
    hUp: m => `${m}m up`, hDown: m => `${m}m down`, hSame: 'Same height', hFloor: f => `Floor ${f}`, hShop: 'Shop',
    ticketHead: 'ORDER', shiftLeft: 'Left', toShop: 'Back to the shop', shopName: 'Chuzuri-ken', nth: n => `#${n}`, earn: y => `Earned ¥${y.toLocaleString()}`,
    pickHead: 'Next order', offerNear: (d, m, y) => `Near ${m}m ¥${y.toLocaleString()}`, offerFar: (d, m, y) => `Far ${m}m ¥${y.toLocaleString()}`,
    signNear: 'NEAR', signFar: 'FAR', signWait: 'OUT', yen: y => `¥${y.toLocaleString()}`,
    zone: { canal: 'across the canal', tower: 'high floor', edge: 'edge of town', far: 'far building' },
    custNote: { duf: '* doo-fu', polite: '* never minds lateness', coins: '* pays in 1-yen coins', photo: '* takes photos. Do not spill', net: '* catches it with a net' },
    floor: (p, f) => `${p} (floor ${f} window)`, dist: d => `${d} m`, sec: s => `${s}s`, late: s => `${s}s late`,
    pause: 'Break', paused: 'On break', resume: 'Back to work', quit: 'Leave (quit)',
    jump: 'Jump', throw: 'Throw', tooFar: 'Too far', bumpPed: '<small>Passer-by</small>Hey! Watch it!', bumpCar: '<small>Driver</small>Get off the road!',
    crowHit: '<small>Crow</small>CAW!', ballWarn: { river: '<small>Little league by the river</small>Heads up!', lot: '<small>Sandlot game</small>Heads up!' },
    ballSorry: ['<small>The kid who hit it</small>Sorryyy!', '<small>The kid who hit it</small>Sorry! Can you throw it back?', '<small>The kid who hit it</small>Nice catch... sorry!'],
    spill: { 25: 'Soup is sloshing', 50: 'Half of it is gone', 75: 'Almost nothing left' }, soggy: { 8: 'Noodles getting soggy', 16: 'Soggy noodles' },
    pickup: (d, p) => `Next: ${d} for the ${p}`,
    pickupFar: (z) => `That one is ${z}. Go!`,
    custPick: { duf: 'Doo-fu... doo-fufu... doo-fu', polite: 'I am terribly sorry to trouble you. Please, please be careful', coins: 'I only have coins. Is that okay?', photo: 'Make it look good. Do not spill a drop', net: 'I will catch it with a net. Just come near the window' },
    dufMaster: '...that guy again',
    custNear: { duf: 'Doo-fufufu', polite: 'Welcome, welcome, thank you for coming', coins: '(counting coins...)', photo: '(click click click)', net: 'Over here! The net!' },
    custReact: {
      duf: { good: 'Doo-fufufufu!!', ok: 'Doo-fu', mess: 'Doo...fu...', late: '...doo-fu' },
      polite: { good: 'Thank you, thank you most sincerely', ok: 'Most splendid, thank you', mess: 'What a... unique presentation', late: 'Not at all. Waiting builds character' },
      coins: { good: 'Here, in 1-yen coins. Count them', ok: 'Here you go, all 1-yen coins', mess: 'One coin is enough for that', late: 'I took out a few coins for the wait' },
      photo: { good: 'So pretty! 100 photos!', ok: 'A filter will fix it', mess: 'I cannot post this...', late: 'The steam is gone from the shot' },
      net: { good: 'Caught it! What a haul!', ok: 'Noodles stuck in the net', mess: 'The soup leaked through the net', late: 'My arms cramped holding the net' }
    },
    coinTip: n => `${n.toLocaleString()} one-yen coins`,
    custLine: { '事務所': 'Before my lunch break ends, please', '美容室': 'I am mid-perm. Bring it to the window', '法律事務所': 'One drop spilled and I will sue', '歯医者': 'I want to eat before the anesthetic wears off', 'ネイルサロン': 'My nails are drying. Hand it over gently', '設計事務所': 'Up all night. Bring it hot', '塾': 'I only have a 10-minute break', '探偵事務所': 'I am on a stakeout. Do not make a scene', '会議室': 'Before the meeting starts, please', 'ヨガ教室': 'Take it easy. Just do not let the noodles go soggy', 'お宅': 'The baby is asleep. Bring it to the upstairs window, not the door' },
    tooFast: 'Too fast to grab it!', lateMsg: 'You are late!',
    react: { good: 'Already? Still hot, thanks!', ok: 'A bit spilled, but fine', throwOk: 'It flew in the window!?', mess: 'Where did the soup go?', late: 'The noodles are soggy…', drop: 'It fell on the street!' },
    tip: y => `Tip ¥${y.toLocaleString()}`, noTip: 'No tip', allDone: 'All delivered!', timeUp: 'Shift over', timeUpHand: 'Time up. Still holding one',
    job: 'Sky delivery', boss: 'Chef', again: 'Again', save: 'Save image', post: 'Post on X', toTitle: 'Title',
    comments: { great: 'Good work. Come back tomorrow', mess: 'Fast, sure. The soup went on its own trip', late: 'Careful is nice. The noodles are mush', drop: 'Stop raining food on people', few: 'Stop sightseeing and deliver', ok: 'Not bad. Faster and cleaner next time', far: 'All the way across the canal. Fast legs', duf: 'The doo-fu guy tipped you? He is a good man', hand: 'Do not come back still holding it. Watch the clock' },
    stamps: ['REJECT', 'TRAINING', 'HIRED', 'HIRED!'],
    postText: (y, n) => `I delivered ${n} orders by wire in 4 minutes and earned ¥${y.toLocaleString()}`
  }
}
const PLACE_EN = {}
const RANK = [10000, 7500, 5000]   // 即採用・採用・要研修の境目（手取り）。tools/sim.mjs の bot で決めた
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
  throw: 'snd/swish-5.mp3', whoosh: 'snd/swish-5.mp3', crow: ['snd/crow_1.mp3', 'snd/crow_2.mp3'], flap: 'snd/wingflap.mp3', bat: 'snd/bat_crack.mp3', gon: 'snd/ball_hit.mp3', land: ['snd/footstep_01.mp3', 'snd/footstep_02.mp3'], bonk: ['snd/thwack-01.mp3', 'snd/thwack-03.mp3'],
  slosh: ['snd/splash_01.mp3', 'snd/splash_02.mp3'], dish: ['snd/dishes_01.mp3', 'snd/dishes_02.mp3', 'snd/dishes_03.mp3'],
  ding: 'snd/bell_ding1.mp3', coin: 'snd/coin_drop.mp3', squeak: ['snd/squeak_1.mp3', 'snd/squeak_2.mp3', 'snd/squeak_3.mp3'],
  coins: ['snd/coins_1.mp3', 'snd/coins_2.mp3', 'snd/coins_3.mp3'], cloth: ['snd/cloth_1.mp3', 'snd/cloth_2.mp3'], grunt: ['snd/grunt_01.mp3', 'snd/grunt_02.mp3', 'snd/grunt_03.mp3', 'snd/grunt_04.mp3'],
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
clearShopFront(world, JOB.shop)   // 見た目を作る前に（店の前の木を抜く）
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
  shopGroup.position.set(S.x + 6, 0, S.z)
}
scene.add(shopGroup)
// 受け取りの輪は1つ（暖簾の前）。輪の色と横の立て看板で、今の注文が近場（生成り）か遠方（赤）かを見せる
// 2026-11-03 本人「輪で選ぶのをやめて、ランダムで近場・遠方が出てくるように」
const pickRing = (() => {
  const P = JOB.pick
  const g = new THREE.Group(); g.position.set(P.x, 0, P.z)
  const ring = new THREE.Mesh(new THREE.RingGeometry(P.r - 0.5, P.r, 48), new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.6, depthWrite: false }))
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06
  const fill = new THREE.Mesh(new THREE.CircleGeometry(P.r - 0.5, 48), new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.12, depthWrite: false }))
  fill.rotation.x = -Math.PI / 2; fill.position.y = 0.05
  // 立て看板（道の側＝西を向く。輪の奥の店側、暖簾にかからない位置）
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 320
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.875), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }))
  board.position.set(P.r - 0.6, 2.3, 3.2); board.rotation.y = -Math.PI / 2
  const legM = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 })
  for (const dz of [-0.6, 0.6]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), legM); leg.position.set(board.position.x + 0.05, 1.1, board.position.z + dz); g.add(leg) }
  g.add(ring, fill, board)
  scene.add(g)
  return { g, ring, fill, cv, tex, key: '', tier: 'near' }
})()
function drawSign(o) {
  const R0 = pickRing, key = o ? lang + o.dish.id + offerYen(o) + o.zone + o.cust + o.tier : lang
  if (R0.key === key) return
  R0.key = key
  const far = !!(o && o.tier === 'far'), col = far ? 0xe0452a : 0xffe2a0
  R0.ring.material.color.setHex(col); R0.fill.material.color.setHex(col)
  const x = R0.cv.getContext('2d'), W = 256, H = 320
  x.fillStyle = far ? '#7d1d14' : '#f3ead2'; x.fillRect(0, 0, W, H)
  x.strokeStyle = far ? '#f3ead2' : '#2b1d10'; x.lineWidth = 8; x.strokeRect(10, 10, W - 20, H - 20)
  x.fillStyle = far ? '#f3ead2' : '#2b1d10'; x.textAlign = 'center'; x.textBaseline = 'middle'
  x.font = '86px "Yuji Syuku", serif'; x.fillText(o ? t(far ? 'signFar' : 'signNear') : t('signWait'), W / 2, 84)
  if (o) {
    x.font = '600 52px "Klee One", serif'; x.fillText(t('yen')(offerYen(o)), W / 2, 176)
    x.font = '600 30px "Klee One", serif'; x.fillText(far ? t('zone')[o.zone] : dishName(o), W / 2, 238)
    x.fillText(Math.round(o.dist) + 'm', W / 2, 278)
  }
  R0.tex.needsUpdate = true
}
// 店と一軒家の当たり判定・掛け点、通り沿いの電柱と街灯（2026-11-02 本人「通り抜けできてまう」「一軒家も」「電柱とか掛けられる場所を」）
const town = addTown(world, JOB.shop)
const poles3d = buildPoles3d(scene, buildPoles(world, JOB.shop))
const houses3d = buildHouses3d(scene, town.houses)
const carsDraw = trafficPool(scene, LOW), pedsDraw = pedPool(scene, LOW)
let street = createStreet(world, 1)
let air = createAir(world, 1)   // カラスと野球ボール（2026-11-03 本人「空中の邪魔を足して」）
const airDraw = airPool(scene)
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
  const person = new Customer(); person.group.position.set(0, -0.78, 0.2); person.group.visible = false
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
// 届け先の高さを見せる目印（2026-11-03 本人「方角はわかるようになったけど、やっぱ高さがわからん」）
// 1) 地面から屋上の上まで伸びる光の柱（遠くからでも、建物の向こうでも上の方が見える）と、窓の高さに光る輪
// 2) 窓の周りの光る枠（暖簾の朱色）。近づくと（40m 以内）太く明るくなる
const beam = (() => {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 128)
  g.addColorStop(0, 'rgba(255,150,60,0)'); g.addColorStop(0.12, 'rgba(255,140,50,.95)'); g.addColorStop(1, 'rgba(240,90,40,.45)')
  x.fillStyle = g; x.fillRect(0, 0, 4, 128)
  const tex = new THREE.CanvasTexture(c)
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false })   // 空の明るさに負けないよう加算でなく普通の重ね方（暖簾の朱）
  const col = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0), mat)   // 下端が原点、高さ1（scale.y で伸ばす）
  col.renderOrder = 3
  const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 6, 28), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, depthWrite: false, fog: false }))
  band.rotation.x = Math.PI / 2; band.renderOrder = 3
  const g2 = new THREE.Group(); g2.add(col, band); g2.visible = false; scene.add(g2)
  return { g: g2, col, band, mat }
})()
const winGlow = (() => {
  const m = new THREE.MeshBasicMaterial({ color: 0xff6a3a, transparent: true, opacity: 0.9, depthWrite: false, fog: false })
  const g2 = new THREE.Group(), W = 3.3, H = 2.9, T = 0.22
  for (const [w, h, x, y] of [[W + T, T, 0, H / 2], [W + T, T, 0, -H / 2], [T, H, -W / 2, 0], [T, H, W / 2, 0]]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); b.position.set(x, y, 0.03); g2.add(b) }
  target.add(g2)
  return { g: g2, m }
})()
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
let paused = false, dbgPause = false, endAt = 0, photo = null, photoScore = -1, afterDel = null
const touchMode = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
document.body.classList.toggle('is-touch', touchMode)
let hitStop = 0, fovKick = 0, flashA = 0   // 受け取り・手渡しの瞬間に少し止める・視野を一瞬動かす・光る（しっぽ取り v5 と同じ）
const cam = { hd: -Math.PI / 2, pitch: 0.15, userT: -1e9, pos: new THREE.Vector3(), off: new THREE.Vector3(-6, 3, 0), look: new THREE.Vector3(), lookOff: new THREE.Vector3(), fov: 64 }
const _v = new THREE.Vector3(), _w = new THREE.Vector3()

function spawnRunner(id) { return createRunner({ id, spawn: { x: S.x - 9, y: 0, z: S.z, yaw: Math.PI / 2 } }) }   // 店と受け取りの輪と立て看板が見える所から始める
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
  cam.hd -= dx * 0.0072; cam.pitch = Math.max(-0.35, Math.min(1, cam.pitch + dy * 0.0048)); cam.userT = performance.now()   // 見回す感度 0.006/0.004 の1.2倍（2026-11-03 本人「ほんとにちょっとだけ高く」）
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
  const b = me && me.rope ? null : rayHit(world, o.x, o.y, o.z, d.x, d.y, d.z, 400)
  let at = b
  // 地面ワイヤー: 空中にいて、画面の地面（道・屋上）をちゃんとタップした時だけ。建物にも当たる時は建物を優先（ずれたタップで地面に掛けない）
  if (me && !me.rope && !me.grounded && !me.climbing) {
    const g = groundRay(o, d, RUN.wireRange + 60)
    const tb = b ? Math.hypot(b.x - o.x, b.y - o.y, b.z - o.z) : Infinity
    if (g && !(tb < g.t + 6)) at = { x: g.x, y: g.y, z: g.z, ground: true }
  }
  pendingWire = { at, sx: cx, sy: cy }
}
// 画面の光線が最初に地面（道・橋・屋上）を下回る点。1m 刻みで進めて、最後の1m を二分して詰める
function groundRay(o, d, maxT) {
  const below = t => { const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t; return y <= floorAt(world, x, z, y).h }
  for (let t = 1; t < maxT; t += 1) {
    if (!below(t)) continue
    let a = t - 1, b2 = t
    for (let i = 0; i < 6; i++) { const m = (a + b2) / 2; if (below(m)) b2 = m; else a = m }
    const x = o.x + d.x * b2, z = o.z + d.z * b2
    return { x, y: floorAt(world, x, z, o.y + d.y * b2 + 0.5).h, z, t: b2 }
  }
  return null
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
function screenBasis() { const e = camera.matrixWorld.elements; let rx = e[0], rz = e[2], fx = -e[8], fz = -e[10]; const a = Math.hypot(rx, rz) || 1, b = Math.hypot(fx, fz) || 1; return { r: { x: rx / a, z: rz / a }, f: { x: fx / b, z: fz / b } } }
function gather() {
  let thr = 0, brk = 0, steer = 0, wallY = null, wallX = null
  if (keys.has('KeyW') || keys.has('ArrowUp')) thr = 1
  if (keys.has('KeyS') || keys.has('ArrowDown')) brk = 1
  if (keys.has('KeyA') || keys.has('ArrowLeft')) steer -= 1
  if (keys.has('KeyD') || keys.has('ArrowRight')) steer += 1
  // 画面の右と前（カメラの実際の向きから取る。cam.hd の式に頼らない）
  const SR = screenBasis().r, SF = screenBasis().f
  let moveDir = null
  if (stick.id != null) {
    // スティックはカメラの向きに対して倒した方へ走る
    // WIRE ESCAPE と同じ効き方: 倒した向き（カメラから見て）へ走る。少し倒すだけで全力
    const mag = Math.min(1, Math.hypot(stick.x, stick.y))
    if (mag > 0.15) {
      const dx = SR.x * stick.x - SF.x * stick.y, dz = SR.z * stick.x - SF.z * stick.y, l = Math.hypot(dx, dz) || 1
      moveDir = { x: dx / l, z: dz / l }; steer = 0; thr = Math.max(thr, Math.min(1, mag * 1.3))
    }
    // 壁に張り付いている時: スティックの上下で登り降り、左右で壁沿いに横へ（画面で見た左右に合わせる）
    if (me.climbing) {
      const cl = me.climbing, sideSign = SR.x * cl.nz - SR.z * cl.nx >= 0 ? 1 : -1   // 壁沿いの正の向き (nz,-nx) と画面の右をそろえる
      wallY = Math.abs(stick.y) > 0.25 ? -stick.y : 0; wallX = Math.abs(stick.x) > 0.25 ? stick.x * sideSign : 0
    }
  }
  const inp = { throttle: thr, brake: brk, steer, jump: press.jump, wire: false, wallY, wallX, moveDir }
  inp.wireYaw = moveDir ? Math.atan2(moveDir.x, moveDir.z) : touchMode ? Math.atan2(SF.x, SF.z) : undefined   // ワイヤーボタンの自動狙い: スティックの向き、スマホでは画面の前
  if (pendingWire) { inp.wire = true; if (pendingWire.at) inp.wireAt = pendingWire.at; me._tap = pendingWire; pendingWire = null }
  const th = press.throw
  press.jump = press.throw = false
  return { inp, th }
}

// ---------------------------------------------------------------- 画面の切り替え
function show(id) { for (const s of ['title', 'how', 'pause', 'result']) $(s).classList.toggle('hidden', s !== id); $('hud').classList.toggle('hidden', mode !== 'play') }
function toTitle() {
  mode = 'title'; paused = false; me = null; sh = null
  demo = { r: spawnRunner('demo'), b: createBot('skilled'), sh: createShift(world, 7) }; air = createAir(world, 7)
  newModel()
  show('title'); $('touch').classList.add('hidden')
  Snd.loop('bgm', 'snd/bgm_title.mp3', 0.22); Snd.loop('amb', 'snd/city_street_loop.wav', 0.2)
}
function startShift(seed = Math.floor(Math.random() * 1e6)) {
  Snd.init(); sfx('click')
  mode = 'play'; paused = false; demo = null; photo = null; photoScore = -1; endAt = 0; afterDel = null
  me = spawnRunner('me'); sh = createShift(world, seed); sh.seed = seed; street = createStreet(world, seed); air = createAir(world, seed)
  newModel()
  cam.hd = Math.PI / 2; cam.pitch = 0.4; cam.userT = -1e9
  show(null); $('touch').classList.toggle('hidden', !touchMode)
  Snd.loop('bgm', 'snd/bgm_play.mp3', 0.16); Snd.loop('amb', 'snd/city_street_loop.wav', 0.26); Snd.loop('wind', 'snd/wind_loop.wav', 0.0001)
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
const offerYen = o => o.fee + o.bonus + o.tipMax   // 崩さず間に合った時の見込み
const dishName = o => o.dish[lang]
function updateHud(dt) {
  const o = curOrder(sh)
  $('tNo').textContent = t('nth')(sh.idx + 1)
  $('tShift').textContent = fmt(JOB.shiftSec - sh.t)
  const ey = earned(sh); if ($('tEarn')._y !== ey) { $('tEarn')._y = ey; $('tEarn').textContent = t('earn')(ey) }
  const tTime = $('tTime'), tk = $('ticket')
  tk.classList.toggle('at-shop', !o); tk.classList.toggle('far-offer', !o && !!sh.offer && sh.offer.tier === 'far')
  if (sh.carrying || sh.thrown) {
    $('tDish').textContent = dishName(o)
    $('tTo').textContent = t('floor')(placeName(o), o.floor) + (o.zone ? ' ' + t('zone')[o.zone] : '')
    $('tNote').textContent = o.cust !== 'normal' ? t('custNote')[o.cust] : ''
    $('tDist').textContent = t('dist')(Math.round(Math.hypot(o.x - me.x, o.z - me.z)))
    const left = sh.limit - sh.held
    tTime.textContent = left >= 0 ? t('sec')(Math.ceil(left)) : t('late')(Math.ceil(-left))
    tTime.classList.toggle('late', left < 0)
  } else if (sh.offer) {
    const N = sh.offer
    $('tDish').textContent = t('pickHead')
    $('tTo').textContent = t(N.tier === 'far' ? 'offerFar' : 'offerNear')(dishName(N), Math.round(N.dist), offerYen(N))
    $('tNote').textContent = N.tier === 'far' ? t('zone')[N.zone] : dishName(N)
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
  // 画面の外の届け先へ矢印
  const goal = sh.carrying || sh.thrown ? _w.set(o.x, o.y + 1.8, o.z) : _w.set(S.x, 5.5, S.z)   // 窓の上に出す（客の顔に重ねない）
  // 方角だけを示す（2026-11-03 本人「矢印がすごい分かりづらい。高さを表現すると分かりづらい。方角だけでいい」）: 画面の上、伝票と丼のあいだに固定。水平の向きだけで回る
  const ar = $('arrow')
  ar.classList.remove('hidden')
  $('arrowD').textContent = Math.round(Math.hypot(goal.x - me.x, goal.z - me.z)) + 'm'
  ar.querySelector('svg').style.transform = `rotate(${compassAng(goal.x, goal.z)}rad)`
  // 高さ: 階数と、自分より上か下か（山形の図）と差（m）。差が小さければ「同じ高さ」
  const carryingO = sh.carrying || sh.thrown
  const dy = carryingO ? o.y - (me.y + 1.1) : (world.groundAt(S.x, S.z, 2).h) - me.y
  const hd = Math.round(Math.abs(dy)), dir = Math.abs(dy) < 2.5 ? 'same' : dy > 0 ? 'up' : 'down'
  const hb = $('heightBox')
  if (hb._k !== dir + hd + (carryingO ? o.floor : 's') + lang) {
    hb._k = dir + hd + (carryingO ? o.floor : 's') + lang
    hb.dataset.dir = dir
    $('hFloor').textContent = carryingO ? t('hFloor')(o.floor) : t('hShop')
    $('hDiff').textContent = dir === 'same' ? t('hSame') : t(dir === 'up' ? 'hUp' : 'hDown')(hd)
  }
  // 置き場所（伝票と丼のあいだ）は画面の大きさが変わった時だけ測り直す（毎フレーム測ると再レイアウトで重い）
  if (ar._W !== innerWidth || ar._H !== innerHeight) {
    ar._W = innerWidth; ar._H = innerHeight
    const tkR = $('ticket').getBoundingClientRect(), bw = $('bowl').getBoundingClientRect()
    const cx = Math.round((tkR.right + bw.left) / 2)
    ar.style.left = cx + 'px'; hb.style.left = cx + 'px'
  }
}

// カメラの前向き（水平）に対して、自分から目標 (x, z) がどっちか。0 = 正面、+ = 右。高さは使わない
function compassAng(gx, gz) {
  camera.updateMatrixWorld()   // HUD はカメラを動かした後・描く前に呼ばれるので、今のカメラの向きにそろえる
  const e = camera.matrixWorld.elements, fx = -e[8], fz = -e[10], rx = -fz, rz = fx   // 右 = 前を右へ90度（傾きの影響を受けない）
  const dx = gx - me.x, dz = gz - me.z
  return Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz)
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
  else if (e.t === 'unwire' && !e.auto) { const v = Math.hypot(me.vx, me.vy, me.vz); if (v > 16) { sfx('whoosh', { vol: Math.min(0.8, v / 50), rate: 0.9 + Math.random() * 0.2 }); fovKick = Math.min(6, (v - 16) * 0.3) } }   // 速く離すと風を切る
  else if (e.t === 'ped') { sfx('bonk', { vol: 0.6, rate: 1.2 }); fx.addShake(0.3); say(t('bumpPed'), 1.4) }
  else if (e.t === 'car') { sfx('bonk', { vol: 1, rate: 0.8 }); fx.addShake(0.7); say(t('bumpCar'), 1.6) }
}
// カラスと野球ボール（shared/air.js）。音は自分からの距離で小さく
function onAirEvent(e) {
  log.push({ src: 'a', ...e, at: sh ? +sh.t.toFixed(2) : 0 })
  const d = me ? Math.hypot(e.x - me.x, e.z - me.z) : 0, nv = Math.max(0, 1 - d / 70)
  if (e.t === 'flock') { sfx('crow', { vol: 0.75 }); sfx('flap', { vol: 0.35, delay: 0.15 }) }
  else if (e.t === 'scare') { if (nv > 0) { sfx('flap', { vol: 0.6 * nv }); sfx('crow', { vol: 0.6 * nv, delay: 0.12 }) } }
  else if (e.t === 'crow') { sfx('crow', { vol: 1 }); sfx('flap', { vol: 0.7 }); sfx('bonk', { vol: 0.4, rate: 1.3 }); fx.addShake(0.4); hitStop = 0.04; fx.debrisAt(e.x, e.y, e.z, 12, 0x1a1a1e, { speed: 4, up: 2, size: 0.1 }); say(t('crowHit'), 1.4) }
  else if (e.t === 'ballWarn') { sfx('bat', { vol: 0.9 }); say(t('ballWarn')[e.from], 2.2) }
  else if (e.t === 'ball') { sfx('gon', { vol: 1 }); fx.addShake(0.8); hitStop = 0.06; const L = t('ballSorry'); say(L[(sh ? sh.results.length + Math.round(sh.t) : 0) % L.length], 2.4) }
}
function onShiftEvent(e) {
  log.push({ src: 's', ...e, at: +sh.t.toFixed(2) })
  const o = curOrder(sh) || sh.last   // 近づいた瞬間に渡し終えると、同じ歩で cur が空になる
  const who = o => `<small>${placeName(o)}${lang === 'ja' ? 'のお客' : ''}</small>`
  if (e.t === 'pickup') {
    sfx('shop', { vol: 0.8 })
    hitStop = 0.04; flashA = 0.45; fovKick = -3; fx.addShake(0.15)
    if (o.cust === 'duf') { say(`<small>${t('masterName')}「${t('dufMaster')}」</small>${t('custPick').duf}`, 2.8); custSfx('duf') }
    else if (o.cust !== 'normal') say(who(o) + t('custPick')[o.cust], 2.8)
    else if (o.tier === 'far') say(`<small>${t('masterName')}</small>${t('pickupFar')(t('zone')[o.zone])}`, 2.4)
    else { const cl = t('custLine')[o.place[0]]; say(cl ? who(o) + cl : `<small>${t('masterName')}</small>${t('pickup')(dishName(o), placeName(o), o.floor)}`, 2.6) }
  }
  else if (e.t === 'approach') { if (e.cust !== 'normal') { say(who(o) + t('custNear')[e.cust], 1.8); custSfx(e.cust) } }
  else if (e.t === 'spill') {
    sfx('slosh', { vol: 0.5 + e.level / 200 }); if (e.level >= 50) sfx('dish', { vol: 0.6 })
    bowlWord(t('spill')[e.level]); const b = $('bowl'); b.classList.remove('tilt'); void b.offsetWidth; b.classList.add('tilt')
    const m = model.group.position; fx.debrisAt(m.x, m.y + 0.9, m.z, 6, 0xc9862f, { speed: 3, up: 2, size: 0.08 })
  } else if (e.t === 'soggy') { bowlWord(t('soggy')[e.level]); sfx('tick', { vol: 0.5 }) }
  else if (e.t === 'tooFast') say(t('tooFast'), 1.2)
  else if (e.t === 'late') { sfx('tick', { vol: 0.7 }); say(t('lateMsg'), 1.2) }
  else if (e.t === 'throw') sfx('throw')
  else if (e.t === 'drop') { sfx('crash', { vol: 0.9 }); sfx('dish'); fx.debrisAt(e.x, 0.5, e.z, 14, 0xc9ced3, { speed: 6, up: 5, size: 0.15 }) }
  else if (e.t === 'deliver') {
    const od = sh.last, c = e.cust || 'normal'
    let kind = reactKind(e)
    const R = c === 'normal' ? T[lang].react : t('custReact')[c]
    const line = e.how === 'drop' ? R.drop : e.how === 'throw' && !e.angry ? (R.throwOk || R.ok) : R[kind]
    if (e.angry) { sfx('grunt', { vol: 0.9 }); } else { sfx('ding', { vol: 0.8 }); if (e.tip && c !== 'coins') sfx('coin', { vol: 0.7, delay: 0.25 }) }
    // 手渡しの瞬間: 一瞬止まって光る。チップが多いほど長く（怒られた時は止まって揺れるだけ）
    if (e.how !== 'drop') {
      if (e.angry) { hitStop = 0.05; fx.addShake(0.4) }
      else { hitStop = Math.min(0.12, 0.06 + e.tip / 4000); flashA = 1; fovKick = -7; fx.addShake(0.5); fx.debrisAt(e.x, e.y + 0.4, e.z, 14, 0xffe2a0, { speed: 7, up: 5, size: 0.1 }) }
    }
    custSfx(c, true, e)
    const tipTxt = c === 'coins' && e.tip ? t('coinTip')(e.tip - (e.early || 0)) + (e.early ? ' +' + t('yen')(e.early) : '') : e.tip ? t('tip')(e.tip) : t('noTip')
    say(`${line}<small>${tipTxt}</small>`, 2.6)
    if (od) { afterDel = { o: od, t: 2.6 }; target.userData.person.show(od); target.userData.person.setReact(kind, e.angry) }
    if (c === 'coins' && od && e.tip) fx.debrisAt(od.x + od.nx * 0.6, od.y + 0.3, od.z + od.nz * 0.6, Math.min(30, 6 + Math.round(e.tip / 40)), 0xd8b04a, { speed: 2, up: 2, size: 0.06 })   // 1円玉がこぼれる
    // 一番いい受け渡しの瞬間を明細の写真にする
    const score = (e.angry ? 0 : 100) + (e.how === 'throw' ? 30 : 0) - e.mess
    if (score > photoScore) { photoScore = score; snapNext = true }
  } else if (e.t === 'allDone' || e.t === 'timeUp') { say(e.t === 'timeUp' && e.carrying ? t('timeUpHand') : e.t === 'allDone' ? t('allDone') : t('timeUp'), 2); endAt = 1.6 }
}
// 受け取った時の反応の種類: good / ok / mess / late（1件目は練習なので怒る台詞は出さない）
function reactKind(e) {
  const angryMess = e.cust === 'photo' ? 55 : JOB.angryMess
  let k = e.mess >= angryMess ? 'mess' : e.late >= JOB.angryLate || e.soggy >= JOB.angrySoggy ? 'late' : e.mess < 25 && e.late === 0 ? 'good' : 'ok'
  if (e.practice && (k === 'mess' || k === 'late')) k = 'ok'
  return k
}
// 客ごとの音（録音素材だけ）
function custSfx(c, done = false, e = null) {
  if (c === 'duf') { sfx('squeak', { vol: 0.7 }); sfx('squeak', { vol: 0.6, delay: 0.22 }); if (done && e && e.style === 'jackpot') sfx('squeak', { vol: 0.8, delay: 0.45 }) }
  else if (c === 'polite') { sfx('cloth', { vol: 0.8 }); sfx('cloth', { vol: 0.7, delay: 0.5 }) }
  else if (c === 'coins') { sfx('coins', { vol: 0.8 }); if (done) { sfx('coins', { vol: 0.8, delay: 0.3 }); sfx('coins', { vol: 0.7, delay: 0.6 }) } }
  else if (c === 'photo') { for (let i = 0; i < 3; i++) sfx('hook', { vol: 0.6, delay: i * 0.16 }) }
  else if (c === 'net') sfx('wire', { vol: 0.6, rate: 0.8 })
}
let snapNext = false
const log = []

// ---------------------------------------------------------------- 結果
// 明細の日付は端末の日付（UTC だと朝9時前は前の日になる）
function showResult() {
  mode = 'result'
  Snd.loop('wind', null); Snd.loop('bgm', null)
  const p = payData(sh, lang), d = { lang, no: 4, job: t('job'), date: (d0 => `${d0.getFullYear()}.${String(d0.getMonth() + 1).padStart(2, '0')}.${String(d0.getDate()).padStart(2, '0')}`)(new Date()), wage: JOB.wage, hours: JOB.hours, pay: p.pay, ded: p.ded, boss: t('boss') }
  const net = totals(d).net
  const C = t('comments'), R = sh.results
  const messy = R.filter(r => r.reason === 'mess').length, late = R.filter(r => r.reason === 'late' || r.reason === 'soggy').length
  const jackpot = R.some(r => r.style === 'jackpot')
  d.comment = p.drops ? C.drop : p.ok <= 1 ? C.few : p.undone && p.ok < 4 ? C.hand : jackpot ? C.duf : messy > late && messy ? C.mess : late ? C.late : net >= RANK[0] && !p.claims ? C.great : p.far >= 2 ? C.far : p.undone ? C.hand : C.ok
  const st = t('stamps'); d.stamp = net >= RANK[0] ? st[3] : net >= RANK[1] ? st[2] : net >= RANK[2] ? st[1] : st[0]
  d.stampK = 1; d.photo = photo; d.footer = 'tom3games.github.io/sky-delivery'
  // 出前の記録: 1件ずつ、何をどう届けて客がどうだったか
  const ja = lang === 'ja', RL = T[lang].react
  d.logTitle = ja ? '今日の出前' : "Today's orders"
  const rows = sh.targets.map((o, i) => {
    const r = R[i]
    const text = (o.tier === 'far' ? (ja ? '遠 ' : 'FAR ') : '') + (ja ? `${placeName(o)}へ ${dishName(o)}` : `${dishName(o)} to ${placeName(o)}`)
    if (!r) return { no: i + 1, text, note: ja ? '持ったまま時間切れ' : 'time ran out', bad: true }
    const how = r.how === 'drop' ? (ja ? '落とした' : 'dropped') : r.how === 'throw' ? (ja ? '投げ入れ' : 'thrown in') : (ja ? '手渡し' : 'handed')
    const tipN = r.cust === 'duf' ? (ja ? `デュフフ ${r.tip.toLocaleString()}円` : `doo-fu ¥${r.tip.toLocaleString()}`) : r.cust === 'coins' ? (ja ? `1円玉${r.tip - (r.early || 0)}枚` : `${r.tip - (r.early || 0)} coins`) : (ja ? `チップ${r.tip}円` : `tip ¥${r.tip}`)
    const note = r.how === 'drop' ? how : r.reason === 'mess' ? (ja ? `${how}・こぼれすぎ` : `${how}, spilled`) : r.reason === 'late' ? (ja ? `${how}・${r.late}秒遅れ` : `${how}, ${r.late}s late`) : r.reason === 'soggy' ? (ja ? `${how}・のびのび` : `${how}, soggy`) : r.tip ? tipN : how
    return { no: i + 1, text, note, bad: r.angry }
  })
  d.log = rows; d.logMore = n => ja ? `ほか ${n}件` : `${n} more`   // 入りきらない分は payslip.js が上にまとめる
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
  const fov = base + Math.min(18, Math.max(0, Math.hypot(c.vx, c.vy, c.vz) - 6) * 0.5)   // 速いほど広く（最大 +12 から +18 に）
  cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 4))
  fovKick *= Math.exp(-dt * 6)
  camera.fov = cam.fov + fovKick; camera.updateProjectionMatrix()
  // 振り子の向きに少しだけ体ごと傾く（カメラの右向きに対する横の速さから）
  const me_ = camera.matrixWorld.elements, rl = Math.hypot(me_[0], me_[2]) || 1, lat = (c.vx * me_[0] + c.vz * me_[2]) / rl
  cam.bank = (cam.bank || 0) + (Math.max(-0.1, Math.min(0.1, (c.rope ? lat : 0) * -0.004)) - (cam.bank || 0)) * (1 - Math.exp(-dt * 3))
  camera.rotateZ(cam.bank)
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
    stepAir(air, me, STEP, true)
    for (const e of air.events) onAirEvent(e)
    air.events.length = 0
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
    stepAir(air, demo.r, STEP, false); air.events.length = 0
    stepShift(demo.sh, demo.r, STEP, { throwNow: !!inp.throw })
    demo.sh.events.length = 0
    if (demo.sh.over) demo.sh = createShift(world, Math.floor(Math.random() * 1000))
  }
}
function frame() {
  requestAnimationFrame(frame)
  const now = performance.now()
  let dt = Math.min(0.1, (now - last) / 1000); last = now
  if (hitStop > 0) { hitStop -= dt; acc = 0 }   // ヒットストップ: ほんの一瞬だけ止める
  else if (!dbgPause) { acc += dt; let n = 0; while (acc >= STEP && n < 6) { stepOnce(); acc -= STEP; n++ } if (n >= 6) acc = 0 }
  else dt = 0
  render(dt || 0.016)
}
// 速さの線: 画面のふちから中心へ流れる白い線。速いほど多く濃く（20m/s から。しっぽ取り v5 と同じ）
const spd = $('speedfx'), sctx = spd.getContext('2d'), hf = $('hitflash')
const lines = Array.from({ length: 46 }, () => ({ a: Math.random() * Math.PI * 2, p: Math.random(), s: 0.6 + Math.random() * 0.8, w: 1 + Math.random() * 2 }))
let spdOn = false
function drawSpeed(v, dt) {
  if (!window.__holdFx) flashA = Math.max(0, flashA - dt * 5)   // __holdFx: 撮影用に光を止めておく
  hf.style.opacity = flashA.toFixed(2)
  const k = Math.max(0, Math.min(1, (v - 20) / 18))
  window.__speedK = k
  if (k <= 0) { if (spdOn) { sctx.clearRect(0, 0, spd.width, spd.height); spdOn = false } return }
  spdOn = true
  const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1)
  if (spd.width !== Math.round(W * dpr) || spd.height !== Math.round(H * dpr)) { spd.width = Math.round(W * dpr); spd.height = Math.round(H * dpr) }
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0); sctx.clearRect(0, 0, W, H)
  const cx = W / 2, cy = H * 0.45, R = Math.hypot(W, H) * 0.55
  sctx.lineCap = 'round'
  const n = Math.round(lines.length * (0.35 + 0.65 * k))
  for (let i = 0; i < n; i++) {
    const L = lines[i]
    L.p += dt * L.s * (1.6 + k * 2.4); if (L.p > 1) { L.p -= 1; L.a = Math.random() * Math.PI * 2 }
    const r1 = R * (1.05 - L.p * 0.45), r0 = r1 - R * (0.12 + 0.2 * k) * L.s
    const ca = Math.cos(L.a), sa = Math.sin(L.a)
    sctx.strokeStyle = `rgba(255,255,255,${(0.1 + 0.32 * k) * Math.min(1, L.p * 4)})`; sctx.lineWidth = L.w
    sctx.beginPath(); sctx.moveTo(cx + ca * r0, cy + sa * r0); sctx.lineTo(cx + ca * r1, cy + sa * r1); sctx.stroke()
  }
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
  // 受け渡しの後も 2.6 秒は窓に残して、客の反応（お辞儀・小銭・フラッシュ・怒り）を見せる
  if (afterDel && mode === 'play') { afterDel.t -= dt; if (afterDel.t <= 0 || (shift && shift.carrying)) afterDel = null }
  const showAfter = mode === 'play' && afterDel && shift === sh
  const o = shift && (curOrder(shift) || (showAfter ? afterDel.o : null))
  target.visible = !!(o && (shift.carrying || shift.thrown || showAfter))
  if (target.visible) {
    target.position.set(o.x - o.nx * 0.65, o.y, o.z - o.nz * 0.65)
    target.rotation.y = Math.atan2(o.nx, o.nz)
    const k = performance.now() / 1000
    const ud = target.userData
    if (ud.person.show(o)) { ud.cust.visible = false; ud.person.group.visible = true; ud.person.update(dt, !!shift.near) }
    else { ud.cust.visible = true; ud.cust.rotation.z = Math.sin(k * 6) * 0.08 }
    ud.lan.visible = !showAfter || shift.carrying
    target.userData.lan.position.y = 0.4 + Math.sin(k * 2) * 0.05
    const dT = camera.position.distanceTo(target.position); target.userData.lan.scale.setScalar(Math.max(1, dT / 30))
  }
  // 光の柱と窓の枠（運んでいる間だけ）
  const goingTo = shift && (shift.carrying || shift.thrown) ? curOrder(shift) : null
  beam.g.visible = !!goingTo; winGlow.g.visible = !!goingTo
  if (goingTo) {
    const o2 = goingTo, bx = o2.x + o2.nx * 1.6, bz = o2.z + o2.nz * 1.6, gy = world.groundAt(bx, bz, 2).h
    const top = Math.max(o2.y + 30, (o2.bld && o2.bld.y1 != null ? o2.bld.y1 : o2.y) + 25)   // 屋上よりずっと上まで（手前の建物の向こうからも先が見える）
    const dC = Math.hypot(camera.position.x - bx, camera.position.z - bz), near = dC < 40
    const R = Math.max(0.5, dC * 0.008)   // 遠くても細くなりすぎない（画面で数px以上）
    beam.g.position.set(bx, gy, bz)
    beam.col.scale.set(R, top - gy, R)
    beam.mat.opacity = Math.max(0, Math.min(1, (dC - 15) / 30)) * 0.85   // 近づくほど薄く（15m 以内は消して窓と客を隠さない）
    beam.band.position.y = o2.y - gy; beam.band.scale.setScalar(R * 2.2)
    const k = performance.now() / 1000, pulse = 0.5 + 0.5 * Math.sin(k * 5)
    winGlow.m.opacity = near ? 0.75 + 0.25 * pulse : 0.55
    winGlow.g.scale.setScalar(near ? 1.08 + 0.06 * pulse : 1)
  }
  const atShop = !!(shift && !shift.carrying && !shift.thrown && shift.offer)
  pickRing.ring.material.opacity = atShop ? 0.55 + Math.sin(performance.now() / 250) * 0.25 : 0.12
  pickRing.fill.visible = atShop
  drawSign(shift && shift.offer ? shift.offer : null)
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
  if (mode === 'play' && me) { const v3 = Math.hypot(me.vx, me.vy, me.vz); const wl = Snd.loops.wind; if (wl && wl.g) { const gv = me.grounded ? 0 : Math.min(0.35, Math.max(0, (v3 - 16) / 40)); wl.g.gain.value = Number.isFinite(gv) ? gv : 0 } }   // 風: 地面では鳴らさない・空中で 16m/s から（2026-11-03 本人「謎の水の音がずっと鳴ってる」）
  drawSpeed(mode === 'play' && me ? Math.hypot(me.vx, me.vy, me.vz) : 0, dt)
  // 車と通行人（カメラの近くだけ描く）、昼→夜
  carsDraw.draw(street.traffic.cars, camera.position, dt); pedsDraw.draw(street.peds, camera.position, dt)
  airDraw.draw(air, camera.position, dt, (x, z) => world.groundAt(x, z, 3).h)
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
  get mode() { return mode }, log, get hitStop() { return hitStop }, get flashA() { return flashA }, get fovKick() { return fovKick }, get me() { return me }, get sh() { return sh }, get air() { return air }, beam: beam.g, JOB, RUN, world, camera, touchMode, cam,
  start: seed => startShift(seed), toTitle, showResult, setLang: l => { lang = l; applyLang() }, get lang() { return lang },
  dbg: {
    pause: on => { dbgPause = on }, step: n => { for (let i = 0; i < n; i++) stepOnce(); render(STEP) },
    teleport: (x, y, z, yaw) => { Object.assign(me, { x, y, z, vx: 0, vy: 0, vz: 0, rope: null, climbing: null, grounded: y < 0.1 }); if (yaw != null) me.yaw = yaw },
    pressWire: (sx, sy) => aimAt(sx, sy), compass: (x, z) => compassAng(x, z), pressJump: () => { press.jump = true }, pressThrow: () => { press.throw = true }, wireAuto: () => { pendingWire = { at: null, key: true } },
    keys, stick, say, setMess: m => { sh.mess = m }, target, get model() { return model },
    render: n => { for (let i = 0; i < n; i++) render(1 / 30) },
    // 目の前の窓に客を出す（撮影と検証用）: 今の注文の客の種類を変えて、窓の前 dist m に浮かせる
    lookAtWindow: (type, dist = 7, side = 0) => {
      const o = sh.cur; if (!o) return null
      if (type) { o.cust = type; o.handR = type === 'net' ? JOB.netR : JOB.handR; o.handSpeed = type === 'net' ? JOB.netSpeed : JOB.handSpeed }
      const yaw = Math.atan2(-o.nx, -o.nz)
      Object.assign(me, { x: o.x + o.nx * dist + o.nz * side, y: o.y - 1.6, z: o.z + o.nz * dist - o.nx * side, vx: 0, vy: 0, vz: 0, rope: null, climbing: null, grounded: false, yaw })
      cam.hd = yaw; cam.pitch = 0.05; cam.userT = performance.now()
      return { x: o.x, y: o.y, z: o.z, cust: o.cust }
    },
    react: (kind, angry) => target.userData.person.setReact(kind, angry)
  }
}
applyLang()
toTitle()
requestAnimationFrame(frame)
// ロード画面は読み込みが全部終わってから消す（テクスチャ・人物の GLB を three の読み込み数で数える）
bootWatch(() => { window.__skyReady = true })
