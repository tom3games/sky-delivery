// 3つの性格の bot を種を変えて回し、稼ぎの分布を出す。node tools/sim.mjs [回数] [性格]
import { createWorld } from '../shared/track.js'
import { createRunner, stepRunner } from '../shared/runner.js'
import { createShift, stepShift, JOB, money, payData } from '../shared/delivery.js'
import { createBot, botInput } from '../shared/bot.js'
import { createStreet } from '../shared/street.js'
import { createAir, stepAir } from '../shared/air.js'
const N = +(process.argv[2] || 12), only = process.argv[3]
const world = createWorld('city')
const dt = 1 / 60
export function play(kind, seed, verbose = false) {
  const r = createRunner({ id: 'me', spawn: { x: JOB.shop.x - 9, y: 0, z: JOB.shop.z, yaw: Math.PI / 2 } })
  const sh = createShift(world, seed), b = createBot(kind, seed)
  const st = createStreet(world, seed), air = process.env.NOAIR ? null : createAir(world, seed)
  let maxMess = 0
  while (!sh.over) {
    const inp = botInput(b, r, sh, world, dt)
    r.events.length = 0
    st.update(dt, r)
    stepRunner(r, inp, dt, world)
    st.collide(r)
    if (air) { stepAir(air, r, dt, true); air.events.length = 0 }
    stepShift(sh, r, dt, { throwNow: !!inp.throw })
    for (const e of sh.events) if (verbose && e.t !== 'spill') console.log(sh.t.toFixed(1), JSON.stringify(e))
    sh.events.length = 0
    maxMess = Math.max(maxMess, sh.mess)
  }
  return { hits: air ? air.hits.crow + air.hits.ball : 0, crow: air ? air.hits.crow : 0, ball: air ? air.hits.ball : 0, far: sh.results.filter(r => r.tier === 'far' && r.how !== 'drop').length, farOffered: sh.targets.filter(o => o.tier === 'far').length, picked: sh.targets.length, gr: (sh.groundT || 0) / Math.max(1, sh.carryT || 1), angry: sh.results.filter(r => r.angry).length, dists: sh.targets.map(t => t.dist), money: money(sh), done: sh.results.filter(r => r.how !== 'drop').length, res: sh.results, p: payData(sh), src: sh.src }
}
const kinds = only ? [only] : ['careful', 'rush', 'skilled', 'clumsy']
for (const k of kinds) {
  const ms = [], det = [], srcSum = {}, held = [], dn = [], dist = [], fr = [], an = [], hitN = [], foff = []
  for (let s = 1; s <= N; s++) { const g = play(k, s, N === 1); ms.push(g.money); dn.push(g.done); fr.push(g.far); hitN.push(g.crow + '/' + g.ball); foff.push([g.farOffered, g.picked]); (globalThis.GR ||= {})[k] = ((globalThis.GR[k] || 0) + g.gr / N); an.push(g.angry); for (const r of g.res) if (r.how !== 'drop') { held.push(r.held); dist.push(g.dists[r.idx]) } for (const [a, b] of Object.entries(g.src)) srcSum[a] = (srcSum[a] || 0) + b; det.push(`${g.done}件 崩${g.res.map(r => r.mess).join('/')} 遅${g.res.map(r => r.late).join('/')} ${g.res.map(r => r.how[0]).join('')}`) }
  ms.sort((a, b) => a - b)
  if (process.env.SRC) console.log(k, JSON.stringify(Object.fromEntries(Object.entries(srcSum).map(([a, b]) => [a, Math.round(b / N)]))))
  const avg = Math.round(ms.reduce((a, b) => a + b, 0) / ms.length)
  const mps = dist.reduce((a, b) => a + b, 0) / Math.max(1, held.reduce((a, b) => a + b, 0))
  console.log(`${k.padEnd(8)} 平均 ${avg}円  中央 ${ms[ms.length >> 1]}  最小 ${ms[0]}  最大 ${ms[ms.length - 1]}  届けた 平均${(dn.reduce((a, b) => a + b, 0) / N).toFixed(1)}件 最少${Math.min(...dn)}件 遠方${(fr.reduce((a, b) => a + b, 0) / N).toFixed(1)} 怒${(an.reduce((a, b) => a + b, 0) / N).toFixed(1)}  受け取りから手渡しまで 平均${(held.reduce((a, b) => a + b, 0) / Math.max(1, held.length)).toFixed(1)}秒（直線距離で ${mps.toFixed(1)}m/秒）`)
  console.log('   地上で運んだ割合', (globalThis.GR[k] * 100).toFixed(0) + '%')
  { const fo = foff.reduce((a, b) => a + b[0], 0), pk = foff.reduce((a, b) => a + b[1], 0), cr = hitN.reduce((a, b) => a + +b.split('/')[0], 0) / N, bl = hitN.reduce((a, b) => a + +b.split('/')[1], 0) / N; console.log(`   受け取った注文の遠方率 ${(100 * fo / Math.max(1, pk)).toFixed(0)}%（${fo}/${pk}）  カラスに当たった 平均${cr.toFixed(1)}回・ボール ${bl.toFixed(1)}回`) }
  if (process.env.V) det.forEach((d, i) => console.log('   ', i + 1, d))
}
