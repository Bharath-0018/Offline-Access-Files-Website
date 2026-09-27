# Production Deployment & Domain Configuration Guide
## Target Domain: https://OfflineAccess.com

This document provides the complete, step-by-step production deployment instructions for running **OfflineAccess** continuously 24/7 on a public cloud server, independent of your personal development computer.

---

## 🔍 1. Domain Registration Status Check for `OfflineAccess.com`

As required, we performed live DNS and Nameserver queries for `OfflineAccess.com`:

```
DNS Query Results:
Name:       OfflineAccess.com
Type A:     76.223.54.146, 13.248.169.48
Type NS:    ns1.afternic.com, ns2.afternic.com
```

### Analysis:
- **Registration Status**: The domain `OfflineAccess.com` is **already registered** and currently parked on **Afternic** (GoDaddy's domain aftermarket/brokerage network).
- **What You Must Do Before It Can Point to Your Server**:
  1. **If you already own this domain**: Log in to your domain registrar (GoDaddy, Namecheap, Google Domains/Squarespace, or Cloudflare) and point the DNS records to your hosting server (see Section 2).
  2. **If you do NOT own this domain yet**: You cannot use `OfflineAccess.com` until you purchase/acquire it through Afternic/GoDaddy or contact the broker.
  3. **Alternative Available Domain Extensions**: If you prefer not to purchase a premium aftermarket domain, consider:
     - `offlineaccess.cloud`
     - `offlineaccess.app`
     - `offlineaccess.io`
     - `offline-access.com`
     - Free subdomain: `offlineaccess.onrender.com` or `offlineaccess.up.railway.app`

---

## 🌐 2. DNS Configuration (Connecting Domain to Hosting)

Once you have control of the domain in your registrar's DNS management console (e.g. Cloudflare, GoDaddy, Namecheap):

### For VPS / Dedicated Cloud Server (DigitalOcean, AWS, Hetzner):
| Record Type | Host / Name | Value / Target | TTL | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **A** | `@` (root) | `<YOUR_SERVER_PUBLIC_IP>` | 300 / Auto | Directs `OfflineAccess.com` to your server |
| **A** (or CNAME) | `www` | `<YOUR_SERVER_PUBLIC_IP>` (or `OfflineAccess.com`) | 300 / Auto | Directs `www.OfflineAccess.com` to your server |

### For Managed Cloud PaaS (Render.com / Railway):
| Record Type | Host / Name | Value / Target | TTL | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **ANAME / ALIAS** | `@` (root) | `offlineaccess.onrender.com` | Auto | Points apex domain |
| **CNAME** | `www` | `offlineaccess.onrender.com` | Auto | Points www subdomain |

---

## 🔒 3. SSL/TLS Certificate & HTTPS Configuration

The application is configured to strictly enforce HTTPS in production (`FORCE_HTTPS=true`).

### Automatic SSL (Render / Railway / Cloudflare)
- When deploying to Render or using Cloudflare proxy, SSL certificates are issued and renewed **automatically** via Let's Encrypt with zero manual intervention.

### Manual SSL on VPS (Ubuntu / Debian / Nginx)
Run Certbot to obtain free trusted certificates:
```bash
sudo apt update && sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d OfflineAccess.com -d www.OfflineAccess.com --agree-tos -m your-email@example.com --redirect
```

---

## 🚀 4. Deployment Options

### Option A: Render.com (Recommended - 1-Click Zero Maintenance)

1. Create a free account at [render.com](https://render.com).
2. Push your project code to a GitHub or GitLab repository.
3. Click **New +** → **Blueprint** → Select your repository.
4. Render will automatically detect [`render.yaml`](file:///c:/Users/CSE%20LAB-1/Downloads/Offline%20project/render.yaml) included in this repository.
5. In **Custom Domains** on Render:
   - Add `OfflineAccess.com` and `www.OfflineAccess.com`.
   - Add the DNS records provided by Render to your domain registrar.
6. Done! Render keeps the app running 24/7 with automatic Let's Encrypt HTTPS and persistent disk storage.

---

### Option B: Cloud VPS / Docker (DigitalOcean, AWS EC2, Hetzner)

#### Step 1: Clone and Set Up Server
On your Ubuntu/Debian server:
```bash
# Install Docker & Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh

# Clone repository
git clone <your-repo-url> /opt/offlineaccess
cd /opt/offlineaccess
```

#### Step 2: Start the Container
```bash
docker compose up -d --build
```
This starts the application on port `3000` with persistent volume `offlineaccess_persistent_data` for all SQLite databases and user file uploads.

#### Step 3: Configure Nginx & SSL
Copy the provided [`nginx.conf`](file:///c:/Users/CSE%20LAB-1/Downloads/Offline%20project/nginx.conf) to `/etc/nginx/sites-available/offlineaccess`:
```bash
sudo cp nginx.conf /etc/nginx/sites-available/offlineaccess
sudo ln -s /etc/nginx/sites-available/offlineaccess /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Install SSL certificate:
```bash
sudo certbot --nginx -d OfflineAccess.com -d www.OfflineAccess.com
```

---

## 💾 5. Database & Large File Storage in Production

- **SQLite Database**: Stored at `/data/cloud.db` inside the persistent volume. Safe from container rebuilds and server reboots.
- **Large File Storage**: User files (including 1.5 GB movies) are streamed directly to `/data/storage/{userId}/`.
- **Zero Buffer Overflow**: Both Nginx (`proxy_request_buffering off;`) and Node.js (`fs.createWriteStream` + streaming chunk pipelines) stream multi-gigabyte files directly to disk without bloating server RAM.
- **HTTP 206 Video Streaming**: Fully functional over public HTTPS connections, allowing users on mobile phones, college computers, and laptops to stream movies smoothly.

---

## 🩺 6. Production Healthcheck & Verification

Once deployed, test your production deployment:
```bash
curl -I https://OfflineAccess.com/api/health
```
Expected output:
```http
HTTP/2 200
content-type: application/json; charset=utf-8
strict-transport-security: max-age=31536000; includeSubDomains

{"status":"ok","service":"OfflineAccess","environment":"production","domain":"OfflineAccess.com","uptime":420,"timestamp":1790499000000}
```
