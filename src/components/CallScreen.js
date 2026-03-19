'use client';
import { useEffect, useRef, useState } from 'react';

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export default function CallScreen({ call, socket, user, status, onEnd }) {
  const [timer, setTimer] = useState('00:00');
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const setupDoneRef = useRef(false);

  // Start WebRTC when call is accepted
  useEffect(() => {
    if (!call.accepted || setupDoneRef.current) return;
    setupDoneRef.current = true;

    const isVideo = call.callType === 'video';
    const isCaller = call.role === 'caller';

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
        localStreamRef.current = stream;
        if (isVideo && localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        const pc = new RTCPeerConnection(rtcConfig);
        pcRef.current = pc;

        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            socket.emit('webrtc:ice-candidate', {
              targetUserId: call.targetUserId,
              candidate: e.candidate,
              callId: call.callId,
            });
          }
        };

        pc.ontrack = (e) => {
          if (isVideo && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = e.streams[0];
          } else if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = e.streams[0];
          }
          setConnected(true);
          startTimeRef.current = Date.now();
          timerRef.current = setInterval(() => {
            const s = Math.floor((Date.now() - startTimeRef.current) / 1000);
            setTimer(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
          }, 1000);
        };

        if (isCaller) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('webrtc:offer', { targetUserId: call.targetUserId, offer, callId: call.callId });
        }
      } catch (err) {
        console.error('WebRTC error:', err);
      }
    })();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [call.accepted, call.callType, call.role, call.targetUserId, call.callId, socket]);

  // Handle remote offer (for callee)
  useEffect(() => {
    if (!call.remoteOffer || !pcRef.current) return;
    const pc = pcRef.current;
    (async () => {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(call.remoteOffer.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc:answer', {
          targetUserId: call.remoteOffer.fromUserId,
          answer,
          callId: call.callId,
        });
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    })();
  }, [call.remoteOffer, call.callId, socket]);

  // Handle remote answer (for caller)
  useEffect(() => {
    if (!call.remoteAnswer || !pcRef.current) return;
    (async () => {
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(call.remoteAnswer.answer));
      } catch (err) {
        console.error('Error handling answer:', err);
      }
    })();
  }, [call.remoteAnswer]);

  // Handle ICE candidates
  useEffect(() => {
    if (!call.remoteCandidate || !pcRef.current) return;
    (async () => {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(call.remoteCandidate.candidate));
      } catch (e) { /* ignore */ }
    })();
  }, [call.remoteCandidate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pcRef.current) pcRef.current.close();
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      setupDoneRef.current = false;
    };
  }, []);

  const toggleMute = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0];
      if (track) { track.enabled = !track.enabled; setMuted(!track.enabled); }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getVideoTracks()[0];
      if (track) { track.enabled = !track.enabled; setVideoOff(!track.enabled); }
    }
  };

  const isVideo = call.callType === 'video';

  return (
    <div className="call-screen">
      <div className="call-content">
        {isVideo && connected && (
          <div className="remote-video-container">
            <video ref={remoteVideoRef} autoPlay playsInline />
          </div>
        )}

        <div className="call-avatar" style={{ background: call.otherColor || '#0088cc' }}>
          {call.otherName?.charAt(0).toUpperCase()}
        </div>
        <h2 style={{ color: 'white', fontSize: 24 }}>{call.otherName}</h2>

        {!connected && <p className="call-status-text">{status || 'Calling...'}</p>}
        {connected && <p className="call-timer">{timer}</p>}

        {isVideo && (
          <video ref={localVideoRef} className="local-video" autoPlay playsInline muted
            style={{ display: !videoOff && connected ? 'block' : 'none' }} />
        )}

        <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />

        <div className="call-controls">
          <button className={`call-control-btn ${muted ? 'active' : ''}`} onClick={toggleMute} title="Mute">
            <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>
          </button>
          <button className="call-control-btn end-call" onClick={onEnd} title="End Call">
            <svg viewBox="0 0 24 24" width="28" height="28"><path fill="white" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>
          </button>
          {isVideo && (
            <button className={`call-control-btn ${videoOff ? 'active' : ''}`} onClick={toggleVideo} title="Toggle Video">
              <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
