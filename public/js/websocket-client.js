/**
 * WebSocket Client
 * Connects to the backend WebSocket for real-time event updates.
 */
class WsClient {
  constructor() {
    this.ws = null;
    this.listeners = {};
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectTimer = null;
    this.token = null;
    this.connected = false;
  }

  /**
   * Connect to the backend WebSocket.
   * @param {string} token - JWT authentication token.
   */
  connect(token) {
    this.token = token;

    if (this.ws) {
      this.ws.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.addEventListener('open', () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.emit('connected');
      });

      this.ws.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data);
          this.emit('message', message);

          // Also emit specific event type
          if (message.type) {
            this.emit(message.type, message.data);
          }
        } catch (err) {
          console.error('WS message parse error:', err);
        }
      });

      this.ws.addEventListener('close', (event) => {
        this.connected = false;
        this.emit('disconnected', { code: event.code, reason: event.reason });

        // Don't reconnect if session was replaced or auth failed
        if (event.code === 4001 || event.code === 4002) {
          return;
        }

        this.scheduleReconnect();
      });

      this.ws.addEventListener('error', () => {
        this.connected = false;
        this.emit('error');
      });
    } catch (err) {
      console.error('WebSocket connection error:', err);
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule a reconnection with exponential backoff.
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('reconnectFailed');
      return;
    }

    if (this.reconnectTimer) return;

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.token) {
        this.connect(this.token);
      }
    }, delay);
  }

  /**
   * Send a message to the server.
   */
  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Disconnect cleanly.
   */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client logout');
      this.ws = null;
    }

    this.connected = false;
    this.token = null;
  }

  /**
   * Check if connected.
   */
  isConnected() {
    return this.connected;
  }

  // ── Event Emitter ──────────────────────────────
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
  }

  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error(`WsClient event handler error [${event}]:`, err);
      }
    });
  }
}

window.WsClient = WsClient;
