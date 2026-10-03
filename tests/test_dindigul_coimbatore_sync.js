// test_dindigul_coimbatore_sync.js
async function testScenario() {
  console.log('=== STARTING DINDIGUL <-> COIMBATORE CLOUD SYNC SIMULATION ===\n');

  const CLOUD_URL = 'https://api.restful-api.dev/objects/ff808181a09d98f701a0ec7c45bb3e14';

  async function fetchCloud() {
    const res = await fetch(CLOUD_URL, {
      cache: 'no-store',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
    const json = await res.json();
    const d = json.data || {};
    return {
      users: Array.isArray(d.users) ? d.users : [],
      files: Array.isArray(d.files) ? d.files : []
    };
  }

  async function saveCloud(data) {
    const res = await fetch(CLOUD_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        name: 'velora_cloud_master_database_v1',
        data
      }),
      signal: AbortSignal.timeout(10000)
    });
    const result = await res.json().catch(() => ({}));
    return res.ok;
  }

  // --- Step 1: User A in Dindigul signs in / provisions account ---
  console.log('Step 1: User A in Dindigul logs in with test account...');
  const testEmail = 'bharath_gang@velora.com';
  const testPass = 'cinema2026';

  let cloud = await fetchCloud();
  let userA = cloud.users.find(u => u.email === testEmail);
  if (!userA) {
    userA = {
      id: 'user_' + Date.now(),
      email: testEmail,
      name: 'Bharath Gang',
      password: testPass,
      is_verified: true,
      storageQuotaBytes: 53687091200,
      sessions: [{ token: 'token_dindigul_' + Date.now() }]
    };
    cloud.users.push(userA);
  } else {
    userA.password = testPass;
  }

  const movieFile = {
    id: 'file_dindigul_' + Date.now(),
    user_id: userA.id,
    user_email: testEmail,
    name: 'Master_Movie.mp4',
    original_name: 'Master_Movie.mp4',
    category: 'movies',
    mime_type: 'video/mp4',
    size_bytes: 750000000,
    created_at: Date.now(),
    cloud_url: 'https://tmpfiles.org/dl/12345/Master_Movie.mp4',
    stream_url: 'https://tmpfiles.org/dl/12345/Master_Movie.mp4'
  };

  cloud.files = cloud.files.filter(f => f.id !== movieFile.id);
  cloud.files.unshift(movieFile);

  const saved = await saveCloud(cloud);
  console.log('✓ Cloud saved:', saved);

  // --- Step 2: Friend B in Coimbatore logs in ---
  console.log('\nStep 2: Friend B in Coimbatore logs in with same Email & Password...');
  const friendCloud = await fetchCloud();
  let friendUser = friendCloud.users.find(u => u.email === testEmail);

  if (!friendUser) {
    console.error('FAILED: Account not found in cloud!');
    process.exit(1);
  }

  if (friendUser.password !== testPass) {
    console.error('FAILED: Password mismatch!');
    process.exit(1);
  }

  console.log('✓ Friend B successfully authenticated with matching password!');
  console.log(`✓ Welcome, ${friendUser.name}!`);

  const friendAccessibleFiles = friendCloud.files.filter(f => f.user_email === testEmail);
  console.log(`\nStep 3: Friend B views files for ${testEmail}...`);
  console.log(`✓ Found ${friendAccessibleFiles.length} file(s) on Friend B screen:`);
  friendAccessibleFiles.forEach(f => {
    console.log(`   - 🎬 ${f.name} (${Math.round(f.size_bytes / (1024*1024))} MB) -> Stream URL: ${f.stream_url}`);
  });

  const hasMovie = friendAccessibleFiles.some(f => f.name === 'Master_Movie.mp4');
  if (hasMovie) {
    console.log('\n========================================================');
    console.log('🎉 SUCCESS: Friend in Coimbatore accessed User A files!');
    console.log('========================================================');
  } else {
    console.error('FAILED: Movie not found on Friend B device!');
    process.exit(1);
  }
}

testScenario().catch(e => {
  console.error('Simulation error:', e);
  process.exit(1);
});
