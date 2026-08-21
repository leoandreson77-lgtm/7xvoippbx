/**
 * SIP Client & WebRTC Calling Engine — KRAD Global
 * Dual-Mode Call Handling:
 * 1. Primary: Real SIP signaling to FreeSWITCH (JsSIP) when FreeSWITCH WSS is connected.
 * 2. Standalone / Relay: Browser WebRTC Signaling over WebSocket Gateway for instant peer calling.
 */
class SipClient {
  constructor() {
    this.ua = null;
    this.currentSession = null;
    this.registered = false;
    this.listeners = {};
    this.localStream = null;
    this.remoteAudio = null;
    this.peerConnection = null;
    this.wsClient = null;
    this.config = null;
    this.mode = 'webrtc_relay'; // Default to webrtc_relay for instant browser calling
    this.callStartTime = null;
    this.isMutedState = false;
    this.isOnHoldState = false;
    this.activeCallTarget = null;
    this.callUuid = null;
    this.pendingSdpOffer = null;
    this.pendingIceCandidates = [];

    // Create hidden remote audio element
    this.setupAudioElement();
  }

  setupAudioElement() {
    let el = document.getElementById('sipRemoteAudio');
    if (!el) {
      el = document.createElement('audio');
      el.id = 'sipRemoteAudio';
      el.autoplay = true;
      el.playsInline = true;
      document.body.appendChild(el);
    }
    this.remoteAudio = el;
  }

  /**
   * Set reference to WebSocket client for WebRTC signaling.
   */
  setWsClient(wsClient) {
    this.wsClient = wsClient;

    if (this.wsClient) {
      this.wsClient.on('incoming_call', (data) => {
        this.mode = 'webrtc_relay';
        this.handleIncomingWebRtcCall(data);
      });

      this.wsClient.on('call_accepted', (data) => {
        this.mode = 'webrtc_relay';
        this.handleWebRtcCallAccepted(data);
      });

      this.wsClient.on('call_progress', (data) => {
        this.emit('progress', data);
      });

      this.wsClient.on('call_failed', (data) => {
        this.cleanupPeerConnection();
        this.emit('failed', { cause: data.cause || 'Failed', message: data.cause });
      });

      this.wsClient.on('call_ended', (data) => {
        this.cleanupPeerConnection();
        this.emit('ended', { duration: data.duration || 0 });
      });

      this.wsClient.on('ice_candidate', async (data) => {
        if (!data.candidate) return;
        if (
          this.peerConnection &&
          this.peerConnection.remoteDescription &&
          this.peerConnection.remoteDescription.type
        ) {
          try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (e) {
            console.warn('addIceCandidate error:', e);
          }
        } else {
          // Queue until remote description is applied
          this.pendingIceCandidates.push(data.candidate);
        }
      });
    }
  }

  /**
   * Flush queued ICE candidates after remote description is set.
   */
  async flushPendingIceCandidates() {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) return;
    while (this.pendingIceCandidates.length > 0) {
      const candidate = this.pendingIceCandidates.shift();
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('Flushed addIceCandidate error:', e);
      }
    }
  }

  /**
   * Connect to FreeSWITCH via WebSocket and register the SIP extension.
   */
  connect(config) {
    this.config = config;

    // Auto-mark registered for WebRTC relay mode immediately
    this.registered = true;
    this.emit('registered', { mode: this.mode });

    if (this.ua) {
      this.disconnect();
    }

    try {
      const socket = new JsSIP.WebSocketInterface(config.wsUrl);

      const uaConfig = {
        sockets: [socket],
        uri: config.sipUri,
        display_name: config.displayName || config.sipUsername,
        ha1: config.ha1,
        realm: config.realm,
        register: true,
        register_expires: 300,
        session_timers: false,
        no_answer_timeout: 60,
        use_preloaded_route: false,
      };

      this.ua = new JsSIP.UA(uaConfig);

      // ── Registration Events ──
      this.ua.on('registered', (e) => {
        this.mode = 'sip';
        this.registered = true;
        this.emit('registered', e);
      });

      this.ua.on('unregistered', (e) => {
        if (this.mode === 'sip') {
          this.mode = 'webrtc_relay';
        }
      });

      this.ua.on('registrationFailed', () => {
        this.mode = 'webrtc_relay';
        this.registered = true;
      });

      // ── Incoming Call ──
      this.ua.on('newRTCSession', (data) => {
        const session = data.session;
        if (session.direction === 'incoming') {
          this.mode = 'sip';
          this.handleIncomingSession(session);
        }
      });

      this.ua.on('connected', () => {
        this.mode = 'sip';
        this.emit('connected');
      });

      this.ua.on('disconnected', () => {
        this.mode = 'webrtc_relay';
        this.registered = true;
      });

      this.ua.start();
    } catch {
      this.mode = 'webrtc_relay';
      this.registered = true;
    }
  }

  // ── Standalone WebRTC Peer Calling ────────────────

  async getLocalMedia() {
    if (!this.localStream || this.localStream.getTracks().every((t) => t.readyState === 'ended')) {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });
        } else {
          throw new Error('Microphone access requires HTTPS in production browsers');
        }
      } catch (err) {
        console.warn('Microphone fallback:', err.message);
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const dest = ctx.createMediaStreamDestination();
          this.localStream = dest.stream;
        } catch {
          this.localStream = null;
        }
      }
    }
    return this.localStream;
  }

  getPcConfig() {
    const stun = this.stunServer || this.config?.stunServer || 'stun:stun.l.google.com:19302';
    return {
      iceServers: [
        { urls: stun },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
    };
  }

  async call(target) {
    if (this.currentSession || this.peerConnection) {
      this.emit('error', { message: 'Already in a call' });
      return;
    }

    this.activeCallTarget = target;
    this.callUuid = `call-${Date.now()}`;
    this.isMutedState = false;
    this.isOnHoldState = false;
    this.pendingIceCandidates = [];

    // 1. Try SIP call if JsSIP is connected to FreeSWITCH
    if (this.mode === 'sip' && this.ua && this.ua.isRegistered()) {
      try {
        const options = {
          mediaConstraints: { audio: true, video: false },
          pcConfig: this.getPcConfig(),
          rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
        };
        const session = this.ua.call(target, options);
        this.currentSession = session;
        this.setupSessionHandlers(session);
        this.emit('calling', { target });
        return;
      } catch {
        this.mode = 'webrtc_relay';
      }
    }

    // 2. WebRTC Relay Calling over WebSocket
    try {
      this.mode = 'webrtc_relay';
      this.emit('calling', { target });

      const pcConfig = this.getPcConfig();
      this.peerConnection = new RTCPeerConnection(pcConfig);

      this.peerConnection.ontrack = (event) => {
        this.setupAudioElement();
        if (event.streams && event.streams[0]) {
          this.remoteAudio.srcObject = event.streams[0];
        } else if (event.track) {
          this.remoteAudio.srcObject = new MediaStream([event.track]);
        }
        this.remoteAudio.play().catch(() => {});
      };

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.wsClient) {
          this.wsClient.send({
            type: 'ice_candidate',
            data: { to: target, candidate: event.candidate },
          });
        }
      };

      const stream = await this.getLocalMedia();
      if (stream) {
        stream.getTracks().forEach((track) => this.peerConnection.addTrack(track, stream));
      }

      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      await this.peerConnection.setLocalDescription(offer);

      if (this.wsClient) {
        this.wsClient.send({
          type: 'call_initiate',
          data: {
            to: target,
            callerNumber: this.config?.sipUsername,
            callerName: this.config?.displayName,
            sdpOffer: offer.sdp,
            callUuid: this.callUuid,
          },
        });
      }
    } catch (err) {
      this.cleanupPeerConnection();
      this.emit('failed', { cause: err.message });
    }
  }

  async handleIncomingWebRtcCall(data) {
    this.activeCallTarget = data.from;
    this.callUuid = data.callUuid;
    this.pendingSdpOffer = data.sdpOffer;
    this.pendingIceCandidates = [];

    this.emit('incoming', {
      callerNumber: data.from,
      callerName: data.callerName,
    });
  }

  async answer() {
    if (this.mode === 'sip' && this.currentSession) {
      const options = {
        mediaConstraints: { audio: true, video: false },
        pcConfig: this.getPcConfig(),
      };
      this.currentSession.answer(options);
      return;
    }

    // WebRTC relay answer
    this.mode = 'webrtc_relay';
    try {
      const pcConfig = this.getPcConfig();
      this.peerConnection = new RTCPeerConnection(pcConfig);

      this.peerConnection.ontrack = (event) => {
        this.setupAudioElement();
        if (event.streams && event.streams[0]) {
          this.remoteAudio.srcObject = event.streams[0];
        } else if (event.track) {
          this.remoteAudio.srcObject = new MediaStream([event.track]);
        }
        this.remoteAudio.play().catch(() => {});
      };

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.wsClient) {
          this.wsClient.send({
            type: 'ice_candidate',
            data: { to: this.activeCallTarget, candidate: event.candidate },
          });
        }
      };

      const stream = await this.getLocalMedia();
      if (stream) {
        stream.getTracks().forEach((track) => this.peerConnection.addTrack(track, stream));
      }

      if (this.pendingSdpOffer) {
        await this.peerConnection.setRemoteDescription(
          new RTCSessionDescription({
            type: 'offer',
            sdp: this.pendingSdpOffer,
          })
        );
        await this.flushPendingIceCandidates();
      }

      const answer = await this.peerConnection.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      await this.peerConnection.setLocalDescription(answer);

      if (this.wsClient) {
        this.wsClient.send({
          type: 'call_answer',
          data: {
            to: this.activeCallTarget,
            sdpAnswer: answer.sdp,
            callUuid: this.callUuid,
          },
        });
      }

      this.callStartTime = Date.now();
      this.emit('accepted', { target: this.activeCallTarget });
      this.emit('confirmed', { target: this.activeCallTarget });
    } catch (err) {
      this.cleanupPeerConnection();
      this.emit('failed', { cause: err.message });
    }
  }

  async handleWebRtcCallAccepted(data) {
    if (this.peerConnection && data.sdpAnswer) {
      try {
        await this.peerConnection.setRemoteDescription(
          new RTCSessionDescription({
            type: 'answer',
            sdp: data.sdpAnswer,
          })
        );
        await this.flushPendingIceCandidates();
        this.callStartTime = Date.now();
        this.emit('accepted', { target: this.activeCallTarget });
        this.emit('confirmed', { target: this.activeCallTarget });
      } catch (err) {
        console.warn('handleWebRtcCallAccepted error:', err);
      }
    }
  }

  reject() {
    if (this.mode === 'sip' && this.currentSession) {
      this.currentSession.terminate({ status_code: 603, reason_phrase: 'Decline' });
      this.currentSession = null;
      return;
    }

    if (this.wsClient && this.activeCallTarget) {
      this.wsClient.send({
        type: 'call_reject',
        data: { to: this.activeCallTarget, callUuid: this.callUuid },
      });
      this.cleanupPeerConnection();
    }
  }

  hangup() {
    if (this.mode === 'sip' && this.currentSession) {
      try {
        this.currentSession.terminate();
      } catch {}
      this.currentSession = null;
      return;
    }

    const durSec = this.callStartTime ? Math.round((Date.now() - this.callStartTime) / 1000) : 0;
    if (this.wsClient && this.activeCallTarget) {
      this.wsClient.send({
        type: 'call_hangup',
        data: {
          to: this.activeCallTarget,
          callUuid: this.callUuid,
          duration: durSec,
          callerNumber: this.config?.sipUsername,
          calleeNumber: this.activeCallTarget,
          status: durSec > 0 ? 'answered' : 'missed',
        },
      });
    }
    this.cleanupPeerConnection();
    this.emit('ended', { duration: durSec });
  }

  toggleMute() {
    if (this.mode === 'sip' && this.currentSession) {
      if (this.currentSession.isMuted().audio) {
        this.currentSession.unmute({ audio: true });
        this.emit('unmuted');
        return false;
      } else {
        this.currentSession.mute({ audio: true });
        this.emit('muted');
        return true;
      }
    }

    if (this.localStream) {
      this.isMutedState = !this.isMutedState;
      this.localStream.getAudioTracks().forEach((t) => {
        t.enabled = !this.isMutedState;
      });
      if (this.isMutedState) this.emit('muted');
      else this.emit('unmuted');
      return this.isMutedState;
    }
    return false;
  }

  toggleHold() {
    if (this.mode === 'sip' && this.currentSession) {
      if (this.currentSession.isOnHold().local) {
        this.currentSession.unhold();
        this.emit('resumed');
        return false;
      } else {
        this.currentSession.hold();
        this.emit('held');
        return true;
      }
    }

    this.isOnHoldState = !this.isOnHoldState;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((t) => {
        t.enabled = !this.isOnHoldState;
      });
    }
    if (this.isOnHoldState) this.emit('held');
    else this.emit('resumed');
    return this.isOnHoldState;
  }

  sendDTMF(tone) {
    if (this.mode === 'sip' && this.currentSession) {
      this.currentSession.sendDTMF(tone);
    }
  }

  cleanupPeerConnection() {
    this.pendingIceCandidates = [];
    this.pendingSdpOffer = null;
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch {}
      this.peerConnection = null;
    }
    if (this.localStream) {
      try {
        this.localStream.getTracks().forEach((t) => t.stop());
      } catch {}
      this.localStream = null;
    }
    if (this.remoteAudio) {
      try {
        this.remoteAudio.srcObject = null;
      } catch {}
    }
    this.callStartTime = null;
    this.activeCallTarget = null;
    this.callUuid = null;
    this.isMutedState = false;
    this.isOnHoldState = false;
  }

  // ── Session Event Handlers (JsSIP) ──────────────
  handleIncomingSession(session) {
    this.currentSession = session;
    this.setupSessionHandlers(session);

    const callerNumber = session.remote_identity.uri.user;
    const callerName = session.remote_identity.display_name || callerNumber;

    this.emit('incoming', { callerNumber, callerName, session });
  }

  setupSessionHandlers(session) {
    session.on('progress', (e) => this.emit('progress', e));
    session.on('accepted', (e) => {
      this.setupRemoteAudio(session);
      this.emit('accepted', e);
    });
    session.on('confirmed', (e) => {
      this.setupRemoteAudio(session);
      this.emit('confirmed', e);
    });
    session.on('ended', (e) => {
      this.currentSession = null;
      this.emit('ended', e);
    });
    session.on('failed', (e) => {
      this.currentSession = null;
      this.emit('failed', e);
    });
    session.on('hold', () => this.emit('held'));
    session.on('unhold', () => this.emit('resumed'));
    session.on('muted', () => this.emit('muted'));
    session.on('unmuted', () => this.emit('unmuted'));
  }

  setupRemoteAudio(session) {
    const pc = session.connection;
    if (pc) {
      pc.ontrack = (event) => {
        this.setupAudioElement();
        if (this.remoteAudio && event.streams[0]) {
          this.remoteAudio.srcObject = event.streams[0];
          this.remoteAudio.play().catch(() => {});
        }
      };
    }
  }

  isRegistered() {
    return this.registered;
  }

  isInCall() {
    return !!this.currentSession || !!this.peerConnection;
  }

  disconnect() {
    if (this.ua) {
      try {
        this.ua.stop();
      } catch {}
      this.ua = null;
    }
    this.cleanupPeerConnection();
    this.registered = false;
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    const cbs = this.listeners[event] || [];
    cbs.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error(`Error in event listener for ${event}:`, err);
      }
    });
  }
}

window.SipClient = SipClient;
