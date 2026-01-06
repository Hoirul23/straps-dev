'use client';

import React, { useEffect, useRef, useState } from 'react';
import { HARCore } from '@/lib/pose/HARCore';
// Import from the official tasks-vision package
import { PoseLandmarker, FilesetResolver, DrawingUtils, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { RefreshCcw, ArrowLeft, PlayCircle, ChevronDown, ChevronUp } from 'lucide-react';
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
    
    // UI State
    const [expandedSet, setExpandedSet] = useState<number | null>(null);
    
    // Recap State
    const [results, setResults] = useState<any[]>([]);
    const maeBuffer = useRef<number[]>([]);
    
    // Per-Rep Tracking
    const repBuffer = useRef<number[]>([]);
    const repFeedbackBuffer = useRef<string[]>([]); // Buffer for feedback text
    const lastRepCount = useRef(0);
    const currentSetReps = useRef<{rep: number, score: number, feedback: string}[]>([]);

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

    // Init Logic and Load Models
    useEffect(() => {
        let isMounted = true;

        async function init() {
            try {
                // 1. Fetch Menu
                await fetchMenu();

                // 2. Init Core
                const core = new HARCore();
                harRef.current = core;
                
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

    // Frame Loop Logic
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
                                
                                let color = '#00FFFF'; // Cyan
                                let glow = '#00FFFF';  // Cyan Glow
                                
                                ctx.shadowColor = glow;
                                ctx.shadowBlur = 15;
                                ctx.strokeStyle = color;
                                ctx.lineWidth = 4;
                                ctx.stroke();
                            }
                            
                            // Draw Joints
                            for (let i = 0; i < lm.length; i++) {
                                const p = lm[i];
                                if (p.visibility && p.visibility < 0.5) continue;
                                if (i < 11 && i !== 0) continue; // Keep nose (0)

                                ctx.beginPath();
                                ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, 2 * Math.PI);
                                ctx.fillStyle = '#FFFFFF'; // White core
                                ctx.shadowColor = '#00FFFF'; // Cyan glow
                                ctx.shadowBlur = 20;
                                ctx.fill();
                            }
                            
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
                        // Accumulate Form Score (MAE)
                        if (res.debug && (res.debug as any).scores && (res.debug as any).scores.deviation_mae) {
                            const val = (res.debug as any).scores.deviation_mae;
                            if (val > 0) {
                                maeBuffer.current.push(val);
                                repBuffer.current.push(val); // Push to current rep buffer
                            }
                        }

                        // Capture Feedback Text
                        if (res.feedback && res.feedback.trim() !== "" && !res.feedback.includes("null")) {
                             // Only push meaningful feedback
                             repFeedbackBuffer.current.push(res.feedback);
                        }

                        // --- Rep Completion Logic ---
                        if (res.reps > lastRepCount.current) {
                            // Rep Finished!
                            const avgRepScore = repBuffer.current.length > 0 
                                ? repBuffer.current.reduce((a, b) => a + b, 0) / repBuffer.current.length 
                                : 0;
                            
                            // Calculate Dominant Feedback
                            let dominantFeedback = "Perfect";
                            if (repFeedbackBuffer.current.length > 0) {
                                // Find most frequent string
                                const counts: Record<string, number> = {};
                                let maxCount = 0;
                                let maxKey = "";
                                
                                for (const fb of repFeedbackBuffer.current) {
                                    const cleanFb = fb.trim(); 
                                    counts[cleanFb] = (counts[cleanFb] || 0) + 1;
                                    if (counts[cleanFb] > maxCount) {
                                        maxCount = counts[cleanFb];
                                        maxKey = cleanFb;
                                    }
                                }
                                if (maxKey) dominantFeedback = maxKey;
                            }
                            
                            currentSetReps.current.push({
                                rep: res.reps, 
                                score: avgRepScore,
                                feedback: dominantFeedback
                            });

                            // Reset for next rep
                            repBuffer.current = [];
                            repFeedbackBuffer.current = [];
                            lastRepCount.current = res.reps;
                        }

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
                 // --- SET COMPLETE LOGIC ---
                 
                 // 1. Calculate Average Form Score
                 const avgMae = maeBuffer.current.length > 0 
                    ? maeBuffer.current.reduce((a, b) => a + b, 0) / maeBuffer.current.length 
                    : 0;
                
                 // 2. Save Result
                 setResults(prev => [...prev, {
                     name: currentTarget.name,
                     set: currentTarget.set_index || 1,
                     reps: currentRepsInSet,
                     weight: currentTarget.weight,
                     score: avgMae,
                     repDetails: [...currentSetReps.current] // CAPTURE REP DETAILS
                 }]);
                 
                 // 3. Reset Buffers
                 maeBuffer.current = [];
                 repBuffer.current = [];
                 repFeedbackBuffer.current = []; // Reset feedback too
                 currentSetReps.current = [];
                 lastRepCount.current = 0; // Reset for next set

                 // Linear Logic: Next Exercise in List
                 const nextExIdx = currentExerciseIndex + 1;
                 const restTime = (currentTarget as any).rest_time_seconds || 0;
                 
                 if (nextExIdx >= menu.exercises.length) {
                     finishWorkout();
                 } else {
                     setCurrentExerciseIndex(nextExIdx);
                     setRepsOffset(stats.reps); // Important: Offset total reps
                     
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
                    summary: {
                        ...summary,
                        detailed_results: results // Send detailed results to backend
                    }
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
    
    // Helper for Form Grade
    const getGrade = (mae: number) => {
        if (mae < 8) return { letter: 'S', color: 'text-purple-400', label: 'Excellent' };
        if (mae < 15) return { letter: 'A', color: 'text-green-400', label: 'Good' };
        if (mae < 25) return { letter: 'B', color: 'text-yellow-400', label: 'Fair' };
        return { letter: 'C', color: 'text-red-400', label: 'Needs Improvement' };
    };

    if (isWorkoutComplete) {
        return (
            <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4 font-sans">
                <div className="max-w-2xl w-full bg-zinc-900 rounded-3xl border border-zinc-800 p-8 shadow-2xl relative overflow-hidden">
                     {/* Cyberpunk Glow */}
                     <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-primary to-purple-500"></div>

                     <div className="text-center mb-8">
                        <div className="inline-block px-4 py-1 rounded-full bg-green-500/10 text-green-400 text-xs font-bold tracking-widest uppercase mb-4 border border-green-500/20">
                            Session Complete
                        </div>
                        <h1 className="text-4xl font-black text-white tracking-tight mb-2">TRAINING RECAP</h1>
                        <p className="text-zinc-500 text-sm">Excellent work. Here is your performance breakdown.</p>
                     </div>

                     {/* Stats Grid */}
                     <div className="grid grid-cols-2 gap-4 mb-8">
                         <div className="bg-zinc-950/50 p-6 rounded-2xl border border-zinc-800 text-center">
                             <div className="text-3xl font-black text-white">{results.length}</div>
                             <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-1">Sets Completed</div>
                         </div>
                         <div className="bg-zinc-950/50 p-6 rounded-2xl border border-zinc-800 text-center">
                             <div className="text-3xl font-black text-primary">
                                 {results.reduce((a, b) => a + b.reps, 0)}
                             </div>
                             <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-1">Total Reps</div>
                         </div>
                     </div>

                     {/* Detailed Results Table */}
                     <div className="bg-zinc-950/30 rounded-2xl border border-zinc-800 overflow-hidden mb-8 max-h-[40vh] overflow-y-auto">
                         <table className="w-full text-sm">
                             <thead className="bg-zinc-900 border-b border-zinc-800">
                                 <tr>
                                     <th className="px-4 py-3 text-left font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Exercise</th>
                                     <th className="px-4 py-3 text-center font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Set</th>
                                     <th className="px-4 py-3 text-center font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Load</th>
                                     <th className="px-4 py-3 text-right font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Form Score</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-zinc-800">
                                 {results.map((res, i) => {
                                     const grade = getGrade(res.score);
                                     const isExpanded = expandedSet === i;
                                     
                                     return (
                                         <React.Fragment key={i}>
                                             <tr 
                                                onClick={() => setExpandedSet(isExpanded ? null : i)}
                                                className="hover:bg-zinc-800/50 transition-colors cursor-pointer group"
                                             >
                                                 <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                                                     {isExpanded ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
                                                     {res.name}
                                                 </td>
                                                 <td className="px-4 py-3 text-center text-zinc-400 font-mono">#{res.set}</td>
                                                 <td className="px-4 py-3 text-center text-zinc-400">
                                                     {res.reps}x <span className="text-zinc-600">@</span> {res.weight}kg
                                                 </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex flex-col items-end gap-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`font-black ${grade.color}`}>{grade.label}</span>
                                                            <span className="text-[10px] text-zinc-600 font-mono">Avg: {res.score.toFixed(1)}°</span>
                                                        </div>
                                                        {/* Preview Chips */}
                                                        {!isExpanded && res.repDetails && res.repDetails.length > 0 && (
                                                            <div className="flex justify-end gap-1">
                                                                {res.repDetails.map((r: any, idx: number) => (
                                                                    <div key={idx} className={`w-1.5 h-1.5 rounded-full ${getGrade(r.score).color.replace('text-','bg-')}`} />
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                             </tr>
                                             {/* Expanded Detail Row */}
                                             {isExpanded && (
                                                <tr className="bg-zinc-900/50">
                                                    <td colSpan={4} className="px-4 py-4">
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                            {res.repDetails?.map((r: any, idx: number) => {
                                                                const rGrade = getGrade(r.score);
                                                                const isPerfect = rGrade.label === 'Excellent';
                                                                const hasFeedback = r.feedback && r.feedback !== 'Perfect';
                                                                
                                                                return (
                                                                    <div key={idx} className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 flex flex-col gap-1">
                                                                        <div className="flex justify-between items-center w-full">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="text-xs font-mono text-zinc-500">#{idx + 1}</span>
                                                                                <span className={`text-xs font-bold ${rGrade.color}`}>{rGrade.label}</span>
                                                                            </div>
                                                                            <span className="text-[10px] text-zinc-600 font-mono">{r.score.toFixed(1)}°</span>
                                                                        </div>
                                                                        
                                                                        {/* Feedback Text */}
                                                                        <div className={`text-[10px] uppercase font-bold tracking-wide ${hasFeedback ? 'text-zinc-400' : 'text-zinc-600/50'}`}>
                                                                            {hasFeedback ? `"${r.feedback}"` : "NO ISSUES DETECTED"}
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })}
                                                            {(!res.repDetails || res.repDetails.length === 0) && (
                                                                <div className="col-span-3 text-center text-zinc-500 text-xs italic py-2">No individual rep data available.</div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                             )}
                                         </React.Fragment>
                                     );
                                 })}
                             </tbody>
                         </table>
                     </div>

                     <div className="flex gap-4">
                        <Link href="/client" className="flex-1 px-6 py-4 bg-white text-black font-bold uppercase tracking-widest rounded-xl hover:bg-zinc-200 transition-colors text-center text-sm">
                            Back to Dashboard
                        </Link>
                     </div>
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
                                        {isWarning ? 'CRITICAL ERROR' : 'SYSTEM ADVICE'}
                                    </h3>
                                    {isWarning && <div className="w-3 h-3 bg-red-500 rounded-full animate-ping"></div>}
                                </div>
                                <p className={`text-2xl font-bold leading-tight uppercase font-mono break-words ${
                                    isWarning ? 'text-red-600' : 'text-zinc-800'
                                }`}>
                                    {(stats.feedback || "SYSTEM READY").replace(/⚠️|✅|❌/g, '').replace(" | ", "\n").trim() || "WAITING FOR INPUT..."}
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
 