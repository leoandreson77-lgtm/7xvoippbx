import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Device } from '@twilio/voice-sdk';
import { useAuth } from './AuthContext';

const SipContext = createContext(null);

export function SipProvider({ children }) {
  const { agent, extension, token, getHeaders } = useAuth();
  const [sipStatus, setSipStatus] = useState('OFFLINE');
  const [sipStatusText, setSipStatusText] = useState('Unregistered');
  const [callState, setCallState] = useState('IDLE'); // IDLE, RINGING, IN_CALL, HELD
  const [currentCallNumber, setCurrentCallNumber] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isHeld, setIsHeld] = useState(false);
  const [recentCalls, setRecentCalls] = useState([]);
  const [sipCreds, setSipCreds] = useState(null);
  const [incomingCallData, setIncomingCallData] = useState(null);

  const wsRef = useRef(null);
  const timerRef = useRef(null);
  const audioRemoteRef = useRef(null);
  const currentCallIdRef = useRef(null);
  const twilioDeviceRef = useRef(null);
  const activeTwilioCallRef = useRef(null);

  useEffect(() => {
    // Create audio element for WebRTC audio playback
    if (!audioRemoteRef.current) {
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.id = 'sipRemoteAudio';
      document.body.appendChild(audio);
      audioRemoteRef.current = audio;
    }
  }, []);

  // Initialize Twilio WebRTC Voice Device for Browser Calls
  useEffect(() => {
    if (!agent || !token) return;

    let device = null;
    let isMounted = true;

    async function initTwilioDevice() {
      try {
        const sessionId = Date.now();
        const res = await fetch(`/api/voice/token?session=${sessionId}`, {
          credentials: 'include',
          headers: getHeaders(),
        });
        if (!res.ok) {
          console.warn('Twilio token request failed:', res.statusText);
          return;
        }

        const { token: voiceToken } = await res.json();
        if (!voiceToken || !isMounted) return;

        device = new Device(voiceToken, {
          codecPreferences: ['opus', 'pcmu'],
          enableRingingState: true,
          closeProtection: true,
        });
        twilioDeviceRef.current = device;
        try {
          await device.register();
        } catch (regErr) {
          console.warn('Device registration notice:', regErr);
        }

        device.on('registered', () => {
          console.log('✓ Twilio WebRTC Voice Device Registered');
          setSipStatus('ONLINE');
          setSipStatusText('WebRTC Ready');
        });

        device.on('unregistered', () => {
          console.log('Twilio WebRTC Device Unregistered');
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setSipStatus('OFFLINE');
            setSipStatusText('Unregistered');
          }
        });

        device.on('error', async (err) => {
          console.warn('Twilio Device error:', err);
          // Auto-recover from Error 32202 or socket disconnects
          if (err.code === 32202 || err.code === 31005 || err.code === 31205) {
            console.log('Auto-recovering Twilio Device after error:', err.code);
            try {
              const refreshRes = await fetch(`/api/voice/token?session=${Date.now()}`, {
                credentials: 'include',
                headers: getHeaders(),
              });
              if (refreshRes.ok) {
                const { token: newToken } = await refreshRes.json();
                if (device && newToken) {
                  device.updateToken(newToken);
                  await device.register();
                }
              }
            } catch (rErr) {
              console.error('Failed to auto-recover Twilio device:', rErr);
            }
          }
        });

        device.on('tokenWillExpire', async () => {
          try {
            const refreshRes = await fetch(`/api/voice/token?session=${Date.now()}`, {
              credentials: 'include',
              headers: getHeaders(),
            });
            if (refreshRes.ok) {
              const { token: newToken } = await refreshRes.json();
              device.updateToken(newToken);
            }
          } catch (e) {
            console.error('Failed to refresh voice token:', e);
          }
        });

        device.on('incoming', (call) => {
          activeTwilioCallRef.current = call;
          const fromParam = call.parameters?.From || 'Unknown Caller';
          setIncomingCallData({
            from: fromParam,
            callUuid: call.parameters?.CallSid || `inc-${Date.now()}`,
            callerName: `Caller ${fromParam}`,
          });
          setCallState('RINGING');
          setCurrentCallNumber(fromParam);

          call.on('accept', () => {
            setCallState('IN_CALL');
            setIncomingCallData(null);
          });

          call.on('disconnect', () => {
            setCallState('IDLE');
            setCurrentCallNumber('');
            setIncomingCallData(null);
            activeTwilioCallRef.current = null;
          });

          call.on('cancel', () => {
            setCallState('IDLE');
            setCurrentCallNumber('');
            setIncomingCallData(null);
            activeTwilioCallRef.current = null;
          });

          call.on('reject', () => {
            setCallState('IDLE');
            setCurrentCallNumber('');
            setIncomingCallData(null);
            activeTwilioCallRef.current = null;
          });

          call.on('error', (err) => {
            console.warn('Incoming Twilio call error:', err);
            setCallState('IDLE');
            setCurrentCallNumber('');
            setIncomingCallData(null);
            activeTwilioCallRef.current = null;
          });
        });

        device.register().catch((err) => {
          console.warn('Device registration notice:', err?.message || err);
        });
      } catch (err) {
        console.warn('Twilio Voice init error:', err);
      }
    }

    initTwilioDevice();

    return () => {
      isMounted = false;
      if (device) {
        try {
          device.destroy();
        } catch (e) {}
      }
      twilioDeviceRef.current = null;
    };
  }, [agent, token]);

  // Fetch SIP credentials & Connect WebSocket
  useEffect(() => {
    if (!agent || !token) {
      setSipStatus('OFFLINE');
      setSipStatusText('Unregistered');
      return;
    }

    async function initSip() {
      try {
        setSipStatusText('Connecting...');
        const res = await fetch('/api/auth/sip-credentials', {
          credentials: 'include',
          headers: getHeaders(),
        });
        if (res.ok) {
          const creds = await res.json();
          setSipCreds(creds);
        }
      } catch (e) {}
    }

    initSip();

    // WebSocket Signalling connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setSipStatus('ONLINE');
      setSipStatusText('Registered');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'connected' || msg.type === 'registration_status') {
          setSipStatus('ONLINE');
          setSipStatusText(msg.data?.registered === false ? 'Unregistered' : 'Registered');
        } else if (msg.type === 'incoming_call') {
          setIncomingCallData(msg.data);
          setCallState('RINGING');
          setCurrentCallNumber(msg.data.from);
          const activeCallId = Date.now().toString();
          currentCallIdRef.current = activeCallId;
          setRecentCalls((prev) => [
            {
              id: activeCallId,
              direction: 'inbound',
              callerNumber: msg.data.from,
              status: 'ringing',
              startedAt: new Date().toISOString(),
              duration: 0,
            },
            ...prev.slice(0, 14),
          ]);
        } else if (msg.type === 'call_accepted') {
          setCallState('IN_CALL');
          setIncomingCallData(null);
          if (currentCallIdRef.current) {
            setRecentCalls((prev) =>
              prev.map((c) => (c.id === currentCallIdRef.current ? { ...c, status: 'answered' } : c))
            );
          }
        } else if (msg.type === 'call_taken') {
          setCallState('IDLE');
          setIncomingCallData(null);
          setCurrentCallNumber('');
        } else if (msg.type === 'call_progress') {
          setCallState('RINGING');
        } else if (msg.type === 'call_failed' || msg.type === 'call_ended' || msg.type === 'call_rejected') {
          if (currentCallIdRef.current) {
            setRecentCalls((prev) =>
              prev.map((c) =>
                c.id === currentCallIdRef.current && c.status === 'ringing'
                  ? { ...c, status: 'missed' }
                  : c
              )
            );
          }
          setCallState('IDLE');
          setIncomingCallData(null);
          setCurrentCallNumber('');
        }
      } catch (e) {}
    };

    ws.onclose = () => {
      setSipStatus('OFFLINE');
      setSipStatusText('Disconnected');
    };

    return () => {
      ws.close();
    };
  }, [agent, token]);

  const callDurationRef = useRef(0);

  // Call timer: ticks every second when IN_CALL
  useEffect(() => {
    if (callState === 'IN_CALL') {
      callDurationRef.current = 0;
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => {
          const next = prev + 1;
          callDurationRef.current = next;
          return next;
        });
      }, 1000);
    } else {
      callDurationRef.current = 0;
      setCallDuration(0);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [callState]);

  const resetCallState = useCallback(() => {
    setCallState('IDLE');
    setCurrentCallNumber('');
    setIsMuted(false);
    setIsHeld(false);
    setCallDuration(0);
    activeTwilioCallRef.current = null;
    currentCallIdRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  async function makeCall(targetNumber) {
    if (!targetNumber) return;
    const cleanTo = targetNumber.trim();

    // If an active call is currently running, disconnect only that call
    if (activeTwilioCallRef.current) {
      try { activeTwilioCallRef.current.disconnect(); } catch (e) {}
      activeTwilioCallRef.current = null;
    }

    setCurrentCallNumber(cleanTo);
    setCallState('RINGING');
    setIsMuted(false);
    setIsHeld(false);

    const activeCallId = Date.now().toString();
    currentCallIdRef.current = activeCallId;

    let placedViaWebRtc = false;

    // Ensure Twilio WebRTC Device exists (instantiate on-demand if needed)
    if (!twilioDeviceRef.current) {
      try {
        const res = await fetch('/api/voice/token', {
          credentials: 'include',
          headers: getHeaders(),
        });
        if (res.ok) {
          const { token: voiceToken } = await res.json();
          if (voiceToken) {
            const dev = new Device(voiceToken, {
              codecPreferences: ['opus', 'pcmu'],
              enableRingingState: true,
              closeProtection: true,
            });
            twilioDeviceRef.current = dev;
          }
        }
      } catch (e) {
        console.warn('On-demand device init:', e);
      }
    }

    // Connect Browser WebRTC Mic & Audio directly via Twilio Voice Device
    if (twilioDeviceRef.current) {
      try {
        console.log('Dialing Twilio WebRTC connect:', cleanTo);
        placedViaWebRtc = true;

        const callPromise = twilioDeviceRef.current.connect({
          params: {
            To: cleanTo,
            CallerId: '+17627446471',
          },
        });

        Promise.resolve(callPromise).then((call) => {
          if (!call) return;
          activeTwilioCallRef.current = call;

          call.on('accept', () => {
            console.log('✓ Call answered and WebRTC media stream connected');
            setCallState('IN_CALL');
            if (currentCallIdRef.current) {
              setRecentCalls((prev) =>
                prev.map((c) => (c.id === currentCallIdRef.current ? { ...c, status: 'answered' } : c))
              );
            }
          });

          call.on('disconnect', () => {
            console.log('Twilio Call ended, duration:', callDurationRef.current);
            const finalDuration = callDurationRef.current || 0;
            const finalStatus = finalDuration > 0 ? 'answered' : 'missed';

            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(
                JSON.stringify({
                  type: 'call_hangup',
                  data: {
                    to: cleanTo,
                    duration: finalDuration,
                    status: finalStatus,
                  },
                })
              );
            }

            if (currentCallIdRef.current) {
              setRecentCalls((prev) =>
                prev.map((c) =>
                  c.id === currentCallIdRef.current
                    ? { ...c, status: finalStatus, duration: finalDuration }
                    : c
                )
              );
            }

            resetCallState();
          });

          call.on('cancel', () => {
            console.log('Twilio Call cancelled');
            resetCallState();
          });

          call.on('reject', () => {
            console.log('Twilio Call rejected');
            resetCallState();
          });

          call.on('error', (err) => {
            console.error('Twilio WebRTC Call Error:', err);
            alert(`Call Notice: ${err.message || JSON.stringify(err)}`);
            resetCallState();
          });

          call.on('mute', (muted) => {
            setIsMuted(muted);
          });
        }).catch((err) => {
          console.error('Twilio connect promise error:', err);
          alert(`Call Connection Notice: ${err.message || err}`);
          resetCallState();
        });
      } catch (err) {
        console.error('Twilio connect error:', err);
        placedViaWebRtc = false;
        alert(`Microphone / Audio Permission Notice: ${err.message || err}`);
      }
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'call_initiate',
          data: {
            to: cleanTo,
            callerNumber: extension?.number || '1000',
            callerName: agent?.name || `Agent Ext ${extension?.number || '1000'}`,
            isWebRtc: placedViaWebRtc,
          },
        })
      );
    }

    // Track in recent calls as ringing initially
    const newCall = {
      id: activeCallId,
      direction: 'outbound',
      calleeNumber: cleanTo,
      status: 'ringing',
      startedAt: new Date().toISOString(),
      duration: 0,
    };
    setRecentCalls((prev) => [newCall, ...prev.slice(0, 14)]);
  }

  function acceptCall() {
    if (activeTwilioCallRef.current) {
      activeTwilioCallRef.current.accept();
    }
    setCallState('IN_CALL');
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'call_answer',
          data: {
            to: incomingCallData?.from,
            callUuid: incomingCallData?.callUuid,
          },
        })
      );
    }
    if (currentCallIdRef.current) {
      setRecentCalls((prev) =>
        prev.map((c) => (c.id === currentCallIdRef.current ? { ...c, status: 'answered' } : c))
      );
    }
    setIncomingCallData(null);
  }

  function rejectCall() {
    if (activeTwilioCallRef.current) {
      try { activeTwilioCallRef.current.reject(); } catch (e) {}
    }
    if (incomingCallData && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'call_reject',
          data: {
            to: incomingCallData.from,
            callUuid: incomingCallData.callUuid,
          },
        })
      );
    }
    resetCallState();
  }

  function endCall() {
    if (activeTwilioCallRef.current) {
      try { activeTwilioCallRef.current.disconnect(); } catch (e) {}
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'call_hangup',
          data: {
            to: currentCallNumber,
            duration: callDuration,
          },
        })
      );
    }

    resetCallState();
  }

  function toggleMute() {
    if (activeTwilioCallRef.current) {
      const nextMute = !isMuted;
      activeTwilioCallRef.current.mute(nextMute);
      setIsMuted(nextMute);
    } else {
      setIsMuted((prev) => !prev);
    }
  }

  function toggleHold() {
    const nextHold = !isHeld;
    setIsHeld(nextHold);
    if (activeTwilioCallRef.current) {
      activeTwilioCallRef.current.mute(nextHold);
    }
  }

  function sendDTMF(digit) {
    if (activeTwilioCallRef.current && digit) {
      try {
        activeTwilioCallRef.current.sendDigits(String(digit));
      } catch (e) {
        console.warn('Error sending DTMF:', e);
      }
    }
  }

  return (
    <SipContext.Provider
      value={{
        sipStatus,
        sipStatusText,
        callState,
        currentCallNumber,
        callDuration,
        isMuted,
        isHeld,
        recentCalls,
        sipCreds,
        incomingCallData,
        makeCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleHold,
        sendDTMF,
      }}
    >
      {children}
    </SipContext.Provider>
  );
}

export function useSip() {
  return useContext(SipContext);
}

