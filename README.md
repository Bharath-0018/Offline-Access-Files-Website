# Velora - Personal Cloud & Pendrive-Style File System

> **A modern personal cloud and pendrive-style file system across all your devices, with persistent server storage and zero-internet local network transfer mode.**

---

## 🌟 The Core Problem Velora Solves

Previously, uploading a file stored it only inside browser storage on that specific computer. Opening the application on Computer B with the same login would show an empty library.

**Velora permanently eliminates this issue**:
* **Computer A**: Log in with your email and password, upload a 1.5 GB movie or 4K video. It is permanently saved to persistent server-side storage linked to your authenticated account.
* **Computer B**: Open Velora from another computer, log in with the **same** email and password. The 1.5 GB movie automatically appears in "My Files". You can stream, download, or manage it with full fidelity.
* **Computer C / Mobile**: Log in from your phone or tablet on the local Wi-Fi or internet. The exact same files, folders, and storage quotas are visible and accessible.

---

## 🚀 Dual Architecture Modes

### 1. Cloud Mode (Persistent Server Storage & Multi-Device Sync)
* **Persistent File Storage**: Uploaded files are written directly to server disk under `data/storage/{userId}/{category}/` and tracked in high-performance SQLite (`data/cloud.db`).
* **50 GB Personal Quota**: Generous 50 GB default quota per account with real-time usage metrics.
* **1.5 GB+ Large File Streaming Engine**:
  * 5MB chunked uploads with SHA-256 verification and automatic retries.
  * Upload progress, speed (MB/s), and ETA calculation.
  * Zero RAM bloat: uses native Node.js streaming file streams and positional file descriptor writes.
* **Instant Multi-Device Sync**: Real-time RFC-6455 WebSocket broadcasts notify all connected devices whenever files are uploaded, deleted, or renamed.
* **HTTP 206 Partial-Content Video Player**: Built-in dark-mode cinema player that streams and seeks instantly through large movies without loading entire files into browser or server RAM.
* **Strict User Isolation**: User A can never view, download, stream, or delete User B's files.

### 2. Offline Local Transfer Mode (Zero-Internet LAN / Hotspot)
* **Device Discovery**: UDP beacon discovery on port `41234` detects other active Velora nodes on the local subnet.
* **Direct LAN Transfers**: Transfer files directly between devices on local Wi-Fi or mobile hotspot without internet access or data consumption.
* **6-Digit Secure Pairing**: Prevents unauthorized devices on the local Wi-Fi from pushing files without explicit pairing.

### 3. Optional Google Drive Cloud Backup (Strictly Decoupled)
* Secondary optional backup service; disconnected by default and completely independent from the core offline cloud.

---

## ⚡ Quick Start

### Option 1: 1-Click Windows Launcher
Double-click `start-server.bat` (or `start-velora.bat` from root).

### Option 2: Command Line
```powershell
node server.js
```
or with agy-node:
```powershell
agy-node server.js
```

### Access URLs:
* **Local Web Portal**: `http://localhost:3000`
* **LAN Access URL** (for Computer B & Mobile): `http://<HOST_IP>:3000` (e.g. `http://192.168.1.5:3000`)

---

## 🧪 Automated Multi-Device Verification Suite

Velora includes a full end-to-end automated verification test suite verifying all 7 lifecycle steps:
1. User registration & air-gapped OTP verification on Computer A.
2. Multi-chunk upload (simulating 6MB - 1.5GB movie file) with SHA-256 calculation.
3. Persistent server disk validation and SQLite database record confirmation.
4. Computer B login with identical credentials, automatic file discovery, bit-for-bit download, and HTTP 206 Partial Content video streaming.
5. Mobile Device C storage quota validation (50 GB quota and usage calculation).
6. Security isolation check: Bob (User B) cannot see, download, or stream Alice's files.
7. File deletion synchronization across all devices and server filesystem cleanup.

To execute the test suite:
```powershell
node tests/test_velora_multidevice.js
```
or
```powershell
npm test
```

---

## 📁 Project Structure

```
OfflineAccess/
├── lib/
│   ├── auth.js          # PBKDF2 password hashing, session tokens, offline OTP, 50GB quota
│   ├── db.js            # SQLite database schema, WAL mode, upload_sessions table
│   ├── discovery.js     # UDP broadcast beacon & network interface detector
│   ├── gdrive.js        # Decoupled optional Google Drive backup manager
│   ├── storage.js       # Chunked streaming uploader, HTTP 206 range streamer, quotas, SHA-256
│   ├── transfer.js      # LAN peer-to-peer file transfer engine & speed calculator
│   └── websocket.js     # RFC-6455 native WebSocket server with per-user event broadcast
├── public/
│   ├── css/style.css    # Clean dark-mode Velora styling
│   ├── js/api.js        # Chunked uploader (5MB slices), streaming URLs, multi-device API client
│   ├── js/app.js        # Velora SPA controller, real-time sync listeners, 50 GB dashboard
│   ├── js/player.js     # HTTP 206 Range video streaming player
│   └── index.html       # Single page application markup
├── tests/
│   └── test_velora_multidevice.js # Automated multi-device verification test suite
├── server.js            # Unified HTTP & WebSocket server
├── package.json         # Scripts and metadata
└── start-server.bat     # Windows launcher
```

---

## 🔒 Security & Privacy
* Passwords hashed using PBKDF2 with 100,000 iterations and 16-byte random salts.
* Session tokens generated cryptographically with 32 bytes of secure entropy.
* Authorization enforced on all file access, download, and streaming endpoints.
* Path traversal prevented via strict boundary checks against user storage directories.
