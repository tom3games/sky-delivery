// フォントを「画面で使う文字だけ」にして自前で置く。node tools/fontlink.mjs（build.mjs が最後に呼ぶ）
// - Google Fonts の text= で、書体ごとに使う文字だけの woff2 を fonts/ に取ってくる（OFL。文字が変わった時だけ取り直す）
// - 1つの書体を「半角英数」l・「最初の画面（ロード画面・タイトル）の字」a・「それ以外」b の3つに分け、fonts.css で unicode-range を付けて並べる
//   ブラウザは画面に出た字の側だけ取るので、準備完了までに取るのは l と a だけ。b は準備完了のあとで game.js が読み始める
// - 筆の書体（Yuji Syuku）は見出し・札・看板の文字だけ
// 文字は「画面に出る物」だけから取る: 本体（まとめた dist/game.js。コメントは消えている）と index.html のコメント・meta・スクリプトのコメントを除いた部分
// verify.mjs が、実際に画面に出た文字（日英・全部の画面）がその書体に入っているか、fonts.css が最新かを確かめる
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
const ROOT = new URL('..', import.meta.url).pathname
const ascii = () => { let s = ''; for (let i = 32; i < 127; i++) s += String.fromCharCode(i); return s }
const sortU = t => [...new Set([...t])].sort().join('')
function htmlText() {
  const h = readFileSync(ROOT + 'index.html', 'utf8')
  const scripts = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/mg, '$1')).join('')
  return h.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<meta[^>]*>/g, '').replace(/<title>[\s\S]*?<\/title>/, '').replace(/<link[^>]*>/g, '') + scripts
}
export function usedChars() {
  const t = readFileSync(ROOT + 'dist/game.js', 'utf8') + htmlText()
  return sortU(ascii() + [...t].filter(c => c.codePointAt(0) > 127).join(''))
}
// js/game.js の文言表（日英）から、キーの文字を集める
function keyText(keys) {
  const src = readFileSync(ROOT + 'js/game.js', 'utf8'); let t = ''
  for (const k of keys) {
    const ms = [...src.matchAll(new RegExp(`[{,\\s]${k}: '([^']*)'`, 'g'))]
    if (ms.length < 2) throw new Error('key not found in ja/en: ' + k)
    for (const m of ms) t += m[1]
  }
  return t
}
// 筆の書体で出る文字: 札・見出し・ロゴ・看板の文言 ＋ 暖簾・看板・番号の決まった字
const BRUSH_KEYS = ['logo', 'start', 'howTitle', 'ok', 'paused', 'resume', 'again', 'signNear', 'signFar', 'signWait']
const BRUSH_FIXED = '宙吊軒らーめ町中華一二三四五'
export const brushChars = () => sortU(ascii() + BRUSH_FIXED + keyText(BRUSH_KEYS))
// 最初の画面（ロード画面とタイトル）に出る文字。ここに無い字は準備完了のあとで届く
// 看板の canvas（店の看板・届け先の札）は準備完了の前に描くので、その字も入れる（入れないと b を準備完了の前に取りに行く）
const FIRST_KEYS = ['series', 'logo', 'masterName', 'masterLine', 'start', 'how', 'lang', 'more', 'muteOn', 'muteOff', 'loading', 'signNear', 'signFar', 'signWait']
export const firstChars = () => sortU(ascii() + '宙吊軒らーめ%町中華' + keyText(FIRST_KEYS))

const FACES = [
  { family: 'Yuji Syuku', q: 'Yuji+Syuku', weight: 400, slug: 'yuji', chars: brushChars },
  { family: 'Klee One', q: 'Klee+One:wght@600', weight: 600, slug: 'klee600', chars: usedChars },
  { family: 'BIZ UDPGothic', q: 'BIZ+UDPGothic:wght@400', weight: 400, slug: 'biz400', chars: usedChars },
  { family: 'BIZ UDPGothic', q: 'BIZ+UDPGothic:wght@700', weight: 700, slug: 'biz700', chars: usedChars }
]
// 書体ごとの a（最初の画面）と b（それ以外）の文字
export function plan() {
  const first = new Set(firstChars()), out = []
  for (const f of FACES) {
    // l = 半角英数（英語の画面と数字。日本語の見出しには出ないので筆の書体では取らずに済む）、a = 最初の画面の字、b = それ以外
    const all = [...f.chars()], asc = c => c.codePointAt(0) > 32 && c.codePointAt(0) < 127   // 空白は a 側（看板の「町中華 宙吊軒」の空白で筆の l を取りに行かない）
    const l = all.filter(asc).join(''), a = all.filter(c => !asc(c) && first.has(c)).join(''), b = all.filter(c => !asc(c) && !first.has(c)).join('')
    for (const [part, txt] of [['l', l], ['a', a], ['b', b]]) if (txt) out.push({ ...f, part, txt, file: `fonts/${f.slug}-${part}.woff2` })
  }
  return out
}
const range = txt => {
  const cps = [...txt].map(c => c.codePointAt(0)).sort((x, y) => x - y), rs = []
  for (const c of cps) { const r = rs[rs.length - 1]; if (r && c === r[1] + 1) r[1] = c; else rs.push([c, c]) }
  return rs.map(([s, e]) => s === e ? 'U+' + s.toString(16) : `U+${s.toString(16)}-${e.toString(16)}`).join(',')
}
const hash = b => createHash('sha1').update(b).digest('hex').slice(0, 8)
export function fontsCss() {
  return '/* tools/fontlink.mjs が作る。手で直さない */\n' + plan().map(p => {
    const v = hash(readFileSync(ROOT + p.file))
    return `@font-face{font-family:'${p.family}';font-style:normal;font-weight:${p.weight};font-display:swap;src:url(${p.file}?v=${v}) format('woff2');unicode-range:${range(p.txt)}}`
  }).join('\n') + '\n'
}
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
async function fetchFace(p) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${p.q}&display=swap&text=${encodeURIComponent(p.txt)}`, { headers: { 'User-Agent': UA } })).text()
  const urls = [...css.matchAll(/url\((https:[^)]+)\) format\('woff2'\)/g)].map(m => m[1])
  if (urls.length !== 1) throw new Error('font css: ' + p.file + ' ' + css.slice(0, 200))
  const r = await fetch(urls[0], { headers: { 'User-Agent': UA } }); if (!r.ok) throw new Error('font get ' + r.status)
  return Buffer.from(await r.arrayBuffer())
}
if (process.argv[1] && process.argv[1].endsWith('fontlink.mjs')) {
  mkdirSync(ROOT + 'fonts', { recursive: true })
  const manP = ROOT + 'fonts/manifest.json', man = existsSync(manP) ? JSON.parse(readFileSync(manP, 'utf8')) : {}
  let got = 0
  for (const p of plan()) {
    if (man[p.file] === p.txt && existsSync(ROOT + p.file)) continue
    writeFileSync(ROOT + p.file, await fetchFace(p)); man[p.file] = p.txt; got++
  }
  for (const k of Object.keys(man)) if (!plan().some(p => p.file === k)) delete man[k]
  writeFileSync(manP, JSON.stringify(man, null, 1) + '\n')
  const css = fontsCss(); writeFileSync(ROOT + 'fonts.css', css)
  const p = ROOT + 'index.html', h = readFileSync(p, 'utf8')
  const tag = `<link id="gfonts" rel="stylesheet" href="fonts.css?v=${hash(css)}">`
  const out = h.replace(/<link id="gbrush"[^>]*>\n?/, '').replace(/<link id="gfonts"[^>]*>/, tag)
  if (!out.includes(tag)) throw new Error('font link not found')
  writeFileSync(p, out)
  console.log('fonts', plan().map(q => `${q.file.slice(6)} ${q.txt.length}字`).join(', '), '取り直し', got)
}
