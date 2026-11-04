// 店（宙吊軒）と一軒家の当たり判定・ワイヤーの掛け点。three.js に依存しない（画面と bot で同じ）
// 2026-11-02 本人「ラーメン屋の店舗が通り抜けできてまう。当たり判定をつけつつ、ワイヤーも引っ掛けれるように。一軒家もいくつか」
// 見た目は js/game.js（店）と js/town3d.js（家）。ここの寸法と合わせる
export const SHOP_BOX = { dx: 6, hw: 3.5, hl: 2.5, h: 3.9 }   // 店の本体（JOB.shop から東へ 6m、幅7・奥行5・屋根まで3.9m）
export const HOUSE = { hw: 4.5, hl: 4, wall: 6, roof: 2.6 }   // 一軒家（2階建て。壁 6m＋切妻屋根）
export const APT = { hw: 7, hl: 5, h: 13, floors: 4 }          // 4階建てのアパート（店の周りでいちばん長く振れる）
export const VEND = { hw: 0.55, hl: 0.4, h: 1.9 }              // 自動販売機。低いので振り子にはならない（タップで掛けると引かれて跳び越す。shared/runner.js の low）

// 店の周りの広場（x 18〜112, z 829〜941）を町にする。2026-11-04 本人「店の周りが空き地すぎる。引っ掛けるものがどこにも無い。自動販売機や一軒家とかも含めてある程度埋めて」
// 空けておく所: 店の前（x 18〜46, z 829〜856＝開始位置・受け取りの輪・立て看板）／歩道（x 16.6・118.4, z 831.6・938.4 の線を通行人が歩く）／噴水のまわり
// 配達先にはしない（town.houses に入れない。注文の分布と bot を変えないため）
const FILL = {
  houses: [
    // 北の列（道の側に背を向けて、路地へ玄関）
    ...[52, 64, 76, 88, 100].map(x => ({ x, z: 838, fx: 0, fz: 1 })),
    // 南の列
    ...[40, 52, 64, 76, 88, 100].map(x => ({ x, z: 932, fx: 0, fz: -1 })),
    // 西の列（店の南）
    ...[864, 876, 888, 900, 912, 924].map(z => ({ x: 27, z, fx: 1, fz: 0 })),
    // 東の列
    ...[852, 866, 880, 894, 908, 922].map(z => ({ x: 109, z, fx: -1, fz: 0 }))
  ],
  apts: [{ x: 46, z: 862, fz: 1 }, { x: 90, z: 862, fz: 1 }, { x: 46, z: 908, fz: -1 }, { x: 90, z: 908, fz: -1 }],
  vends: [
    { x: 42, z: 849, fx: -1, fz: 0, c: 0 }, { x: 27, z: 856, fx: 0, fz: -1, c: 1 },   // 開始地点から見える2台
    { x: 58, z: 843.6, fx: 0, fz: 1, c: 2 }, { x: 82, z: 843.6, fx: 0, fz: 1, c: 0 },
    { x: 60, z: 876, fx: 1, fz: 0, c: 1 }, { x: 76, z: 895, fx: -1, fz: 0, c: 2 },
    { x: 32, z: 880, fx: 1, fz: 0, c: 0 }, { x: 104, z: 880, fx: -1, fz: 0, c: 1 },
    { x: 64, z: 926.4, fx: 0, fz: -1, c: 2 }, { x: 84, z: 926.4, fx: 0, fz: -1, c: 0 }
  ],
  // 路地の電柱と噴水のまわりの街灯（nx, nz は腕を出す向き）
  posts: [
    ...[48, 74, 100].map(x => ({ x, z: 848, kind: 'pole', nx: 0, nz: 1 })),
    ...[44, 70, 96].map(x => ({ x, z: 922, kind: 'pole', nx: 0, nz: -1 })),
    ...[870, 896].map(z => ({ x: 35, z, kind: 'pole', nx: 1, nz: 0 })),
    ...[872, 898].map(z => ({ x: 100, z, kind: 'pole', nx: -1, nz: 0 })),
    // 開始地点から掛からない向きが残った所（tools/reach.mjs で測って足した）
    { x: 15.1, z: 856, kind: 'pole', nx: 1, nz: 0 }, { x: 15.2, z: 841, kind: 'lamp', nx: -1, nz: 0 }, { x: 15.1, z: 835.5, kind: 'pole', nx: -1, nz: 0 }, { x: 20.5, z: 861, kind: 'lamp', nx: 1, nz: 0 },
    { x: 33, z: 858, kind: 'pole', nx: 0, nz: -1 }, { x: 58, z: 858, kind: 'pole', nx: 0, nz: 1 }, { x: 32, z: 834, kind: 'pole', nx: 0, nz: 1 },
    { x: 55, z: 874, kind: 'lamp', nx: 0.7, nz: 0.7 }, { x: 80, z: 874, kind: 'lamp', nx: -0.7, nz: 0.7 },
    { x: 55, z: 896, kind: 'lamp', nx: 0.7, nz: -0.7 }, { x: 80, z: 896, kind: 'lamp', nx: -0.7, nz: -0.7 }
  ]
}
export const POST_H = { pole: 10.5, lamp: 8 }

// 公園の区画（x -117〜-18, z 703〜807）の南北の縁に3軒ずつ。玄関と2階の窓は道の側
const HOUSE_SPOTS = [
  { x: -100, z: 712, face: -1 }, { x: -68, z: 712, face: -1 }, { x: -36, z: 712, face: -1 },
  { x: -100, z: 798, face: 1 }, { x: -68, z: 798, face: 1 }, { x: -36, z: 798, face: 1 }
]

function addBox(world, c) {
  world.colliders.push(c)
  const ex = c.hw + 1, ez = c.hl + 1
  world.colGrid.add(c, c.cx - ex, c.cz - ez, c.cx + ex, c.cz + ez)
}

export function addTown(world, shop) {
  if (world.town) return world.town
  const town = { shop: null, houses: [], fill: { houses: [], apts: [], vends: [], posts: [] } }
  const g = (x, z) => world.groundAt(x, z, 3).h
  // 店: 通り抜けできないように箱を置く。低いけれどワイヤーも掛かる（small）
  const sy = g(shop.x + SHOP_BOX.dx, shop.z)
  town.shop = { cx: shop.x + SHOP_BOX.dx, cz: shop.z, yaw: 0, hw: SHOP_BOX.hw, hl: SHOP_BOX.hl, y0: sy, y1: sy + SHOP_BOX.h, kind: 'building', small: true, shop: true }
  addBox(world, town.shop)
  // 一軒家
  for (const sp of HOUSE_SPOTS) {
    const y = g(sp.x, sp.z)
    const h = { cx: sp.x, cz: sp.z, yaw: 0, hw: HOUSE.hw, hl: HOUSE.hl, y0: y, y1: y + HOUSE.wall, kind: 'building', small: true, house: true, face: sp.face, gable: HOUSE.roof, ridgeX: true }
    addBox(world, h)
    town.houses.push(h)
  }
  const F = town.fill
  town.fountain = world.colliders.find(o => o.kind === 'fountain' && Math.abs(o.cx - shop.x) < 60 && Math.abs(o.cz - shop.z) < 60) || null
  for (const sp of FILL.houses) {
    const y = g(sp.x, sp.z), alongX = sp.fz !== 0   // 間口の向き。玄関が南北なら間口は東西
    const h = { cx: sp.x, cz: sp.z, yaw: 0, hw: alongX ? HOUSE.hw : HOUSE.hl, hl: alongX ? HOUSE.hl : HOUSE.hw, y0: y, y1: y + HOUSE.wall, kind: 'building', small: true, fill: true, fx: sp.fx, fz: sp.fz, gable: HOUSE.roof, ridgeX: alongX }   // 棟は間口と平行
    addBox(world, h); F.houses.push(h)
  }
  for (const sp of FILL.apts) {
    const y = g(sp.x, sp.z)
    const a = { cx: sp.x, cz: sp.z, yaw: 0, hw: APT.hw, hl: APT.hl, y0: y, y1: y + APT.h, kind: 'building', small: true, fill: true, fx: 0, fz: sp.fz }
    addBox(world, a); F.apts.push(a)
    addBox(world, { cx: sp.x + sp.fz * APT.hw / 2, cz: sp.z - sp.fz, yaw: 0, hw: 1.1, hl: 1.1, y0: a.y1, y1: a.y1 + 1.8, kind: 'tank' })   // 屋上の貯水槽
  }
  for (const sp of FILL.vends) {
    const y = g(sp.x, sp.z), alongX = sp.fz !== 0
    const v = { cx: sp.x, cz: sp.z, yaw: 0, hw: alongX ? VEND.hw : VEND.hl, hl: alongX ? VEND.hl : VEND.hw, y0: y, y1: y + VEND.h, kind: 'vending', fx: sp.fx, fz: sp.fz, c: sp.c }
    addBox(world, v); F.vends.push(v)
  }
  for (const sp of FILL.posts) {
    const y = g(sp.x, sp.z)
    const q = { cx: sp.x, cz: sp.z, yaw: 0, hw: 0.2, hl: 0.2, y0: y, y1: y + POST_H[sp.kind], kind: 'post', post: sp.kind, nx: sp.nx, nz: sp.nz }
    addBox(world, q); F.posts.push(q)
  }
  clearShopFront(world, shop)
  world.solidProps = true      // 街灯・信号・木・柵・バリケードなどの小物も通り抜けできないように
  world._anchorBoxes = null   // 掛け点の一覧を作り直す
  world.town = town
  return town
}

// 店の前（受け取りの輪と立て看板が見える所）の木を抜く。輪が木に隠れて見えなかった。見た目を作る前に呼ぶ（何度呼んでも同じ）
export function clearShopFront(world, shop) {
  for (const o of world.objects || []) {
    if (o.type !== 'tree' || o.gone || Math.abs(o.cx - (shop.x - 8)) > 12 || Math.abs(o.cz - shop.z) > 14) continue
    o.y1 = o.y0 - 5; o.gone = true
    if (o.ti != null && world.trees[o.ti]) world.trees[o.ti].gone = true
  }
}
