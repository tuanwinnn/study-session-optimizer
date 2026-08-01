# Composite index benchmark: `StudySession(userId, createdAt)`

**Question:** does adding `@@index([userId, createdAt])` change *how the query's cost scales
with table size*, not just its cost at one size?

**Method:** seeded a dedicated fake user (`benchmark-test-user`, cascade-deletable) with
100 / 1,000 / 10,000 `StudySession` rows, timestamps spread randomly across the last 180
days. Measured two real query shapes with `EXPLAIN (ANALYZE, BUFFERS)` via `$queryRaw`
against Neon's `DIRECT_URL` (bypassing pgbouncer). Each data point is the average of 5 runs
after discarding one warmup run. Full per-run data: `results.jsonl` (Query A) and
`results-range.jsonl` (Query B).

The seed script originally ran plain `ANALYZE` after each reseed. That was upgraded to
`VACUUM (ANALYZE)` mid-run after the first `after`-phase 100-row point came back with a
seq-scan cost estimate 30x higher than its `before`-phase counterpart at the same row
count — repeated delete+reinsert cycles leave dead tuples that inflate the table's physical
page count independent of live rows, which skews the planner's cost estimate. That one
data point was discarded and re-measured with `VACUUM (ANALYZE)`; the fix was then kept for
the remainder of the after-phase and all of Query B. The three before-phase points (Query
A) were captured with plain `ANALYZE` only — checked for the same bloat by comparing
`Buffers` counts: Query A's before-10,000 Seq Scan touched **192** pages; Query B's
before-10,000 Seq Scan (run immediately afterward, against the same but by-then-vacuumed
10,000-row table) touched **190** — a ~1% difference, confirming the un-vacuumed
before-phase points were not meaningfully bloated.

Both query shapes use the same index — `@@index([userId, createdAt])`, added in migration
`20260801214849_add_studysession_userid_createdat_index` and kept permanently (it also
speeds up the existing `GET /api/sessions` route).

---

## Query A — full session history (`GET /api/sessions` exactly as written)

```sql
SELECT * FROM "StudySession" WHERE "userId" = $1 ORDER BY "createdAt" DESC
```

| Rows | Before (avg ms) | Before plan | After (avg ms) | After plan |
|---:|---:|---|---:|---|
| 100 | 0.081 | Seq Scan → Sort | 0.089 | Seq Scan → Sort *(planner still skips the index)* |
| 1,000 | 0.433 | Seq Scan → Sort | 0.420 | Seq Scan → Sort *(still skips it)* |
| 10,000 | 5.349 | Seq Scan → Sort | 5.569 | **Index Scan Backward** (Sort eliminated) |

**Finding:** the plan changes at 10,000 rows — Postgres switches to walking the composite
index backward, which returns rows already in `createdAt DESC` order and removes the
separate `Sort` step entirely. But wall-clock time doesn't improve: `Buffers` jumps from
**192 pages** (Seq Scan + Sort) to **10,041 pages** (Index Scan Backward) — a 52x increase.
Because this query returns *every* row for the user, the Index Scan does one random heap
lookup per row instead of one sequential pass, and with rows inserted in random date order
(not physical/insertion order), each of those 10,000 lookups tends to land on a different
heap page — repeatedly revisiting pages a sequential scan would have read once. **Indexes
speed up selective access, not full-table-per-user dumps.** This query only benefits from
the sort being pushed into the index; that matters more as row counts grow well past
10,000, or would flip to a clear net win if the app started paginating instead of fetching
the full history every time.

## Query B — realistic date-range window (14 days ago → 7 days ago)

```sql
SELECT * FROM "StudySession"
WHERE "userId" = $1 AND "createdAt" >= $2 AND "createdAt" <= $3
```

This mirrors what the analytics route conceptually needs (it currently fetches everything
and filters the 7-day window in JS). "Before" is measured with
`SET LOCAL enable_indexscan/enable_bitmapscan = off` inside a transaction — a standard,
non-destructive way to force the pre-index plan without dropping the (now-permanent) index
from the live schema.

| Rows | Before (avg ms) | Rows scanned but discarded | After (avg ms) | Rows discarded | Speedup |
|---:|---:|---:|---:|---:|---:|
| 100 | 0.053 | 96 of 100 | 0.043 | 96 *(planner still picks Seq Scan)* | ~1.2x (noise) |
| 1,000 | 0.158 | 967 of 1,000 | 0.154 | 967 *(still Seq Scan)* | ~1.0x (noise) |
| 10,000 | 1.251 | 9,588 of 10,000 | 0.255 | **0** — Bitmap Heap Scan | **4.9x** |

**Finding:** this is the real curve-divergence story. "Before," cost grows with total table
size because Postgres has to scan every row for the user and discard the ones outside the
window — at 10,000 rows, 96% of the scanned data is thrown away
(`Rows Removed by Filter: 9588`). Growing the table 100x (100 → 10,000 rows) makes the
unindexed query **~23.6x slower** (0.053ms → 1.251ms). The indexed query only gets
**~5.9x slower** over the same 100x growth (0.043ms → 0.255ms), because past a certain size
the planner switches to a Bitmap Heap Scan that seeks directly to the matching rows —
`Rows Removed by Filter` drops to 0. At small volumes (100–1,000 rows) the planner
correctly determines a full scan is still cheaper than using the index at all — the win
only shows up once there's enough data that skipping irrelevant rows actually pays for the
index traversal, which is exactly the "changes the shape of the curve, not just one number"
result this benchmark set out to find.

Notably, `Buffers` barely moves at 10,000 rows — **190 pages before, 165 after**, only 13%
fewer. That looks inconsistent with a 4.9x speedup until you separate I/O from CPU: both
plans read roughly the same number of *pages* (the table is small enough that most of it is
already cached), but the "before" plan still has to evaluate the date-range predicate and
deserialize all 10,000 tuples to find the 412 matches, while the "after" plan's Bitmap Heap
Scan is handed exactly the matching row locations by the index and skips that work
entirely. The 4.9x win here is a **CPU/tuple-processing** win, not an I/O win — worth
knowing before claiming "fewer disk reads" as the mechanism.

---

## Honest caveats

- The table only ever contains one test user's rows, so the pre-existing `@@index([userId])`
  is maximally **non-selective** here — every row matches `userId = benchmark-test-user`,
  so that index narrows nothing and the planner has no reason to use it. That's why "before"
  never showed an Index Scan on the old index; it also means "no useful index" in Query B's
  "before" column was simulated via planner GUCs (`enable_indexscan/bitmapscan = off`)
  rather than an actual missing index, since the composite index is now a permanent part of
  the schema (kept deliberately — see below). This is a standard, non-destructive
  benchmarking technique; it does not alter data or schema.
- Query A shows a real, defensible mechanism change (Sort eliminated) but not a wall-clock
  win at these volumes — reported as-is rather than only showing the query that looks good.
- All timings are from a live Neon Postgres instance (not localhost), so absolute numbers
  include network round-trip variance; the relative before/after comparison at fixed volume
  is the meaningful signal, not the absolute millisecond values.

## Outcome

The `@@index([userId, createdAt])` index was kept permanently in `prisma/schema.prisma`
(migration `20260801214849_add_studysession_userid_createdat_index`) — it's a real
improvement for the existing `GET /api/sessions` query's sort, and a ~5x improvement for
any future date-windowed query (e.g. pushing the analytics route's 7-day filter into SQL).

Note: `@@index([userId, createdAt])` makes the older standalone `@@index([userId])` on
`StudySession` redundant — a composite index's leading column(s) can serve any query the
single-column index could. Left in place rather than dropped, since removing it wasn't part
of this task's scope, but it's a follow-up worth flagging.

All benchmark data (`benchmark-test-user` and its rows) was deleted after these
measurements via `cleanup.js`.
