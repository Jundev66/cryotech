/**
 * Resets the public demo: deletes its company and builds it again from scratch.
 *
 * The demo is a toy anyone can click. People will sell twelve thousand birds,
 * empty the treasury and leave half-typed clients behind, and that is fine —
 * this runs on a schedule and puts it back. It is also what keeps the free
 * database from filling up with a year of strangers' experiments.
 *
 * The credentials are published in the README on purpose: a demo you cannot log
 * into is a screenshot. They open a throwaway company on a throwaway database,
 * which is why this script holds no secret and needs none.
 *
 *   DEMO_API_URL=https://cryotech-demo-api.onrender.com/api \
 *   DEMO_EMAIL=demo@cryotech.demo DEMO_PASSWORD=... \
 *   node scripts/seed-demo.mjs
 */
import { createClient, seedDemoFarm } from './demo-farm.mjs';

const API = process.env.DEMO_API_URL ?? 'http://localhost:3011/api';
const EMAIL = process.env.DEMO_EMAIL ?? 'demo@cryotech.demo';
const PASSWORD = process.env.DEMO_PASSWORD;
const COMPANY = process.env.DEMO_COMPANY_NAME ?? 'Granja Demo';

if (!PASSWORD) {
  console.error('Falta DEMO_PASSWORD.');
  process.exit(1);
}

const client = createClient(API);

/**
 * Logs in, or registers the first time.
 *
 * Register only works while public sign-up is open, which on the demo it is —
 * that is the point. On the real deployment `REGISTRATION_ENABLED=false` makes
 * this fail loudly rather than quietly creating an account, which is the
 * behaviour you want if anyone ever points this script at the wrong API.
 */
async function signIn() {
  try {
    return await client.post('/auth/login', { email: EMAIL, password: PASSWORD });
  } catch {
    console.log('  el usuario no existe todavía, registrándolo');
    return client.post('/auth/register', {
      email: EMAIL,
      password: PASSWORD,
      confirmPassword: PASSWORD,
      fullName: 'Demo',
    });
  }
}

const auth = await signIn();
client.state.token = auth.accessToken;

// Delete every company this user owns, not just one named `Granja Demo`:
// a visitor can create their own from the onboarding screen, and those would
// accumulate run after run.
const existing = await client.get('/companies');
for (const company of existing) {
  await client.del(`/companies/${company.id}`);
  console.log(`  borrada ${company.name}`);
}

const { companyId } = await seedDemoFarm(client, { companyName: COMPANY });
console.log(`\nDemo listo: ${COMPANY} (${companyId}) en ${API}`);
