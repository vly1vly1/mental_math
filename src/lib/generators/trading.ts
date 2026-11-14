import type { Question } from '../types'
import { eur, fmt, pick, randInt, round, sign } from '../util'

export const TRADING_LEVELS = ['Desk warm-up', 'Working trader', 'Under pressure']

type Draft = Omit<Question, 'category' | 'level' | 'key' | 'topic' | 'long' | 'tolerance'> & { tolerance?: number }
type TopicGen = (level: number) => Draft

const px = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const pc = (n: number) => `${fmt(n)}%`
const LOSS = 'losses negative'

const positionSizing: TopicGen = (lv) => {
  if (lv === 1) {
    const d = pick([0.5, 1, 2, 4, 5])
    const shares = randInt(2, 40) * 10
    const risk = d * shares
    return {
      prompt: `You are willing to risk ${eur(risk)} on a trade. Your stop is ${eur(d)} per share away from entry. How many shares can you buy?`,
      answer: shares,
      suffix: ' shares',
      explanation: `Size = risk ÷ stop distance = ${fmt(risk)} ÷ ${fmt(d)} = ${fmt(shares)} shares`,
    }
  }
  const acct = randInt(2, 40) * 5000
  const p = pick([0.5, 1, 2])
  const risk = (acct * p) / 100
  const d = pick([0.5, 1, 2.5, 5].filter((x) => Number.isInteger(risk / x)))
  const shares = risk / d
  const entry = randInt(20, 200)
  const where =
    lv === 2 ? `Your stop is ${eur(d)} per share away.` : `You buy at ${eur(entry)} with a stop at ${eur(entry - d)}.`
  return {
    prompt: `Account ${eur(acct)}, risking ${pc(p)} per trade. ${where} What is the position size in shares?`,
    answer: shares,
    suffix: ' shares',
    explanation: `Risk = ${pc(p)} of ${fmt(acct)} = ${eur(risk)}; ${fmt(risk)} ÷ ${fmt(d)} per share = ${fmt(shares)} shares`,
  }
}

const notional: TopicGen = (lv) => {
  if (lv === 1) {
    const q = randInt(1, 20) * 100
    const p = randInt(11, 99)
    return {
      prompt: `You are long ${fmt(q)} shares trading at ${eur(p)}. What is your notional exposure?`,
      answer: q * p,
      prefix: '€',
      explanation: `${fmt(q)} × ${p} = ${eur(q * p)}`,
    }
  }
  const n = lv === 2 ? randInt(2, 25) : randInt(3, 15)
  const mult = lv === 2 ? pick([10, 20, 50]) : pick([5, 10, 25, 50])
  const idx = lv === 2 ? randInt(30, 90) * 100 + pick([0, 50]) : randInt(600, 1600) * 5
  return {
    prompt: `You hold ${n} index futures. The multiplier is ${eur(mult)} per point and the index is at ${fmt(idx)}. What is the notional exposure?`,
    answer: n * mult * idx,
    prefix: '€',
    explanation: `${n} × ${mult} = ${fmt(n * mult)} per point; × ${fmt(idx)} = ${eur(n * mult * idx)}`,
  }
}

const pnl: TopicGen = (lv) => {
  if (lv === 1) {
    const entry = randInt(20, 150)
    const delta = randInt(1, 12) * sign()
    const q = randInt(1, 20) * 100
    return {
      prompt: `You buy ${fmt(q)} shares at ${eur(entry)} and sell at ${eur(entry + delta)}. What is the P&L?`,
      answer: delta * q,
      prefix: '€',
      hint: LOSS,
      explanation: `(${entry + delta} − ${entry}) × ${fmt(q)} = ${fmt(delta)} × ${fmt(q)} = ${eur(delta * q)}`,
    }
  }
  const short = lv === 3 && Math.random() < 0.5
  const n = lv === 2 ? randInt(20, 400) * 500 : randInt(10, 250) * 2000
  const move = lv === 2 ? pick([0.2, 0.4, 0.5, 0.8, 1, 1.2, 1.5, 2, 2.5, 3]) : round(randInt(3, 60) * 0.05, 2)
  const dir = sign()
  const ans = round(((n * move) / 100) * dir * (short ? -1 : 1), 2)
  return {
    prompt: `A ${short ? 'short' : 'long'} position has a notional value of ${eur(n)}. The asset ${
      dir > 0 ? 'rises' : 'falls'
    } ${pc(move)}. What is the P&L?`,
    answer: ans,
    prefix: '€',
    hint: LOSS,
    tolerance: 0.005,
    explanation: `1% of ${fmt(n)} = ${fmt(n / 100)}; × ${fmt(move)} = ${fmt(round((n * move) / 100, 2))}. ${
      short ? 'Short' : 'Long'
    } and price ${dir > 0 ? 'up' : 'down'} → ${eur(ans)}`,
  }
}

const pctReturn: TopicGen = (lv) => {
  if (lv <= 2) {
    const e = lv === 1 ? pick([20, 25, 40, 50, 80, 100, 200, 250, 400, 500]) : pick([40, 80, 120, 125, 160, 250, 400, 800])
    const r = lv === 1 ? randInt(1, 15) * sign() : randInt(1, 30) * 0.5 * sign()
    const x = round(e * (1 + r / 100), 4)
    return {
      prompt: `You buy at ${eur(e)} and the price moves to ${eur(x)}. What is the percentage return?`,
      answer: r,
      suffix: '%',
      hint: LOSS,
      tolerance: 0.005,
      explanation: `Change ${fmt(round(x - e, 4))} on ${e}: 1% of ${e} is ${fmt(e / 100)}, so ${fmt(round(x - e, 4))} ÷ ${fmt(
        e / 100,
      )} = ${pc(r)}`,
    }
  }
  const cost = randInt(3, 60) * 4000
  const r = randInt(1, 60) * 0.25 * sign()
  const val = round(cost * (1 + r / 100), 2)
  return {
    prompt: `A position bought for ${eur(cost)} is now worth ${eur(val)}. What is the percentage return?`,
    answer: r,
    suffix: '%',
    hint: LOSS,
    tolerance: 0.005,
    explanation: `P&L = ${eur(round(val - cost, 2))}; 1% of ${fmt(cost)} = ${fmt(cost / 100)} → ${fmt(
      round(val - cost, 2),
    )} ÷ ${fmt(cost / 100)} = ${pc(r)}`,
  }
}

const basisPoints: TopicGen = (lv) => {
  if (lv === 1) {
    if (Math.random() < 0.5) {
      const x = randInt(1, 300) / 100
      return {
        prompt: `How many basis points is ${pc(x)}?`,
        answer: round(x * 100, 2),
        suffix: ' bps',
        explanation: `1% = 100 bps, so ${pc(x)} = ${fmt(round(x * 100, 2))} bps`,
      }
    }
    const b = randInt(1, 400)
    return {
      prompt: `Convert ${b} basis points to a percentage.`,
      answer: b / 100,
      suffix: '%',
      tolerance: 0.0005,
      explanation: `100 bps = 1%, so ${b} bps = ${pc(b / 100)}`,
    }
  }
  if (lv === 2 || Math.random() < 0.5) {
    const b = lv === 2 ? pick([1, 2, 5, 10, 15, 20, 25, 40, 50, 75]) : pick([0.5, 1.5, 2.5, 7.5, 12.5])
    const n = lv === 2 ? randInt(1, 50) * 100_000 : randInt(1, 40) * 1_000_000
    const ans = round((n * b) / 10000, 2)
    return {
      prompt: `What is ${fmt(b)} bps of ${eur(n)}?`,
      answer: ans,
      prefix: '€',
      tolerance: 0.005,
      explanation: `1 bp of ${fmt(n)} = ${fmt(n / 10000)}; × ${fmt(b)} = ${eur(ans)}`,
    }
  }
  const y1 = randInt(100, 500) / 100
  const db = randInt(3, 45) * sign()
  const y2 = round(y1 + db / 100, 2)
  return {
    prompt: `A bond yield moves from ${y1.toFixed(2)}% to ${y2.toFixed(2)}%. What is the change in basis points?`,
    answer: db,
    suffix: ' bps',
    hint: 'negative for a fall',
    explanation: `${y2.toFixed(2)} − ${y1.toFixed(2)} = ${fmt(round(y2 - y1, 2))} percentage points = ${fmt(db)} bps`,
  }
}

const leverage: TopicGen = (lv) => {
  if (lv === 1) {
    const eq = randInt(2, 40) * 5000
    const l = pick([2, 3, 4, 5, 8, 10, 20])
    if (Math.random() < 0.5)
      return {
        prompt: `${eur(eq)} of equity controls a position with ${eur(eq * l)} notional. What is the leverage?`,
        answer: l,
        suffix: '×',
        explanation: `Leverage = notional ÷ equity = ${fmt(eq * l)} ÷ ${fmt(eq)} = ${l}×`,
      }
    return {
      prompt: `You have ${eur(eq)} of equity and trade at ${l}× leverage. What notional do you control?`,
      answer: eq * l,
      prefix: '€',
      explanation: `${fmt(eq)} × ${l} = ${eur(eq * l)}`,
    }
  }
  if (lv === 2) {
    const l = pick([2, 3, 4, 5, 8, 10])
    const mv = pick([0.5, 1, 1.5, 2, 2.5, 3, 4]) * sign()
    return {
      prompt: `You are long at ${l}× leverage and the asset moves ${mv > 0 ? '+' : '−'}${pc(Math.abs(mv))}. What is the return on your equity?`,
      answer: l * mv,
      suffix: '%',
      hint: LOSS,
      tolerance: 0.005,
      explanation: `Return on equity = leverage × move = ${l} × ${fmt(mv)}% = ${pc(l * mv)}`,
    }
  }
  if (Math.random() < 0.5) {
    const n = randInt(2, 80) * 25000
    const mr = pick([2, 2.5, 4, 5, 10, 12.5, 20, 25])
    return {
      prompt: `A position has ${eur(n)} notional and the margin requirement is ${pc(mr)}. How much margin is needed?`,
      answer: (n * mr) / 100,
      prefix: '€',
      tolerance: 0.005,
      explanation: `${pc(mr)} of ${fmt(n)} = ${eur((n * mr) / 100)} (that is ${fmt(100 / mr)}× leverage)`,
    }
  }
  const l = pick([2, 4, 5, 8, 10, 16, 20, 25, 40, 50])
  return {
    prompt: `At ${l}× leverage, what adverse percentage move wipes out your equity?`,
    answer: 100 / l,
    suffix: '%',
    tolerance: 0.005,
    explanation: `100% ÷ ${l} = ${pc(100 / l)}`,
  }
}

const probability: TopicGen = (lv) => {
  const p1 = lv === 1 ? randInt(1, 9) * 10 : randInt(2, 18) * 5
  const p2 = lv === 1 ? randInt(1, 9) * 10 : randInt(1, 9) * 10
  const base = { suffix: '%', tolerance: 0.005 }
  if (lv === 1)
    return {
      ...base,
      prompt: `Two independent events have probabilities ${p1}% and ${p2}%. What is the probability that both happen?`,
      answer: round((p1 * p2) / 100, 4),
      explanation: `${fmt(p1 / 100)} × ${fmt(p2 / 100)} = ${fmt(round((p1 * p2) / 10000, 4))} = ${pc(round((p1 * p2) / 100, 4))}`,
    }
  if (lv === 2) {
    const none = round(((100 - p1) * (100 - p2)) / 100, 4)
    return {
      ...base,
      prompt: `Two independent trades win with probabilities ${p1}% and ${p2}%. What is the probability that at least one wins?`,
      answer: round(100 - none, 4),
      explanation: `P(neither) = ${fmt((100 - p1) / 100)} × ${fmt((100 - p2) / 100)} = ${pc(none)}; 100% − ${pc(none)} = ${pc(
        round(100 - none, 4),
      )}`,
    }
  }
  if (Math.random() < 0.5) {
    const p = randInt(2, 9) * 10
    const n = pick([2, 3])
    const ans = round((p / 100) ** n * 100, 4)
    return {
      ...base,
      prompt: `A strategy wins ${p}% of its trades, independently. What is the probability of ${n} wins in a row?`,
      answer: ans,
      explanation: `${fmt(p / 100)}${n === 2 ? '²' : '³'} = ${fmt(round((p / 100) ** n, 6))} = ${pc(ans)}`,
    }
  }
  const ans = round((p1 * (100 - p2) + p2 * (100 - p1)) / 100, 4)
  return {
    ...base,
    prompt: `Two independent events have probabilities ${p1}% and ${p2}%. What is the probability that exactly one happens?`,
    answer: ans,
    explanation: `${fmt(p1 / 100)} × ${fmt((100 - p2) / 100)} + ${fmt(p2 / 100)} × ${fmt((100 - p1) / 100)} = ${pc(ans)}`,
  }
}

const expectedValue: TopicGen = (lv) => {
  if (lv <= 2) {
    const p = lv === 1 ? randInt(1, 9) * 10 : randInt(1, 19) * 5
    const unit = lv === 1 ? 100 : 20
    const w = randInt(1, lv === 1 ? 9 : 40) * unit
    const l = randInt(1, lv === 1 ? 9 : 40) * unit
    const ans = round((p * w - (100 - p) * l) / 100, 2)
    return {
      prompt: `A prediction market contract has a ${p}% probability of winning ${eur(w)} and a ${100 - p}% probability of losing ${eur(l)}. What is the expected value?`,
      answer: ans,
      prefix: '€',
      hint: 'negative if unfavourable',
      tolerance: 0.005,
      explanation: `${fmt(p / 100)} × ${fmt(w)} = ${fmt(round((p * w) / 100, 2))}; ${fmt((100 - p) / 100)} × ${fmt(l)} = ${fmt(
        round(((100 - p) * l) / 100, 2),
      )}; EV = ${fmt(round((p * w) / 100, 2))} − ${fmt(round(((100 - p) * l) / 100, 2))} = ${eur(ans)}`,
    }
  }
  const [a, b, c] = pick([
    [50, 30, 20],
    [60, 25, 15],
    [40, 35, 25],
    [70, 20, 10],
    [45, 35, 20],
  ])
  const w1 = randInt(2, 12) * 100
  const w2 = randInt(0, 3) * 100
  const l = randInt(2, 15) * 100
  const ans = round((a * w1 + b * w2 - c * l) / 100, 2)
  return {
    prompt: `A trade has three outcomes: ${a}% chance of +${eur(w1)}, ${b}% chance of ${w2 ? '+' + eur(w2) : 'breaking even'}, and ${c}% chance of −${eur(l)}. What is the expected value?`,
    answer: ans,
    prefix: '€',
    hint: 'negative if unfavourable',
    tolerance: 0.005,
    explanation: `${fmt(a / 100)} × ${fmt(w1)} + ${fmt(b / 100)} × ${fmt(w2)} − ${fmt(c / 100)} × ${fmt(l)} = ${fmt(
      (a * w1) / 100,
    )} + ${fmt((b * w2) / 100)} − ${fmt((c * l) / 100)} = ${eur(ans)}`,
  }
}

const riskReward: TopicGen = (lv) => {
  if (lv === 1) {
    const e = randInt(20, 200)
    const d = pick([1, 2, 4, 5])
    const k = pick([1.5, 2, 2.5, 3, 4, 5])
    return {
      prompt: `Long entry at ${eur(e)}, stop at ${eur(e - d)}, target at ${eur(e + k * d)}. What is the reward-to-risk ratio?`,
      answer: k,
      suffix: ' : 1',
      tolerance: 0.005,
      explanation: `Reward ${fmt(k * d)} ÷ risk ${d} = ${fmt(k)} : 1`,
    }
  }
  if (lv === 2) {
    const [k, be] = pick([
      [1, 50],
      [3, 25],
      [4, 20],
      [1.5, 40],
      [9, 10],
      [0.25, 80],
      [0.6, 62.5],
      [7, 12.5],
      [2, 33.33],
    ])
    return {
      prompt: `Your reward-to-risk ratio is ${fmt(k)} : 1. What win rate do you need to break even?`,
      answer: round(100 / (1 + k), 4),
      suffix: '%',
      tolerance: be === 33.33 ? 0.05 : 0.005,
      explanation: `Break-even win rate = 1 ÷ (1 + R) = 1 ÷ ${fmt(1 + k)} = ${pc(be)}`,
    }
  }
  const w = randInt(5, 14) * 5
  const k = pick([1.5, 2, 2.5, 3, 4])
  const ans = round((w / 100) * k - (1 - w / 100), 4)
  return {
    prompt: `A system wins ${w}% of the time with a ${fmt(k)} : 1 reward-to-risk ratio. What is the expectancy per trade, in R?`,
    answer: ans,
    suffix: ' R',
    tolerance: 0.0005,
    hint: 'e.g. 0.25',
    explanation: `${fmt(w / 100)} × ${fmt(k)} − ${fmt(1 - w / 100)} × 1 = ${fmt(round((w / 100) * k, 4))} − ${fmt(
      round(1 - w / 100, 4),
    )} = ${fmt(ans)} R`,
  }
}

const spread: TopicGen = (lv) => {
  if (lv <= 2) {
    const bid = randInt(1000, 9900) / 100
    const sp = pick([0.01, 0.02, 0.03, 0.05, 0.08, 0.1, 0.12, 0.15, 0.25])
    const ask = round(bid + sp, 2)
    if (lv === 1)
      return Math.random() < 0.5
        ? {
            prompt: `The market is ${px(bid)} bid, ${px(ask)} offered. What is the spread?`,
            answer: sp,
            prefix: '€',
            tolerance: 0.0005,
            explanation: `${px(ask)} − ${px(bid)} = ${fmt(sp)}`,
          }
        : {
            prompt: `The market is ${px(bid)} bid, ${px(ask)} offered. What is the mid price?`,
            answer: round((bid + ask) / 2, 4),
            prefix: '€',
            tolerance: 0.0005,
            explanation: `Bid + half the spread: ${px(bid)} + ${fmt(sp / 2)} = ${fmt(round((bid + ask) / 2, 4))}`,
          }
    const q = randInt(1, 50) * 100
    return {
      prompt: `The market is ${px(bid)} / ${px(ask)}. You buy ${fmt(q)} shares at the ask and sell them at the bid immediately. How much does the round trip cost?`,
      answer: round(q * sp, 2),
      prefix: '€',
      tolerance: 0.005,
      explanation: `Spread ${fmt(sp)} × ${fmt(q)} shares = ${eur(round(q * sp, 2))}`,
    }
  }
  const mid = pick([20, 25, 40, 50, 80, 100, 125, 200, 250])
  const bps = pick([4, 8, 10, 16, 20, 40])
  const half = (mid * bps) / 20000
  return {
    prompt: `The market is ${px(round(mid - half, 4))} / ${px(round(mid + half, 4))}. What is the bid/ask spread in basis points of the mid?`,
    answer: bps,
    suffix: ' bps',
    tolerance: 0.005,
    explanation: `Spread ${fmt(round(half * 2, 4))} on mid ${mid}; 1 bp of ${mid} = ${fmt(mid / 10000)} → ${fmt(
      round(half * 2, 4),
    )} ÷ ${fmt(mid / 10000)} = ${bps} bps`,
  }
}

const impliedProb: TopicGen = (lv) => {
  const base = { suffix: '%' }
  if (lv === 1) {
    const o = pick([1.25, 1.6, 2, 2.5, 4, 5, 8, 10, 20, 1.5, 3])
    return {
      ...base,
      prompt: `Decimal odds of ${o.toFixed(2)} imply what probability?`,
      answer: round(100 / o, 4),
      tolerance: 0.05,
      explanation: `Implied probability = 1 ÷ odds = 1 ÷ ${o} = ${pc(round(100 / o, 2))}`,
    }
  }
  if (lv === 2) {
    const [a, b] = pick([
      [3, 1],
      [4, 1],
      [1, 1],
      [1, 4],
      [3, 2],
      [9, 1],
      [1, 3],
      [7, 1],
      [2, 3],
      [19, 1],
      [2, 1],
    ])
    return {
      ...base,
      prompt: `Fractional odds of ${a}/${b} imply what probability?`,
      answer: round((100 * b) / (a + b), 4),
      tolerance: 0.05,
      explanation: `Stake ÷ (profit + stake) = ${b} ÷ ${a + b} = ${pc(round((100 * b) / (a + b), 2))}`,
    }
  }
  if (Math.random() < 0.5) {
    const yes = randInt(30, 70)
    const over = randInt(1, 8)
    const no = 100 - yes + over
    return {
      ...base,
      prompt: `A binary market quotes YES at ${(yes / 100).toFixed(2)} and NO at ${(no / 100).toFixed(2)} (payout 1.00). What is the overround, in percentage points?`,
      answer: over,
      tolerance: 0.005,
      explanation: `${yes}% + ${no}% = ${yes + no}% → ${over} points above 100%`,
    }
  }
  const fav = Math.random() < 0.5
  const m = fav ? pick([100, 150, 300, 400, 900, 200]) : pick([100, 150, 300, 400, 900])
  const ans = fav ? (100 * m) / (m + 100) : 10000 / (m + 100)
  return {
    ...base,
    prompt: `American odds of ${fav ? '−' : '+'}${m} imply what probability?`,
    answer: round(ans, 4),
    tolerance: 0.05,
    explanation: fav
      ? `Favourite: ${m} ÷ (${m} + 100) = ${pc(round(ans, 2))}`
      : `Underdog: 100 ÷ (${m} + 100) = ${pc(round(ans, 2))}`,
  }
}

const weightedAverage: TopicGen = (lv) => {
  if (lv <= 2) {
    const [r1, r2] = lv === 1 ? pick([[1, 1], [1, 3], [3, 1]]) : pick([[2, 3], [1, 4], [3, 2], [4, 1], [3, 7], [1, 9]])
    const unit = randInt(1, 5) * 100
    const step = lv === 1 ? randInt(1, 5) : randInt(1, 6) * 0.5
    const diff = (r1 + r2) * step * sign()
    const p1 = randInt(30, 90) + (lv === 2 ? pick([0, 0.5]) : 0)
    const p2 = p1 + diff
    const avg = round(p1 + (diff * r2) / (r1 + r2), 4)
    return {
      prompt: `You buy ${fmt(r1 * unit)} shares at ${eur(p1)} and ${fmt(r2 * unit)} shares at ${eur(p2)}. What is your average entry price?`,
      answer: avg,
      prefix: '€',
      tolerance: 0.005,
      explanation: `Weights ${r1}:${r2}. Start from ${fmt(p1)} and move ${r2}/${r1 + r2} of the ${fmt(diff)} gap: ${fmt(
        p1,
      )} ${diff < 0 ? '−' : '+'} ${fmt(Math.abs(round((diff * r2) / (r1 + r2), 4)))} = ${eur(avg)}`,
    }
  }
  const ws = pick([[60, 40], [70, 30], [50, 30, 20], [40, 40, 20], [25, 75], [50, 25, 25]])
  const rs = ws.map(() => randInt(-10, 20))
  const ans = round(ws.reduce((s, w, i) => s + w * rs[i], 0) / 100, 4)
  return {
    prompt: `A portfolio is weighted ${ws.map((w) => w + '%').join(' / ')} and the holdings return ${rs
      .map((r) => (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r) + '%')
      .join(' / ')}. What is the portfolio return?`,
    answer: ans,
    suffix: '%',
    hint: LOSS,
    tolerance: 0.005,
    explanation: `${ws.map((w, i) => `${fmt(w / 100)} × ${fmt(rs[i])}`).join(' + ')} = ${pc(ans)}`,
  }
}

const priceQuantity: TopicGen = (lv) => {
  const p = lv === 1 ? randInt(12, 95) : lv === 2 ? randInt(40, 400) / 4 : randInt(400, 1600) / 4
  const q = lv === 1 ? randInt(2, 9) * pick([100, 1000]) : lv === 2 ? randInt(2, 40) * 40 : randInt(3, 30) * 400
  return {
    prompt: `What is the cost of ${fmt(q)} units at ${eur(p)} each?`,
    answer: round(p * q, 2),
    prefix: '€',
    tolerance: 0.005,
    explanation: Number.isInteger(p)
      ? `${fmt(p)} × ${fmt(q)} = ${eur(p * q)}`
      : `${Math.floor(p)} × ${fmt(q)} = ${fmt(Math.floor(p) * q)}, plus ${fmt(round(p % 1, 2))} × ${fmt(q)} = ${fmt(
          round((p % 1) * q, 2),
        )} → ${eur(round(p * q, 2))}`,
  }
}

export const TRADING_TOPICS: { id: string; name: string; gen: TopicGen }[] = [
  { id: 'sizing', name: 'Position sizing', gen: positionSizing },
  { id: 'notional', name: 'Notional exposure', gen: notional },
  { id: 'pnl', name: 'P&L', gen: pnl },
  { id: 'return', name: 'Percentage returns', gen: pctReturn },
  { id: 'bps', name: 'Basis points', gen: basisPoints },
  { id: 'leverage', name: 'Leverage', gen: leverage },
  { id: 'probability', name: 'Probability', gen: probability },
  { id: 'ev', name: 'Expected value', gen: expectedValue },
  { id: 'rr', name: 'Risk / reward', gen: riskReward },
  { id: 'spread', name: 'Bid / ask spreads', gen: spread },
  { id: 'implied', name: 'Implied probabilities', gen: impliedProb },
  { id: 'wavg', name: 'Weighted averages', gen: weightedAverage },
  { id: 'pxqty', name: 'Price × quantity', gen: priceQuantity },
]

export function makeTrading(level: number, topics?: string[]): Question {
  const pool = topics?.length ? TRADING_TOPICS.filter((t) => topics.includes(t.id)) : TRADING_TOPICS
  const t = pick(pool.length ? pool : TRADING_TOPICS)
  const lv = Math.min(3, Math.max(1, level))
  const d = t.gen(lv)
  return {
    tolerance: 0,
    ...d,
    answer: round(d.answer, 4),
    key: `q:${t.id}:${d.prompt}`,
    category: 'trading',
    long: true,
    level: lv,
    topic: t.name,
  }
}
