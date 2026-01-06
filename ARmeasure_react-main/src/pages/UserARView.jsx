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
    // const [canvasStream, setCanvasStream] = useState(null); // Removed for Pro Fix

    // Pass null instead of canvas stream - we stream camera only
    const { status: peerStatus, endCall, sendData, data: remoteData, isDataConnected, toggleCamera, facingMode } = usePeer('user', code, null);

    // Data sync for Remote Overlay (Pro Fix)
    const handleSessionStart = useCallback(() => {
        // Start a loop to send AR data to reviewer
        // We do not replace the video stream anymore, to avoid freezing.
        const intervalId = setInterval(() => {
            if (!arSceneRef.current) return;

            const screenData = arSceneRef.current.getScreenPoints();
            if (screenData && sendData && isDataConnected) {
                sendData({
                    type: 'AR_OVERLAY_DATA',
                    points: screenData.points,
                    reticle: screenData.reticle,
                    isClosed: screenData.isClosed,
                    stats: stats // Send current stats too
                });
            }
        }, 50); // 20 FPS updates

        // Cleanup on unmount or session end (handled via effect teardown usually, but here we attach to session)
        return () => clearInterval(intervalId);
    }, [sendData, isDataConnected, stats]);

    const handleEndCall = () => {
        endCall();
        navigate('/');
    };

    return (
        <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: 'transparent' }}>
            {/* AR Scene in background */}
            <ARScene
                ref={arSceneRef}
                onStatusUpdate={setArStatus}
                onStatsUpdate={setStats}
                onSessionStart={handleSessionStart}
                onSessionEnd={() => navigate('/')}
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
            < div style={{ position: 'absolute', top: 20, right: 20, zIndex: 10 }}>
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