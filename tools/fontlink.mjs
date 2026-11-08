// Google Fonts を「画面で使う文字だけ」で読む（text= で1書体1ファイルの小さなフォントになる）。node tools/fontlink.mjs
// 文字を足したら build のあとで回す（verify.mjs が、足りない文字が無いか確かめる）
import { readFileSync, writeFileSync } from 'node:fs'
const ROOT = new URL('..', import.meta.url).pathname
export function usedChars() {
  const t = ['dist/game.js', 'index.html', 'sfx.js', 'tm.js'].map(f => readFileSync(ROOT + f, 'utf8')).join('')
  const cs = new Set([...t].filter(c => c.codePointAt(0) > 127))
  for (let i = 32; i < 127; i++) cs.add(String.fromCharCode(i))
  return [...cs].sort().join('')
}
const FAM = 'family=Yuji+Syuku&family=Klee+One:wght@600&family=BIZ+UDPGothic:wght@400;700'
export const fontHref = () => `https://fonts.googleapis.com/css2?${FAM}&display=swap&text=${encodeURIComponent(usedChars())}`
if (process.argv[1] && process.argv[1].endsWith('fontlink.mjs')) {
  const p = ROOT + 'index.html', h = readFileSync(p, 'utf8')
  const tag = `<link id="gfonts" href="${fontHref().replace(/&/g, '&amp;')}" rel="stylesheet" media="print" onload="this.media='all'">`
  const out = h.replace(/<link[^>]*fonts\.googleapis\.com\/css2[^>]*>/, tag)
  if (out === h && !h.includes(tag)) throw new Error('font link not found')
  writeFileSync(p, out); console.log('chars', usedChars().length, 'href', fontHref().length)
}
