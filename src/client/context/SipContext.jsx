import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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
        if (msg.type === 'incoming_call') {
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

  // Call timer
  useEffect(() => {
    if (callState === 'IN_CALL') {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setCallDuration(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  function makeCall(targetNumber) {
    if (!targetNumber) return;
    const cleanTo = targetNumber.trim();
    setCurrentCallNumber(cleanTo);
    setCallState('RINGING');
    setIsMuted(false);
    setIsHeld(false);

    const activeCallId = Date.now().toString();
    currentCallIdRef.current = activeCallId;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'call_initiate',
          data: {
            to: cleanTo,
            callerNumber: extension?.number || '1000',
            callerName: agent?.name || `Agent Ext ${extension?.number || '1000'}`,
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
    if (!incomingCallData) return;
    setCallState('IN_CALL');
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'call_answer',
          data: {
            to: incomingCallData.from,
            callUuid: incomingCallData.callUuid,
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
    if (currentCallIdRef.current) {
      setRecentCalls((prev) =>
        prev.map((c) => (c.id === currentCallIdRef.current ? { ...c, status: 'missed' } : c))
      );
    }
    setCallState('IDLE');
    setIncomingCallData(null);
    setCurrentCallNumber('');
  }

  function endCall() {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'call_terminate',
          data: { to: currentCallNumber },
        })
      );
    }

    if (currentCallIdRef.current) {
      setRecentCalls((prev) =>
        prev.map((c) => {
          if (c.id === currentCallIdRef.current) {
            return {
              ...c,
              status: c.status === 'answered' ? 'answered' : 'missed',
              duration: callDuration,
            };
          }
          return c;
        })
      );
    }

    setCallState('IDLE');
    setCurrentCallNumber('');
    setIncomingCallData(null);
    setIsMuted(false);
    setIsHeld(false);
  }

  function toggleMute() {
    setIsMuted((prev) => !prev);
  }

  function toggleHold() {
    setIsHeld((prev) => !prev);
  }

  function sendDTMF(digit) {
    /* Send DTMF tone */
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
