import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import ARScene from '../components/ARScene';
import PlanParser from '../components/PlanParser';
import { usePeer } from '../hooks/usePeer';

const UserARView = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const code = searchParams.get('code');
    const arSceneRef = useRef(null);
    const [stats, setStats] = useState({ total: "0.00 m", count: 0 });
    const [arStatus, setArStatus] = useState("Initializing AR...");
    const [showPlan, setShowPlan] = useState(false);
    const [canvasStream, setCanvasStream] = useState(null);
    const [logs, setLogs] = useState([]);

    const addLog = useCallback((msg) => {
        setLogs(prev => {
            const newLogs = [...prev, msg];
            if (newLogs.length > 8) newLogs.shift();
            return newLogs;
        });
    }, []);

    // Pass canvasStream (Restarted Camera) if active
    const { status: peerStatus, localStream, endCall, sendData, data: remoteData, isDataConnected, toggleCamera, facingMode } = usePeer('user', code, canvasStream, viewMode === 'AR');

    const [viewMode, setViewMode] = useState('AR'); // 'AR' or 'VIDEO'

    // Toggle Mode Handler - Pattern A: Simpler since WebXR/WebRTC don't conflict
    const toggleViewMode = useCallback(async () => {
        const newMode = viewMode === 'AR' ? 'VIDEO' : 'AR';
        setViewMode(newMode);
        addLog(`SWITCHING TO: ${newMode} MODE`);

        if (newMode === 'AR') {
            // Switch to AR mode
            // WebXR will own the camera, WebRTC will use audio only
            addLog("AR Mode Active - Camera released to WebXR.");
        } else {
            // Switch to VIDEO mode - but note: video is still from canvas or can be enabled
            // For now, AR data continues via DataChannel
            addLog("Video Mode - AR data still available via DataChannel.");
        }
    }, [viewMode, addLog]);



    // 2. Data Sync Logic (Interval) - Pattern A: Send AR data via DataChannel
    const startDataSync = useCallback(() => {
        const intervalId = setInterval(() => {
            if (!arSceneRef.current) return;

            // Pattern A: Send AR data (pose + measurements) via DataChannel
            const arData = arSceneRef.current.getARData();
            const screenData = arSceneRef.current.getScreenPoints();
            
            if (arData && sendData && isDataConnected) {
                sendData({
                    type: 'AR_DATA',
                    pose: arData.poseMatrix,
                    measurements: arData.measurements,
                    screenPoints: screenData,
                    timestamp: arData.timestamp
                });
            }
        }, 100); // Send AR data at 10Hz for low latency

        return () => clearInterval(intervalId);
    }, [sendData, isDataConnected, stats]);

    // Combined Handler for Session Start - Pattern A: WebXR owns camera
    const handleSessionStart = useCallback(() => {
        addLog("AR STARTED. WebXR owns camera.");

        // Pattern A: WebXR now owns the camera exclusively
        // No need to stop WebRTC camera - it already only has audio
        // Start sending AR data via DataChannel
        return startDataSync();
    }, [startDataSync, addLog]);

    const handleEndCall = () => {
        endCall();
        navigate('/');
    };

    return (
        <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: 'transparent' }}>
            {/* DEBUG CONSOLE OVERLAY - HIGH VISIBILITY - MOVED DOWN */}
            <div style={{
                position: 'absolute',
                top: '25%', // Move down to avoid top pills
                left: 10,
                zIndex: 99999, // Max Z
                pointerEvents: 'none',
                maxWidth: '85%',
                display: 'flex',
                flexDirection: 'column',
                gap: 6
            }}>
                {/* Always show current status at top */}
                <div style={{
                    background: peerStatus.includes('Error') ? 'rgba(255,0,0,0.9)' : 'rgba(0,0,0,0.8)',
                    color: '#fff', fontSize: 16, fontWeight: 'bold', padding: '8px', borderRadius: 8,
                    border: '2px solid white'
                }}>
                    STATUS: {peerStatus}
                </div>

                {logs.map((log, i) => (
                    <div key={i} style={{
                        background: 'rgba(255, 0, 0, 0.85)', // High contrast RED
                        color: 'white',
                        fontSize: 16, // Larger text for mobile
                        fontWeight: 'bold',
                        padding: '8px 12px',
                        borderRadius: 8,
                        fontFamily: 'monospace',
                        boxShadow: '0 4px 8px rgba(0,0,0,0.6)',
                        borderLeft: '4px solid white'
                    }}>
                        {log}
                    </div>
                ))}
            </div>

            {/* AR Scene in background */}
            <ARScene
                ref={arSceneRef}
                onStatusUpdate={(msg) => {
                    setArStatus(msg);
                    // allow status updates to log mostly, but maybe throttle?
                }}
                onStatsUpdate={setStats}
                onSessionStart={handleSessionStart}
                onSessionEnd={() => navigate('/')}
                onLog={addLog}
            />

            {/* Local Video/AR Canvas Preview (Visible ONLY in VIDEO Mode) */}
            <video
                ref={ref => {
                    // Pattern A: Show canvas stream for AR visualization or local stream
                    const activeStream = canvasStream || localStream;
                    if (ref && activeStream) {
                        ref.srcObject = activeStream;
                    }
                }}
                autoPlay
                muted
                playsInline
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    zIndex: -2,
                    display: viewMode === 'VIDEO' ? 'block' : 'none',
                    pointerEvents: 'none'
                }}
            />

            {/* Connection Status Overlay */}
            <div style={{
                position: 'absolute',
                top: 80,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.6)',
                padding: '4px 12px',
                borderRadius: 16,
                zIndex: 20,
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6
            }}>
                <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: peerStatus.includes('Connected') ? '#4caf50' : peerStatus.includes('Error') ? '#f44336' : '#ff9800'
                }} />
                <span style={{ color: '#fff', fontSize: 12, fontWeight: 500 }}>{peerStatus}</span>
            </div>

            {/* MODE TOGGLE SWITCH - THE SOLUTION */}
            <div style={{
                position: 'absolute',
                top: 130, // Below connection pill
                right: 20,
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                gap: 5
            }}>
                <button
                    onClick={toggleViewMode}
                    style={{
                        background: viewMode === 'AR' ? '#4caf50' : '#2196f3',
                        color: 'white',
                        border: '2px solid white',
                        borderRadius: 12,
                        padding: '12px 20px',
                        fontSize: 16,
                        fontWeight: 'bold',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                        transition: 'all 0.2s'
                    }}
                >
                    {viewMode === 'AR' ? '📐 MEASURING' : '📹 STREAMING'}
                </button>
                <div style={{ fontSize: 10, color: 'white', opacity: 0.8, background: 'rgba(0,0,0,0.5)', padding: 4, borderRadius: 4, textAlign: 'center' }}>
                    {viewMode === 'AR' ? 'Camera: AR Only' : 'Camera: Video Call'}
                </div>
            </div>

            {/* Overlay UI - Top Center Pill */}
            <div className="shiny-pill" style={{
                position: 'absolute',
                top: 25,
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '12px 30px',
                textAlign: 'center',
                minWidth: 160,
                pointerEvents: 'none',
                zIndex: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 2
            }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.45)', letterSpacing: '2px', marginBottom: 2, textTransform: 'uppercase' }}>Session Distance</div>
                <div style={{
                    fontSize: 28, fontWeight: 700, color: '#4da6ff', display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4,
                    textShadow: '0 0 20px rgba(0,123,255,0.3)'
                }}>
                    {stats.total.split(' ')[0]} <span style={{ fontSize: 15, color: '#fff', opacity: 0.6, fontWeight: 500 }}>{stats.total.split(' ')[1]}</span>
                </div>
                {stats.area && (
                    <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ fontSize: 9, fontWeight: 800, color: '#00BFFF', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 2 }}>Area</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{stats.area}</div>
                    </div>
                )}
            </div >

            {/* Top Right Controls - Power Off / End Call Icon */}
            < div style={{ position: 'absolute', top: 20, right: 20, zIndex: 10, display: 'flex', gap: 10 }}>
                {/* Manual Screen Share Trigger (if auto fails) */}
                <button
                    onClick={handleEndCall}
                    className="glass-btn"
                    style={{
                        width: 38,
                        height: 38,
                        borderRadius: '50%',
                        background: 'rgba(220,53,69,0.5)',
                        border: '1px solid rgba(220,53,69,0.3)',
                        padding: 0
                    }}
                    title="End Call"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                        <line x1="12" y1="2" x2="12" y2="12"></line>
                    </svg>
                </button>
            </div >

            {/* Middle Right Stack - Compacted */}
            <div style={{ position: 'absolute', right: 20, top: '55%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 12, zIndex: 10 }}>
                <button
                    onClick={() => arSceneRef.current?.cycleUnit()}
                    className="glass-btn"
                    style={{
                        width: 52,
                        height: 52,
                        borderRadius: '50%',
                        fontSize: 11,
                        fontWeight: 800,
                        background: 'rgba(255,255,255,0.12)',
                        borderColor: 'rgba(255,255,255,0.2)'
                    }}
                >
                    UNIT
                </button>
                <button
                    onClick={() => setShowPlan(!showPlan)}
                    className="glass-btn"
                    style={{
                        width: 52,
                        height: 52,
                        borderRadius: '50%',
                        background: showPlan ? 'rgba(0,191,255,0.8)' : 'rgba(0,191,255,0.4)',
                        borderColor: 'rgba(0,191,255,0.3)',
                        borderWidth: '2px'
                    }}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <line x1="10" y1="9" x2="8" y2="9"></line>
                    </svg>
                </button>

                <button
                    onClick={toggleCamera}
                    className="glass-btn"
                    style={{
                        width: 52,
                        height: 52,
                        borderRadius: '50%',
                        margin: '0 auto',
                        opacity: 1,
                        background: 'rgba(0,191,255,0.4)',
                        border: '2px solid rgba(0,191,255,0.3)'
                    }}
                    title="Flip Camera"
                >
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                        <path d="M8.5 14.5c.5 1.5 2 2.5 3.5 2.5s3-1 3.5-2.5"></path>
                        <path d="m14 13 1.5 1.5L17 13"></path>
                    </svg>
                </button>
            </div>

            {/* Floating Plan View */}
            {showPlan && (
                <div className="glass-panel" style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '92%',
                    height: '80%',
                    borderRadius: 24,
                    padding: 24,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                    zIndex: 1000,
                    overflow: 'auto',
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(255,255,255,0.95)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h3 style={{ margin: 0, color: '#222', fontSize: 20 }}>Project Plan</h3>
                        <button onClick={() => setShowPlan(false)} style={{ border: 'none', background: 'rgba(0,0,0,0.05)', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>✕</button>
                    </div>
                    <PlanParser role="user" sendData={sendData} remoteData={remoteData} isDataConnected={isDataConnected} />
                </div>
            )}

            {/* Overlay Removed: Canvas capture is automatic */}

            {/* Conditional Bottom Controls - Repositioned above STOP AR */}
            {stats.count > 0 && (
                <div style={{ position: 'absolute', bottom: 105, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 15, zIndex: 10, padding: '0 20px' }}>
                    <button
                        onClick={() => arSceneRef.current?.undo()}
                        className="glass-btn"
                        style={{ padding: '12px 24px', borderRadius: 30, fontSize: 14, minWidth: 95 }}
                    >
                        Undo
                    </button>
                    <button
                        onClick={() => arSceneRef.current?.startNewLine()}
                        className="glass-btn glass-btn-primary"
                        style={{ padding: '12px 28px', borderRadius: 30, fontSize: 15, minWidth: 125, fontWeight: 800, letterSpacing: '0.5px' }}
                    >
                        New Line
                    </button>
                    <button
                        onClick={() => arSceneRef.current?.reset()}
                        className="glass-btn glass-btn-danger"
                        style={{ padding: '12px 24px', borderRadius: 30, fontSize: 14, minWidth: 95 }}
                    >
                        Reset
                    </button>
                </div>
            )}

            {/* Point Counter - Subtle Bottom right */}
            {
                stats.count > 0 && (
                    <div style={{ position: 'absolute', bottom: 20, right: 20, color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 500 }}>
                        {stats.count} points measured
                    </div>
                )
            }
        </div >
    );
};

export default UserARView;