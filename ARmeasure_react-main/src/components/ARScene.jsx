import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { SceneManager } from '../modules/scene';
import { MeasureManager } from '../modules/measure';
import { InteractionManager } from '../modules/interactions';
import { formatDistance } from '../modules/utils';

const ARScene = forwardRef((props, ref) => {
    const containerRef = useRef(null);
    const logicRef = useRef({
        sceneManager: null,
        measureManager: null,
        interactionManager: null,
        currentUnit: 'm'
    });

    // Debug variable
    let lastLogTime = 0;

    const [statusText, setStatusText] = useState("Initializing AR...");
    const [stats, setStats] = useState({ total: "0.00 m", count: 0 });

    useImperativeHandle(ref, () => ({
        undo: () => {
            logicRef.current.measureManager?.undoLastPoint();
            updateUI();
        },
        reset: () => {
            logicRef.current.measureManager?.resetAll();
            updateUI();
        },
        startNewLine: () => {
            logicRef.current.measureManager?.startNewLine();
            updateUI();
        },
        setUnit: (u) => {
            logicRef.current.currentUnit = u;
            logicRef.current.measureManager?.setUnit(u);
            updateUI();
        },
        cycleUnit: () => {
            const units = ['m', 'cm', 'in', 'ft'];
            const current = logicRef.current.currentUnit;
            const next = units[(units.indexOf(current) + 1) % units.length];
            logicRef.current.currentUnit = next;
            logicRef.current.measureManager?.setUnit(next);
            updateUI();
        },
        // Pattern A: Get AR Data for DataChannel transmission
        getARData: () => {
            const mgr = logicRef.current;
            if (!mgr.sceneManager || !mgr.measureManager) return null;

            const points3D = mgr.measureManager.getPoints();
            const camera = mgr.sceneManager.camera;
            const session = mgr.sceneManager.getSession();

            // Extract pose matrix from XR session
            let poseMatrix = null;
            if (session && session.requestAnimationFrame) {
                // Pose data would be extracted from the XR frame
                // This is a placeholder for the actual pose extraction
                poseMatrix = {
                    timestamp: Date.now(),
                    position: camera.position.toArray(),
                    quaternion: camera.quaternion.toArray()
                };
            }

            return {
                poseMatrix,
                measurements: {
                    points: points3D.map(p => p.toArray()),
                    totalDistance: mgr.measureManager.getTotalDistance(),
                    area: mgr.measureManager.getArea(),
                    isClosed: mgr.measureManager.isClosed,
                    unit: mgr.currentUnit,
                    pointCount: points3D.length
                },
                timestamp: Date.now()
            };
        },
        // Pattern A: Get Screen Coordinates for Remote Overlay
        getScreenPoints: () => {
            const mgr = logicRef.current;
            if (!mgr.sceneManager || !mgr.measureManager) return null;

            // Get points from measure manager
            const points3D = mgr.measureManager.getPoints();
            const camera = mgr.sceneManager.camera;

            // Project each point
            const screenPoints = points3D.map(p => {
                const vector = p.clone();
                vector.project(camera); // Projects to NDC [-1, 1]
                return {
                    x: (vector.x + 1) / 2, // Convert to [0, 1]
                    y: -(vector.y - 1) / 2 // Convert to [0, 1] (flip Y)
                };
            });

            // Project reticle
            let reticle = null;
            if (mgr.interactionManager) {
                const rPos = mgr.interactionManager.getReticlePosition();
                if (rPos) {
                    const vector = rPos.clone();
                    vector.project(camera);
                    reticle = {
                        x: (vector.x + 1) / 2,
                        y: -(vector.y - 1) / 2
                    };
                }
            }

            // Calculate segments with distances
            const segments = [];
            if (points3D.length > 1) {
                for (let i = 0; i < points3D.length - 1; i++) {
                    const p1 = points3D[i];
                    const p2 = points3D[i + 1];
                    const dist = p1.distanceTo(p2);
                    segments.push({
                        text: formatDistance(dist, mgr.currentUnit),
                        startIndex: i,
                        endIndex: i + 1
                    });
                }
                // Closing segment
                if (mgr.measureManager.isClosed) {
                    const p1 = points3D[points3D.length - 1];
                    const p2 = points3D[0];
                    const dist = p1.distanceTo(p2);
                    segments.push({
                        text: formatDistance(dist, mgr.currentUnit),
                        startIndex: points3D.length - 1,
                        endIndex: 0
                    });
                }
            }

            return {
                points: screenPoints,
                segments: segments, // New: contains text labels for lines
                reticle: reticle,
                isClosed: mgr.measureManager.isClosed
            };
        },
        // Legacy: Get the canvas MediaStream (Kept for compatibility if needed, but unused in Pro fix)
        getCanvasStream: (fps = 30) => {
            return logicRef.current.sceneManager?.getCaptureStream(fps);
        }
    }));

    useEffect(() => {
        initAR();
        return () => {
            // Cleanup
            if (logicRef.current.sceneManager) {
                logicRef.current.sceneManager.dispose();
            }
        };
    }, []);

    const propsRef = useRef(props);
    useEffect(() => {
        propsRef.current = props;
    }, [props]);

    const initAR = () => {
        const mgr = logicRef.current;

        // 1. Scene
        mgr.sceneManager = new SceneManager(
            (t, frame) => render(t, frame),
            () => {
                setStatusText("AR Session Active");
                if (propsRef.current.onSessionStart) propsRef.current.onSessionStart();
            },
            () => {
                setStatusText("AR Session Ended");
                console.log("Triggering onSessionEnd callback...");
                if (propsRef.current.onSessionEnd) propsRef.current.onSessionEnd();
            }
        );
        mgr.sceneManager.init(props.overlayRoot);

        // Ensure background transparency for AR feed
        if (mgr.sceneManager.renderer) {
            mgr.sceneManager.renderer.setClearColor(0x000000, 0);
        }

        // 2. Managers
        mgr.measureManager = new MeasureManager(mgr.sceneManager.scene);
        mgr.interactionManager = new InteractionManager(
            mgr.sceneManager.scene,
            mgr.sceneManager.renderer,
            mgr.sceneManager.camera
        );

        // 3. Listeners
        mgr.sceneManager.controller.addEventListener('select', handleTap);
        document.body.addEventListener('click', (e) => {
            if (!e.target.closest('button') && !e.target.closest('input')) handleTap();
        });
    };

    const handleTap = () => {
        const mgr = logicRef.current;
        if (!mgr.interactionManager || !mgr.measureManager) return;

        const pos = mgr.interactionManager.getReticlePosition();
        if (pos && mgr.measureManager.getPointCount() < 20) {
            mgr.measureManager.addPoint(pos);
            updateUI();
        }
    };

    const render = (t, frame) => {
        const mgr = logicRef.current;
        if (!mgr.interactionManager || !mgr.measureManager) return;

        // Debug: Check if render loop is actually running
        if (Math.floor(t / 1000) % 2 === 0 && Math.floor(t) !== lastLogTime) {
            console.log("AR Render Loop Active - Frame timestamp:", t);
            if (props.onLog) props.onLog(`Render Loop: ${Math.floor(t)}`);
            lastLogTime = Math.floor(t);
        }

        const session = mgr.sceneManager.getSession();
        mgr.interactionManager.update(frame, session);

        // Update dot animations (pulse)
        mgr.measureManager.updateAnimations(t);

        // Real-time Visuals & UI (Rubber Band)
        const pos = mgr.interactionManager.getReticlePosition();
        mgr.measureManager.updatePreview(pos);

        // Debug: Check tracking
        if (Math.floor(t / 1000) % 2 === 0 && Math.floor(t) !== lastLogTime) {
            const tracking = pos ? "TRACKING" : "NO TRACKING";
            const frameCount = Math.floor(t);
            console.log(`AR: ${tracking} - ${frameCount}`);
            if (props.onLog) props.onLog(`[${frameCount}] ${tracking}`);
            lastLogTime = frameCount;
        }
        if (pos || mgr.measureManager.getPointCount() > 0) {
            updateUI(pos);
        }
    };

    const updateUI = (livePos) => {
        const mgr = logicRef.current;
        const dist = mgr.measureManager.getTotalDistance(livePos);
        const text = formatDistance(dist, mgr.currentUnit);
        const count = mgr.measureManager.getPointCount();

        // Area calculation
        const areaVal = mgr.measureManager.getArea();
        const areaText = areaVal > 0 ? `${areaVal.toFixed(2)} m²` : null;

        setStats({ total: text, count, area: areaText });
    };

    useEffect(() => {
        if (props.onStatusUpdate) props.onStatusUpdate(statusText);
    }, [statusText, props.onStatusUpdate]);

    useEffect(() => {
        if (props.onStatsUpdate) props.onStatsUpdate(stats);
    }, [stats, props.onStatsUpdate]);

    return (
        <div ref={containerRef} style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: -1 }}>
        </div>
    );
});

export default ARScene;
