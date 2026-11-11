/** ★3 = 最少枚数、★2 = 最少 + 1 枚まで、★1 = それ以上でも解けた。 */
export function stars(used: number, min: number): 1 | 2 | 3 {
  if (used <= min) return 3
  if (used <= min + 1) return 2
  return 1
}
