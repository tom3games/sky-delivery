// 店（宙吊軒）と一軒家の当たり判定・ワイヤーの掛け点。three.js に依存しない（画面と bot で同じ）
// 2026-11-02 本人「ラーメン屋の店舗が通り抜けできてまう。当たり判定をつけつつ、ワイヤーも引っ掛けれるように。一軒家もいくつか」
// 見た目は js/game.js（店）と js/town3d.js（家）。ここの寸法と合わせる
export const SHOP_BOX = { dx: 6, hw: 3.5, hl: 2.5, h: 3.9 }   // 店の本体（JOB.shop から東へ 6m、幅7・奥行5・屋根まで3.9m）
export const HOUSE = { hw: 4.5, hl: 4, wall: 6, roof: 2.6 }   // 一軒家（2階建て。壁 6m＋切妻屋根）

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
  const town = { shop: null, houses: [] }
  const g = (x, z) => world.groundAt(x, z, 3).h
  // 店: 通り抜けできないように箱を置く。低いけれどワイヤーも掛かる（small）
  const sy = g(shop.x + SHOP_BOX.dx, shop.z)
  town.shop = { cx: shop.x + SHOP_BOX.dx, cz: shop.z, yaw: 0, hw: SHOP_BOX.hw, hl: SHOP_BOX.hl, y0: sy, y1: sy + SHOP_BOX.h, kind: 'building', small: true, shop: true }
  addBox(world, town.shop)
  // 一軒家
  for (const sp of HOUSE_SPOTS) {
    const y = g(sp.x, sp.z)
    const h = { cx: sp.x, cz: sp.z, yaw: 0, hw: HOUSE.hw, hl: HOUSE.hl, y0: y, y1: y + HOUSE.wall, kind: 'building', small: true, house: true, face: sp.face }
    addBox(world, h)
    town.houses.push(h)
  }
  world.solidProps = true      // 街灯・信号・木・柵・バリケードなどの小物も通り抜けできないように
  world._anchorBoxes = null   // 掛け点の一覧を作り直す
  world.town = town
  return town
}
