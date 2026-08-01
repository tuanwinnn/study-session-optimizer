// Shared Prisma client for benchmark scripts, pointed at DIRECT_URL (not the
// pooled DATABASE_URL) so pgbouncer transaction pooling doesn't add noise to
// EXPLAIN ANALYZE timings.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

if (!process.env.DIRECT_URL) {
  throw new Error('DIRECT_URL is not set (check .env)');
}

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});

const BENCHMARK_USER_ID = 'benchmark-test-user';
const BENCHMARK_USER_EMAIL = 'benchmark-test-user@example.com';

module.exports = { prisma, BENCHMARK_USER_ID, BENCHMARK_USER_EMAIL };
