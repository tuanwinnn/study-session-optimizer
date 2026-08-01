// Runs the benchmark query (mirrors GET /api/sessions) under
// EXPLAIN (ANALYZE, BUFFERS), 6 times, discards the first (warmup) run, and
// averages the rest. Appends one JSON line to results.jsonl.
//
// Usage: node scripts/benchmark/run-query.js <before|after> <volume>
const fs = require('fs');
const path = require('path');
const { prisma, BENCHMARK_USER_ID } = require('./client');

const RUNS = 6;
const RESULTS_FILE = path.join(__dirname, 'results.jsonl');

async function runOnce() {
  const planRows = await prisma.$queryRaw`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT * FROM "StudySession"
    WHERE "userId" = ${BENCHMARK_USER_ID}
    ORDER BY "createdAt" DESC
  `;
  const planText = planRows.map((r) => r['QUERY PLAN']).join('\n');

  // Top-level node determines whether Postgres avoided a separate sort pass —
  // that's the real win for this query (ORDER BY createdAt DESC), since the
  // WHERE clause alone (userId = one test user) doesn't filter anything out.
  const topNodeMatch = planText.match(/^(Sort|Seq Scan|Index Only Scan|Index Scan|Bitmap Heap Scan)[^\n]*/);
  const scanMatch = planText.match(
    /(Seq Scan|Index Only Scan|Index Scan|Bitmap Heap Scan|Bitmap Index Scan)[^\n]*/
  );
  const hasSortNode = /^Sort\s/m.test(planText);
  const sortMethodMatch = planText.match(/Sort Method: ([^\n]+)/);
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
    hasSortNode,
    sortMethod: sortMethodMatch ? sortMethodMatch[1].trim() : null,
    rowsRemovedByFilter: rowsRemovedMatch ? parseInt(rowsRemovedMatch[1], 10) : 0,
    buffers: buffersMatch ? buffersMatch[1].trim() : null,
    planText,
  };
}

async function main() {
  const phase = process.argv[2];
  const volume = parseInt(process.argv[3], 10);
  if (!['before', 'after'].includes(phase) || !volume) {
    console.error('Usage: node scripts/benchmark/run-query.js <before|after> <volume>');
    process.exit(1);
  }

  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const result = await runOnce();
    runs.push(result);
    console.log(
      `  run ${i + 1}/${RUNS}: ${result.executionTimeMs.toFixed(3)} ms | top=${result.topNode} | sort=${result.hasSortNode}${result.sortMethod ? ` (${result.sortMethod})` : ''} | rowsRemovedByFilter=${result.rowsRemovedByFilter}`
    );
  }

  const [warmup, ...measured] = runs;
  const avgMs =
    measured.reduce((sum, r) => sum + r.executionTimeMs, 0) / measured.length;
  const last = measured[measured.length - 1];

  const summary = {
    phase,
    volume,
    avgMs: parseFloat(avgMs.toFixed(3)),
    topNode: last.topNode,
    scanType: last.scanType,
    hasSortNode: last.hasSortNode,
    sortMethod: last.sortMethod,
    rowsRemovedByFilter: last.rowsRemovedByFilter,
    buffers: last.buffers,
    warmupMs: warmup.executionTimeMs,
    allRunsMs: runs.map((r) => r.executionTimeMs),
  };

  fs.appendFileSync(RESULTS_FILE, JSON.stringify(summary) + '\n');
  console.log(
    `\n[${phase}] volume=${volume} avg=${summary.avgMs}ms top=${summary.topNode} sort=${summary.hasSortNode}${summary.sortMethod ? ` (${summary.sortMethod})` : ''}`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
