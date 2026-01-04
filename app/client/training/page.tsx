'use client';

import React, { useEffect, useRef, useState } from 'react';
import { HARCore } from '@/lib/pose/HARCore';
// Import from the official tasks-vision package
import { PoseLandmarker, FilesetResolver, DrawingUtils, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { RefreshCcw, ArrowLeft, PlayCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { AuthProvider, useAuth } from '@/lib/auth';

export default function TrainingPageWrap() {
    return (
        <AuthProvider>
            <Suspense fallback={<div className="min-h-screen bg-zinc-900 flex items-center justify-center text-white">Loading...</div>}>
                <TrainingPage />
            </Suspense>
        </AuthProvider>
    );
}

function TrainingPage() {
    const { user } = useAuth();
    const searchParams = useSearchParams();
    const mode = searchParams.get('mode');

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isStarted, setIsStarted] = useState(false);
    
    // Workflow State
    const [menu, setMenu] = useState<any>(null);
    const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
    // const [currentSet, setCurrentSet] = useState(1); // REMOVED: Linear Progression uses index only
    const [repsOffset, setRepsOffset] = useState(0); // Offset for accumulated reps
    const [stats, setStats] = useState({ exercise: '', reps: 0, status: 'Idle', feedback: '',  mae: 0});
    const [isWorkoutComplete, setIsWorkoutComplete] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    const [feedbackMsg, setFeedbackMsg] = useState<string>("");
    const [isWarning, setIsWarning] = useState<boolean>(false);

    // Rest Timer State
    const [isResting, setIsResting] = useState(false);
    const [restTimer, setRestTimer] = useState(0);

    // Refs for loop
    const harRef = useRef<HARCore | null>(null);
    const landmarkerRef = useRef<PoseLandmarker | null>(null);
    const requestRef = useRef<number | null>(null);
    const isRestingRef = useRef(false);
    const isStartedRef = useRef(false);

    useEffect(() => {
        isRestingRef.current = isResting;
    }, [isResting]);

    useEffect(() => {
        isStartedRef.current = isStarted;
    }, [isStarted]);


    // API Base URL
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

    // Fetch Latest Menu
    const fetchMenu = async () => {
        // Check for Free Mode
        if (mode === 'free') {
            const local = localStorage.getItem('straps_free_mode_menu');
            if (local) {
                const menuData = JSON.parse(local);
                setMenu(menuData);
                setCurrentExerciseIndex(0);
                setRepsOffset(0);
                return;
            }
        }

        if (!user) return;
        const headers = { 'x-user-id': user.id.toString() };

        try {
            const res = await fetch(`${API_BASE}/api/menus`, { headers });
            const data = await res.json();
            if (data && data.length > 0) {
                const latest = data[0]; 
                if (typeof latest.exercises === 'string') latest.exercises = JSON.parse(latest.exercises);
                setMenu(latest);
                setCurrentExerciseIndex(0);
                setRepsOffset(0);
            }
        } catch (err) {
            console.error("Failed to fetch menu:", err);
        }
    };

    useEffect(() => {
        let isMounted = true;

        async function init() {
            try {
                // 1. Fetch Menu
                await fetchMenu();

                // 2. Init Core
                const core = new HARCore();
                harRef.current = core;
                // Pre-set exercise if menu loaded? 
                // We'll update it in the loop or effect.

                // 3. Init Vision
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

                // 4. Init Camera
                if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: { width: 640, height: 480 }
                    });
                    
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                        try {
                            await videoRef.current.play();
                        } catch (err) {
                            console.warn("Video play aborted (harmless):", err);
                        }
                        
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
    }, [user, mode]); // Trigger init/fetch when mode changes

    // Rest Timer Countdown
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isResting && restTimer > 0) {
            interval = setInterval(() => {
                setRestTimer((prev) => prev - 1);
            }, 1000);
        } else if (isResting && restTimer <= 0) {
            // Rest Finished
            setIsResting(false);
            // Re-sync offset to ignore any movements during rest
            setRepsOffset(stats.reps);
        }
        return () => clearInterval(interval);
    }, [isResting, restTimer, stats.reps]);

    // Effect: Update Active Exercise in HAR Core
    useEffect(() => {
        if (menu && harRef.current) {
            const range = menu.exercises?.[currentExerciseIndex];
            if (range) {
                harRef.current.setExercise(range.name);
            }
        }
    }, [menu, currentExerciseIndex]);

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
                            // Custom "Cyber" Drawing
                            // drawingUtils.drawLandmarks(lm, { radius: 1, color: '#00FF00' });
                            // drawingUtils.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
                            
                            // Config
                            const connectors = PoseLandmarker.POSE_CONNECTIONS;
                            
                            // Draw Connections
                            ctx.lineCap = 'round';
                            ctx.lineJoin = 'round';
                            
                            for (const { start, end } of connectors) {
                                const p1 = lm[start];
                                const p2 = lm[end];
                                
                                if (!p1 || !p2 || (p1.visibility && p1.visibility < 0.5) || (p2.visibility && p2.visibility < 0.5)) continue;
                                
                                ctx.beginPath();
                                ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
                                ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
                                
                                // Color logic
                                const isLeft = (start % 2 === 1) || (end % 2 === 1); // Odd indices are usually left in MP
                                // MP Pose: 11(L Sho), 12(R Sho). 
                                // Actually:
                                // 0-10: Face
                                // 11,13,15,17,19,21: Left Arm/Hand
                                // 12,14,16,18,20,22: Right Arm/Hand
                                // 23,25,27,29,31: Left Leg/Foot
                                // 24,26,28,30,32: Right Leg/Foot
                                
                                let color = '#00FFFF'; // Cyan
                                let glow = '#00FFFF';  // Cyan Glow
                                
                                // Torso can be slightly dimmer or same?
                                // Let's stick to uniform Cyan as requested.
                                
                                ctx.shadowColor = glow;
                                ctx.shadowBlur = 15; // Stronger glow
                                ctx.strokeStyle = color;
                                ctx.lineWidth = 4;
                                ctx.stroke();
                            }
                            
                            // Draw Joints
                            for (let i = 0; i < lm.length; i++) {
                                const p = lm[i];
                                if (p.visibility && p.visibility < 0.5) continue;
                                
                                // Skip face landmarks mostly? 0-10
                                if (i < 11 && i !== 0) continue; // Keep nose (0)

                                ctx.beginPath();
                                ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, 2 * Math.PI);
                                
                                ctx.fillStyle = '#FFFFFF'; // White core
                                ctx.shadowColor = '#00FFFF'; // Cyan glow
                                ctx.shadowBlur = 20;
                                ctx.fill();
                            }
                            
                            // Reset context
                            ctx.shadowBlur = 0;
                        }
                    }
                    ctx.restore();
                }

                // Process Logic
                if (isStartedRef.current && !isRestingRef.current && result.landmarks && result.landmarks.length > 0) {
                     // Pass normalized landmarks (x,y,z,visibility) AND world landmarks (meters)
                     const res = await har.process(
                         result.landmarks[0] as any, 
                         result.worldLandmarks[0] as any
                     );
                     
                     if (res) {
                        setStats({
                            status: res.status,
                            exercise: res.exercise || 'Unknown',
                            reps: res.reps, // Reps from RehabCore
                            feedback: res.feedback,
                            mae: (res.debug as any)?.scores?.deviation_mae || 0
                        });

                        // Update Feedback UI State
                        if (res.feedback) {
                            setFeedbackMsg(res.feedback);
                            // Detect Warning Flag from RehabCore
                            setIsWarning(res.feedback.includes("⚠️"));
                        } else {
                            setFeedbackMsg("");
                            setIsWarning(false);
                        }
                     }
                }
            }
        }
        requestRef.current = requestAnimationFrame(predictWebcam);
    };

    // Progression Logic
    useEffect(() => {
        if (!menu || isWorkoutComplete) return;
        const currentTarget = menu.exercises[currentExerciseIndex];
        if (!currentTarget) {
            finishWorkout();
            return;
        }

        // Calculate Reps in Current Set
        const currentRepsInSet = Math.max(0, stats.reps - repsOffset);
        
        const isMatchingExercise = stats.exercise && numberSafeMatch(stats.exercise, currentTarget.name);

        if (isMatchingExercise) {
             if (currentRepsInSet >= currentTarget.reps) {
                 // Linear Logic: Next Exercise in List
                 const nextExIdx = currentExerciseIndex + 1;
                 const restTime = (currentTarget as any).rest_time_seconds || 0;
                 
                 if (nextExIdx >= menu.exercises.length) {
                     finishWorkout();
                 } else {
                     setCurrentExerciseIndex(nextExIdx);
                     setRepsOffset(0);
                     
                     if (restTime > 0) {
                         setIsResting(true);
                         setRestTimer(restTime);
                     }
                 }
             }
        }
    }, [stats.reps, stats.exercise, menu, currentExerciseIndex, repsOffset]);

    const numberSafeMatch = (a: string, b: string) => {
        return a.toLowerCase().includes(b.split(' ')[0].toLowerCase());
    }

    const saveRecap = async (summary: any) => {
        if (!menu || !user) return;
        try {
            await fetch(`${API_BASE}/api/recap`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user-id': user.id
                },
                body: JSON.stringify({
                    menu_id: menu.id,
                    user_id: user.id,
                    summary
                })
            });
        } catch (e) {
            console.error("Failed to save recap:", e);
        }
    };

    const finishWorkout = async () => {
        if (isWorkoutComplete || !menu) return;
        setIsWorkoutComplete(true);
        setIsSaving(true);
        try {
            await saveRecap({
                completed: true,
                exercises: menu.exercises,
                timestamp: new Date().toISOString()
            });
        } catch (e) { console.error(e); } 
        finally { setIsSaving(false); }
    };

    if (isWorkoutComplete) {
        return (
            <div className="min-h-screen bg-white text-zinc-900 flex flex-col items-center justify-center p-4">
                <h1 className="text-4xl font-bold text-green-600 mb-4">Workout Complete!</h1>
                <div className="bg-white p-8 rounded-xl border border-zinc-200 text-center shadow-xl">
                    <p className="text-xl mb-4">Great job.</p>
                    {isSaving ? <p className="text-blue-600">Saving...</p> : <p className="text-zinc-400">Saved.</p>}
                     <Link href="/client" className="mt-8 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition inline-block">Back to Dashboard</Link>
                </div>
            </div>
        );
    }
    
    // ... Render same as before ...
    const currentTarget = menu?.exercises?.[currentExerciseIndex];

    return (
        <div className="min-h-screen bg-background text-foreground p-6 font-sans selection:bg-primary/30">
            <header className="flex justify-between items-center mb-8">
                 <div className="flex items-center gap-4">
                    <Link href="/client" className="p-2 bg-white rounded-full hover:bg-zinc-100 transition-colors border border-zinc-200">
                        <ArrowLeft className="w-5 h-5 text-zinc-600" />
                    </Link>
                    <h1 className="text-3xl font-light tracking-widest text-zinc-800">TRAINING<span className="font-bold text-primary">.MODE</span></h1>
                 </div>
                 <div className="flex items-center gap-4">
                    <div className="bg-white border border-zinc-200 px-6 py-2 rounded-full text-xs font-medium tracking-wider text-zinc-600 uppercase shadow-sm">
                        {menu ? menu.name : 'Loading...'}
                    </div>
                    <button 
                        onClick={() => {
                            setMenu(null);
                            fetchMenu();
                        }}
                        className="p-2 bg-white border border-zinc-200 hover:bg-zinc-100 rounded-full transition-colors shadow-sm"
                        title="Refresh Menu"
                    >
                        <RefreshCcw size={18} className="text-zinc-500" />
                    </button>

                    <button 
                        onClick={() => {
                            // Reset Logic
                            // setCurrentSet(1);
                            setRepsOffset(0);
                            setStats(prev => ({ ...prev, reps: 0, status: 'Idle', feedback: 'Reset' }));
                            if (harRef.current) harRef.current.resetParams();
                            setIsResting(false);
                        }}
                        className="px-4 py-2 bg-red-50 text-red-600 rounded-full text-xs font-bold uppercase tracking-widest border border-red-100 hover:bg-red-100 transition-colors"
                    >
                        Reset
                    </button>

                    <div className="flex bg-zinc-100 p-1 rounded-full border border-zinc-200">
                        <Link 
                            href="/client/training"
                            className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${
                                !(new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('mode') === 'free')
                                ? 'bg-white text-primary shadow-sm' 
                                : 'text-zinc-400 hover:text-zinc-600'
                            }`}
                        >
                            Assigned
                        </Link>
                        <Link 
                            href="/client/training?mode=free"
                            className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${
                                (new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('mode') === 'free')
                                ? 'bg-white text-primary shadow-sm' 
                                : 'text-zinc-400 hover:text-zinc-600'
                            }`}
                        >
                            Personal
                        </Link>
                    </div>
                 </div>
            </header>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 relative border-8 border-white rounded-[2rem] overflow-hidden bg-zinc-100 shadow-2xl">
                   {isLoading && <div className="absolute inset-0 flex items-center justify-center text-blue-400 font-mono animate-pulse">Loading AI Engine (WASM)...</div>}
                   <video ref={videoRef} className="hidden" width="640" height="480" autoPlay playsInline muted />
                   <canvas ref={canvasRef} width="640" height="480" className="w-full h-auto object-contain" />
                   
                   {/* Status Display Removed as per user request (kept in Live Monitor) */}
                   {/* <div className="absolute top-6 left-6 flex gap-4">
                       <div className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-widest backdrop-blur-md border ${stats.status === 'Fall Detected' ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-primary/10 border-primary/30 text-primary'}`}>
                           {stats.status.toUpperCase()}
                       </div>
                   </div> */}

                    {/* --- NEW: FEEDBACK OVERLAY WINDOW --- */}


                   {/* Rest Overlay */}
                   {isResting && (
                       <div className="absolute inset-0 bg-black/95 z-50 flex flex-col items-center justify-center animate-in fade-in duration-500">
                           <div className="text-secondary font-medium tracking-[0.2em] uppercase mb-6 text-sm">Recovery Break</div>
                           <div className="text-9xl font-light text-highlight mb-10 tabular-nums tracking-tighter">
                               {Math.floor(restTimer / 60)}:{(restTimer % 60).toString().padStart(2, '0')}
                           </div>
                           <button 
                               onClick={() => setIsResting(false)}
                               className="px-10 py-3 bg-secondary/10 hover:bg-secondary/20 hover:scale-105 text-secondary rounded-full font-medium transition-all text-xs uppercase tracking-widest border border-secondary/30"
                           >
                               Resume Workout
                           </button>
                       </div>
                   )}

                   {/* Start Overlay */}
                   {!isStarted && !isLoading && (
                        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-40 flex flex-col items-center justify-center p-8 text-center">
                            <h2 className="text-3xl font-bold text-zinc-900 mb-2">Ready to Train?</h2>
                            <p className="text-zinc-600 mb-8 max-w-md">
                                {menu ? `Start your assigned program: ${menu.name}` : `No assigned program found.`}
                            </p>
                            
                            <div className="flex flex-col gap-4">
                                {menu && (
                                    <button 
                                        onClick={() => setIsStarted(true)}
                                        className="px-12 py-4 bg-primary text-white text-lg font-bold rounded-full shadow-xl hover:shadow-2xl hover:scale-105 transition-all flex items-center justify-center gap-3 w-64"
                                    >
                                        <PlayCircle className="w-6 h-6" /> START {menu.name ? 'PROGRAM' : 'WORKOUT'}
                                    </button>
                                )}

                                <div className="flex items-center gap-4 w-64">
                                     <div className="h-px bg-zinc-300 flex-1"></div>
                                     <span className="text-xs text-zinc-400 font-bold uppercase">OR</span>
                                     <div className="h-px bg-zinc-300 flex-1"></div>
                                </div>

                                <Link 
                                    href="/client/free"
                                    className="px-12 py-4 bg-white border-2 border-zinc-200 text-zinc-600 text-lg font-bold rounded-full hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-3 w-64 text-center"
                                >
                                     CREATE PERSONAL MENU
                                </Link>

                                {new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('mode') === 'free' && (
                                    <Link 
                                        href="/client/training"
                                        className="mt-2 text-zinc-400 text-xs font-bold uppercase tracking-widest hover:text-primary transition-colors"
                                    >
                                        Return to Assigned Program
                                    </Link>
                                )}
                            </div>
                        </div>
                   )}
                </div>

                <div className="flex flex-col gap-6">
                    {/* Workout Menu List */}
                    <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden flex flex-col max-h-[40vh] shadow-lg">
                        <div className="p-4 border-b border-zinc-100 bg-zinc-50">
                             <h2 className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Workout Plan</h2>
                        </div>
                        <div className="overflow-y-auto p-2 space-y-2">
                            {menu?.exercises?.map((ex: any, idx: number) => {
                                const isActive = idx === currentExerciseIndex;
                                const isCompleted = idx < currentExerciseIndex;
                                
                                return (
                                    <React.Fragment key={idx}>
                                        {(idx === 0 || ex.set_index > (menu.exercises[idx - 1]?.set_index || 0)) && (
                                            <div className="py-4 flex items-center gap-4">
                                                <div className="h-px bg-zinc-200 flex-1"></div>
                                                <span className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em] bg-white px-2 rounded-lg">
                                                    SET {ex.set_index || 1}
                                                </span>
                                                <div className="h-px bg-zinc-200 flex-1"></div>
                                            </div>
                                        )}
                                        <div 
                                            className={`p-5 rounded-2xl transition-all border ${
                                                isActive 
                                                    ? 'bg-blue-50 border-primary shadow-sm' 
                                                    : isCompleted 
                                                        ? 'opacity-40 grayscale border-transparent' 
                                                        : 'bg-white border-zinc-100'
                                            }`}
                                        >
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <div className={`text-lg tracking-wide ${isActive ? 'font-bold text-zinc-900' : 'text-zinc-500 font-medium'}`}>
                                                        {ex.name}
                                                    </div>
                                                    <div className="text-[10px] text-secondary/70 uppercase tracking-widest mt-1">
                                                        Target: {ex.reps} reps • {ex.weight}kg
                                                    </div>
                                                </div>
                                                
                                                {isActive && (
                                                    <div className="text-right">
                                                        <div className="text-3xl font-light text-primary">
                                                            {Math.max(0, stats.reps - repsOffset)}<span className="text-sm text-secondary/50 font-normal ml-1">/ {ex.reps}</span>
                                                        </div>
                                                        <div className="text-[10px] text-blue-300 uppercase tracking-wider font-bold animate-pulse">
                                                            Set {ex.set_index || 1}/{ex.total_sets || 1}
                                                        </div>
                                                        {(ex as any).rest_time_seconds > 0 && (
                                                            <div className="text-[10px] text-zinc-500 mt-1">
                                                                Rest: {(ex as any).rest_time_seconds}s
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                
                                                {isCompleted && (
                                                    <div className="text-green-500">
                                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </React.Fragment>
                                );
                            })}
                            
                            {!menu && (
                                <div className="p-4 text-center text-zinc-500 italic">No menu loaded</div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-zinc-200 flex flex-col justify-center items-center text-center shadow-lg h-48">
                         <h2 className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest mb-2">Real-time Counter</h2>
                         
                         <div className="relative">
                             <svg className="w-32 h-32 transform -rotate-90">
                                <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-zinc-100" />
                                <circle 
                                    cx="64" cy="64" r="56" 
                                    stroke="currentColor" strokeWidth="6" fill="transparent" 
                                    className="text-primary transition-all duration-500 ease-out drop-shadow-md"
                                    strokeDasharray={2 * Math.PI * 56}
                                    strokeDashoffset={2 * Math.PI * 56 * (1 - (Math.max(0, stats.reps - repsOffset) / (currentTarget?.reps || 1)))}
                                />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center flex-col">
                                <span className="text-4xl font-black text-zinc-900">{Math.max(0, stats.reps - repsOffset)}</span>
                                <span className="text-zinc-400 text-[10px] font-medium">REPS</span>
                            </div>
                         </div>
                    </div>

                    {/* Redesigned Cyberpunk Feedback Card (Expanded) */}
                    <div className={`p-0.5 rounded-xl flex-1 bg-gradient-to-r ${
                        isWarning ? 'from-red-500 via-rose-500 to-red-500 animate-pulse' : 'from-cyan-400 via-blue-500 to-cyan-400'
                    }`}>
                        <div className="bg-zinc-50 rounded-[10px] p-6 h-full relative overflow-hidden flex flex-col justify-center">
                             {/* Scanline effect (Subtle Light Mode) */}
                            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,0,0,0.02)_50%),linear-gradient(90deg,rgba(0,0,0,0.03),rgba(0,0,0,0.01),rgba(0,0,0,0.03))] z-0 pointer-events-none bg-[length:100%_4px,6px_100%]"></div>
                            
                            <div className="relative z-10 text-center md:text-left">
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className={`text-xs font-black uppercase tracking-[0.2em] ${
                                        isWarning ? 'text-red-500 drop-shadow-sm' : 'text-cyan-600 drop-shadow-sm'
                                    }`}>
                                        {isWarning ? 'CRITICAL_ERROR' : 'SYSTEM_ADVICE'}
                                    </h3>
                                    {isWarning && <div className="w-3 h-3 bg-red-500 rounded-full animate-ping"></div>}
                                </div>
                                <p className={`text-2xl font-bold leading-tight uppercase font-mono break-words ${
                                    isWarning ? 'text-red-600' : 'text-zinc-800'
                                }`}>
                                    {(stats.feedback || "SYSTEM_READY").replace(/⚠️|✅|❌/g, '').replace(" | ", "\n").trim() || "WAITING FOR INPUT..."}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Form Quality (MAE) - Expanded */}
                    <div className={`rounded-xl border-l-8 overflow-hidden shadow-lg bg-white h-32 flex flex-col justify-center ${
                        stats.mae > 15 
                            ? 'border-red-500'     
                            : stats.mae > 5 
                                ? 'border-yellow-400' 
                                : 'border-emerald-500' 
                    }`}>
                        <div className="px-6 py-2 flex justify-between items-center h-full">
                            <div className="flex flex-col text-left">
                                <span className="text-xs font-black uppercase tracking-widest text-zinc-400">Form Quality</span>
                                <span className={`text-2xl uppercase font-black mt-1 ${
                                    stats.mae > 15 ? 'text-red-600' : stats.mae > 5 ? 'text-yellow-600' : 'text-emerald-600'
                                }`}>
                                    {stats.mae > 15 ? 'Needs Improvement' : stats.mae > 5 ? 'Fair' : 'Excellent'}
                                </span>
                            </div>
                            <div className="text-right">
                                <div className="text-5xl font-black tabular-nums leading-none text-zinc-900 tracking-tighter">
                                    {stats.mae.toFixed(1)}°
                                </div>
                                <span className="text-[10px] uppercase text-zinc-400 tracking-wider font-bold">Deviation</span>
                            </div>
                        </div>
                        {/* Mini Graph Bar */}
                        <div className="h-2 w-full bg-zinc-100 flex mt-auto">
                            <div 
                                className={`h-full transition-all duration-500 ${stats.mae > 15 ? 'bg-red-500' : stats.mae > 5 ? 'bg-yellow-400' : 'bg-emerald-500'}`} 
                                style={{ width: `${Math.min(100, (stats.mae / 30) * 100)}%` }}
                            ></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
