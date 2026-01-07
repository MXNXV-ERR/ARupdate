import React, { useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import PlanParser from '../components/PlanParser';
import { usePeer } from '../hooks/usePeer';

const ReviewerDashboard = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const code = searchParams.get('code');
    const { status, remoteStream, endCall, sendData, data: remoteData, isDataConnected } = usePeer('reviewer', code);
    const [arData, setArData] = React.useState(null);
    const [arMeasurements, setArMeasurements] = React.useState(null);
    const videoRef = useRef(null);

    useEffect(() => {
        if (remoteData) {
            // Pattern A: Handle AR_DATA message type (pose + measurements)
            if (remoteData.type === 'AR_DATA') {
                setArMeasurements(remoteData.measurements);
                setArData(remoteData.screenPoints);
                console.log("Received AR Data:", remoteData);
            }
            // Legacy: Handle AR_OVERLAY_DATA for backward compatibility
            else if (remoteData.type === 'AR_OVERLAY_DATA') {
                setArData(remoteData);
            }
        }
    }, [remoteData]);

    useEffect(() => {
        const video = videoRef.current;
        if (video && remoteStream) {
            video.srcObject = remoteStream;
            video.play().catch(err => {
                console.error("Error playing video:", err);
            });
        } else if (video && !remoteStream) {
            video.srcObject = null;
        }

        return () => {
            if (video) {
                video.srcObject = null;
            }
        };
    }, [remoteStream]);

    const handleEndCall = () => {
        endCall();
        navigate('/');
    };

    return (
        <div style={{ padding: '10px 1%', maxWidth: '100%', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h1>Reviewer Dashboard</h1>
                <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
                    <div style={{ padding: '10px 20px', background: '#333', borderRadius: 8, color: 'white' }}>
                        Code: <strong>{code}</strong> ({status})
                    </div>
                    <button
                        onClick={handleEndCall}
                        className="glass-btn glass-btn-danger"
                        title="End Call"
                        style={{
                            width: 44,
                            height: 44,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0
                        }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                            <line x1="12" y1="2" x2="12" y2="12"></line>
                        </svg>
                    </button>
                </div>
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                width: '100%',
                boxSizing: 'border-box'
            }}>
                {/* Video Column - Equal width with Plan Parser */}
                <div style={{
                    background: '#222',
                    borderRadius: 12,
                    padding: 24,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                    minHeight: '85vh',
                    width: '100%',
                    boxSizing: 'border-box',
                    overflow: 'hidden'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                        <h3 style={{ margin: 0, color: '#fff' }}>User View</h3>
                        {remoteStream && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '6px 12px',
                                background: 'rgba(40, 167, 69, 0.2)',
                                borderRadius: 20,
                                border: '1px solid rgba(40, 167, 69, 0.5)'
                            }}>
                                <div style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: '#28a745'
                                }}></div>
                                <span style={{ fontSize: 12, color: '#28a745', fontWeight: 'bold' }}>LIVE</span>
                            </div>
                        )}
                    </div>
                    <div style={{
                        width: '100%',
                        height: '80vh',
                        background: '#000',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 12,
                        overflow: 'hidden',
                        boxShadow: '0 0 20px rgba(0,123,255,0.1)',
                        margin: '0 auto',
                        position: 'relative'
                    }}>
                        {remoteStream ? (
                            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'contain',
                                        display: 'block'
                                    }}
                                />
                                {/* AR Overlay Layer */}
                                <svg
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: '100%',
                                        pointerEvents: 'none',
                                        objectFit: 'contain' // Matches video behavior? actually SVG usually fills.
                                        // Note: If video is object-fit: contain, there might be letterboxing.
                                        // Ideally we want to match the video rect exactly, but 100% is a good start.
                                    }}
                                    viewBox="0 0 100 100"
                                    preserveAspectRatio="xMidYMid meet"
                                >
                                    {arData?.points && arData.points.length > 1 && (
                                        <>
                                            {/* Draw Line Path */}
                                            <polyline
                                                points={arData.points.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}
                                                fill={arData.isClosed ? "rgba(0, 123, 255, 0.2)" : "none"}
                                                stroke="#ff0044"
                                                strokeWidth="0.8"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                            {/* Closed loop segment */}
                                            {arData.isClosed && (
                                                <line
                                                    x1={arData.points[arData.points.length - 1].x * 100}
                                                    y1={arData.points[arData.points.length - 1].y * 100}
                                                    x2={arData.points[0].x * 100}
                                                    y2={arData.points[0].y * 100}
                                                    stroke="#ff0044"
                                                    strokeWidth="0.8"
                                                />
                                            )}

                                            {/* Render Measurement Text Labels (New) */}
                                            {arData.segments && arData.segments.map((seg, i) => {
                                                if (!arData.points[seg.startIndex] || !arData.points[seg.endIndex]) return null;

                                                const start = arData.points[seg.startIndex];
                                                const end = arData.points[seg.endIndex];

                                                // Calculate midpoint
                                                const midX = (start.x + end.x) / 2 * 100;
                                                const midY = (start.y + end.y) / 2 * 100;

                                                return (
                                                    <g key={`seg-${i}`}>
                                                        {/* Optional: Background pill for readability */}
                                                        <rect
                                                            x={midX - 12} y={midY - 4}
                                                            width="24" height="8"
                                                            rx="2" fill="rgba(0,0,0,0.7)"
                                                        />
                                                        <text
                                                            x={midX}
                                                            y={midY}
                                                            fill="white"
                                                            fontSize="3.5"
                                                            textAnchor="middle"
                                                            dominantBaseline="middle"
                                                            fontWeight="bold"
                                                        >
                                                            {seg.text}
                                                        </text>
                                                    </g>
                                                );
                                            })}
                                        </>
                                    )}

                                    {/* Draw Points */}
                                    {arData?.points && arData.points.map((p, i) => (
                                        <circle
                                            key={i}
                                            cx={p.x * 100}
                                            cy={p.y * 100}
                                            r="1.2"
                                            fill="#007bff"
                                            stroke="white"
                                            strokeWidth="0.2"
                                        />
                                    ))}

                                    {/* Draw Reticle */}
                                    {arData?.reticle && (
                                        <circle
                                            cx={arData.reticle.x * 100}
                                            cy={arData.reticle.y * 100}
                                            r="1"
                                            fill="none"
                                            stroke="white"
                                            strokeWidth="0.5"
                                            strokeDasharray="1,1"
                                            opacity="0.8"
                                        />
                                    )}
                                </svg>

                                {/* Remote Stats Pill */}
                                {(arData?.stats || arMeasurements) && (
                                    <div className="shiny-pill" style={{
                                        position: 'absolute',
                                        top: 25,
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        padding: '8px 20px',
                                        textAlign: 'center',
                                        minWidth: 120,
                                        pointerEvents: 'none',
                                        zIndex: 10,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 2,
                                        background: 'rgba(0,0,0,0.6)',
                                        borderRadius: 20,
                                        border: '1px solid rgba(255,255,255,0.2)'
                                    }}>
                                        <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.6)', letterSpacing: '1px', textTransform: 'uppercase' }}>USER MEASURING</div>
                                        <div style={{
                                            fontSize: 20, fontWeight: 700, color: '#4da6ff', display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4
                                        }}>
                                            {/* Pattern A: Show AR measurements from DataChannel */}
                                            {arMeasurements ? (
                                                <>
                                                    <span>{(arMeasurements.totalDistance || 0).toFixed(2)}</span>
                                                    <span style={{ fontSize: 12 }}>{arMeasurements.unit || 'm'}</span>
                                                </>
                                            ) : (
                                                arData?.stats?.total || "0.00 m"
                                            )}
                                        </div>
                                        {/* Show point count from AR measurements */}
                                        {arMeasurements && (
                                            <div style={{ fontSize: 10, color: '#fff', opacity: 0.7 }}>
                                                {arMeasurements.pointCount} points
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#888',
                                textAlign: 'center',
                                padding: 40
                            }}>
                                <div style={{
                                    width: 80,
                                    height: 80,
                                    border: '3px solid #444',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginBottom: 20
                                }}>
                                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#666' }}>
                                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                                        <circle cx="12" cy="13" r="4"></circle>
                                    </svg>
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#aaa' }}>
                                    Waiting for User Stream
                                </div>
                                <div style={{ fontSize: 14, color: '#666' }}>
                                    {status.includes('Waiting') || status.includes('not online') ? (
                                        'User is connecting...'
                                    ) : status.includes('Connected') ? (
                                        'Stream starting...'
                                    ) : (
                                        status
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Plan Column - Equal width with User View */}
                <div style={{
                    background: '#222',
                    borderRadius: 12,
                    padding: 24,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                    minHeight: '85vh',
                    width: '100%',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <h3 style={{ marginBottom: 15, color: '#fff' }}>Floor Plan Verification</h3>
                    <div style={{ flex: 1, width: '100%', overflow: 'auto', minWidth: 0 }}>
                        <PlanParser role="reviewer" sendData={sendData} remoteData={remoteData} isDataConnected={isDataConnected} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReviewerDashboard;
