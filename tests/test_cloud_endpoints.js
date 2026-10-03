// test_cloud_endpoints.js
async function run() {
  console.log('--- 1. Testing restful-api.dev GET ---');
  try {
    const r1 = await fetch('https://api.restful-api.dev/objects/ff808181a09d98f701a0ec7c45bb3e14', {
      signal: AbortSignal.timeout(6000)
    });
    console.log('GET restful status:', r1.status);
    const d1 = await r1.json();
    console.log('Users in restful-api.dev:', (d1.data && d1.data.users) ? d1.data.users.length : 0);
  } catch (e) {
    console.error('GET restful error:', e.message);
  }

  console.log('--- 2. Testing restful-api.dev PUT ---');
  try {
    const r2 = await fetch('https://api.restful-api.dev/objects/ff808181a09d98f701a0ec7c45bb3e14', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'velora_cloud_master_database_v1',
        data: { test: true, time: Date.now() }
      }),
      signal: AbortSignal.timeout(6000)
    });
    console.log('PUT restful status:', r2.status);
    const text2 = await r2.text();
    console.log('PUT restful response:', text2.substring(0, 200));
  } catch (e) {
    console.error('PUT restful error:', e.message);
  }

  console.log('--- 3. Testing jsonblob.com POST ---');
  try {
    const r3 = await fetch('https://jsonblob.com/api/jsonBlob', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        users: [{ email: 'master@velora.cloud', name: 'Master' }],
        files: []
      }),
      signal: AbortSignal.timeout(6000)
    });
    console.log('POST jsonblob status:', r3.status);
    console.log('jsonblob location header:', r3.headers.get('location'));
    const d3 = await r3.json().catch(() => ({}));
    console.log('POST jsonblob body:', d3);
  } catch (e) {
    console.error('POST jsonblob error:', e.message);
  }
}
run();
