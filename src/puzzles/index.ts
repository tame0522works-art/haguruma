import type { Puzzle } from './types.ts'

// 試しの問題。座標の単位は歯車のモジュール（8枚歯のピッチ円の半径が 4）。
export const puzzles: Puzzle[] = [
  {
    id: 'first',
    title: 'はじめの一枚',
    width: 52,
    height: 28,
    pegs: [
      { id: 'I', x: 12, y: 14 },
      { id: 'a', x: 24, y: 14 },
      { id: 'b', x: 26, y: 14 },
      { id: 'O', x: 40, y: 14 },
    ],
    layers: 1,
    teeth: [8, 12, 16],
    given: [
      { peg: 'I', layer: 0, teeth: 16 },
      { peg: 'O', layer: 0, teeth: 16 },
    ],
    input: 'I',
    outputs: [{ peg: 'O', ratio: [1, 1] }],
    best: 1,
  },
  {
    id: 'reverse',
    title: '逆に回す',
    width: 64,
    height: 44,
    pegs: [{'id':'I','x':11,'y':19},{'id':'a','x':17,'y':27},{'id':'b','x':29,'y':27},{'id':'O','x':43,'y':27},{'id':'d','x':17,'y':11},{'id':'e','x':11,'y':5},{'id':'f','x':23,'y':19},{'id':'g','x':11,'y':13}],
    layers: 1,
    teeth: [8, 12, 16],
    given: [{'peg':'I','layer':0,'teeth':12},{'peg':'O','layer':0,'teeth':12}],
    input: 'I',
    outputs: [{'peg':'O','ratio':[-1,1]}],
    best: 2,
  },
  {
    id: 'third',
    title: '三分の一',
    width: 64,
    height: 44,
    pegs: [{'id':'I','x':8,'y':26},{'id':'a','x':16,'y':32},{'id':'O','x':28,'y':32},{'id':'c','x':16,'y':24},{'id':'d','x':16,'y':16},{'id':'e','x':8,'y':10},{'id':'f','x':24,'y':26},{'id':'g','x':8,'y':34},{'id':'h','x':34,'y':24}],
    layers: 2,
    teeth: [8, 12, 16, 24],
    given: [{'peg':'I','layer':0,'teeth':8},{'peg':'O','layer':0,'teeth':16}],
    input: 'I',
    outputs: [{'peg':'O','ratio':[1,3]}],
    best: 3,
  },
]
