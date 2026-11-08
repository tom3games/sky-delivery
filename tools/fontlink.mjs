// Google Fonts を「画面で使う文字だけ」で読む（text= で1書体1ファイルの小さなフォントになる）。node tools/fontlink.mjs（build.mjs が最後に呼ぶ）
// 筆の書体（Yuji Syuku）は見出し・札・看板だけなので、その文字だけの別の読み込みにする（全部の文字だと 220KB、見出しだけなら数十KB）
// 文字は「画面に出る物」だけから取る: 本体（まとめた dist/game.js。コメントは消えている）と index.html のコメント・meta・スクリプトのコメントを除いた部分
// verify.mjs が、実際に画面に出た文字（日英・全画面・看板の canvas）がそれぞれの読み込みに入っているか確かめる
import { readFileSync, writeFileSync } from 'node:fs'
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
// 筆の書体で出る文字: 札・見出し・ロゴ・看板の文言（js/game.js の文言表の該当キー、日英）＋ 暖簾・看板・番号の決まった字
const BRUSH_KEYS = ['logo', 'start', 'howTitle', 'ok', 'paused', 'resume', 'again', 'signNear', 'signFar', 'signWait']
const BRUSH_FIXED = '宙吊軒らーめ町中華一二三四五'
export function brushChars() {
  const src = readFileSync(ROOT + 'js/game.js', 'utf8'); let t = BRUSH_FIXED
  for (const k of BRUSH_KEYS) {
    const ms = [...src.matchAll(new RegExp(`[{,\\s]${k}: '([^']*)'`, 'g'))]
    if (ms.length < 2) throw new Error('brush key not found in ja/en: ' + k)
    for (const m of ms) t += m[1]
  }
  return sortU(ascii() + t)
}
const FAM = 'family=Klee+One:wght@600&family=BIZ+UDPGothic:wght@400;700'
export const fontHref = () => `https://fonts.googleapis.com/css2?${FAM}&display=swap&text=${encodeURIComponent(usedChars())}`
export const brushHref = () => `https://fonts.googleapis.com/css2?family=Yuji+Syuku&display=swap&text=${encodeURIComponent(brushChars())}`
if (process.argv[1] && process.argv[1].endsWith('fontlink.mjs')) {
  const p = ROOT + 'index.html', h = readFileSync(p, 'utf8')
  const tag = (id, href) => `<link id="${id}" href="${href.replace(/&/g, '&amp;')}" rel="stylesheet" media="print" onload="this.media='all'">`
  let out = h.replace(/<link id="gfonts"[^>]*>/, tag('gfonts', fontHref()))
  out = /<link id="gbrush"/.test(out) ? out.replace(/<link id="gbrush"[^>]*>/, tag('gbrush', brushHref())) : out.replace(/(<link id="gfonts"[^>]*>)/, `${tag('gbrush', brushHref())}\n$1`)
  if (!/<link id="gfonts"/.test(out)) throw new Error('font link not found')
  writeFileSync(p, out); console.log('chars', usedChars().length, 'brush', brushChars().length)
}
