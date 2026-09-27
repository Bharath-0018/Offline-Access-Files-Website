// lib/auth.js - Authentication, password hashing, offline OTP, and user session management
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { query, get, run } = require('./db');

const STORAGE_ROOT = process.env.STORAGE_DIR || (process.env.VERCEL ? path.join('/tmp', 'storage') : path.join(__dirname, '..', 'data', 'storage'));

// Helper to hash password
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

// Verify password
function verifyPassword(password, hash, salt) {
  const testHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(testHash, 'hex'));
}

// Ensure user storage directories
function ensureUserStorage(userId) {
  const userDir = path.join(STORAGE_ROOT, userId);
  const categories = ['movies', 'videos', 'documents', 'images', 'audio', 'others'];
  for (const cat of categories) {
    const dir = path.join(userDir, cat);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  return userDir;
}

// Generate 6-digit OTP
function generateOtp(email, purpose = 'signup') {
  // Invalidate previous OTPs for this email & purpose
  run('UPDATE otps SET used = 1 WHERE email = ? AND purpose = ?', email, purpose);

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const id = crypto.randomUUID();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  run(
    'INSERT INTO otps (id, email, code, purpose, expires_at, used) VALUES (?, ?, ?, ?, ?, 0)',
    id, email, code, purpose, expiresAt
  );

  return { code, expiresAt };
}

// Verify OTP
function verifyOtp(email, code, purpose) {
  const now = Date.now();
  const otp = get(
    'SELECT * FROM otps WHERE email = ? AND code = ? AND purpose = ? AND used = 0 AND expires_at > ?',
    email, code, purpose, now
  );

  if (!otp) {
    return false;
  }

  // Mark as used
  run('UPDATE otps SET used = 1 WHERE id = ?', otp.id);
  return true;
}

// Register user
function registerUser({ email, password, name }) {
  const cleanEmail = email.trim().toLowerCase();
  const existing = get('SELECT id FROM users WHERE email = ?', cleanEmail);
  if (existing) {
    throw new Error('An account with this email already exists.');
  }

  const { hash, salt } = hashPassword(password);
  const userId = crypto.randomUUID();
  const now = Date.now();

  run(
    'INSERT INTO users (id, email, name, password_hash, password_salt, is_verified, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
    userId, cleanEmail, name.trim(), hash, salt, now
  );

  // Initialize storage directory for the user
  ensureUserStorage(userId);

  // Generate OTP for email verification
  const { code, expiresAt } = generateOtp(cleanEmail, 'signup');

  return {
    userId,
    email: cleanEmail,
    name: name.trim(),
    otpCode: code, // returned for offline verification display
    expiresAt
  };
}

// Confirm OTP and activate user
function confirmRegistration(email, code) {
  const cleanEmail = email.trim().toLowerCase();
  const valid = verifyOtp(cleanEmail, code, 'signup');
  if (!valid) {
    throw new Error('Invalid or expired verification code.');
  }

  run('UPDATE users SET is_verified = 1 WHERE email = ?', cleanEmail);
  const user = get('SELECT id, email, name, storage_quota_bytes FROM users WHERE email = ?', cleanEmail);
  
  // Create session
  const sessionToken = createSession(user.id);
  return { user, sessionToken };
}

// Login user
function loginUser(email, password) {
  const cleanEmail = email.trim().toLowerCase();
  const user = get('SELECT * FROM users WHERE email = ?', cleanEmail);
  if (!user) {
    throw new Error('Invalid email or password.');
  }

  const isMatch = verifyPassword(password, user.password_hash, user.password_salt);
  if (!isMatch) {
    throw new Error('Invalid email or password.');
  }

  if (!user.is_verified) {
    // Generate new verification OTP
    const { code } = generateOtp(cleanEmail, 'signup');
    return {
      requiresVerification: true,
      email: cleanEmail,
      otpCode: code
    };
  }

  // Update last login
  run('UPDATE users SET last_login_at = ? WHERE id = ?', Date.now(), user.id);
  ensureUserStorage(user.id);

  const sessionToken = createSession(user.id);
  return {
    requiresVerification: false,
    sessionToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      storageQuotaBytes: user.storage_quota_bytes
    }
  };
}

// Create session token
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  run('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)', token, userId, expiresAt, Date.now());
  return token;
}

// Get user by session token
function getUserBySession(token) {
  if (!token) return null;
  const now = Date.now();
  const session = get(
    `SELECT u.id, u.email, u.name, u.storage_quota_bytes, u.is_verified 
     FROM sessions s 
     JOIN users u ON s.user_id = u.id 
     WHERE s.token = ? AND s.expires_at > ?`,
    token, now
  );
  return session || null;
}

// Invalidate session
function logoutSession(token) {
  if (!token) return;
  run('DELETE FROM sessions WHERE token = ?', token);
}

// Request password reset OTP
function requestPasswordReset(email) {
  const cleanEmail = email.trim().toLowerCase();
  const user = get('SELECT id FROM users WHERE email = ?', cleanEmail);
  if (!user) {
    // Avoid revealing if user exists, but still handle gracefully
    return { success: true, otpCode: '123456' };
  }

  const { code } = generateOtp(cleanEmail, 'reset');
  return { success: true, otpCode: code };
}

// Reset password with OTP
function resetPassword(email, code, newPassword) {
  const cleanEmail = email.trim().toLowerCase();
  const valid = verifyOtp(cleanEmail, code, 'reset');
  if (!valid) {
    throw new Error('Invalid or expired reset code.');
  }

  const { hash, salt } = hashPassword(newPassword);
  run('UPDATE users SET password_hash = ?, password_salt = ? WHERE email = ?', hash, salt, cleanEmail);

  // Invalidate old sessions
  const user = get('SELECT id FROM users WHERE email = ?', cleanEmail);
  if (user) {
    run('DELETE FROM sessions WHERE user_id = ?', user.id);
  }

  return { success: true };
}

module.exports = {
  registerUser,
  confirmRegistration,
  loginUser,
  getUserBySession,
  logoutSession,
  requestPasswordReset,
  resetPassword,
  ensureUserStorage,
  generateOtp,
  createSession,
  STORAGE_ROOT
};
