// 全問が解けること、最初の盤面がまだ解けていないこと、軸の id が重ならないことを確かめ、最少枚数と解の数を出す。
import { format, rat } from '../src/engine/rational.ts'
import { solve } from '../src/engine/solve.ts'
import { evaluate } from '../src/engine/train.ts'
import { puzzles } from '../src/puzzles/index.ts'

const showAll = process.argv.includes('--show')
let failures = 0

for (const [i, p] of puzzles.entries()) {
  const problems: string[] = []
  const ids = p.pegs.map((x) => x.id)
  if (new Set(ids).size !== ids.length) problems.push('軸の id が重なっている')
  if (new Set(puzzles.map((x) => x.id)).size !== puzzles.length) problems.push('問題の id が重なっている')
  if (!p.given.some((g) => g.peg === p.input)) problems.push('入力軸に歯車がない')

  const start = evaluate(p, [])
  if (start.issues.length) problems.push(`最初の盤面に問題: ${start.issues.map((x) => x.kind).join(',')}`)
  if (start.solved) problems.push('最初から解けている')

  const t0 = performance.now()
  const r = solve(p)
  const ms = Math.round(performance.now() - t0)
  if (r.min === null) problems.push('解けない')
  else if (r.min !== p.best) problems.push(`best が ${p.best} だが最少は ${r.min}`)

  const targets = p.outputs.map((o) => `${o.peg}=${format(rat(...o.ratio))}`).join(' ')
  const status = problems.length ? `NG ${problems.join(' / ')}` : 'ok'
  console.log(
    `${String(i + 1).padStart(2)} ${p.id.padEnd(10)} ${targets.padEnd(10)} 最少 ${r.min ?? '-'} 枚  解 ${r.solutions.length}${r.solutions.length >= 50 ? '+' : ''}  盤面 ${r.nodes}  ${ms}ms  ${status}`,
  )
  if (showAll || problems.length === 0) {
    for (const s of r.solutions.slice(0, showAll ? 50 : 3)) {
      console.log(`     ${s.map((x) => `${x.peg}${x.layer ? '上' : ''}:${x.teeth}`).join(' ')}`)
    }
  }
  if (problems.length) failures++
}

console.log(failures ? `\n${failures} 問が NG` : '\nすべて ok')
process.exit(failures ? 1 : 0)
