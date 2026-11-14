import { Setup } from '../components/Setup'
import { PageHeader } from '../components/ui'

export function TrainPage() {
  return (
    <>
      <PageHeader title="Train" sub="Pick a mode, set the difficulty and go. Answers are typed, feedback is instant, and every multiplication fact you touch feeds the adaptive engine." />
      <Setup modeIds={['tables', 'multiplication', 'division', 'percentages', 'powers', 'mixed']} defaultFormat="practice" storageKey="train" />
    </>
  )
}

export function ChallengesPage() {
  return (
    <>
      <PageHeader title="Timed challenges" sub="Sprints, endurance, fixed tests, accuracy and streak runs. Results are stored per format and mode so you can compare like with like." />
      <Setup
        modeIds={['mixed', 'tables', 'multiplication', 'division', 'percentages', 'powers', 'trading', 'weak']}
        defaultFormat="sprint-60"
        storageKey="challenges"
        formatFirst
      />
    </>
  )
}

export function TradingPage() {
  return (
    <>
      <PageHeader title="Trading & quant arithmetic" sub="The calculations a desk expects you to do in your head: sizing, notional, P&L, basis points, leverage, odds, expected value and weighted averages." />
      <Setup modeIds={['trading']} defaultFormat="practice" storageKey="trading" />
    </>
  )
}
