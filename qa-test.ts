const BASE_URL = 'https://happypatient.onrender.com/api';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<boolean>) {
  try {
    const ok = await fn();

    if (ok) {
      console.log(`✅ PASS — ${name}`);
      passed++;
    } else {
      console.log(`❌ FAIL — ${name}`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL — ${name}`);
    console.log(`   ${error instanceof Error ? error.message : error}`);
    failed++;
  }
}

async function request(path: string, options: RequestInit = {}) {
  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

async function main() {
  console.log('\n================================');
  console.log('   HappyPatient QA Smoke Test');
  console.log('================================\n');

  // 1. Health
  await test('Health check', async () => {
    const r = await request('/healthz');
    return r.ok;
  });

  // 2. Root API
  await test('API root responds', async () => {
    const r = await request('/');
    return r.ok;
  });

  // 3. Categories
  await test('Categories endpoint', async () => {
    const r = await request('/categories');
    return r.ok;
  });

  // 4. Doctors
  await test('Doctors endpoint', async () => {
    const r = await request('/doctors');
    return r.ok;
  });

  // 5. Unauthorized request
  await test('Protected endpoint rejects unauthenticated request', async () => {
    const r = await request('/appointments');
    return r.status === 401 || r.status === 403;
  });

  // 6. Invalid login
  await test('Invalid login is rejected', async () => {
    const r = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'definitely-not-a-real-user@example.com',
        password: 'WrongPassword123!',
      }),
    });

    return r.status >= 400 && r.status < 500;
  });

  console.log('\n================================');
  console.log('QA RESULT');
  console.log('================================');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total:  ${passed + failed}`);

  if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED');
  } else {
    console.log('\n⚠️ SOME TESTS FAILED');
  }
}

main();
