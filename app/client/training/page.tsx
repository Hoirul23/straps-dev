'use client';

import React, { useEffect, useRef, useState } from 'react';
import { HARCore } from '@/lib/pose/HARCore';
// Import from the official tasks-vision package
import { PoseLandmarker, FilesetResolver, DrawingUtils, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { RefreshCcw, ArrowLeft, PlayCircle } from 'lucide-react';
import Link from 'next/link';

import { AuthProvider, useAuth } from '@/lib/auth';

export default function TrainingPageWrap() {
    return (
        <AuthProvider>
            <TrainingPage />
        </AuthProvider>
    );
}

function TrainingPage() {
    const { user } = useAuth();
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isStarted, setIsStarted] = useState(false);
    
    // Workflow State
    const [menu, setMenu] = useState<any>(null);
    const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
    const [currentSet, setCurrentSet] = useState(1);
    const [repsOffset, setRepsOffset] = useState(0); // Offset for accumulated reps
    const [stats, setStats] = useState({ exercise: '', reps: 0, status: 'Idle', feedback: '' });
    const [isWorkoutComplete, setIsWorkoutComplete] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
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
                setCurrentSet(1);
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
    }, [user]); // Added user to dependency array for fetchMenu

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
                            drawingUtils.drawLandmarks(lm, { radius: 1, color: '#00FF00' });
                            drawingUtils.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
                        }
                    }
                    ctx.restore();
                }

                // Process Logic
                if (isStartedRef.current && !isRestingRef.current && result.landmarks && result.landmarks.length > 0) {
                     // Pass normalized landmarks (x,y,z,visibility)
                     // Tasks API: x,y in [0,1], z in relative scale
                     const res = await har.process(result.landmarks[0] as any);
                     
                     if (res) {
                        setStats({
                            status: res.status,
                            exercise: res.exercise || 'Unknown',
                            reps: res.reps, // Reps from RehabCore
                            feedback: res.feedback
                        });
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
                 // Set Complete
                 const totalSets = currentTarget.sets || 1;
                 const restTime = (currentTarget as any).rest_time_seconds || 0;
                 console.log("Debug Logic:", { currentSet, totalSets, restTime, currentRepsInSet });
                 
                 if (currentSet < totalSets) {
                     // Move to Next Set
                     setCurrentSet(prev => prev + 1);
                     setRepsOffset(stats.reps); // New baseline
                     
                     // Trigger Rest if configured
                     if (restTime > 0) {
                         setIsResting(true);
                         setRestTimer(restTime);
                     }
                 } else {
                     // Exercise Complete
                     const nextIdx = currentExerciseIndex + 1;
                     if (nextIdx < menu.exercises.length) {
                         // Check if we should rest between exercises? Usually yes if configured.
                         // But for now let's assume rest is per-set. 
                         // If user wants rest between exercises, it's effectively a rest after the last set.
                         if (restTime > 0) {
                             setIsResting(true);
                             setRestTimer(restTime);
                             // Delay transition until rest ends? 
                             // No, logic is trickier. Let's just transition immediately for now 
                             // OR we can make a "Resting... Next: Squat" screen.
                             // For simplicity: Rest applies triggers here, but we also change index.
                             // Wait, if we change index, the 'restTime' might be confusing.
                             // Let's keep it simple: Rest only WITHIN the exercise (between sets).
                         }
                         
                         setCurrentExerciseIndex(nextIdx);
                         setCurrentSet(1);
                         setRepsOffset(0); 
                     } else {
                         finishWorkout();
                     }
                 }
             }
        }
    }, [stats.reps, stats.exercise, menu, currentExerciseIndex, currentSet, repsOffset]);

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
                 </div>
            </header>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 relative border-8 border-white rounded-[2rem] overflow-hidden bg-zinc-100 shadow-2xl">
                   {isLoading && <div className="absolute inset-0 flex items-center justify-center text-blue-400 font-mono animate-pulse">Loading AI Engine (WASM)...</div>}
                   <video ref={videoRef} className="hidden" width="640" height="480" autoPlay playsInline muted />
                   <canvas ref={canvasRef} width="640" height="480" className="w-full h-auto object-contain" />
                   
                   <div className="absolute top-6 left-6 flex gap-4">
                       <div className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-widest backdrop-blur-md border ${stats.status === 'Fall Detected' ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-primary/10 border-primary/30 text-primary'}`}>
                           {stats.status.toUpperCase()}
                       </div>
                   </div>

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
                            <p className="text-zinc-600 mb-8 max-w-md">Ensure your full body is visible in the camera. When you are ready, press start to begin the program.</p>
                            <button 
                                onClick={() => setIsStarted(true)}
                                className="px-12 py-4 bg-primary text-white text-lg font-bold rounded-full shadow-xl hover:shadow-2xl hover:scale-105 transition-all flex items-center gap-3"
                            >
                                <PlayCircle className="w-6 h-6" /> START WORKOUT
                            </button>
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
                                    <div 
                                        key={idx}
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
                                                    Target: {ex.reps} reps
                                                </div>
                                            </div>
                                            
                                            {isActive && (
                                                <div className="text-right">
                                                    <div className="text-3xl font-light text-primary">
                                                        {Math.max(0, stats.reps - repsOffset)}<span className="text-sm text-secondary/50 font-normal ml-1">/ {ex.reps}</span>
                                                    </div>
                                                    <div className="text-[10px] text-blue-300 uppercase tracking-wider font-bold animate-pulse">
                                                        Set {currentSet}/{ex.sets || 1}
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
                                );
                            })}
                            
                            {!menu && (
                                <div className="p-4 text-center text-zinc-500 italic">No menu loaded</div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-zinc-200 flex-1 flex flex-col justify-center items-center text-center shadow-lg">
                         <h2 className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-4">Real-time Counter</h2>
                         
                         <div className="relative">
                             <svg className="w-56 h-56 transform -rotate-90">
                                <circle cx="112" cy="112" r="100" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-zinc-100" />
                                <circle 
                                    cx="112" cy="112" r="100" 
                                    stroke="currentColor" strokeWidth="8" fill="transparent" 
                                    className="text-primary transition-all duration-500 ease-out drop-shadow-md"
                                    strokeDasharray={2 * Math.PI * 88}
                                    strokeDashoffset={2 * Math.PI * 88 * (1 - (Math.max(0, stats.reps - repsOffset) / (currentTarget?.reps || 1)))}
                                />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center flex-col">
                                <span className="text-6xl font-black text-zinc-900">{Math.max(0, stats.reps - repsOffset)}</span>
                                <span className="text-zinc-400 text-sm font-medium">COMPLETED</span>
                            </div>
                         </div>
                    </div>

                    {stats.feedback && (
                        <div className="bg-yellow-500/10 p-4 rounded-xl border border-yellow-500/20">
                            <h3 className="text-yellow-500 font-bold text-sm mb-1">AI Coach</h3>
                            <p className="text-yellow-100 text-lg leading-tight">{stats.feedback}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
