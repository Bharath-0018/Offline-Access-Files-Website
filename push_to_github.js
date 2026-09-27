// push_to_github.js - Automated GitHub Repository Creator & File Uploader (Zero Git Required)
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const REPO_NAME = 'Offline-Access-Files-Website';
const REPO_DESC = 'An offline-first personal file sharing and storage platform for secure, fast device-to-device file transfer without relying on the internet.';
const OWNER = 'Bharath-0018';

// Deployment files to clean up and remove from GitHub repository
const FILES_TO_DELETE = [
  'vercel.json',
  'api/index.js',
  'DEPLOYMENT.md',
  'Dockerfile',
  'docker-compose.yml',
  'nginx.conf'
];

// Files to include in the repository (exclude heavy binaries & runtime caches)
const EXCLUDE_DIRS = new Set(['data', '.git', 'node_modules', '.gemini', 'api']);
const EXCLUDE_FILES = new Set(['cloud.db', 'cloud.db-shm', 'cloud.db-wal', 'vercel.json', 'DEPLOYMENT.md', 'Dockerfile', 'docker-compose.yml', 'nginx.conf']);

function getFilesToUpload(dir, baseDir = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let results = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.join(baseDir, entry.name).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      results = results.concat(getFilesToUpload(fullPath, relPath));
    } else {
      if (EXCLUDE_FILES.has(entry.name)) continue;
      // Skip large media files over 10MB
      const stat = fs.statSync(fullPath);
      if (stat.size > 10 * 1024 * 1024) continue;
      results.push({ fullPath, relPath, size: stat.size });
    }
  }

  return results;
}

function githubRequest(method, endpoint, token, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path: endpoint,
      method,
      headers: {
        'User-Agent': 'Velora-GitHub-Sync',
        'Authorization': `Bearer ${token.trim()}`,
        'Accept': 'application/vnd.github.v3+json',
        ...(payload ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        } : {})
      }
    }, (res) => {
      let resBody = '';
      res.on('data', chunk => { resBody += chunk; });
      res.on('end', () => {
        try {
          const data = resBody ? JSON.parse(resBody) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`GitHub API ${res.statusCode}: ${data.message || resBody}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const token = process.argv[2] || process.env.GITHUB_TOKEN;

  if (!token) {
    console.log('====================================================================');
    console.log('🚀 GitHub Clean & Sync Tool');
    console.log('====================================================================');
    console.log(`Target: https://github.com/${OWNER}/${REPO_NAME}`);
    console.log('');
    console.log('Run:');
    console.log('  agy-node push_to_github.js <YOUR_GITHUB_PERSONAL_ACCESS_TOKEN>');
    console.log('');
    console.log('To generate a token:');
    console.log('  1. Go to https://github.com/settings/tokens/new');
    console.log('  2. Select Note: "Clean Sync", check "repo" scope, and click Generate');
    console.log('  3. Copy the token and run the command above!');
    console.log('====================================================================');
    process.exit(1);
  }

  console.log(`\n1. Checking repository https://github.com/${OWNER}/${REPO_NAME}...`);
  try {
    await githubRequest('GET', `/repos/${OWNER}/${REPO_NAME}`, token);
    console.log(`✓ Repository "${REPO_NAME}" found.`);
  } catch (err) {
    console.log(`Creating repository "${REPO_NAME}" for ${OWNER}...`);
    await githubRequest('POST', '/user/repos', token, {
      name: REPO_NAME,
      description: REPO_DESC,
      private: false,
      auto_init: true
    });
    console.log(`✓ Repository "${REPO_NAME}" created successfully!`);
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n2. Cleaning up Vercel/Render deployment files from GitHub repository...');
  for (const delFile of FILES_TO_DELETE) {
    try {
      const existing = await githubRequest('GET', `/repos/${OWNER}/${REPO_NAME}/contents/${encodeURIComponent(delFile)}`, token);
      if (existing && existing.sha) {
        await githubRequest('DELETE', `/repos/${OWNER}/${REPO_NAME}/contents/${encodeURIComponent(delFile)}`, token, {
          message: `Delete ${delFile} (clean repository)`,
          sha: existing.sha,
          branch: 'main'
        });
        console.log(`✓ Deleted ${delFile} from GitHub repository.`);
      }
    } catch (e) {
      // File does not exist on remote, nothing to delete
    }
  }

  console.log('\n3. Scanning clean project files for upload...');
  const projectDir = __dirname;
  const files = getFilesToUpload(projectDir);
  console.log(`Found ${files.length} clean project files to upload.`);

  console.log('\n4. Syncing clean files to GitHub...');
  for (const f of files) {
    const content = fs.readFileSync(f.fullPath);
    const base64Content = content.toString('base64');

    // Check if file already exists on repo to get sha for update
    let existingSha = null;
    try {
      const existing = await githubRequest('GET', `/repos/${OWNER}/${REPO_NAME}/contents/${encodeURIComponent(f.relPath)}`, token);
      existingSha = existing.sha;
      if (existing.content && existing.content.replace(/\s+/g, '') === base64Content) {
        console.log(`- Up to date: ${f.relPath}`);
        continue;
      }
    } catch (e) {}

    await githubRequest('PUT', `/repos/${OWNER}/${REPO_NAME}/contents/${encodeURIComponent(f.relPath)}`, token, {
      message: `Sync ${f.relPath}`,
      content: base64Content,
      branch: 'main',
      ...(existingSha ? { sha: existingSha } : {})
    });

    console.log(`✓ Synced ${f.relPath}`);
  }

  console.log('\n====================================================================');
  console.log('🎉 SUCCESS! Clean project repository updated on GitHub:');
  console.log(`🔗 https://github.com/${OWNER}/${REPO_NAME}`);
  console.log('All Vercel & Render deployment files removed.');
  console.log('====================================================================\n');
}

main().catch(err => {
  console.error('\n❌ Upload Error:', err.message);
  process.exit(1);
});
