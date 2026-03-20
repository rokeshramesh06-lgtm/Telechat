"use client";
import { useState, useEffect, useRef, useCallback } from "react";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export default function CallScreen({
  callState,
  currentUser,
  onEndCall,
}) {
  const { calleeId, callerName, callType, isIncoming, conversationId } = callState;
  const [status, setStatus] = useState(isIncoming ? "connecting" : "ringing");
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(callType === "audio");

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pollRef = useRef(null);
  const timerRef = useRef(null);
  const connectedRef = useRef(false);

  const cleanup = useCallback(() => {
    clearInterval(pollRef.current);
    clearInterval(timerRef.current);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    pcRef.current = null;
    connectedRef.current = false;
  }, []);

  const sendSignal = useCallback(
    async (signalType, signalData) => {
      try {
        await fetch("/api/calls/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            calleeId,
            conversationId,
            signalType,
            signalData,
          }),
        });
      } catch (err) {
        console.error("Signal send error:", err);
      }
    },
    [calleeId, conversationId]
  );

  const pollSignals = useCallback(async () => {
    try {
      const res = await fetch("/api/calls/signal");
      const data = await res.json();

      for (const signal of data.signals || []) {
        if (signal.callerId !== calleeId) continue;

        switch (signal.signalType) {
          case "answer":
            if (pcRef.current && pcRef.current.signalingState !== "stable") {
              await pcRef.current.setRemoteDescription(signal.signalData);
              setStatus("connected");
              connectedRef.current = true;
            }
            break;
          case "ice-candidate":
            if (pcRef.current && signal.signalData) {
              try {
                await pcRef.current.addIceCandidate(signal.signalData);
              } catch {}
            }
            break;
          case "hangup":
            cleanup();
            onEndCall();
            break;
        }
      }
    } catch {}
  }, [calleeId, cleanup, onEndCall]);

  useEffect(() => {
    async function initCall() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callType === "video",
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;

        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.ontrack = (event) => {
          remoteStreamRef.current = event.streams[0];
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = event.streams[0];
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            sendSignal("ice-candidate", event.candidate.toJSON());
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "connected") {
            setStatus("connected");
            connectedRef.current = true;
            timerRef.current = setInterval(() => {
              setDuration((d) => d + 1);
            }, 1000);
          }
          if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
            cleanup();
            onEndCall();
          }
        };

        if (!isIncoming) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sendSignal("offer", pc.localDescription.toJSON());
          setStatus("ringing");
        }

        // Start polling for signals
        pollRef.current = setInterval(pollSignals, 800);
      } catch (err) {
        console.error("Call init error:", err);
        setStatus("error");
      }
    }

    initCall();

    return cleanup;
  }, []);

  // Handle incoming call - set remote description from offer and create answer
  useEffect(() => {
    async function handleIncoming() {
      if (isIncoming && callState.offer && pcRef.current) {
        try {
          await pcRef.current.setRemoteDescription(callState.offer);
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          await sendSignal("answer", pcRef.current.localDescription.toJSON());
          setStatus("connecting");
        } catch (err) {
          console.error("Answer error:", err);
        }
      }
    }
    const timer = setTimeout(handleIncoming, 500);
    return () => clearTimeout(timer);
  }, [isIncoming, callState.offer, sendSignal]);

  function handleHangup() {
    sendSignal("hangup", { reason: "user_hangup" });
    cleanup();
    onEndCall();
  }

  function toggleMute() {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMuted(!audioTrack.enabled);
    }
  }

  function toggleVideo() {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setVideoOff(!videoTrack.enabled);
    }
  }

  function formatDuration(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }

  return (
    <div className="call-screen">
      <div className="call-bg" />

      {callType === "video" && (
        <>
          <video
            ref={remoteVideoRef}
            className="call-remote-video"
            autoPlay
            playsInline
          />
          <video
            ref={localVideoRef}
            className="call-local-video"
            autoPlay
            playsInline
            muted
          />
        </>
      )}

      <div className={`call-info ${callType === "video" ? "video-mode" : ""}`}>
        {callType === "audio" && (
          <div className="call-avatar">
            <div
              className="avatar call-avatar-circle"
              style={{ width: 96, height: 96, fontSize: 36, background: "var(--accent)" }}
            >
              {(callerName || "?")[0].toUpperCase()}
            </div>
            {status === "ringing" && <div className="call-pulse" />}
          </div>
        )}
        <span className="call-name">{callerName}</span>
        <span className="call-status">
          {status === "ringing" && "Ringing..."}
          {status === "connecting" && "Connecting..."}
          {status === "connected" && formatDuration(duration)}
          {status === "error" && "Call failed"}
        </span>
      </div>

      <div className="call-controls">
        <button
          className={`call-btn ${muted ? "active" : ""}`}
          onClick={toggleMute}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
              <path d="M17 16.95A7 7 0 015 12M19 12a7 7 0 00-.11-1.23" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
            </svg>
          )}
        </button>

        {callType === "video" && (
          <button
            className={`call-btn ${videoOff ? "active" : ""}`}
            onClick={toggleVideo}
            title={videoOff ? "Turn on camera" : "Turn off camera"}
          >
            {videoOff ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            )}
          </button>
        )}

        <button className="call-btn hangup-btn" onClick={handleHangup} title="End call">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91" />
            <line x1="23" y1="1" x2="1" y2="23" />
          </svg>
        </button>
      </div>
    </div>
  );
}
