import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import prismaPkg from '@prisma/client';

const { PrismaClient } = prismaPkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@helpdesk.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin12345!';

const AGENT_EMAIL = process.env.SEED_AGENT_EMAIL ?? 'agent@helpdesk.local';
const AGENT_PASSWORD = process.env.SEED_AGENT_PASSWORD ?? 'Agent12345!';

async function upsertUser({ email, password, role, name }) {
  const passwordHash = await bcrypt.hash(password, 12);

  return prisma.user.upsert({
    where: { email },
    update: { role, passwordHash, name },
    create: { email, role, passwordHash, name },
    select: { id: true, email: true, role: true },
  });
}

async function main() {
  const admin = await upsertUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: 'ADMIN',
    name: 'Admin',
  });
  const agent = await upsertUser({
    email: AGENT_EMAIL,
    password: AGENT_PASSWORD,
    role: 'AGENT',
    name: 'Agent',
  });

  console.log('Seeded admin:', admin);
  console.log('Seeded agent:', agent);
}

main()
  .then(async () => {
    await prisma.$disconnect().catch(() => {});
    await pool.end().catch(() => {});
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect().catch(() => {});
    await pool.end().catch(() => {});
    process.exit(1);
  });
