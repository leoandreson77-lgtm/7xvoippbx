/**
 * Call Controls & Ringtone Audio Engine — KRAD Global
 * Manages receiver incoming call dialog, Web Audio API ringtone synthesizer,
 * active in-call controls (Mute, Hold, DTMF, Hangup), and live timer.
 */
class CallControls {
  constructor(sipClient) {
    this.sipClient = sipClient;
    this.isMuted = false;
    this.isHeld = false;
    this.callTimer = null;
    this.callStartTime = null;
    this.ringtoneOsc1 = null;
    this.ringtoneOsc2 = null;
    this.ringtoneGain = null;
    this.audioCtx = null;
    this.ringtoneInterval = null;

    // DOM elements
    this.activeCallCard = document.getElementById('activeCallCard');
    this.activeCallStatus = document.getElementById('activeCallStatus');
    this.activeCallNumber = document.getElementById('activeCallNumber');
    this.activeCallTimer = document.getElementById('activeCallTimer');
    this.activeCallerAvatar = document.getElementById('activeCallerAvatar');
    this.audioEqualizer = document.getElementById('audioEqualizer');
    this.muteBtn = document.getElementById('muteBtn');
    this.holdBtn = document.getElementById('holdBtn');
    this.dtmfBtn = document.getElementById('dtmfBtn');
    this.hangupActiveBtn = document.getElementById('hangupActiveBtn');
    this.callBtn = document.getElementById('callBtn');
    this.hangupBtn = document.getElementById('hangupBtn');
    this.dtmfOverlay = document.getElementById('dtmfOverlay');
    this.dtmfPad = document.getElementById('dtmfPad');
    this.dtmfCloseBtn = document.getElementById('dtmfCloseBtn');

    // Enhanced Incoming Modal Elements
    this.incomingOverlay = document.getElementById('incomingCallOverlay');
    this.incomingCallerAvatar = document.getElementById('incomingCallerAvatar');
    this.incomingCallerName = document.getElementById('incomingCallerName');
    this.incomingCallerNumber = document.getElementById('incomingCallerNumber');
    this.incomingCallContext = document.getElementById('incomingCallContext');
    this.acceptCallBtn = document.getElementById('acceptCallBtn');
    this.rejectCallBtn = document.getElementById('rejectCallBtn');

    this.init();
  }

  init() {
    // Request browser notification permission for incoming calls
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // ── Mute Button ──
    this.muteBtn.addEventListener('click', () => {
      this.isMuted = this.sipClient.toggleMute();
      this.muteBtn.classList.toggle('active', this.isMuted);
      this.muteBtn.querySelector('.control-label').textContent = this.isMuted ? 'Unmute' : 'Mute';
      this.muteBtn.querySelector('.control-icon').textContent = this.isMuted ? '🔇' : '🎤';
    });

    // ── Hold Button ──
    this.holdBtn.addEventListener('click', () => {
      this.isHeld = this.sipClient.toggleHold();
      this.holdBtn.classList.toggle('active', this.isHeld);
      this.holdBtn.querySelector('.control-label').textContent = this.isHeld ? 'Resume' : 'Hold';
      this.holdBtn.querySelector('.control-icon').textContent = this.isHeld ? '▶' : '⏸';
      this.activeCallStatus.textContent = this.isHeld ? 'On Hold (Paused)' : 'In Conversation';
    });

    // ── DTMF Button ──
    this.dtmfBtn.addEventListener('click', () => {
      this.dtmfOverlay.classList.add('visible');
    });

    this.dtmfCloseBtn.addEventListener('click', () => {
      this.dtmfOverlay.classList.remove('visible');
    });

    this.dtmfPad.addEventListener('click', (e) => {
      const key = e.target.closest('.dial-key');
      if (!key) return;
      const tone = key.dataset.dtmf;
      if (tone) {
        this.sipClient.sendDTMF(tone);
      }
    });

    // ── Hangup Active Call ──
    this.hangupActiveBtn.addEventListener('click', () => {
      this.sipClient.hangup();
    });

    // ── Incoming Call: Accept ──
    this.acceptCallBtn.addEventListener('click', () => {
      this.stopRingtone();
      this.sipClient.answer();
      this.hideIncomingCall();
    });

    // ── Incoming Call: Reject ──
    this.rejectCallBtn.addEventListener('click', () => {
      this.stopRingtone();
      this.sipClient.reject();
      this.hideIncomingCall();
    });

    // ── Keyboard Shortcuts for Incoming Calls ──
    window.addEventListener('keydown', (e) => {
      if (this.incomingOverlay && this.incomingOverlay.classList.contains('visible')) {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.acceptCallBtn.click();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.rejectCallBtn.click();
        }
      }
    });
  }

  // ── Web Audio API Ringtone Synthesizer ──────────

  startRingtone() {
    try {
      this.stopRingtone();
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();

      const playBurst = () => {
        if (!this.audioCtx) return;
        const osc1 = this.audioCtx.createOscillator();
        const osc2 = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        // Dual Tone Multi-Frequency PBX Ring (440Hz + 480Hz)
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(440, this.audioCtx.currentTime);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(480, this.audioCtx.currentTime);

        gain.gain.setValueAtTime(0, this.audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.18, this.audioCtx.currentTime + 0.05);
        gain.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 1.8);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc1.start(this.audioCtx.currentTime);
        osc2.start(this.audioCtx.currentTime);

        osc1.stop(this.audioCtx.currentTime + 1.8);
        osc2.stop(this.audioCtx.currentTime + 1.8);
      };

      playBurst();
      this.ringtoneInterval = setInterval(playBurst, 3000);
    } catch {}
  }

  stopRingtone() {
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch {}
      this.audioCtx = null;
    }
  }

  /**
   * Show the active in-call receiver UI.
   */
  showActiveCall(number, status = 'Connecting...') {
    this.stopRingtone();
    this.activeCallNumber.textContent = number || '—';
    this.activeCallStatus.textContent = status;
    this.activeCallTimer.textContent = '00:00';
    this.activeCallCard.classList.add('visible');

    // Update avatar with caller initial
    if (this.activeCallerAvatar && number) {
      this.activeCallerAvatar.textContent = number.replace('+', '').charAt(0).toUpperCase() || '👤';
    }

    // Switch dial/hangup buttons
    this.callBtn.style.display = 'none';
    this.hangupBtn.style.display = 'flex';

    // Reset controls
    this.isMuted = false;
    this.isHeld = false;
    this.muteBtn.classList.remove('active');
    this.holdBtn.classList.remove('active');
    this.muteBtn.querySelector('.control-label').textContent = 'Mute';
    this.muteBtn.querySelector('.control-icon').textContent = '🎤';
    this.holdBtn.querySelector('.control-label').textContent = 'Hold';
    this.holdBtn.querySelector('.control-icon').textContent = '⏸';
  }

  /**
   * Start the call duration timer.
   */
  startTimer() {
    this.stopRingtone();
    this.callStartTime = Date.now();
    this.activeCallStatus.textContent = 'In Conversation';

    if (this.callTimer) clearInterval(this.callTimer);
    this.callTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const seconds = (elapsed % 60).toString().padStart(2, '0');
      this.activeCallTimer.textContent = `${minutes}:${seconds}`;
    }, 1000);
  }

  /**
   * Hide the active call UI and reset.
   */
  hideActiveCall() {
    this.stopRingtone();
    this.activeCallCard.classList.remove('visible');
    this.callBtn.style.display = 'flex';
    this.hangupBtn.style.display = 'none';

    if (this.callTimer) {
      clearInterval(this.callTimer);
      this.callTimer = null;
    }
    this.callStartTime = null;
    this.dtmfOverlay.classList.remove('visible');
  }

  /**
   * Show the enhanced incoming call overlay on the receiver's screen.
   */
  showIncomingCall(callerNumber, callerName) {
    const num = callerNumber || 'Unknown';
    const name = callerName || (num.startsWith('10') ? `Agent (Ext ${num})` : 'Incoming Caller');

    if (this.incomingCallerNumber) this.incomingCallerNumber.textContent = num;
    if (this.incomingCallerName) this.incomingCallerName.textContent = name;
    if (this.incomingCallerAvatar) {
      this.incomingCallerAvatar.textContent = name.charAt(0).toUpperCase() || '📞';
    }

    if (this.incomingCallContext) {
      this.incomingCallContext.textContent = num.startsWith('10')
        ? 'Direct Internal Extension • HD Voice'
        : 'Incoming Toll-Free Line • Caller ID Verified';
    }

    this.incomingOverlay.classList.add('visible');

    // Start synthesized telephone ringing
    this.startRingtone();

    // Trigger Browser Notification if window is in background
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification(`📞 Incoming Call from ${name}`, {
        body: `Extension: ${num} is calling. Click to answer.`,
        icon: '/favicon.ico',
      });
    }
  }

  /**
   * Hide the incoming call overlay.
   */
  hideIncomingCall() {
    this.stopRingtone();
    this.incomingOverlay.classList.remove('visible');
  }
}

window.CallControls = CallControls;
