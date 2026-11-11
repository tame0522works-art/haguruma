/** 回転比は割り切れないことが多い（12:8 など）ので、小数にせず分数のまま扱う。分母は常に正。 */
export interface Rational {
  readonly n: number
  readonly d: number
}

function gcd(a: number, b: number): number {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b) [a, b] = [b, a % b]
  return a
}

export function rat(n: number, d = 1): Rational {
  if (d === 0) throw new Error('分母が 0')
  if (d < 0) {
    n = -n
    d = -d
  }
  const g = gcd(n, d) || 1
  return { n: n / g, d: d / g }
}

export const mul = (a: Rational, b: Rational): Rational => rat(a.n * b.n, a.d * b.d)
export const neg = (a: Rational): Rational => rat(-a.n, a.d)
export const eq = (a: Rational, b: Rational): boolean => a.n === b.n && a.d === b.d
export const toNumber = (a: Rational): number => a.n / a.d

/** 表示用。「-1/3」「2」の形。 */
export const format = (a: Rational): string => (a.d === 1 ? `${a.n}` : `${a.n}/${a.d}`)
