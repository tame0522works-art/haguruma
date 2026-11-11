/** 歯数。モジュール 1 の歯車として、ピッチ円の半径は歯数の半分（8枚歯で 4）。 */
export type Teeth = 8 | 12 | 16 | 24

export const ALL_TEETH: readonly Teeth[] = [8, 12, 16, 24]

/** 0 = 下段、1 = 上段。同じ軸の2段は一緒に回る（同軸の2段歯車）。 */
export type Layer = 0 | 1

export interface Peg {
  id: string
  /** 座標は整数。噛み合いの判定を整数の2乗距離で厳密に行うため。 */
  x: number
  y: number
}

export interface Placement {
  peg: string
  layer: Layer
  teeth: Teeth
}

export interface Obstacle {
  x: number
  y: number
  r: number
}

export interface Output {
  peg: string
  /** 入力軸を 1 としたときの出力軸の回転。正 = 入力と同じ向き、負 = 逆向き。[分子, 分母]。 */
  ratio: [number, number]
}

export interface Puzzle {
  id: string
  title: string
  width: number
  height: number
  pegs: Peg[]
  /** 使える段の数。1 なら下段だけ。 */
  layers: 1 | 2
  /** 置ける歯車の種類。 */
  teeth: Teeth[]
  /** 種類ごとの在庫。書いていない種類は無制限。 */
  stock?: Partial<Record<Teeth, number>>
  /** 最初から付いていて外せない歯車（入力・出力の歯車など）。 */
  given: Placement[]
  input: string
  outputs: Output[]
  obstacles?: Obstacle[]
  /** その問題で初めて出てくる決まりの説明。 */
  note?: string
  /** 最少枚数（★3 の基準）。画面で毎回探さずに済むよう問題に持たせ、check:puzzles で solve の結果と照らす。 */
  best: number
}
