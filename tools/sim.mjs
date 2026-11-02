// 3つの性格の bot を種を変えて回し、稼ぎの分布を出す。node tools/sim.mjs [回数] [性格]
import { createWorld } from '../shared/track.js'
import { createRunner, stepRunner } from '../shared/runner.js'
import { createShift, stepShift, JOB, money, payData } from '../shared/delivery.js'
import { createBot, botInput } from '../shared/bot.js'
const N = +(process.argv[2] || 12), only = process.argv[3]
const world = createWorld('city')
const dt = 1 / 60
export function play(kind, seed, verbose = false) {
  const r = createRunner({ id: 'me', spawn: { x: JOB.shop.x - 3, y: 0, z: JOB.shop.z, yaw: -Math.PI / 2 } })
  const sh = createShift(world, seed), b = createBot(kind)
  let maxMess = 0
  while (!sh.over) {
    const inp = botInput(b, r, sh, world, dt)
    r.events.length = 0
    stepRunner(r, inp, dt, world)
    stepShift(sh, r, dt, { throwNow: !!inp.throw })
    for (const e of sh.events) if (verbose && e.t !== 'spill') console.log(sh.t.toFixed(1), JSON.stringify(e))
    sh.events.length = 0
    maxMess = Math.max(maxMess, sh.mess)
  }
  return { money: money(sh), done: sh.results.length, res: sh.results, p: payData(sh), src: sh.src }
}
const kinds = only ? [only] : ['careful', 'rush', 'skilled']
for (const k of kinds) {
  const ms = [], det = [], srcSum = {}
  for (let s = 1; s <= N; s++) { const g = play(k, s, N === 1); ms.push(g.money); for (const [a, b] of Object.entries(g.src)) srcSum[a] = (srcSum[a] || 0) + b; det.push(`${g.done}件 崩${g.res.map(r => r.mess).join('/')} 遅${g.res.map(r => r.late).join('/')} ${g.res.map(r => r.how[0]).join('')}`) }
  ms.sort((a, b) => a - b)
  if (process.env.SRC) console.log(k, JSON.stringify(Object.fromEntries(Object.entries(srcSum).map(([a, b]) => [a, Math.round(b / N)]))))
  const avg = Math.round(ms.reduce((a, b) => a + b, 0) / ms.length)
  console.log(`${k.padEnd(8)} 平均 ${avg}円  中央 ${ms[ms.length >> 1]}  最小 ${ms[0]}  最大 ${ms[ms.length - 1]}`)
  if (process.env.V) det.forEach((d, i) => console.log('   ', i + 1, d))
}
