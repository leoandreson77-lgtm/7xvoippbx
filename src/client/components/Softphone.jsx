import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSip } from '../context/SipContext';
import {
  Phone, PhoneOff, PhoneIncoming, PhoneOutgoing,
  Mic, MicOff, Pause, Play, ArrowRightLeft, Users,
  Delete, Headphones, Speaker, Volume2, Wifi, WifiOff,
  Signal, SignalLow, SignalMedium, SignalHigh,
  ChevronDown, Settings, Timer, Shield,
} from 'lucide-react';

const KEYPAD_KEYS = [
  { digit: '1', letters: '' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '*', letters: '' },
  { digit: '0', letters: '+' },
  { digit: '#', letters: '' },
];

export default function Softphone() {
  const {
    sipStatus, sipStatusText, callState,
    currentCallNumber, callDuration,
    isMuted, isHeld, makeCall, acceptCall, rejectCall, endCall,
    toggleMute, toggleHold, sendDTMF, incomingCallData,
  } = useSip();

  const [dialInput, setDialInput] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [showDevices, setShowDevices] = useState(false);
  const [audioDevices, setAudioDevices] = useState({ inputs: [], outputs: [] });
  const [selectedMic, setSelectedMic] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState('');
  const [networkQuality, setNetworkQuality] = useState('good'); // good | fair | poor
  const dtmfAudioCtx = useRef(null);

  // Format seconds to MM:SS
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Enumerate audio devices
  useEffect(() => {
    async function getDevices() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter(d => d.kind === 'audioinput');
        const outputs = devices.filter(d => d.kind === 'audiooutput');
        setAudioDevices({ inputs, outputs });
        if (inputs.length > 0 && !selectedMic) setSelectedMic(inputs[0].deviceId);
        if (outputs.length > 0 && !selectedSpeaker) setSelectedSpeaker(outputs[0].deviceId);
      } catch (e) { /* permission denied */ }
    }
    getDevices();
  }, []);

  // Simulated network quality indicator
  useEffect(() => {
    if (callState !== 'IN_CALL') { setNetworkQuality('good'); return; }
    const interval = setInterval(() => {
      const rand = Math.random();
      setNetworkQuality(rand > 0.85 ? 'poor' : rand > 0.7 ? 'fair' : 'good');
    }, 5000);
    return () => clearInterval(interval);
  }, [callState]);

  // DTMF tone generator
  const playDTMFTone = useCallback((digit) => {
    if (!dtmfAudioCtx.current) {
      dtmfAudioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = dtmfAudioCtx.current;
    const freqs = {
      '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
      '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
      '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
      '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
    };
    const pair = freqs[digit];
    if (!pair) return;
    const gain = ctx.createGain();
    gain.gain.value = 0.08;
    gain.connect(ctx.destination);
    pair.forEach(f => {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      osc.type = 'sine';
      osc.connect(gain);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    });
  }, []);

  const handleKeyPress = (digit) => {
    playDTMFTone(digit);
    if (callState === 'IN_CALL') {
      sendDTMF(digit);
    }
    setDialInput(prev => prev + digit);
  };

  const handleBackspace = () => setDialInput(prev => prev.slice(0, -1));

  const handleDial = (e) => {
    e && e.preventDefault();
    if (!dialInput.trim()) return;
    makeCall(dialInput.trim());
  };

  const handleTransfer = () => {
    if (!transferTarget.trim()) return;
    // Transfer logic would go here via SIP context
    setShowTransfer(false);
    setTransferTarget('');
  };

  const NetworkIcon = () => {
    if (networkQuality === 'poor') return <SignalLow size={14} className="net-icon-poor" />;
    if (networkQuality === 'fair') return <SignalMedium size={14} className="net-icon-fair" />;
    return <SignalHigh size={14} className="net-icon-good" />;
  };

  const isInCall = callState === 'IN_CALL' || callState === 'RINGING';

  return (
    <div className="softphone" style={{ position: 'relative' }}>
      {/* ── Incoming Call Modal Overlay ── */}
      {incomingCallData && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.96)', backdropFilter: 'blur(16px)',
          zIndex: 100, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: '24px',
          borderRadius: '20px', border: '1px solid rgba(59, 130, 246, 0.4)',
        }}>
          <div className="sp-caller-ripple" style={{ marginBottom: '16px' }}>
            <span className="sp-ripple-ring" style={{ borderColor: 'var(--success)' }} />
            <div className="sp-caller-avatar" style={{ background: 'var(--success)', width: '56px', height: '56px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PhoneIncoming size={28} color="#fff" />
            </div>
          </div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '4px' }}>
            {incomingCallData.callerName || `Ext ${incomingCallData.from}`}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--accent-light)', marginBottom: '24px' }}>
            📞 Incoming Call from {incomingCallData.from}
          </div>
          <div style={{ display: 'flex', gap: '16px', width: '100%', maxWidth: '240px' }}>
            <button
              onClick={acceptCall}
              style={{
                flex: 1, padding: '12px', borderRadius: '12px', background: '#10b981',
                color: '#fff', fontWeight: 'bold', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
              }}
            >
              <Phone size={18} /> Accept
            </button>
            <button
              onClick={rejectCall}
              style={{
                flex: 1, padding: '12px', borderRadius: '12px', background: '#ef4444',
                color: '#fff', fontWeight: 'bold', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
              }}
            >
              <PhoneOff size={18} /> Reject
            </button>
          </div>
        </div>
      )}

      {/* ── Softphone Header ── */}
      <div className="sp-header">
        <div className="sp-header-left">
          <Phone size={16} className="sp-brand-icon" />
          <span className="sp-brand">7XVOIP</span>
        </div>
        <div className="sp-header-right">
          <div className={`sp-sip-badge sp-sip-${sipStatus === 'ONLINE' ? 'online' : 'offline'}`}>
            <span className="sp-sip-dot" />
            <span>{sipStatusText}</span>
          </div>
          {callState === 'IN_CALL' && (
            <div className="sp-net-badge">
              <NetworkIcon />
              <span className="sp-net-label">
                {networkQuality === 'good' ? 'Excellent' : networkQuality === 'fair' ? 'Fair' : 'Poor'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Active Call View ── */}
      {isInCall && (
        <div className="sp-active-call">
          <div className="sp-call-visual">
            {/* Pulsing avatar ring */}
            <div className="sp-caller-ripple">
              <span className="sp-ripple-ring" />
              <span className="sp-ripple-ring sp-ripple-delayed" />
              <div className="sp-caller-avatar">
                <Phone size={28} />
              </div>
            </div>

            <div className="sp-caller-id">{currentCallNumber || 'Unknown'}</div>
            <div className="sp-call-status-label">
              {callState === 'RINGING' ? 'Ringing...' : isHeld ? 'On Hold' : 'Connected'}
            </div>

            {/* Timer */}
            <div className="sp-call-timer">
              <Timer size={14} />
              <span>{formatTime(callDuration)}</span>
            </div>

            {/* Soundwave animation */}
            {callState === 'IN_CALL' && !isHeld && (
              <div className="sp-soundwave">
                {[...Array(7)].map((_, i) => (
                  <span key={i} className="sp-wave-bar" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            )}
          </div>

          {/* ── Call Control Bar ── */}
          <div className="sp-call-controls">
            <button
              className={`sp-ctrl-btn ${isMuted ? 'sp-ctrl-active' : ''}`}
              onClick={toggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              <span>{isMuted ? 'Unmute' : 'Mute'}</span>
            </button>

            <button
              className={`sp-ctrl-btn ${isHeld ? 'sp-ctrl-active' : ''}`}
              onClick={toggleHold}
              title={isHeld ? 'Resume' : 'Hold'}
            >
              {isHeld ? <Play size={20} /> : <Pause size={20} />}
              <span>{isHeld ? 'Resume' : 'Hold'}</span>
            </button>

            <button
              className="sp-ctrl-btn"
              onClick={() => setShowTransfer(!showTransfer)}
              title="Transfer"
            >
              <ArrowRightLeft size={20} />
              <span>Transfer</span>
            </button>

            <button className="sp-ctrl-btn sp-ctrl-hangup" onClick={endCall} title="End Call">
              <PhoneOff size={20} />
              <span>Hangup</span>
            </button>
          </div>

          {/* Transfer Overlay */}
          {showTransfer && (
            <div className="sp-transfer-panel">
              <div className="sp-transfer-header">
                <ArrowRightLeft size={14} />
                <span>Transfer Call</span>
              </div>
              <div className="sp-transfer-body">
                <input
                  type="text"
                  placeholder="Extension or number..."
                  value={transferTarget}
                  onChange={(e) => setTransferTarget(e.target.value)}
                  className="sp-transfer-input"
                />
                <div className="sp-transfer-actions">
                  <button className="sp-btn-blind" onClick={handleTransfer}>
                    <PhoneOutgoing size={14} />
                    Blind
                  </button>
                  <button className="sp-btn-attended" onClick={handleTransfer}>
                    <Users size={14} />
                    Attended
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Dialer Screen ── */}
      {!isInCall && (
        <>
          <form className="sp-dialer-screen" onSubmit={handleDial}>
            <input
              type="text"
              className="sp-dial-input"
              value={dialInput}
              onChange={(e) => setDialInput(e.target.value)}
              placeholder="Enter number..."
              autoComplete="off"
            />
            {dialInput && (
              <button type="button" className="sp-backspace" onClick={handleBackspace} aria-label="Backspace">
                <Delete size={20} />
              </button>
            )}
          </form>

          {/* ── Keypad ── */}
          <div className="sp-keypad">
            {KEYPAD_KEYS.map(({ digit, letters }) => (
              <button
                key={digit}
                type="button"
                className="sp-key"
                onClick={() => handleKeyPress(digit)}
              >
                <span className="sp-key-digit">{digit}</span>
                <span className="sp-key-letters">{letters || '\u00A0'}</span>
              </button>
            ))}
          </div>

          {/* ── Dial Button ── */}
          <div className="sp-dial-action">
            <button
              type="button"
              className="sp-dial-btn"
              onClick={handleDial}
              disabled={!dialInput.trim() && sipStatus !== 'ONLINE'}
            >
              <Phone size={20} />
              <span>Call</span>
            </button>
          </div>
        </>
      )}

      {/* ── Audio Device Selector ── */}
      <div className="sp-device-section">
        <button
          className="sp-device-toggle"
          onClick={() => setShowDevices(!showDevices)}
        >
          <Settings size={14} />
          <span>Audio Devices</span>
          <ChevronDown size={14} className={`sp-chevron ${showDevices ? 'sp-chevron-open' : ''}`} />
        </button>

        {showDevices && (
          <div className="sp-device-panel">
            <div className="sp-device-group">
              <label className="sp-device-label">
                <Mic size={12} />
                <span>Microphone</span>
              </label>
              <select
                value={selectedMic}
                onChange={(e) => setSelectedMic(e.target.value)}
                className="sp-device-select"
              >
                {audioDevices.inputs.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="sp-device-group">
              <label className="sp-device-label">
                <Volume2 size={12} />
                <span>Speaker</span>
              </label>
              <select
                value={selectedSpeaker}
                onChange={(e) => setSelectedSpeaker(e.target.value)}
                className="sp-device-select"
              >
                {audioDevices.outputs.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Speaker ${d.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
