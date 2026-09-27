# OfflineAccess - Offline-First Personal File Sharing & Storage Platform

> **An offline-first personal file sharing and storage platform for secure, fast device-to-device file transfer without relying on the internet.**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Bharath-0018/Velora&project-name=offlineaccess)

A production-grade, zero-dependency, full-stack application built to transfer and access large files (such as 1.5 GB movies, 4K videos, disk images, and documents) between computers, laptops, and mobile devices connected to the same local network (Wi-Fi, hotspot, or local router) **without requiring internet connectivity, pendrives, external hard disks, or cloud storage**.

Live Public Deployment Target: **[https://offlineaccess.vercel.app](https://offlineaccess.vercel.app)**

---

## 🌟 Key Features & Architecture

### 1. Zero-Internet Offline Core (Primary Mode)
* **Direct LAN Communication**: Operates seamlessly over standard Wi-Fi routers (even without an active internet connection) or mobile hotspots.
* **Large File Streaming Engine**: Specifically designed to handle **1.5 GB, 5 GB, and larger files** without loading entire files into memory buffers.
* **HTTP 206 Partial-Content Video Player**: Built-in cinema video player that streams and seeks instantly through large offline movies from local disk storage without buffering or internet access.
* **Zero External npm Dependencies**: Powered natively by Node.js runtime modules (`node:sqlite`, `node:crypto`, `node:http`, `node:dgram`, `node:fs`, `node:stream`). Runs anywhere in seconds without dependency installation failures.

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

## ⚡ 1-Click Vercel Deployment

Deploy directly to your Vercel account (`bharathperumal09-7373s-projects`):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Bharath-0018/Velora&project-name=offlineaccess)

1. Click the **Deploy with Vercel** button above.
2. Sign in to your Vercel account.
3. Set project name: `offlineaccess`.
4. Vercel automatically detects `vercel.json` and `api/index.js`.
5. Your live URL will be active immediately at:
   👉 **`https://offlineaccess.vercel.app`**

---

## 🚀 Local Quick Start (Zero Internet)

### Option 1: 1-Click Windows Batch Launcher
Double-click:
```cmd
start-server.bat
```

### Option 2: Command Line
```powershell
node server.js
```

The server outputs:
```
================================================================
🚀 OfflineAccess - Offline Personal Cloud & Local File Sharing
================================================================
🌐 Local Web Portal:      http://localhost:3000
📶 LAN Access URL:         http://192.168.7.12:3000
📡 Device Discovery:       UDP Port 41234 (Active)
🔌 WebSocket Signaling:    ws://192.168.7.12:3000/ws
🔒 Zero-Internet Engine:   ACTIVE & READY
================================================================
```

---

## 📁 Project Structure

```
Offline project/
├── api/
│   └── index.js         # Vercel Serverless Function entry point
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
├── vercel.json          # Vercel production routing & serverless rewrites
├── Dockerfile           # Docker container configuration
├── docker-compose.yml   # Docker compose configuration
├── nginx.conf           # Production Nginx reverse proxy configuration
├── package.json         # Project metadata
├── start-server.bat     # 1-click batch launcher
├── start.ps1            # PowerShell launcher
└── README.md            # Comprehensive documentation
```
