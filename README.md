# 空中出前 宙吊軒（1日だけ職場体験 #4）

https://tom3games.github.io/sky-delivery/

ワイヤーで町中華の出前を空から届ける3Dバカゲー。速く飛ぶと崩れて怒られる、遅いとのびて怒られる。

- 遊ぶ: ブラウザで開くだけ（スマホ対応）
- 開発: `node server.mjs` → http://localhost:5310 ／ 検証 `node verify.mjs` ／ 釣り合い `node tools/sim.mjs 12`
- 公開するのは1つにまとめた `dist/game.js`。js/ shared/ を直したら `node tools/build.mjs`（フォントの文字も作り直す。verify.mjs も最初に呼ぶ）。index.html の `dist/game.js?v=` を上げる ／ 読み込みの計測 `node loadtime.mjs https://tom3games.github.io/sky-delivery/ "window.__skyReady" 3`
- 準備完了は 空・色の画像・配達員の GLB だけ待つ。窓の客の GLB と壁の法線・粗さは準備完了のあとで読む（届くまで客は影絵の板）
- 音の出所は CREDITS.md（全部 CC0）
