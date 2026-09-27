# Velora - Offline-First Personal File Sharing & Storage Platform

> **An offline-first personal file sharing and storage platform for secure, fast device-to-device file transfer without relying on the internet.**

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Bharath-0018/Velora)

---

## 🌟 Key Features & Architecture

### 1. Zero-Internet Offline Core (Primary Mode)
* **Direct LAN Communication**: Operates seamlessly over standard Wi-Fi routers (even without an active internet connection) or mobile hotspots.
* **Large File Streaming Engine**: Specifically designed to handle **1.5 GB, 5 GB, and larger files** without loading entire files into memory buffers.
* **HTTP 206 Partial-Content Video Player**: Built-in cinema video player that streams and seeks instantly through large offline movies from local disk storage without buffering or internet access.
* **Zero External npm Dependencies**: Powered natively by Node.js 24 runtime modules (`node:sqlite`, `node:crypto`, `node:http`, `node:dgram`, `node:fs`, `node:stream`). Runs anywhere in seconds without dependency installation failures.

### 2. Multi-User Authentication & Isolation
* **User Accounts**: Sign Up, Sign In, Profile management.
* **Cryptographic Security**: Passwords hashed using PBKDF2 (100,000 iterations + 16-byte random salt).
* **Air-Gapped Offline OTP**: In offline environments where SMTP cannot send emails, the server generates and securely displays the 6-digit verification code locally on screen, enabling instant offline onboarding.
* **Strict Storage Isolation**: Each user receives an isolated filesystem directory (`data/storage/{userId}/`). User A can **never** view or query User B's files.
* **Path Traversal Protection**: Enforces canonical path boundary checks to prevent directory traversal (`../`) attacks.

### 3. Personal File Library & Management
* **Categorized Explorer**: Automatic categorization into **Movies & Videos**, **Documents**, **Images**, **Audio**, and **Other Files**.
* **Folder Hierarchy**: Create folders, subdirectories, and navigate with breadcrumbs.
* **File Operations**: Upload (chunked/resumable), Download, Rename, Delete, Search, and Sort (by name, size, date, category).
* **Storage Metrics & Quotas**: Real-time visualization of personal storage quota (e.g., 2.4 GB / 10 GB), used bytes, and host disk free space.

### 4. Local Device Discovery & Secure Pairing
* **UDP Beacons**: Automatically broadcasts discovery beacons on UDP port `41234` to detect other instances running on the local subnet.
* **WebSocket Presence**: Real-time peer status updates and instant file transfer progress.
* **6-Digit Secure Pairing**: Prevents unauthorized devices on the local Wi-Fi from browsing or pushing files without authorization.
* **Offline QR Code Generator**: Generates clean QR codes for mobile phones or laptops to open the web portal instantly.

### 5. High-Speed Peer-to-Peer LAN Transfers
* Direct device-to-device streaming transfer over HTTP/WebSocket without hitting remote cloud servers.
* Real-time metrics:
  * File name & size
  * Transfer speed in **MB/s**
  * Progress percentage (**0% → 100%**)
  * Estimated Remaining Time (**ETA in seconds**)
  * Pause, Resume, and Cancel support
  * Complete transfer history log

### 6. Built-in Offline Cinema Video Player
* Custom sleek dark-mode player controls:
  * Play / Pause, Timeline scrubbing bar
  * Volume control and Mute toggle
  * Speed selector (**0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x**)
  * Fullscreen toggle
  * **Automatic Resume**: Remembers the exact playback timestamp per file
  * **Subtitle Support**: Load local `.srt` or `.vtt` subtitles directly

### 7. Optional Google Drive Cloud Backup (Strictly Decoupled)
* Google Drive integration is available purely as an **optional cloud backup/sync service** when internet connectivity is present.
* The local offline storage and core LAN transfers **never depend** on Google Drive. Disconnecting Google Drive or running in an air-gapped environment leaves 100% of offline features operational.

---

## 🏗️ Architecture & Network Independence

```
[ Computer A ]                          [ Laptop B ]
(Has 1.5 GB Movie)                      (Wants to play Movie)
       │                                       │
       │─────── 1. UDP Local Discovery ───────►│ (Discovered via LAN IP)
       │◄────── 2. 6-Digit Pair Request ──────│ (Approved & Verified)
       │                                       │
       │======= 3. High-Speed LAN Stream =====►│ (Direct Stream to Disk)
       │         (Speed MB/s, ETA, 0-100%)     │
       │                                       │
[ Local Storage A ]                     [ Local Storage B ]
                                               │
                                        [ HTTP 206 Stream ]
                                               │
                                     [ Offline Video Player ]
                                     (Plays without internet!)
```

### Network Independence Matrix

| Feature | Local Wi-Fi / Hotspot (No Internet) | Internet Required |
| :--- | :---: | :---: |
| **Local Device Discovery** | ✅ 100% Works | ❌ No |
| **P2P Direct File Transfer** | ✅ 100% Works | ❌ No |
| **Personal File Library** | ✅ 100% Works | ❌ No |
| **Offline Movie / Video Player** | ✅ 100% Works | ❌ No |
| **User Sign Up / Sign In (Offline OTP)** | ✅ 100% Works | ❌ No |
| **Storage Quota & Local Disk Monitor** | ✅ 100% Works | ❌ No |
| **Google Drive Cloud Backup** | ⏸️ Standby | ✅ Yes (Optional) |

---

## 🚀 Quick Start Guide

### Prerequisites
* Windows, macOS, or Linux.
* Node.js v20+ or the bundled `agy-node` runtime.

### Launching the Application

#### Option 1: 1-Click Batch Launcher (Windows)
Double-click:
```cmd
start-server.bat
```

#### Option 2: Command Line
```powershell
agy-node server.js
# OR
node server.js
```

The server will output:
```
================================================================
🚀 AetherDrop - Offline Personal Cloud & Local File Sharing
================================================================
🌐 Local Web Portal:      http://localhost:3000
📶 LAN Access URL:         http://192.168.x.x:3000
📡 Device Discovery:       UDP Port 41234 (Active)
🔌 WebSocket Signaling:    ws://192.168.x.x:3000/ws
🔒 Zero-Internet Engine:   ACTIVE & READY
================================================================
```

---

## 🎬 Primary Acceptance Test Walkthrough

This scenario directly validates the core goal: **Transferring and watching a 1.5 GB movie offline between Computer A and Laptop B without internet**.

### Scenario:
1. **Setup**:
   - Turn OFF your computer's internet connection (or disconnect router WAN / connect both devices to a mobile hotspot with Mobile Data turned OFF).
   - Start the application on **Computer A**.
2. **Accessing the Portal**:
   - On **Computer A**, open `http://localhost:3000`.
   - Click **"1-Click Demo Login"** (or create an account with offline OTP).
   - Notice `Interstellar_Sample_Movie.mp4` (1.5 GB representation) is listed under **Movies & Videos**.
3. **Connecting Laptop B**:
   - On **Laptop B** (connected to the same Wi-Fi/hotspot), open `http://<Computer_A_IP>:3000` (e.g. `http://192.168.7.12:3000` or scan the QR code).
   - Register or sign in on Laptop B.
4. **Discovering and Pairing**:
   - Go to **Nearby Devices** on Computer A.
   - Laptop B appears under **Discovered Devices**.
   - Click **"Pair Device"** and enter the 6-digit pairing code shown on Laptop B.
5. **Streaming Transfer**:
   - On Computer A, click the Send icon next to `Interstellar_Sample_Movie.mp4`.
   - Select Laptop B.
   - Watch the live transfer progress bar advance from **0% → 100%** with live MB/s transfer speed and remaining time.
6. **Offline Playback**:
   - Go to Laptop B.
   - The movie immediately appears under **Offline Movies**.
   - Click **Play Video Offline**.
   - The built-in media player begins streaming the movie directly from local disk storage via HTTP 206 range requests.
   - Seek forward 30 minutes: playback responds instantly without buffering or internet access!

---

## 📁 Project Structure

```
Offline project/
├── lib/
│   ├── auth.js          # PBKDF2 password hashing, session tokens, offline OTP
│   ├── db.js            # SQLite database schema, WAL mode, prepared queries
│   ├── discovery.js     # UDP broadcast beacon & network interface detector
│   ├── gdrive.js        # Decoupled Google Drive cloud backup manager
│   ├── storage.js       # Chunked streaming uploader, HTTP 206 range streamer, quotas
│   ├── transfer.js      # LAN peer-to-peer file transfer engine & speed calculator
│   └── websocket.js     # RFC-6455 native WebSocket server implementation
├── public/
│   ├── css/
│   │   └── app.css      # Dark modern theme, glassmorphism, responsive styles
│   ├── js/
│   │   ├── api.js       # Client API & chunked file upload client
│   │   ├── app.js       # Master Single-Page-Application router & controllers
│   │   ├── icons.js     # 100% offline embedded SVG icon system
│   │   ├── player.js    # Custom offline cinema video player controller
│   │   └── qrcode.js    # Standalone offline QR code generator
│   └── index.html       # Single-page application shell
├── data/
│   ├── cloud.db         # SQLite database file
│   └── storage/         # Isolated user directories (data/storage/{userId}/)
├── node.cmd             # Windows runtime wrapper
├── start-server.bat     # 1-click batch launcher
├── start.ps1            # PowerShell launcher
├── package.json         # Project metadata
└── README.md            # Comprehensive documentation
```

---

## 🔒 Security Design

1. **Password Hashing**: PBKDF2 with 100,000 iterations using SHA-512 and unique 16-byte cryptographically secure salts.
2. **User Isolation**: SQLite queries strictly enforce `WHERE user_id = ?`. Storage paths strictly verify that canonical disk paths reside within `data/storage/{userId}`.
3. **Path Traversal Prevention**: Strips leading relative sequences (`../`, `..\`) and uses canonical path verification.
4. **Device Pairing Authentication**: Devices on the local Wi-Fi must exchange 6-digit codes before files can be pushed to disk.
5. **Data Integrity**: Streaming SHA-256 checksums are calculated on the fly during chunked uploads and transfers to detect any corruption.
