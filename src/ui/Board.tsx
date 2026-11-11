import { useEffect, useMemo, useRef } from 'react'
import { initialAngles } from '../engine/phase.ts'
import { toNumber } from '../engine/rational.ts'
import { keyOf, type Evaluation } from '../engine/train.ts'
import type { Placement, Puzzle } from '../puzzles/types.ts'
import { gearPath } from './gearPath.ts'

/** 入力軸の回る速さ（ラジアン/秒）。1/9 でも動きが見え、3倍でも目で追える速さ。 */
const INPUT_SPEED = 2 * Math.PI * 0.12

interface Props {
  puzzle: Puzzle
  gears: readonly Placement[]
  ev: Evaluation
  selected: string | null
  hinted?: string | null
  /** 回さずに向きの矢印で示すか（動きを減らす設定で、本人が「回して見る」を選んでいないとき）。 */
  still: boolean
  onSelect: (peg: string) => void
}

export function Board({ puzzle, gears, ev, selected, hinted = null, still: reduced, onSelect }: Props) {
  const fixed = useMemo(() => new Set(puzzle.given.map(keyOf)), [puzzle])
  const all = useMemo(() => [...puzzle.given, ...gears], [puzzle, gears])
  const angles = useMemo(() => initialAngles(puzzle, all, ev.meshes), [puzzle, all, ev.meshes])
  const pegs = useMemo(() => new Map(puzzle.pegs.map((p) => [p.id, p])), [puzzle])
  const refs = useRef(new Map<string, SVGGElement>())

  // 問題のある歯車・軸・障害物
  const { badGears, badPegs, badObstacles } = useMemo(() => {
    const badGears = new Set<string>()
    const badPegs = new Set<string>()
    const badObstacles = new Set<number>()
    for (const i of ev.issues) {
      switch (i.kind) {
        case 'collide':
          badGears.add(i.a).add(i.b)
          break
        case 'covers':
          badGears.add(i.a)
          badPegs.add(i.peg)
          break
        case 'obstacle':
          badGears.add(i.a)
          badObstacles.add(i.index)
          break
        case 'outside':
        case 'overlap':
          badGears.add(i.a)
          break
        case 'jam':
          for (const g of gears) if (i.pegs.includes(g.peg)) badGears.add(keyOf(g))
          for (const g of puzzle.given) if (i.pegs.includes(g.peg)) badGears.add(keyOf(g))
          break
        case 'stock':
          break
      }
    }
    return { badGears, badPegs, badObstacles }
  }, [ev.issues, gears, puzzle.given])

  // 回転は React を通さず、毎フレーム transform を直接書き換える
  useEffect(() => {
    const place = (t: number) => {
      for (const [key, el] of refs.current) {
        const peg = key.split(':')[0]
        const w = ev.moving ? ev.omega.get(peg) : undefined
        const a = (angles.get(key) ?? 0) + (w ? toNumber(w) * INPUT_SPEED * t : 0)
        el.setAttribute('transform', `rotate(${((a * 180) / Math.PI).toFixed(3)})`)
      }
    }
    if (!ev.moving || reduced) {
      place(0)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      place((now - t0) / 1000)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [angles, ev.moving, ev.omega, reduced])

  const layer = (l: 0 | 1) =>
    all
      .filter((g) => g.layer === l)
      .map((g) => {
        const k = keyOf(g)
        const p = pegs.get(g.peg)!
        const cls = ['gear', l ? 'upper' : 'lower', fixed.has(k) ? 'fixed' : 'placed', badGears.has(k) ? 'bad' : ''].join(' ')
        return (
          <g key={k} transform={`translate(${p.x} ${p.y})`} className={cls}>
            <g className="shake">
              <g
                ref={(el) => {
                  if (el) refs.current.set(k, el)
                  else refs.current.delete(k)
                }}
              >
                <path d={gearPath(g.teeth)} fillRule="evenodd" />
              </g>
            </g>
          </g>
        )
      })

  const occupied = new Set(all.map((g) => g.peg))
  const outputPegs = new Set(puzzle.outputs.map((o) => o.peg))

  return (
    <svg className="board" viewBox={`0 0 ${puzzle.width} ${puzzle.height}`} role="group" aria-label="歯車の盤">
      <rect className="plate" x={0} y={0} width={puzzle.width} height={puzzle.height} rx={2} />
      {(puzzle.obstacles ?? []).map((o, i) => (
        <circle key={i} className={`obstacle${badObstacles.has(i) ? ' bad' : ''}`} cx={o.x} cy={o.y} r={o.r} />
      ))}
      {layer(0)}
      {layer(1)}
      {reduced &&
        ev.moving &&
        [...ev.omega].map(([peg, w]) => {
          // 動きを減らす設定では回さないので、回る向きを矢印で示す
          const p = pegs.get(peg)!
          return <path key={peg} className="spin-arrow" transform={`translate(${p.x} ${p.y})${w.n < 0 ? ' scale(1 -1)' : ''}`} d={ARROW} />
        })}
      {puzzle.pegs.map((p) => {
        const isIn = p.id === puzzle.input
        const isOut = outputPegs.has(p.id)
        return (
          <g key={p.id} transform={`translate(${p.x} ${p.y})`}>
            {isOut && <circle className="target" r={2.3} />}
            {isOut && puzzle.outputs.length > 1 && (
              <text className="out-num" x={2.4} y={-2.4}>
                {puzzle.outputs.findIndex((o) => o.peg === p.id) + 1}
              </text>
            )}
            {p.id === hinted && <circle className="hint-ring" r={3.2} />}
            {p.id === selected && <circle className="selected" r={2.8} />}
            <circle className={`peg${occupied.has(p.id) ? ' used' : ''}${isIn ? ' input' : ''}${badPegs.has(p.id) ? ' bad' : ''}`} r={isIn ? 1.3 : 1} />
            <circle
              className="hit"
              r={3.4}
              role="button"
              tabIndex={0}
              aria-label={pegLabel(puzzle, p.id, all)}
              aria-pressed={p.id === selected}
              onClick={() => onSelect(p.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(p.id)
                }
              }}
            />
          </g>
        )
      })}
    </svg>
  )
}

/** 軸のまわりの時計回りの矢印（半径 2.6、3/4 周）。反時計回りは上下を裏返して使う。 */
const ARROW = (() => {
  const r = 2.6
  const a0 = -Math.PI / 2
  const a1 = a0 + Math.PI * 1.4
  const p = (a: number, rr = r) => `${(rr * Math.cos(a)).toFixed(2)} ${(rr * Math.sin(a)).toFixed(2)}`
  return `M${p(a0)} A${r} ${r} 0 1 1 ${p(a1)} M${p(a1 + 0.35, r)} L${p(a1, r + 0.9)} M${p(a1 + 0.35, r)} L${p(a1, r - 0.9)}`
})()

export function roleOf(puzzle: Puzzle, peg: string): string {
  if (peg === puzzle.input) return '入力の軸'
  const i = puzzle.outputs.findIndex((o) => o.peg === peg)
  if (i < 0) return '軸'
  return puzzle.outputs.length > 1 ? `出力${i + 1}の軸` : '出力の軸'
}

function pegLabel(puzzle: Puzzle, peg: string, all: readonly Placement[]): string {
  const role = roleOf(puzzle, peg)
  const on = all
    .filter((g) => g.peg === peg)
    .sort((a, b) => a.layer - b.layer)
    .map((g) => `${puzzle.layers === 2 ? (g.layer ? '上段 ' : '下段 ') : ''}${g.teeth}枚歯`)
  return `${role}${on.length ? `、${on.join('、')}` : '、空き'}`
}
