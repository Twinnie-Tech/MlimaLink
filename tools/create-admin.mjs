/**
 * Creates an admin account, or resets the password of an existing one.
 * Usage: npm run admin:create -- --email admin@mlimalink.com --name "Jane Admin"
 * The password is asked for (hidden), or read from ADMIN_PASSWORD when set.
 */
import 'dotenv/config';
import { createInterface } from 'readline';
import { parseArgs } from 'util';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Same rules as shopper and seller passwords in auth-service. */
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    let prompted = false;
    rl._writeToOutput = (text) => {
      if (!prompted) {
        rl.output.write(text);
        prompted = true;
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const { values } = parseArgs({
  options: { email: { type: 'string' }, name: { type: 'string' } },
});
const email = values.email?.trim().toLowerCase();
if (!email || !emailRegex.test(email)) {
  fail(
    'Usage: npm run admin:create -- --email admin@example.com --name "Jane Admin"',
  );
}

const password =
  process.env.ADMIN_PASSWORD ?? (await askHidden(`Password for ${email}: `));
if (!passwordRegex.test(password)) {
  fail(
    'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.',
  );
}

const prisma = new PrismaClient();
try {
  const hashed = await bcrypt.hash(password, 10);
  const existing = await prisma.admins.findUnique({ where: { email } });
  if (existing) {
    await prisma.admins.update({
      where: { email },
      data: { password: hashed, ...(values.name && { name: values.name }) },
    });
    console.log(`Updated the password for admin ${email}.`);
  } else {
    await prisma.admins.create({
      data: { email, name: values.name?.trim() || 'Admin', password: hashed },
    });
    console.log(`Created admin ${email}. Log in at the admin dashboard.`);
  }
} finally {
  await prisma.$disconnect();
}
