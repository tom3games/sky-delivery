// SNS 用の画像 og.png（1200x630）。遊んでいる場面（窓の前でワイヤーにぶら下がって岡持ちを差し出す）＋暖簾のタイトル。node og.mjs
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { muteContext, MUTE_LAUNCH } from './mute.mjs'
const srv = spawn(process.execPath, ['server.mjs'], { cwd: import.meta.dirname, env: { ...process.env, PORT: '5395' } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch({ ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, '--use-angle=metal'] })
const ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 1200, height: 630 } }); await muteContext(ctx)
const p = await ctx.newPage()
await p.goto('http://localhost:5395/'); await p.waitForFunction(() => window.__skyReady, null, { timeout: 20000 })
await p.evaluate(() => sky.start(5)); await p.waitForTimeout(800)
await p.evaluate(() => {
  sky.dbg.pause(true)
  sky.dbg.teleport(sky.JOB.pick.x, 0, sky.JOB.pick.z); sky.dbg.step(2)
  const o = sky.sh.cur, me = sky.me
  o.cust = 'duf'   // 窓にはデュフフの人
  // 窓の斜め前、少し下でワイヤーにぶら下がって窓へ振り上がる途中
  const sx = -o.nz, sz = o.nx
  sky.dbg.teleport(o.x + o.nx * 4.5 + sx * 3, o.y - 2.2, o.z + o.nz * 4.5 + sz * 3, Math.atan2(-o.nx, -o.nz))
  Object.assign(me, { grounded: false, vx: -sx * 6, vz: -sz * 6, vy: 3 })
  me.rope = { x: o.x + sx * 9, y: o.y + 14, z: o.z + sz * 9, len: 18, t: 0.5 }
  sky.dbg.step(1)
  window.__freeze = true
  const c = sky.camera
  c.position.set(me.x + o.nx * 7 - sx * 5, me.y + 2.4, me.z + o.nz * 7 - sz * 5)
  c.lookAt(me.x - o.nx * 1.5 + sx * 1.5, me.y + 1.6, me.z - o.nz * 1.5 + sz * 1.5)
  c.fov = 52; c.updateProjectionMatrix()
  sky.dbg.step(1)
  for (const id of ['hud', 'pause', 'title']) document.getElementById(id).classList.add('hidden')
  const d = document.createElement('div')
  d.innerHTML = `<div style="position:fixed;left:44px;top:0;display:flex;gap:6px;height:300px;z-index:30">${['空', '中', '出', '前'].map(c => `<div style="width:96px;background:#1f2a44;display:flex;justify-content:center;padding-top:60px;box-shadow:inset 0 -20px 30px rgba(0,0,0,.25)"><span style="font-family:'Yuji Syuku',serif;color:#f6f1e4;font-size:78px;line-height:1">${c}</span></div>`).join('')}</div>
  <div style="position:fixed;left:44px;top:322px;z-index:30;font-family:'Klee One',sans-serif;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.8)"><div style="font-size:26px">1日だけ職場体験 #4　町中華 宙吊軒</div><div style="font-size:40px;margin-top:10px;line-height:1.35">4分で稼げるだけ稼げ。<br>遠い注文ほど高い。</div></div>`
  document.body.appendChild(d)
})
await p.waitForTimeout(600)
await p.screenshot({ path: 'og.png' })
await b.close(); srv.kill()
console.log('og.png')
