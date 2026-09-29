// push_to_github.js
const { execSync } = require('node:child_process');
const token = process.argv[2] || process.env.GITHUB_TOKEN;

const git = 'C:\\Users\\VSB\\min_git\\cmd\\git.exe';

if (!token) {
  console.log('Usage: agy-node push_to_github.js <YOUR_GITHUB_PERSONAL_ACCESS_TOKEN>');
  process.exit(1);
}

const remoteUrl = `https://Bharath-0018:${token}@github.com/Bharath-0018/Offline-Access-Files-Website.git`;

try {
  console.log('Pushing latest Velora commits to https://github.com/Bharath-0018/Offline-Access-Files-Website ...');
  execSync(`"${git}" push "${remoteUrl}" main`, {
    cwd: __dirname,
    stdio: 'inherit'
  });
  console.log('\n[SUCCESS] Successfully pushed to GitHub!');
} catch (err) {
  console.error('\n[ERROR] Push failed:', err.message);
  process.exit(1);
}
