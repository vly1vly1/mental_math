# Mental Maths Lab

A local, keyboard-first training terminal for fast, accurate mental arithmetic, aimed at trading and quantitative finance.
React + TypeScript + Vite + Tailwind CSS. No backend, no account: progress lives in `localStorage`.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # question generation, answer validation, adaptive engine, statistics
npm run build      # type-check + production build into dist/
```

## Layout

| Path | Purpose |
| --- | --- |
| `src/lib/generators/` | Algorithmic question generators (tables, multiplication, division, percentages, powers, trading) |
| `src/lib/techniques.ts` | The ten techniques: explanation, worked examples, exercise generators |
| `src/lib/answer.ts` | Parsing and mathematical validation of typed answers |
| `src/lib/adaptive.ts` | Per-fact records, mastery score, spaced repetition, weak facts, daily plan |
| `src/lib/progress.ts` | Pure statistics: totals, streaks, session summaries, personal bests |
| `src/lib/modes.ts` | Training modes and challenge formats |
| `src/lib/storage.ts` | Persistence, import validation |
| `src/components/Session.tsx` | The session engine (timing, pause, skip, feedback, results) |
| `src/pages/` | Dashboard, Train, Challenges, Trading, Weak facts, Grid, Techniques, History, Settings |

## How the adaptive engine works

Each of the 5,050 unique facts (7 × 8 and 8 × 7 share a record) stores attempts, correct answers, total time,
last practice date, a mastery score and a review interval.

- **Mastery (0–100)** is an exponentially weighted average of answer quality: 0 for a mistake, 60–100 for a
  correct answer depending on speed relative to a per-fact target time. Mastered means 80 or more.
- **Spaced repetition**: a mistake makes the fact due again within a minute; fast correct answers multiply the
  interval (1 day, then roughly ×1.4–2.6 each time, capped at 120 days).
- **Selection**: due weak facts are weighted up to 7.5× an unseen fact; mastered facts that are not due still
  appear occasionally (0.12×).
- **Daily session**: 30 questions — the weakest due facts, new facts from the smallest range not yet covered,
  and the mastered facts that have gone longest without review.
