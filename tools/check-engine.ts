// 手で答えの分かる例でエンジンを確かめる。
import { initialAngles } from '../src/engine/phase.ts'
import { format, toNumber } from '../src/engine/rational.ts'
import { solve } from '../src/engine/solve.ts'
import { evaluate, keyOf, type Issue } from '../src/engine/train.ts'
import { puzzles } from '../src/puzzles/index.ts'
import { ALL_TEETH, type Peg, type Placement, type Puzzle, type Teeth } from '../src/puzzles/types.ts'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'NG  '} ${name}${detail ? `  (${detail})` : ''}`)
}

function puzzle(pegs: [string, number, number][], extra: Partial<Puzzle> = {}): Puzzle {
  return {
    id: 't',
    title: 't',
    width: 100,
    height: 100,
    pegs: pegs.map(([id, x, y]): Peg => ({ id, x, y })),
    layers: 2,
    teeth: [...ALL_TEETH],
    given: [],
    input: 'I',
    outputs: [],
    best: 0,
    ...extra,
  }
}
const g = (peg: string, teeth: Teeth, layer: 0 | 1 = 0): Placement => ({ peg, layer, teeth })
const kinds = (issues: Issue[]) => issues.map((i) => i.kind).join(',')

{
  const p = puzzle([['I', 20, 20], ['B', 32, 20]])
  const ev = evaluate(p, [g('I', 16), g('B', 8)])
  check('16→8 で 2倍・逆向き', format(ev.omega.get('B')!) === '-2' && ev.moving, format(ev.omega.get('B')!))
}
{
  const p = puzzle([['I', 20, 20], ['B', 32, 20], ['C', 44, 20]])
  const ev = evaluate(p, [g('I', 16), g('B', 8), g('C', 16)])
  check('遊び歯車を挟むと同じ向き・同じ速さ', format(ev.omega.get('C')!) === '1')
}
{
  // 斜めの噛み合い: (6,8) 離れて距離 10 = 4 + 6
  const p = puzzle([['I', 20, 20], ['B', 26, 28]])
  const ev = evaluate(p, [g('I', 8), g('B', 12)])
  check('斜め (6,8) で 8枚と12枚が噛み合う', format(ev.omega.get('B')!) === '-2/3')
}
{
  const p = puzzle([['I', 20, 20], ['B', 36, 20], ['C', 52, 20]])
  const ev = evaluate(p, [g('I', 8), g('B', 24), g('B', 8, 1), g('C', 24, 1)])
  check('同軸2段で 1/9', format(ev.omega.get('C')!) === '1/9' && ev.issues.length === 0, kinds(ev.issues))
}
{
  // 2本の軸を2段で結び、比が食い違う（-1 と -1/3）
  const p = puzzle([['I', 20, 20], ['B', 36, 20]])
  const ev = evaluate(p, [g('I', 16), g('B', 16), g('I', 8, 1), g('B', 24, 1)])
  check('2段で比が食い違うと固まる', kinds(ev.issues) === 'jam' && !ev.moving, kinds(ev.issues))
}
{
  // 3枚の輪（奇数）は向きが食い違って固まる。格子点で辺が半径の和になる三角形を探す。
  let found: { pegs: [string, number, number][]; gears: Placement[] } | null = null
  search: for (const a of ALL_TEETH)
    for (const b of ALL_TEETH)
      for (const c of ALL_TEETH) {
        const ab = (a + b) / 2
        const ac = (a + c) / 2
        const bc = (b + c) / 2
        for (let x = -ac; x <= ac; x++)
          for (let y = 1; y <= ac; y++) {
            if (x * x + y * y !== ac * ac) continue
            if ((x - ab) ** 2 + y * y !== bc * bc) continue
            found = {
              pegs: [['I', 40, 40], ['B', 40 + ab, 40], ['C', 40 + x, 40 + y]],
              gears: [g('I', a), g('B', b), g('C', c)],
            }
            break search
          }
      }
  check('奇数の輪になる格子点の三角形がある', found !== null)
  if (found) {
    const ev = evaluate(puzzle(found.pegs), found.gears)
    const jam = ev.issues.find((i) => i.kind === 'jam')
    check('3枚の輪は固まる', !!jam && jam.pegs.length === 3 && !ev.moving, `${found.gears.map((x) => x.teeth)} ${kinds(ev.issues)}`)
  }
}
{
  // 4枚の輪（偶数）なら回る: 16枚を正方形の角に、辺 16
  const p = puzzle([['I', 20, 20], ['B', 36, 20], ['C', 36, 36], ['D', 20, 36]])
  const ev = evaluate(p, [g('I', 16), g('B', 16), g('C', 16), g('D', 16)])
  check('偶数の輪は回る', ev.moving && ev.issues.length === 0 && format(ev.omega.get('C')!) === '1', kinds(ev.issues))
}
{
  const p = puzzle([['I', 20, 20], ['B', 35, 20], ['C', 37, 20], ['D', 38, 20]])
  check('距離 15（半径の和 16 より近い）はぶつかる', kinds(evaluate(p, [g('I', 16), g('B', 16)]).issues) === 'collide')
  check('距離 17（歯先が重なる）はぶつかる', kinds(evaluate(p, [g('I', 16), g('C', 16)]).issues) === 'collide')
  check('距離 18（歯先が触れるだけ）はぶつからない', kinds(evaluate(p, [g('I', 16), g('D', 16)]).issues) === '')
  check('別の段ならぶつからない', kinds(evaluate(p, [g('I', 16), g('C', 16, 1)]).issues) === '', kinds(evaluate(p, [g('I', 16), g('C', 16, 1)]).issues))
}
{
  const p = puzzle([['I', 20, 20], ['P', 25, 20]])
  const ev = evaluate(p, [g('I', 24), g('P', 8, 1)])
  check('別の段の軸にかぶさるとぶつかる', ev.issues.length > 0 && ev.issues.every((i) => i.kind === 'covers'), kinds(ev.issues))
  check('軸の上に何も付いていなければかぶさってよい', kinds(evaluate(p, [g('I', 24)]).issues) === '')
}
{
  const p = puzzle([['I', 5, 20]])
  check('盤の外にはみ出す', kinds(evaluate(p, [g('I', 16)]).issues) === 'outside')
  const q = puzzle([['I', 20, 20]], { obstacles: [{ x: 30, y: 20, r: 2 }] })
  check('障害物に当たる', kinds(evaluate(q, [g('I', 16)]).issues) === 'obstacle')
  check('障害物に届かない', kinds(evaluate(q, [g('I', 8)]).issues) === '')
}
{
  const p = puzzle([['I', 20, 20], ['B', 32, 20]], { stock: { 8: 0 } })
  check('在庫切れ', kinds(evaluate(p, [g('I', 16), g('B', 8)]).issues) === 'stock')
}
{
  const base = puzzle([['I', 16, 16], ['M', 28, 16], ['O', 40, 16]], { given: [g('I', 16), g('O', 16)], layers: 1 })
  const same = solve({ ...base, outputs: [{ peg: 'O', ratio: [1, 1] }] })
  check('間に1枚で同じ向き（最少 1 枚）', same.min === 1 && same.solutions.length === 1, `min=${same.min} 解=${same.solutions.length}`)
  const opposite = solve({ ...base, outputs: [{ peg: 'O', ratio: [-1, 1] }] })
  check('軸が1本では逆向きにできない', opposite.min === null, `min=${opposite.min}`)
}
{
  // 1/9 は同軸2段を2回使わないと出ない（1段で歯数の比は最大 24:8 = 3）
  const p = puzzle([['I', 20, 20], ['B', 36, 20], ['C', 52, 20]], {
    given: [g('I', 8), g('C', 24, 1)],
    outputs: [{ peg: 'C', ratio: [1, 9] }],
  })
  const r = solve(p)
  check('1/9 は 24枚 + 8枚（同軸）の 2 枚で解ける', r.min === 2, `min=${r.min} 解=${r.solutions.length} 盤面=${r.nodes}`)
  const ev = evaluate(p, r.solutions[0] ?? [])
  check('解は evaluate でも solved', ev.solved)
}

{
  // 見た目の角度: 全問の解で、噛み合う2枚の歯が相手の谷の真ん中に来ているか。回したあと（t = 0.37, 2.9）も確かめる。
  let worst = 0
  let meshes = 0
  for (const p of puzzles) {
    const sol = solve(p).solutions[0]
    const all = [...p.given, ...sol]
    const ev = evaluate(p, sol)
    const base = initialAngles(p, all, ev.meshes)
    const byKey = new Map(all.map((x) => [keyOf(x), x]))
    const pegs = new Map(p.pegs.map((x) => [x.id, x]))
    for (const t of [0, 0.37, 2.9]) {
      const angle = (k: string) => base.get(k)! + toNumber(ev.omega.get(k.split(':')[0])!) * t
      for (const m of ev.meshes) {
        const a = byKey.get(m.a)!
        const b = byKey.get(m.b)!
        const pa = pegs.get(a.peg)!
        const pb = pegs.get(b.peg)!
        const phi = Math.atan2(pb.y - pa.y, pb.x - pa.x)
        const nA = ((phi - angle(m.a)) * a.teeth) / (2 * Math.PI)
        const nB = ((phi + Math.PI - angle(m.b)) * b.teeth) / (2 * Math.PI)
        // nA + nB が 0.5 の整数ずれなら、歯と谷が向き合っている
        const off = Math.abs(((((nA + nB - 0.5) % 1) + 1.5) % 1) - 0.5)
        worst = Math.max(worst, off)
        meshes++
      }
    }
  }
  check('全問の解で歯が相手の谷に向き合う', worst < 1e-9, `${meshes} 組、最大のずれ ${worst.toExponential(1)} 歯`)
}

console.log(failures ? `\n${failures} 件の NG` : '\nすべて ok')
process.exit(failures ? 1 : 0)
