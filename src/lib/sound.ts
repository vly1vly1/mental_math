let ctx: AudioContext | null = null

function tone(freq: number, start: number, dur: number, gain: number, type: OscillatorType = 'sine') {
  if (!ctx) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.value = freq
  const t = ctx.currentTime + start
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(gain, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(ctx.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}

export function play(kind: 'correct' | 'wrong' | 'done', enabled: boolean) {
  if (!enabled) return
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    if (kind === 'correct') tone(880, 0, 0.09, 0.05)
    else if (kind === 'wrong') tone(196, 0, 0.2, 0.07, 'triangle')
    else {
      tone(660, 0, 0.1, 0.05)
      tone(880, 0.1, 0.1, 0.05)
      tone(1320, 0.2, 0.18, 0.05)
    }
  } catch {
    /* audio unavailable */
  }
}
