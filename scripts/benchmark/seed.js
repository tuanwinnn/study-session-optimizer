// Seeds `count` fake StudySession rows for a dedicated benchmark-only user,
// spread realistically across the last ~180 days. Run: node scripts/benchmark/seed.js <count>
const { prisma, BENCHMARK_USER_ID, BENCHMARK_USER_EMAIL } = require('./client');

const CHUNK_SIZE = 1000;
const DAYS_SPAN = 180;

function randomDateWithinLastNDays(days) {
  const now = Date.now();
  const offsetMs = Math.random() * days * 24 * 60 * 60 * 1000;
  return new Date(now - offsetMs);
}

async function ensureBenchmarkUserAndTask() {
  const user = await prisma.user.upsert({
    where: { id: BENCHMARK_USER_ID },
    update: {},
    create: {
      id: BENCHMARK_USER_ID,
      name: 'Benchmark Test User',
      email: BENCHMARK_USER_EMAIL,
      password: 'not-a-real-password-hash',
    },
  });

  const existingTask = await prisma.task.findFirst({ where: { userId: user.id } });
  if (existingTask) return existingTask;

  return prisma.task.create({
    data: {
      userId: user.id,
      title: 'Benchmark Task',
      subject: 'Benchmarking',
      priority: 'medium',
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      estimatedHours: 100,
    },
  });
}

async function seed(count) {
  const task = await ensureBenchmarkUserAndTask();

  const deleted = await prisma.studySession.deleteMany({ where: { userId: BENCHMARK_USER_ID } });
  if (deleted.count > 0) {
    console.log(`Cleared ${deleted.count} existing benchmark rows.`);
  }

  let inserted = 0;
  while (inserted < count) {
    const batchSize = Math.min(CHUNK_SIZE, count - inserted);
    const rows = Array.from({ length: batchSize }, () => {
      const startTime = randomDateWithinLastNDays(DAYS_SPAN);
      const totalMinutes = 15 + Math.floor(Math.random() * 105);
      const endTime = new Date(startTime.getTime() + totalMinutes * 60 * 1000);
      return {
        userId: BENCHMARK_USER_ID,
        taskId: task.id,
        startTime,
        endTime,
        // createdAt has @default(now()); set explicitly to match startTime,
        // otherwise every row lands at ~the same instant and the date-range
        // predicate this benchmark is testing becomes meaningless.
        createdAt: startTime,
        pomodorosCompleted: 1 + Math.floor(Math.random() * 4),
        totalMinutes,
        wasCompleted: true,
      };
    });

    await prisma.studySession.createMany({ data: rows });
    inserted += batchSize;
    console.log(`Inserted ${inserted}/${count}`);
  }

  // VACUUM (not just ANALYZE) reclaims dead tuples left by the deleteMany above.
  // Without it, repeated seed cycles bloat the table's physical page count, which
  // inflates the planner's Seq Scan cost estimate independent of live row count —
  // that bloat would unfairly bias later volumes toward "looks like it needs an index".
  await prisma.$executeRawUnsafe('VACUUM (ANALYZE) "StudySession"');
  console.log(`Seed complete: ${count} rows for ${BENCHMARK_USER_ID}. Ran VACUUM (ANALYZE).`);
}

const count = parseInt(process.argv[2], 10);
if (!count || count <= 0) {
  console.error('Usage: node scripts/benchmark/seed.js <count>');
  process.exit(1);
}

seed(count)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
