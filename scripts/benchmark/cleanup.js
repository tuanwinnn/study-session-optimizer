// Deletes all benchmark data. Cascades User -> Task -> StudySession via the
// existing onDelete: Cascade relations in schema.prisma.
const { prisma, BENCHMARK_USER_ID } = require('./client');

async function cleanup() {
  const result = await prisma.user.deleteMany({ where: { id: BENCHMARK_USER_ID } });
  console.log(
    result.count > 0
      ? `Deleted benchmark user ${BENCHMARK_USER_ID} (cascaded to Task/StudySession rows).`
      : `No benchmark user found for ${BENCHMARK_USER_ID} (already clean).`
  );

  const remaining = await prisma.studySession.count({ where: { userId: BENCHMARK_USER_ID } });
  console.log(`Remaining StudySession rows for benchmark user: ${remaining}`);
}

cleanup()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
