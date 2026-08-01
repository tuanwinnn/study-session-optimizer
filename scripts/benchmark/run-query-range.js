// Benchmarks a realistic date-range query: sessions for the test user
// created between 14 and 7 days ago (matches the "14 days ago -> 7 days ago"
// example from the original spec, and is what the analytics route would run
// server-side if its 7-day window were pushed into SQL instead of filtered in JS).
//
// "before" is measured by forcing the planner to ignore index scans for that
// query only (SET LOCAL enable_indexscan/enable_bitmapscan = off, inside a
// transaction so it doesn't affect anything else) -- this simulates "no useful
// index" without altering the schema, since the composite index already exists
// permanently in the DB per the earlier decision to keep it.
//
// Usage: node scripts/benchmark/run-query-range.js <before|after> <volume>
const fs = require('fs');
const path = require('path');
const { prisma, BENCHMARK_USER_ID } = require('./client');

const RUNS = 6;
const RESULTS_FILE = path.join(__dirname, 'results-range.jsonl');

const rangeEnd = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
const rangeStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

function parsePlan(planText) {
  const topNodeMatch = planText.match(
    /^(Sort|Seq Scan|Index Only Scan|Index Scan|Bitmap Heap Scan)[^\n]*/
  );
  const scanMatch = planText.match(
    /(Seq Scan|Index Only Scan|Index Scan|Bitmap Heap Scan|Bitmap Index Scan)[^\n]*/
  );
  const rowsRemovedMatch = planText.match(/Rows Removed by Filter: (\d+)/);
  const buffersMatch = planText.match(/Buffers: ([^\n]+)/);
  const execMatch = planText.match(/Execution Time: ([\d.]+) ms/);

  if (!execMatch) {
    throw new Error(`Could not parse "Execution Time" from plan:\n${planText}`);
  }

  return {
    executionTimeMs: parseFloat(execMatch[1]),
    topNode: topNodeMatch ? topNodeMatch[0].trim() : 'unknown',
    scanType: scanMatch ? scanMatch[0].trim() : 'unknown',
    rowsRemovedByFilter: rowsRemovedMatch ? parseInt(rowsRemovedMatch[1], 10) : 0,
    buffers: buffersMatch ? buffersMatch[1].trim() : null,
  };
}

async function runOnce(phase) {
  if (phase === 'before') {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_indexscan = off');
      await tx.$executeRawUnsafe('SET LOCAL enable_bitmapscan = off');
      const planRows = await tx.$queryRaw`
        EXPLAIN (ANALYZE, BUFFERS)
        SELECT * FROM "StudySession"
        WHERE "userId" = ${BENCHMARK_USER_ID}
          AND "createdAt" >= ${rangeStart}
          AND "createdAt" <= ${rangeEnd}
      `;
      return parsePlan(planRows.map((r) => r['QUERY PLAN']).join('\n'));
    });
  }

  const planRows = await prisma.$queryRaw`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT * FROM "StudySession"
    WHERE "userId" = ${BENCHMARK_USER_ID}
      AND "createdAt" >= ${rangeStart}
      AND "createdAt" <= ${rangeEnd}
  `;
  return parsePlan(planRows.map((r) => r['QUERY PLAN']).join('\n'));
}

async function main() {
  const phase = process.argv[2];
  const volume = parseInt(process.argv[3], 10);
  if (!['before', 'after'].includes(phase) || !volume) {
    console.error('Usage: node scripts/benchmark/run-query-range.js <before|after> <volume>');
    process.exit(1);
  }

  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const result = await runOnce(phase);
    runs.push(result);
    console.log(
      `  run ${i + 1}/${RUNS}: ${result.executionTimeMs.toFixed(3)} ms | ${result.scanType} | rowsRemovedByFilter=${result.rowsRemovedByFilter}`
    );
  }

  const [warmup, ...measured] = runs;
  const avgMs = measured.reduce((sum, r) => sum + r.executionTimeMs, 0) / measured.length;
  const last = measured[measured.length - 1];

  const summary = {
    phase,
    volume,
    avgMs: parseFloat(avgMs.toFixed(3)),
    scanType: last.scanType,
    rowsRemovedByFilter: last.rowsRemovedByFilter,
    buffers: last.buffers,
    warmupMs: warmup.executionTimeMs,
    allRunsMs: runs.map((r) => r.executionTimeMs),
  };

  fs.appendFileSync(RESULTS_FILE, JSON.stringify(summary) + '\n');
  console.log(
    `\n[${phase}] volume=${volume} avg=${summary.avgMs}ms scan=${summary.scanType} rowsRemoved=${summary.rowsRemovedByFilter}`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
