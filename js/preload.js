// 最初の画面に要る素材（配達員の GLB・空・色の画像）を、本体の重い初期化（街を組む）より先に取り始める。game.js の一番最初の import
// 遅い端末では本体の実行に0.5秒ほどかかり、その間回線が空いていた。読む側と同じ取り方（GLB は fetch、three の画像は crossorigin、ビルの壁は素の Image）にしないと2回取る
import { Q } from './quality.js?v=16'
const pre = (href, as, cors) => { const l = document.createElement('link'); l.rel = 'preload'; l.as = as; l.href = href; if (cors) l.crossOrigin = 'anonymous'; document.head.appendChild(l) }
try {
  for (const n of ['Ranger', 'Rig_Medium_General', 'Rig_Medium_MovementBasic']) pre(`assets/chars/${n}.glb`, 'fetch', true)
  pre(`assets/hdri/${Q.sky}.webp`, 'image', true)
  for (const n of ['concrete_wall_004', 'rock_face', 'asphalt_02', 'dirt', 'rocky_terrain_02', 'forest_leaves_02', 'japanese_cedar_bark']) pre(`assets/${Q.tex}/${n}_diff.webp`, 'image', true)
  for (const n of ['rectangular_facade_tiles', 'concrete_panels', 'red_brick_03', 'plastered_wall_04', 'corrugated_iron']) pre(`assets/${Q.tex}/${n}_diff.webp`, 'image', false)
} catch (e) {}
