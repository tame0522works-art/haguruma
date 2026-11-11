import type { Placement, Puzzle } from '../puzzles/types.ts'
import { keyOf, type Mesh } from './train.ts'

/**
 * 噛み合う歯車の歯が、相手の歯の谷にはまって見えるように、各歯車の最初の角度（ラジアン）を決める。
 * 歯車の形は「角度 0 の方向に歯の中心がある」として描く前提。
 *
 * A の中心から B の中心への向きを φ とすると、接点を指す A の向きは歯の単位で nA = (φ − θA)·TA/2π、
 * B の向きは nB = (φ + π − θB)·TB/2π。転がると数え方が逆になり、歯は相手の谷（半歯ずれ）に来るので
 * nB = 0.5 − nA。これを θB について解くと θB = φ + π − π/TB + (φ − θA)·TA/TB。
 * θA が増えると θB は TA/TB の割合で減るので、回転比とも食い違わない。
 *
 * 同じ軸の別の段は一緒に回るだけで歯の位置は関係ないので、角度は 0 から始める。
 * 偶数の輪では最初に通った道で決まり、輪を閉じる所で歯がずれて見えることがある（判定には関係しない）。
 */
export function initialAngles(puzzle: Puzzle, gears: readonly Placement[], meshes: readonly Mesh[]): Map<string, number> {
  const pegs = new Map(puzzle.pegs.map((p) => [p.id, p]))
  const byKey = new Map(gears.map((g) => [keyOf(g), g]))
  const next = new Map<string, string[]>()
  const link = (a: string, b: string) => {
    if (!next.has(a)) next.set(a, [])
    next.get(a)!.push(b)
  }
  for (const m of meshes) {
    link(m.a, m.b)
    link(m.b, m.a)
  }

  const angle = new Map<string, number>()
  // 入力軸の歯車から始め、残り（入力につながらない歯車）もそれぞれのまとまりで揃える
  const order = [...gears].sort((a, b) => Number(b.peg === puzzle.input) - Number(a.peg === puzzle.input))
  for (const start of order) {
    const k0 = keyOf(start)
    if (angle.has(k0)) continue
    angle.set(k0, 0)
    const queue = [k0]
    while (queue.length) {
      const k = queue.shift()!
      const a = byKey.get(k)!
      const pa = pegs.get(a.peg)!
      for (const kb of next.get(k) ?? []) {
        if (angle.has(kb)) continue
        const b = byKey.get(kb)!
        const pb = pegs.get(b.peg)!
        const phi = Math.atan2(pb.y - pa.y, pb.x - pa.x)
        angle.set(kb, phi + Math.PI - Math.PI / b.teeth + (phi - angle.get(k)!) * (a.teeth / b.teeth))
        queue.push(kb)
      }
      // 同じ軸の別の段
      for (const g of gears) {
        const kg = keyOf(g)
        if (g.peg === a.peg && !angle.has(kg)) {
          angle.set(kg, 0)
          queue.push(kg)
        }
      }
    }
  }
  return angle
}
