'use client';

import React, { useEffect, useRef, useState } from 'react';
import { HARCore } from '@/lib/pose/HARCore';
// Import from the official tasks-vision package
import { PoseLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';
import { ArrowLeft, Activity, ShieldAlert, Ban, CheckCircle, Edit3, Trash2, MousePointerClick, BellRing } from 'lucide-react';
import Link from 'next/link';

import { AuthProvider, useAuth } from '@/lib/auth';

export default function MonitorPageWrap() {
    return (
        <AuthProvider>
            <MonitorPage />
        </AuthProvider>
    );
}

function MonitorPage() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    
    // State
    const [stats, setStats] = useState({ status: 'Initializing...', confidence: 0 });

    // Safety Zone State (Normalized 0-1)
    const [safetyZone, setSafetyZone] = useState<{x: number, y: number, w: number, h: number} | null>(null);
    const [isEditingZone, setIsEditingZone] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);
    const [startPoint, setStartPoint] = useState<{x: number, y: number} | null>(null);
    const zoneRef = useRef<{x: number, y: number, w: number, h: number} | null>(null);

    // Alarm State
    const [alarmTriggered, setAlarmTriggered] = useState(false);
    const fallStartTimeRef = useRef<number | null>(null);
    const [timeToAlarm, setTimeToAlarm] = useState<number | null>(null);

    // Sync ref for loop access
    useEffect(() => {
        zoneRef.current = safetyZone;
    }, [safetyZone]);

    // Refs
    const harRef = useRef<HARCore | null>(null);
    const landmarkerRef = useRef<PoseLandmarker | null>(null);
    const requestRef = useRef<number | null>(null);

    useEffect(() => {
        let isMounted = true;

        async function init() {
            try {
                // 1. Init Core
                const core = new HARCore();
                harRef.current = core;

                // 2. Init Vision
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
                );
                if (!isMounted) return;

                const landmarker = await PoseLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`,
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    numPoses: 1
                });
                landmarkerRef.current = landmarker;

                // 3. Init Camera
                if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: { width: 640, height: 480 }
                    });
                    
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                        await videoRef.current.play();
                        
                        setIsLoading(false);
                        requestRef.current = requestAnimationFrame(predictWebcam);
                    }
                }

            } catch (e) {
                console.error("Init Error:", e);
                setIsLoading(false);
            }
        }
        
        init();

        return () => {
            isMounted = false;
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            if (videoRef.current && videoRef.current.srcObject) {
                (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
            }
        };
    }, []);

    // Logging
    // Logging
    const { user } = useAuth();
    const userRef = useRef(user);
    
    // Keep userRef synced
    useEffect(() => {
        userRef.current = user;
    }, [user]);

    const lastLogRef = useRef(Date.now());
    const alarmLoggedRef = useRef(false);

    const sendLog = async (data: any) => {
        if (!userRef.current) return;
        try {
            await fetch('/api/logs', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user-id': userRef.current.id 
                },
                body: JSON.stringify(data)
            });
        } catch (e) { console.error("Log failed", e); }
    };

    // Loop
    const lastVideoTimeRef = useRef(-1);
    
    const predictWebcam = async () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const landmarker = landmarkerRef.current;
        const har = harRef.current;

        if (video && canvas && landmarker && har) {
            let startTimeMs = performance.now();
            
            if (lastVideoTimeRef.current !== video.currentTime && video.videoWidth > 0 && video.videoHeight > 0) {
                lastVideoTimeRef.current = video.currentTime;
                
                const result = landmarker.detectForVideo(video, startTimeMs);
                
                // Draw
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.save();
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    
                    // Mirror
                    ctx.scale(-1, 1);
                    ctx.translate(-canvas.width, 0);

                    // Draw Video Frame
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                    if (result.landmarks) {
                        const drawingUtils = new DrawingUtils(ctx);
                        for (const lm of result.landmarks) {
                            drawingUtils.drawLandmarks(lm, { radius: 1, color: '#00FF00' });
                            drawingUtils.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
                        }
                    }
                    ctx.restore();
                }

                // Process Logic
                if (result.landmarks && result.landmarks.length > 0) {
                     const lm = result.landmarks[0];
                     
                     // 1. Run HAR first (Always detect status)
                     const res = await har.process(lm as any);
                     
                     if (res) {
                        // 2. Check Safety Zone
                        let isUnsafe = false;
                        if (zoneRef.current) {
                             const z = zoneRef.current;
                             const inZone = (p: {x:number, y:number}) => 
                                p.x >= z.x && p.x <= (z.x + z.w) &&
                                p.y >= z.y && p.y <= (z.y + z.h);

                             let outsideCount = 0;
                             for (const point of lm) {
                                  // Convert to Screen Coords (Mirrored)
                                  const screenPoint = { x: 1 - point.x, y: point.y };
                                  if (!inZone(screenPoint)) {
                                      outsideCount++;
                                  }
                             }

                             // Threshold: > 70% of points outside triggers Unsafe
                             if ((outsideCount / lm.length) > 0.7) {
                                 isUnsafe = true;
                             }
                        }

                        // Update Status
                        setStats({
                            status: res.status,
                            confidence: res.confidence || 0
                        });
                        
                        // 3. Check Alarm Condition
                        let currentAlarmState = false;
                        if (res.status === 'Fall Detected' && isUnsafe) {
                            const now = Date.now();
                            if (!fallStartTimeRef.current) {
                                fallStartTimeRef.current = now;
                            }
                            
                            const elapsed = now - fallStartTimeRef.current;
                            if (elapsed > 10000) {
                                // Trigger Alarm
                                setAlarmTriggered(true);
                                currentAlarmState = true;
                            } else {
                                // Update countdown for UI
                                setTimeToAlarm(Math.ceil((10000 - elapsed) / 1000));
                            }
                        } else {
                            // Reset
                            fallStartTimeRef.current = null;
                            setTimeToAlarm(null);
                        }

                        // 4. Logging Logic
                        const now = Date.now();
                        
                        // A. Check for Alarm Log (Immediate)
                        // If alarm just triggered (transition) or is buzzing
                        if (currentAlarmState && !alarmLoggedRef.current) {
                            sendLog({
                                status: 'ALARM: Fall Outside Zone',
                                confidence: '1.0',
                                details: { reason: 'Fall detected outside safe zone > 10s' }
                            });
                            alarmLoggedRef.current = true; // Prevent spamming per frame
                        }
                        
                        // B. Periodic Log (Every 1 min)
                        if (now - lastLogRef.current > 60000) {
                            sendLog({
                                status: res.status,
                                confidence: String(res.confidence),
                                details: { isUnsafe, zoneConfigured: !!zoneRef.current }
                            });
                            lastLogRef.current = now;
                        }
                     }
                }
            }
        }
        requestRef.current = requestAnimationFrame(predictWebcam);
    };

    // Drawing Handlers
    const handleMouseDown = (e: React.MouseEvent) => {
        if (!isEditingZone || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        setIsDrawing(true);
        setStartPoint({x, y});
        setSafetyZone({x, y, w: 0, h: 0});
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDrawing || !startPoint || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const currentX = (e.clientX - rect.left) / rect.width;
        const currentY = (e.clientY - rect.top) / rect.height;

        const w = Math.abs(currentX - startPoint.x);
        const h = Math.abs(currentY - startPoint.y);
        const x = Math.min(currentX, startPoint.x);
        const y = Math.min(currentY, startPoint.y);

        setSafetyZone({x, y, w, h});
    };

    const handleMouseUp = () => {
        setIsDrawing(false);
    };

    return (
        <div className="min-h-screen bg-background text-foreground p-6 font-sans selection:bg-primary/30">
            <header className="flex justify-between items-center mb-8">
                 <div className="flex items-center gap-4">
                    <Link href="/client" className="p-2 bg-white rounded-full hover:bg-zinc-100 transition-colors border border-zinc-200">
                        <ArrowLeft className="w-5 h-5 text-zinc-600" />
                    </Link>
                    <h1 className="text-3xl font-light tracking-widest text-zinc-800">LIVE<span className="font-bold text-primary">.MONITOR</span></h1>
                 </div>
                 <div className="flex items-center gap-2 text-zinc-400 text-xs uppercase tracking-widest">
                    <Activity className="w-4 h-4 animate-pulse text-green-500" />
                    System Active
                 </div>
            </header>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-6xl mx-auto">
                {/* Main Camera View */}
                <div className="md:col-span-3 relative border-8 border-white rounded-[2rem] overflow-hidden bg-zinc-100 shadow-2xl group">
                   {isLoading && <div className="absolute inset-0 flex items-center justify-center text-blue-400 font-mono animate-pulse">Loading AI Engine (WASM)...</div>}
                   <video ref={videoRef} className="hidden" width="640" height="480" autoPlay playsInline muted />
                   
                   {/* Interaction Layer */}
                   <div 
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        className={`absolute inset-0 z-30 ${isEditingZone ? 'cursor-crosshair' : 'cursor-default'}`}
                   >
                       {/* Render Safety Zone using HTML Overlay */}
                       {safetyZone && (
                           <div 
                                className="absolute border-4 duration-300 border-green-500/50 bg-green-500/10"
                                style={{
                                    left: `${safetyZone.x * 100}%`,
                                    top: `${safetyZone.y * 100}%`,
                                    width: `${safetyZone.w * 100}%`,
                                    height: `${safetyZone.h * 100}%`
                                }}
                           >
                               <div className="absolute top-0 left-0 -translate-y-full px-2 py-1 text-xs font-bold rounded-t-lg bg-green-500 text-white">
                                   SAFE ZONE
                               </div>
                           </div>
                       )}
                   </div>
                   
                   <canvas ref={canvasRef} width="640" height="480" className="w-full h-auto object-contain relative z-10" />
                   
                   {/* Status Overlay */}
                   <div className="absolute top-6 left-6 flex gap-4 z-10 pointer-events-none">
                       <div className={`px-6 py-3 rounded-2xl text-lg font-bold tracking-widest backdrop-blur-md border shadow-lg transition-colors duration-300 flex items-center gap-3 ${
                           stats.status === 'Fall Detected'
                               ? 'bg-red-500/90 border-red-500 text-white animate-pulse' 
                               : 'bg-white/90 border-zinc-200 text-zinc-800'
                       }`}>
                           {stats.status === 'Fall Detected' && <Ban className="w-6 h-6" />}
                           {stats.status}
                       </div>
                   </div>
                   
                   {/* Danger Countdown */}
                   {timeToAlarm !== null && !alarmTriggered && (
                        <div className="absolute inset-0 flex items-center justify-center z-40 bg-red-500/20 pointer-events-none">
                            <div className="bg-red-600 text-white px-8 py-6 rounded-3xl animate-bounce flex flex-col items-center shadow-2xl">
                                <ShieldAlert className="w-12 h-12 mb-2" />
                                <div className="text-4xl font-black">{timeToAlarm}</div>
                                <div className="text-xs font-bold uppercase tracking-widest">Zone Violation Detected</div>
                            </div>
                        </div>
                   )}
                   
                   {/* ALARM TRIGGERED */}
                   {alarmTriggered && (
                       <div className="absolute inset-0 z-50 bg-red-600 animate-pulse flex flex-col items-center justify-center text-white p-8 text-center">
                           <BellRing className="w-24 h-24 mb-6 animate-bounce" />
                           <h1 className="text-6xl font-black mb-4 tracking-tighter">EMERGENCY</h1>
                           <p className="text-xl font-bold uppercase tracking-widest mb-12">Fall Detected Outside Safe Zone</p>
                           <button 
                                onClick={() => {
                                    setAlarmTriggered(false);
                                    fallStartTimeRef.current = null;
                                    alarmLoggedRef.current = false;
                                }}
                                className="bg-white text-red-600 px-10 py-4 rounded-full font-black text-xl hover:scale-105 transition-all shadow-xl uppercase border-4 border-red-800 pointer-events-auto"
                           >
                               DISMISS ALARM
                           </button>
                       </div>
                   )}

                   {isEditingZone && (
                       <div className="absolute bottom-6 left-0 right-0 flex justify-center z-30 pointer-events-none">
                           <div className="bg-yellow-100 text-yellow-800 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider shadow-md animate-bounce">
                               Mode: Draw Safety Zone
                           </div>
                       </div>
                   )}
                </div>

                {/* Sidebar Controls */}
                <div className="md:col-span-1 flex flex-col gap-4">
                    <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
                        <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-4">Safety Controls</h3>
                        
                        <div className="space-y-3">
                            <button 
                                onClick={() => setIsEditingZone(!isEditingZone)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm ${
                                    isEditingZone 
                                        ? 'bg-yellow-50 text-yellow-700 border border-yellow-200 shadow-inner' 
                                        : 'bg-zinc-50 text-zinc-700 hover:bg-zinc-100 border border-zinc-100'
                                }`}
                            >
                                <Edit3 className="w-4 h-4" /> 
                                {isEditingZone ? 'Done Editing' : 'Edit Safe Zone'}
                            </button>

                            {safetyZone && (
                                <button 
                                    onClick={() => setSafetyZone(null)}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 transition-all font-medium text-sm"
                                >
                                    <Trash2 className="w-4 h-4" /> Clear Zone
                                </button>
                            )}
                        </div>

                        {safetyZone ? (
                            <div className="mt-6 p-4 bg-green-50 rounded-xl border border-green-100">
                                <div className="flex items-center gap-2 text-green-700 font-bold text-xs uppercase mb-1">
                                    <CheckCircle className="w-4 h-4" /> Zone Active
                                </div>
                                <p className="text-green-600 text-xs leading-relaxed">
                                    Alarm triggers if a fall is detected OUTSIDE this zone for &gt; 10 seconds.
                                </p>
                            </div>
                        ) : (
                            <div className="mt-6 p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                                <div className="flex items-center gap-2 text-zinc-400 font-bold text-xs uppercase mb-1">
                                    <MousePointerClick className="w-4 h-4" /> No Zone
                                </div>
                                <p className="text-zinc-400 text-xs leading-relaxed">
                                    Click "Edit Safe Zone" and draw a box on the camera to define the safe area.
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex-1">
                        <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-4">Stats</h3>
                        <div className="space-y-4">
                            <div>
                                <div className="text-sm text-zinc-500 mb-1">Current State</div>
                                <div className="text-2xl font-bold text-zinc-800">{stats.status}</div>
                            </div>
                            <div>
                                <div className="text-sm text-zinc-500 mb-1">AI Confidence</div>
                                <div className="text-xl font-mono text-primary">{(stats.confidence * 100).toFixed(1)}%</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
