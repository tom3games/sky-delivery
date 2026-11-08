// 公開物を1つにまとめる。node tools/build.mjs で dist/game.js を作る（js/ shared/ を直したら毎回。verify.mjs も最初に呼ぶ）
// 細かいモジュール約40件を1件にして、最初の読み込みを速くする（kobito-escape v5 と同じやり方）
// esbuild はリポジトリに入れない。入っていなければ: mkdir -p ~/tools/esb && cd ~/tools/esb && npm i esbuild
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { resolve, dirname } from 'node:path'
const esbuild = createRequire(homedir() + '/tools/esb/x.js')('esbuild')
const ROOT = resolve(import.meta.dirname, '..')
// import の ?v=N を外す。同じファイルが2回入らないようにする
const noQuery = { name: 'no-query', setup(b) { b.onResolve({ filter: /\?/ }, a => ({ path: resolve(a.resolveDir || dirname(a.importer), a.path.split('?')[0]) })) } }
const r = await esbuild.build({
  absWorkingDir: ROOT, entryPoints: ['js/game.js'], outfile: 'dist/game.js', bundle: true, format: 'esm', minify: true,
  target: 'es2020', charset: 'utf8', legalComments: 'eof', alias: { three: resolve(ROOT, 'vendor/three.module.min.js') },
  plugins: [noQuery], logLevel: 'warning', metafile: true
})
const out = r.metafile.outputs['dist/game.js']
console.log('dist/game.js', (out.bytes / 1024).toFixed(0) + 'KB', Object.keys(r.metafile.inputs).length + 'files')
// 画面で使う文字だけのフォントの読み込みを index.html に書き直す（文字が増えても漏れない）
const { execFileSync } = await import('node:child_process')
execFileSync(process.execPath, [resolve(ROOT, 'tools/fontlink.mjs')], { cwd: ROOT, stdio: 'inherit' })
