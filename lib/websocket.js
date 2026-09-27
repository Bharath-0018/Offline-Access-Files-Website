// lib/websocket.js - Native zero-dependency RFC-6455 WebSocket Server Implementation
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class SimpleWebSocketClient extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.isAlive = true;
    this.userId = null;
    this.deviceId = null;
    this.deviceName = 'Browser Client';

    this.buffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this._processBuffer();
    });

    socket.on('close', () => {
      this.isAlive = false;
      this.emit('close');
    });

    socket.on('error', (err) => {
      this.emit('error', err);
    });
  }

  _processBuffer() {
    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0];
      const secondByte = this.buffer[1];

      const fin = (firstByte & 0x80) !== 0;
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLength = secondByte & 0x7f;

      let currentOffset = 2;

      if (payloadLength === 126) {
        if (this.buffer.length < currentOffset + 2) return;
        payloadLength = this.buffer.readUInt16BE(currentOffset);
        currentOffset += 2;
      } else if (payloadLength === 127) {
        if (this.buffer.length < currentOffset + 8) return;
        // Read 64-bit int
        const high = this.buffer.readUInt32BE(currentOffset);
        const low = this.buffer.readUInt32BE(currentOffset + 4);
        payloadLength = high * 4294967296 + low;
        currentOffset += 8;
      }

      let mask = null;
      if (isMasked) {
        if (this.buffer.length < currentOffset + 4) return;
        mask = this.buffer.subarray(currentOffset, currentOffset + 4);
        currentOffset += 4;
      }

      if (this.buffer.length < currentOffset + payloadLength) {
        // Not all payload received yet
        return;
      }

      const payload = this.buffer.subarray(currentOffset, currentOffset + payloadLength);
      this.buffer = this.buffer.subarray(currentOffset + payloadLength);

      if (isMasked && mask) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= mask[i % 4];
        }
      }

      // Handle Opcode
      if (opcode === 8) {
        // Close frame
        this.socket.end();
        return;
      } else if (opcode === 9) {
        // Ping -> Pong
        this._sendFrame(10, payload);
      } else if (opcode === 1) {
        // Text frame
        const text = payload.toString('utf8');
        try {
          const json = JSON.parse(text);
          this.emit('message', json);
        } catch (e) {
          this.emit('raw_message', text);
        }
      }
    }
  }

  send(data) {
    if (!this.socket.writable) return;
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    const payload = Buffer.from(str, 'utf8');
    this._sendFrame(1, payload);
  }

  _sendFrame(opcode, payload) {
    const len = payload.length;
    let header;

    if (len <= 125) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | (opcode & 0x0f);
      header[1] = len;
    } else if (len <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | (opcode & 0x0f);
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | (opcode & 0x0f);
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }

    try {
      this.socket.write(Buffer.concat([header, payload]));
    } catch (e) {
      console.error('Socket write error:', e.message);
    }
  }

  close() {
    try {
      this.socket.end();
    } catch (e) {}
  }
}

class WebSocketServer extends EventEmitter {
  constructor() {
    super();
    this.clients = new Set();
  }

  handleUpgrade(req, socket, head) {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const acceptKey = crypto
      .createHash('sha1')
      .update(key + WS_GUID)
      .digest('base64');

    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`
    ];

    socket.write(headers.concat('\r\n').join('\r\n'));

    const client = new SimpleWebSocketClient(socket);
    this.clients.add(client);

    client.on('close', () => {
      this.clients.delete(client);
      this.emit('client_disconnected', client);
    });

    client.on('message', (msg) => {
      this.emit('client_message', client, msg);
    });

    this.emit('client_connected', client);
  }

  broadcast(event, data, filterFn = null) {
    const payload = { event, data, timestamp: Date.now() };
    for (const client of this.clients) {
      if (!filterFn || filterFn(client)) {
        client.send(payload);
      }
    }
  }

  sendToUser(userId, event, data) {
    this.broadcast(event, data, (client) => client.userId === userId);
  }
}

module.exports = {
  WebSocketServer,
  SimpleWebSocketClient
};
