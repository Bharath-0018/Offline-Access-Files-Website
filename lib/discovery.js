// lib/discovery.js - Zero-Internet Local Device Discovery via UDP Beacons, WebSocket Presence, and Network Interfaces
const os = require('node:os');
const dgram = require('node:dgram');
const crypto = require('node:crypto');
const http = require('node:http');
const { query, get, run } = require('./db');

const UDP_PORT = 41234;
const BEACON_INTERVAL_MS = 3000;

class DeviceDiscovery {
  constructor(port = 3000) {
    this.port = port;
    this.deviceId = this._getOrCreateDeviceId();
    this.deviceName = os.hostname() || 'Personal Cloud Node';
    this.deviceType = this._guessDeviceType();
    this.discoveredDevices = new Map();
    this.udpSocket = null;
    this.broadcastTimer = null;
    this.localIps = this.getLocalIps();
  }

  _getOrCreateDeviceId() {
    const existing = get('SELECT value FROM system_settings WHERE key = ?', 'device_id');
    if (existing) {
      return existing.value;
    }
    const newId = crypto.randomUUID();
    run('INSERT INTO system_settings (key, value) VALUES (?, ?)', 'device_id', newId);
    return newId;
  }

  _guessDeviceType() {
    const platform = os.platform();
    if (platform === 'win32' || platform === 'darwin' || platform === 'linux') {
      return 'laptop';
    }
    return 'desktop';
  }

  getLocalIps() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // Skip internal/loopback and non-IPv4
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push({
            name,
            address: iface.address,
            netmask: iface.netmask
          });
        }
      }
    }
    return ips;
  }

  getPrimaryIp() {
    const ips = this.getLocalIps();
    // Prioritize Wi-Fi or 192.168.x / 10.x / 172.x private addresses
    for (const iface of ips) {
      if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.') || iface.address.startsWith('172.')) {
        return iface.address;
      }
    }
    return ips.length > 0 ? ips[0].address : '127.0.0.1';
  }

  start() {
    this.localIps = this.getLocalIps();
    const primaryIp = this.getPrimaryIp();

    // Start UDP Beacon Receiver and Broadcaster
    try {
      this.udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.udpSocket.on('error', (err) => {
        console.warn('UDP Discovery warning:', err.message);
      });

      this.udpSocket.on('message', (msg, rinfo) => {
        try {
          const data = JSON.parse(msg.toString('utf8'));
          if (data.type === 'AETHER_BEACON' && data.deviceId !== this.deviceId) {
            this._handleDiscoveredBeacon(data, rinfo.address);
          }
        } catch (e) {}
      });

      this.udpSocket.bind(UDP_PORT, () => {
        try {
          this.udpSocket.setBroadcast(true);
        } catch (e) {}
        this._startBroadcasting(primaryIp);
      });
    } catch (e) {
      console.warn('UDP setup skipped:', e.message);
    }
  }

  _startBroadcasting(primaryIp) {
    if (this.broadcastTimer) clearInterval(this.broadcastTimer);

    const sendBeacon = () => {
      if (!this.udpSocket) return;
      const message = Buffer.from(
        JSON.stringify({
          type: 'AETHER_BEACON',
          deviceId: this.deviceId,
          deviceName: this.deviceName,
          deviceType: this.deviceType,
          ip: primaryIp,
          port: this.port,
          timestamp: Date.now()
        })
      );

      // Broadcast to standard broadcast address
      try {
        this.udpSocket.send(message, 0, message.length, UDP_PORT, '255.255.255.255');
      } catch (e) {}
    };

    sendBeacon();
    this.broadcastTimer = setInterval(sendBeacon, BEACON_INTERVAL_MS);
  }

  _handleDiscoveredBeacon(data, remoteIp) {
    const ip = data.ip || remoteIp;
    const now = Date.now();

    const deviceRecord = {
      id: data.deviceId,
      deviceName: data.deviceName || 'Nearby Device',
      deviceType: data.deviceType || 'laptop',
      ipAddress: ip,
      port: data.port || 3000,
      lastSeenAt: now
    };

    this.discoveredDevices.set(data.deviceId, deviceRecord);

    // Sync to SQLite
    const existing = get('SELECT id, is_paired, pair_code, pair_token FROM devices WHERE id = ?', data.deviceId);
    if (!existing) {
      // Auto-assign random 6-digit pair code for this device
      const pairCode = Math.floor(100000 + Math.random() * 900000).toString();
      run(
        'INSERT INTO devices (id, device_name, device_type, ip_address, port, pair_code, is_paired, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
        data.deviceId, data.deviceName, data.deviceType || 'laptop', ip, data.port || 3000, pairCode, now
      );
    } else {
      run(
        'UPDATE devices SET device_name = ?, ip_address = ?, port = ?, last_seen_at = ? WHERE id = ?',
        data.deviceName, ip, data.port || 3000, now, data.deviceId
      );
    }
  }

  // Get active nearby devices (seen in the last 15 seconds)
  getDiscoveredDevices() {
    const now = Date.now();
    // Prune stale in-memory devices
    for (const [id, dev] of this.discoveredDevices.entries()) {
      if (now - dev.lastSeenAt > 20000) {
        this.discoveredDevices.delete(id);
      }
    }

    const allDbDevices = query('SELECT * FROM devices ORDER BY last_seen_at DESC');
    return allDbDevices.map(d => ({
      id: d.id,
      deviceName: d.device_name,
      deviceType: d.device_type,
      ipAddress: d.ip_address,
      port: d.port,
      isPaired: !!d.is_paired,
      pairCode: d.pair_code,
      isOnline: (now - d.last_seen_at) < 15000,
      lastSeenAt: d.last_seen_at
    }));
  }

  // Generate pair code for self (to show on UI)
  getMyPairingInfo() {
    let code = get('SELECT value FROM system_settings WHERE key = ?', 'my_pair_code');
    if (!code) {
      const newCode = Math.floor(100000 + Math.random() * 900000).toString();
      run('INSERT INTO system_settings (key, value) VALUES (?, ?)', 'my_pair_code', newCode);
      code = { value: newCode };
    }

    return {
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      ipAddress: this.getPrimaryIp(),
      port: this.port,
      pairCode: code.value,
      url: `http://${this.getPrimaryIp()}:${this.port}`
    };
  }

  // Pair with remote device using pair code
  pairDevice(deviceId, enteredCode) {
    const device = get('SELECT * FROM devices WHERE id = ?', deviceId);
    if (!device) {
      throw new Error('Device not found on local network.');
    }

    // In local pairing, we verify the pair code
    if (device.pair_code && device.pair_code !== enteredCode.trim()) {
      throw new Error('Invalid 6-digit pairing code.');
    }

    const pairToken = crypto.randomBytes(24).toString('hex');
    run('UPDATE devices SET is_paired = 1, pair_token = ? WHERE id = ?', pairToken, deviceId);

    return {
      success: true,
      deviceId,
      deviceName: device.device_name,
      isPaired: true
    };
  }

  // Unpair device
  unpairDevice(deviceId) {
    run('UPDATE devices SET is_paired = 0, pair_token = NULL WHERE id = ?', deviceId);
    return { success: true };
  }

  stop() {
    if (this.broadcastTimer) clearInterval(this.broadcastTimer);
    if (this.udpSocket) {
      try { this.udpSocket.close(); } catch (e) {}
    }
  }
}

module.exports = DeviceDiscovery;
