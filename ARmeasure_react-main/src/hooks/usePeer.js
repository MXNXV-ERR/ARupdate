import { useEffect, useState, useRef, useCallback } from 'react';
import Peer from 'peerjs';

export const usePeer = (role, code, canvasStream = null) => {
    const [peer, setPeer] = useState(null);
    const [call, setCall] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [status, setStatus] = useState("Initializing...");
    const [conn, setConn] = useState(null);
    const [data, setData] = useState(null);
    const [isDataConnected, setIsDataConnected] = useState(false);
    const localStreamRef = useRef(null);
    const audioTrackRef = useRef(null); // Keep audio track reference
    const [facingMode, setFacingMode] = useState('environment');
    const [retryCount, setRetryCount] = useState(0);

    function getVideoConstraints(mode) {
        const constraints = {
            facingMode: { ideal: mode },
            width: { ideal: 1280, max: 1280 },
            height: { ideal: 720, max: 720 },
            frameRate: { ideal: 20, max: 30 }
        };
        return constraints;
    }

    const setupCallEvents = useCallback((activeCall) => {
        setCall(activeCall);
        activeCall.on('stream', (stream) => {
            console.log("Remote Stream received");
            setRemoteStream(stream);
            if (role === 'reviewer') {
                setStatus(`Connected - Receiving stream from ${activeCall.peer}`);
            } else {
                setStatus(`Connected - Streaming to ${activeCall.peer}`);
            }
        });
        activeCall.on('close', () => {
            setStatus("Call Ended");
            setCall(null);
            setRemoteStream(null);
        });
        activeCall.on('error', (err) => {
            console.error("Call error:", err);
            setStatus(`Call Error: ${err.message || err.type}`);
        });
    }, [role]);

    const setupDataEvents = useCallback((dataConn) => {
        setConn(dataConn);
        dataConn.on('data', (receivedData) => {
            console.log("Data received:", receivedData?.type);
            setData(receivedData);
        });
        dataConn.on('open', () => {
            console.log("Data connection open with:", dataConn.peer);
            setIsDataConnected(true);
        });
        dataConn.on('close', () => {
            setConn(null);
            setIsDataConnected(false);
        });
        dataConn.on('error', (err) => {
            console.error("Data connection error:", err);
            setIsDataConnected(false);
        });
    }, []);

    // startCall removed (inlined in useEffect to control dependencies)

    // Replace video track with canvas stream when available (for AR) - REMOVED FOR PRO FIX
    // We now stick to the camera stream to prevent freezing/black screen issues.
    /*
    const replaceWithCanvasStream = useCallback(() => {
        if (!call || !call.peerConnection || !canvasStream) return;

        try {
            const canvasVideoTrack = canvasStream.getVideoTracks()[0];
            if (!canvasVideoTrack) {
                console.error("No video track in canvas stream");
                return;
            }

            const senders = call.peerConnection.getSenders();
            const videoSender = senders.find(s => s.track?.kind === 'video');

            if (videoSender) {
                videoSender.replaceTrack(canvasVideoTrack);
                console.log("Replaced video track with canvas stream");
                setStatus("Streaming AR view...");
            }
        } catch (e) {
            console.error("Error replacing with canvas stream:", e);
        }
    }, [call, canvasStream]);
    */

    const facingModeRef = useRef(facingMode); // Ref to access latest mode without triggering updates
    const peerRef = useRef(null);
    const retryTimeoutRef = useRef(null);

    // Update ref when state changes
    useEffect(() => {
        facingModeRef.current = facingMode;
    }, [facingMode]);

    const setupCallEventsRef = useRef(setupCallEvents);
    const setupDataEventsRef = useRef(setupDataEvents);

    // Keep refs updated
    useEffect(() => {
        setupCallEventsRef.current = setupCallEvents;
        setupDataEventsRef.current = setupDataEvents;
    }, [setupCallEvents, setupDataEvents]);


    useEffect(() => {
        if (!code) return;
        const myId = role === 'reviewer' ? `${code}-reviewer` : `${code}-user`;
        const targetId = role === 'reviewer' ? `${code}-user` : `${code}-reviewer`;

        console.log(`Initializing Peer with ID: ${myId}`);
        setStatus("Connecting to Server...");

        const p = new Peer(myId, {
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            },
            debug: 2
        });



        const connectToRemote = () => {
            if (role !== 'user' || !p || p.destroyed) return;

            console.log(`Attempting to connect to ${targetId}...`);
            setStatus(`Looking for ${targetId}...`);

            // 1. Data Connection
            const dataConn = p.connect(targetId);
            setupDataEventsRef.current(dataConn);

            // 2. Media Call
            const initiateCall = async () => {
                try {
                    let stream = localStreamRef.current;
                    if (!stream) {
                        stream = await navigator.mediaDevices.getUserMedia({
                            audio: true,
                            video: getVideoConstraints(facingModeRef.current)
                        });
                        localStreamRef.current = stream;
                        audioTrackRef.current = stream.getAudioTracks()[0];
                    }

                    const outgoingCall = p.call(targetId, stream);
                    setupCallEventsRef.current(outgoingCall);
                } catch (e) {
                    console.error("Media Error:", e);
                    setStatus("Media Error: " + e.message + " (Check Camera)");
                }
            };
            initiateCall();
        };

        p.on('open', (id) => {
            console.log("Peer opened with ID:", id);
            setStatus(role === 'reviewer' ? "Waiting for someone to join..." : "Ready to call...");
            setPeer(p);

            if (role === 'user') {
                connectToRemote();
            }
        });

        p.on('connection', (dataConn) => {
            console.log("Incoming data connection-from:", dataConn.peer);
            setupDataEventsRef.current(dataConn);
        });

        p.on('call', (incomingCall) => {
            console.log("Incoming call...", incomingCall);
            navigator.mediaDevices.getUserMedia({
                audio: true,
                video: getVideoConstraints(facingModeRef.current)
            })
                .then(stream => {
                    localStreamRef.current = stream;
                    incomingCall.answer(stream);
                    setupCallEventsRef.current(incomingCall);
                    setStatus(`Call connected with ${incomingCall.peer}`);
                })
                .catch(err => {
                    console.error("Failed to answer:", err);
                    setStatus(`Error answering: ${err.message}`);
                });
        });

        p.on('disconnected', () => {
            setStatus("Disconnected. Retrying...");
            p.reconnect();
        });

        p.on('error', (err) => {
            console.error("Peer Error:", err);
            setStatus(`Error: ${err.type}`);

            // Retry logic
            if (err.type === 'peer-unavailable' && role === 'user') {
                setStatus(`Reviewer not ready. Retrying in 2s...`);
                if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = setTimeout(() => {
                    console.log("Retrying connection...");
                    connectToRemote();
                }, 2000);
            }
            if (err.type === 'unavailable-id') {
                setStatus("ID Conflict. Retrying in 2s...");
                console.warn("Peer ID taken, retrying...");
                if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = setTimeout(() => {
                    setRetryCount(c => c + 1);
                }, 2000);
            }
        });

        return () => {
            console.log("Destroying peer instance...");
            if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
            p.destroy();
            peerRef.current = null;
        };
    }, [role, code, retryCount]); // Re-run on retryCount change

    // Replace video track with canvas stream - REMOVED
    /*
    useEffect(() => {
        if (role === 'user' && call && call.peerConnection && canvasStream) {
            replaceWithCanvasStream();
        }
    }, [canvasStream, role, call, replaceWithCanvasStream]);
    */

    const sendData = (payload) => {
        if (conn && conn.open) {
            conn.send(payload);
        }
    };

    const toggleCamera = async () => {
        const nextMode = facingMode === 'user' ? 'environment' : 'user';
        setFacingMode(nextMode);
        try {
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
            }
            const newStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: getVideoConstraints(nextMode, arActive)
            });
            localStreamRef.current = newStream;
            if (call && call.peerConnection) {
                const videoTrack = newStream.getVideoTracks()[0];
                const senders = call.peerConnection.getSenders();
                const videoSender = senders.find(s => s.track?.kind === 'video');
                if (videoSender) {
                    videoSender.replaceTrack(videoTrack);
                }
            }
            setStatus(`Switched to ${nextMode} camera`);
        } catch (e) {
            console.error("Error switching camera:", e);
            setStatus("Camera switch error: " + e.message);
        }
    };

    const endCall = () => {
        if (call) call.close();
        if (peer) peer.destroy();

        // Stop all local tracks (Camera/Mic)
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }

        setCall(null);
        setPeer(null);
        setRemoteStream(null);
        setConn(null);
        setIsDataConnected(false);
        setStatus("Call Ended Manually");
    };

    return { peer, call, remoteStream, status, endCall, sendData, data, isDataConnected, toggleCamera, facingMode };
};
