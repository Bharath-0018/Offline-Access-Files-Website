// test_velora_multidevice.js - End-to-End Verification Test for Velora Multi-Device Cloud Sync
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 3456;
process.env.PORT = PORT.toString();
process.env.DB_PATH = path.join(__dirname, '..', 'data', 'test_cloud.db');
process.env.STORAGE_DIR = path.join(__dirname, '..', 'data', 'test_storage');

// Clean up previous test database and storage if present
if (fs.existsSync(process.env.DB_PATH)) {
  try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
}
if (fs.existsSync(process.env.STORAGE_DIR)) {
  try { fs.rmSync(process.env.STORAGE_DIR, { recursive: true, force: true }); } catch (e) {}
}

// Start server
const { server } = require('../server.js');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function makeRequest(method, reqPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: reqPath,
      method: method,
      headers: { ...headers }
    };

    if (body && !headers['Content-Type'] && !Buffer.isBuffer(body)) {
      headers['Content-Type'] = 'application/json';
    }

    const req = http.request(options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const rawBuffer = Buffer.concat(chunks);
        let json = null;
        try {
          json = JSON.parse(rawBuffer.toString('utf8'));
        } catch (e) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          buffer: rawBuffer,
          json
        });
      });
    });

    req.on('error', reject);

    if (body) {
      if (Buffer.isBuffer(body)) {
        req.write(body);
      } else if (typeof body === 'object') {
        req.write(JSON.stringify(body));
      } else {
        req.write(body);
      }
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('Starting Velora Multi-Device Cloud Verification Test');
  console.log('====================================================\n');

  await new Promise((resolve, reject) => {
    server.listen(PORT, '127.0.0.1', (err) => {
      if (err) return reject(err);
      console.log(`Test server listening on http://127.0.0.1:${PORT}`);
      resolve();
    });
  });

  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      testsPassed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      testsFailed++;
    }
  }

  try {
    // --- 1. USER REGISTRATION (Alice) ---
    console.log('\n--- Step 1: User Registration on Computer A ---');
    const aliceEmail = `alice_${Date.now()}@velora.com`;
    const alicePass = 'VeloraSecurePass2026!';
    const regRes = await makeRequest('POST', '/api/auth/register', {}, {
      name: 'Alice Cloud',
      email: aliceEmail,
      password: alicePass
    });

    assert((regRes.status === 200 || regRes.status === 201) && regRes.json && regRes.json.success, 'Alice registration request succeeds');
    const otpCode = regRes.json.otpCode;
    assert(!!otpCode, `Registration OTP generated: ${otpCode}`);

    // Verify OTP
    const verifyRes = await makeRequest('POST', '/api/auth/verify-otp', {}, {
      email: aliceEmail,
      code: otpCode
    });
    assert(verifyRes.status === 200 && verifyRes.json && verifyRes.json.token, 'Alice verified OTP and received session token');
    const tokenComputerA = verifyRes.json.token;
    const aliceId = verifyRes.json.user.id;

    // Verify duplicate email registration is strictly rejected
    const dupRegRes = await makeRequest('POST', '/api/auth/register', {}, {
      name: 'Alice Duplicate',
      email: aliceEmail,
      password: 'AnotherPassword123!'
    });
    assert(dupRegRes.status === 400 && dupRegRes.json && dupRegRes.json.error && dupRegRes.json.error.includes('already exists'), 'Duplicate email registration is strictly rejected');

    // Verify login with unknown email is strictly rejected
    const unknownLoginRes = await makeRequest('POST', '/api/auth/login', {}, {
      email: 'nonexistent_user@velora.com',
      password: 'SomePassword123!'
    });
    assert(unknownLoginRes.status === 401 && unknownLoginRes.json && unknownLoginRes.json.error && unknownLoginRes.json.error.includes('No account found'), 'Login with non-existent email is rejected');

    // Verify login with wrong password is strictly rejected
    const wrongPassLoginRes = await makeRequest('POST', '/api/auth/login', {}, {
      email: aliceEmail,
      password: 'WrongPassword123!'
    });
    assert(wrongPassLoginRes.status === 401 && wrongPassLoginRes.json && wrongPassLoginRes.json.error && wrongPassLoginRes.json.error.includes('Incorrect password'), 'Login with incorrect password is rejected');

    // --- 2. UPLOAD FROM COMPUTER A (Chunked Multi-part) ---
    console.log('\n--- Step 2: Upload File from Computer A ---');
    // Generate dummy movie file (6 MB across three 2MB chunks)
    const chunkSize = 2 * 1024 * 1024; // 2MB chunk
    const totalChunks = 3;
    const totalSize = totalChunks * chunkSize;
    const dummyData = crypto.randomBytes(totalSize);
    const expectedSha256 = crypto.createHash('sha256').update(dummyData).digest('hex');
    const fileName = 'Interstellar_2014_1080p.mp4';

    console.log(`Simulating upload of ${fileName} (${(totalSize / (1024 * 1024)).toFixed(2)} MB)...`);

    // 2a. Init chunk upload
    const initRes = await makeRequest('POST', '/api/files/chunk/init', {
      'Authorization': `Bearer ${tokenComputerA}`,
      'Content-Type': 'application/json'
    }, {
      fileName,
      fileSize: totalSize,
      chunkSize,
      totalChunks,
      mimeType: 'video/mp4',
      category: 'movies',
      clientChecksum: expectedSha256
    });

    assert(initRes.status === 200 && initRes.json && initRes.json.uploadId, 'Chunked upload initialized');
    const uploadId = initRes.json.uploadId;

    // 2b. Upload each chunk
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = start + chunkSize;
      const chunkBuffer = dummyData.subarray(start, end);

      const chunkRes = await makeRequest('POST', '/api/files/chunk/upload', {
        'Authorization': `Bearer ${tokenComputerA}`,
        'Content-Type': 'application/octet-stream',
        'X-Upload-Id': uploadId,
        'X-Chunk-Index': i.toString(),
        'X-Total-Chunks': totalChunks.toString()
      }, chunkBuffer);

      assert(chunkRes.status === 200 && chunkRes.json && chunkRes.json.success, `Chunk ${i + 1}/${totalChunks} uploaded successfully`);
    }

    // 2c. Finalize chunk upload
    const finRes = await makeRequest('POST', '/api/files/chunk/finalize', {
      'Authorization': `Bearer ${tokenComputerA}`,
      'Content-Type': 'application/json'
    }, {
      uploadId,
      clientChecksum: expectedSha256
    });

    if (finRes.status !== 200) {
      console.error('Finalize error details:', finRes.json || finRes.buffer.toString());
    }
    assert(finRes.status === 200 && finRes.json && finRes.json.file, 'Upload finalized and SHA-256 verified');
    const uploadedFile = finRes.json.file;
    assert(uploadedFile.name === fileName, 'Uploaded file name matches');
    assert(uploadedFile.size_bytes === totalSize, 'Uploaded file size matches');
    assert(uploadedFile.checksum_sha256 === expectedSha256, 'Server stored checksum matches client SHA-256');

    // --- 3. VERIFY PERSISTENT SERVER STORAGE ---
    console.log('\n--- Step 3: Check Server Persistent File Storage ---');
    const diskPath = path.join(process.env.STORAGE_DIR, aliceId, uploadedFile.file_path);
    assert(fs.existsSync(diskPath), `File exists on server storage: ${diskPath}`);
    const diskStats = fs.statSync(diskPath);
    assert(diskStats.size === totalSize, `Server disk file size matches exactly: ${diskStats.size} bytes`);

    // --- 4. SIMULATE COMPUTER B: LOGIN WITH SAME CREDENTIALS ---
    console.log('\n--- Step 4: Login from Computer B with Same Account ---');
    const compBLoginRes = await makeRequest('POST', '/api/auth/login', {}, {
      email: aliceEmail,
      password: alicePass
    });
    assert(compBLoginRes.status === 200 && compBLoginRes.json && compBLoginRes.json.sessionToken, 'Computer B logged in successfully with same email & password');
    const tokenComputerB = compBLoginRes.json.sessionToken;

    // 4b. Computer B lists files - must automatically see the movie uploaded on Computer A
    console.log('Computer B fetching file list from server...');
    const compBFilesRes = await makeRequest('GET', '/api/files', {
      'Authorization': `Bearer ${tokenComputerB}`
    });
    assert(compBFilesRes.status === 200 && Array.isArray(compBFilesRes.json.files), 'Computer B fetched file list');
    const filesOnCompB = compBFilesRes.json.files;
    const foundMovieOnCompB = filesOnCompB.find(f => f.id === uploadedFile.id);
    assert(!!foundMovieOnCompB, 'Computer B automatically sees the file uploaded on Computer A!');
    assert(foundMovieOnCompB && foundMovieOnCompB.name === fileName, 'Computer B sees exact file name');
    assert(foundMovieOnCompB && foundMovieOnCompB.size_bytes === totalSize, 'Computer B sees exact file size');

    // 4c. Computer B downloads the file
    console.log('Computer B downloading file from server...');
    const compBDownloadRes = await makeRequest('GET', `/api/files/download/${uploadedFile.id}`, {
      'Authorization': `Bearer ${tokenComputerB}`
    });
    assert(compBDownloadRes.status === 200, 'Computer B download HTTP 200 OK');
    const downloadedSha256 = crypto.createHash('sha256').update(compBDownloadRes.buffer).digest('hex');
    assert(downloadedSha256 === expectedSha256, 'Downloaded file bit-for-bit SHA-256 match');

    // 4d. Computer B streams the movie using HTTP Range (Partial Content 206)
    console.log('Computer B requesting partial video stream (Range: bytes=0-1023)...');
    const streamRes = await makeRequest('GET', `/api/files/stream/${uploadedFile.id}`, {
      'Authorization': `Bearer ${tokenComputerB}`,
      'Range': 'bytes=0-1023'
    });
    assert(streamRes.status === 206, 'Stream returned HTTP 206 Partial Content');
    assert(streamRes.headers['content-range'] === `bytes 0-1023/${totalSize}`, `Content-Range header correct: ${streamRes.headers['content-range']}`);
    assert(streamRes.buffer.length === 1024, `Streamed chunk length is exactly 1024 bytes`);

    // --- 5. SIMULATE MOBILE DEVICE C (Storage Quota Verification) ---
    console.log('\n--- Step 5: Mobile Device C Storage Quota & Stats ---');
    const mobileStatsRes = await makeRequest('GET', '/api/storage/stats', {
      'Authorization': `Bearer ${tokenComputerB}`
    });
    assert(mobileStatsRes.status === 200, 'Mobile retrieved storage stats');
    assert(mobileStatsRes.json.quotaBytes === 53687091200, `Storage quota is 50 GB (${mobileStatsRes.json.quotaBytes} bytes)`);
    assert(mobileStatsRes.json.usedBytes === totalSize, `Used storage correctly reflects uploaded file size: ${mobileStatsRes.json.usedBytes} bytes`);

    // --- 6. AUTHORIZATION SECURITY (User B / Attacker Isolation) ---
    console.log('\n--- Step 6: User Isolation & Access Control Check ---');
    const bobEmail = `bob_${Date.now()}@velora.com`;
    const bobRegRes = await makeRequest('POST', '/api/auth/register', {}, {
      name: 'Bob Attacker',
      email: bobEmail,
      password: 'BobPassword456!'
    });
    const bobVerifyRes = await makeRequest('POST', '/api/auth/verify-otp', {}, {
      email: bobEmail,
      code: bobRegRes.json.otpCode
    });
    const tokenBob = bobVerifyRes.json.token;

    // Bob tries to list files - MUST NOT see Alice's files
    const bobFilesRes = await makeRequest('GET', '/api/files', {
      'Authorization': `Bearer ${tokenBob}`
    });
    assert(bobFilesRes.json.files.length === 0, 'Bob cannot see Alice\'s files (0 files listed)');

    // Bob tries to download Alice's file directly - MUST be 404/403
    const bobDownloadRes = await makeRequest('GET', `/api/files/download/${uploadedFile.id}`, {
      'Authorization': `Bearer ${tokenBob}`
    });
    assert(bobDownloadRes.status === 404 || bobDownloadRes.status === 403, `Bob cannot download Alice\'s file (Status ${bobDownloadRes.status})`);

    // Bob tries to stream Alice's file directly - MUST be 404/403
    const bobStreamRes = await makeRequest('GET', `/api/files/stream/${uploadedFile.id}`, {
      'Authorization': `Bearer ${tokenBob}`
    });
    assert(bobStreamRes.status === 404 || bobStreamRes.status === 403, `Bob cannot stream Alice\'s file (Status ${bobStreamRes.status})`);

    // --- 7. VERIFY PERSISTENCE ACROSS LOGOUT AND RE-LOGIN ---
    console.log('\n--- Step 7: Persistence Across User Logout and Re-Login ---');
    const compBLogoutRes = await makeRequest('POST', '/api/auth/logout', {
      'Authorization': `Bearer ${tokenComputerB}`
    });
    assert(compBLogoutRes.status === 200, 'User successfully logged out');

    // Re-login with the same account credentials
    const reLoginRes = await makeRequest('POST', '/api/auth/login', {}, {
      email: aliceEmail,
      password: alicePass
    });
    assert(reLoginRes.status === 200 && reLoginRes.json && reLoginRes.json.sessionToken, 'Logged back in with the same account');
    const newSessionToken = reLoginRes.json.sessionToken;

    // Check that uploaded file is still available and never lost on logout
    const reCheckFilesRes = await makeRequest('GET', '/api/files', {
      'Authorization': `Bearer ${newSessionToken}`
    });
    const preservedFile = (reCheckFilesRes.json.files || []).find(f => f.id === uploadedFile.id);
    assert(!!preservedFile, 'Uploaded file is permanently preserved and visible after signout and re-login');
    assert(preservedFile && preservedFile.name === fileName, 'Preserved file metadata and name match exactly');

    // --- 8. FILE DELETION SYNC (Only deleted when user explicitly clicks delete) ---
    console.log('\n--- Step 8: Explicit User File Deletion Multi-Device Sync ---');
    const delRes = await makeRequest('DELETE', `/api/files/${uploadedFile.id}`, {
      'Authorization': `Bearer ${newSessionToken}`
    });
    assert(delRes.status === 200, 'User explicitly deleted the file from cloud');

    // Confirm file is gone from Alice's account
    const checkFilesAfterDel = await makeRequest('GET', '/api/files', {
      'Authorization': `Bearer ${tokenComputerA}`
    });
    assert(checkFilesAfterDel.json.files.length === 0, 'File is removed from cloud file list on Computer A');
    assert(!fs.existsSync(diskPath), 'File is physically removed from server storage disk');

    // Clean up
    console.log('\n====================================================');
    console.log(`Results: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('====================================================');

    if (testsFailed === 0) {
      console.log('\nSUCCESS! All Velora multi-device cloud features verified!');
      process.exit(0);
    } else {
      console.error('\nFAILURE: Some tests failed.');
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during test execution:', err);
    process.exit(1);
  }
}

runTests();
