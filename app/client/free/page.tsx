'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, Reorder } from 'framer-motion';
import { Plus, Trash2, PlayCircle, ArrowLeft, GripVertical, Dumbbell } from 'lucide-react';
import Link from 'next/link';

interface ExerciseItem {
    id: string; // Unique ID for UI keys
    name: string;
    reps: number;
    weight: number;
    rest_time_seconds: number;
}

export default function FreeModeBuilder() {
    const router = useRouter();
    const [playlist, setPlaylist] = useState<ExerciseItem[]>([
        { id: 'init-1', name: 'Squat', reps: 10, weight: 20, rest_time_seconds: 30 }
    ]);

    // --- Actions ---

    const addExercise = () => {
        setPlaylist([...playlist, {
            id: Math.random().toString(36).substr(2, 9),
            name: 'Squat',
            reps: 10,
            weight: 10,
            rest_time_seconds: 30
        }]);
    };

    const removeExercise = (index: number) => {
        setPlaylist(playlist.filter((_, i) => i !== index));
    };

    const updateItem = (index: number, field: keyof ExerciseItem, value: any) => {
        const newPlaylist = [...playlist];
        newPlaylist[index] = { ...newPlaylist[index], [field]: value };
        setPlaylist(newPlaylist);
    };

    const startTraining = () => {
        if (playlist.length === 0) return;

        // Enrichment: Calculate Set Indices
        const counts: Record<string, number> = {};
        const totals: Record<string, number> = {};

        // 1. Calculate Totals
        playlist.forEach(item => {
            totals[item.name] = (totals[item.name] || 0) + 1;
        });

        // 2. Assign Indices
        const enrichedExercises = playlist.map(item => {
            counts[item.name] = (counts[item.name] || 0) + 1;
            return {
                name: item.name,
                reps: item.reps,
                weight: item.weight,
                rest_time_seconds: item.rest_time_seconds,
                set_index: counts[item.name],
                total_sets: totals[item.name]
            };
        });

        // Save to LocalStorage
        const freeMenu = {
            id: 'free-mode',
            name: 'Free Session',
            exercises: enrichedExercises
        };
        localStorage.setItem('straps_free_mode_menu', JSON.stringify(freeMenu));

        // Redirect
        router.push('/client/training?mode=free');
    };

    const EXERCISE_OPTIONS = [
        "Squat", "Lunges", "Deadlift", "Sit to Stand",
        "Bicep Curl", "Hammer Curl", "Overhead Press", "Lateral Raises",
        "Front Raise", "Shoulder Abduction", "Shoulder Flexion", "Knee Extension", "Hip Abduction"
    ];

    return (
        <div className="min-h-screen bg-background text-foreground p-4 md:p-8 font-sans pb-32">
            <header className="max-w-3xl mx-auto mb-10 flex items-center gap-4">
                <Link href="/client" className="p-3 bg-white hover:bg-zinc-100 rounded-full transition-colors border border-zinc-200 shadow-sm">
                    <ArrowLeft className="w-5 h-5 text-zinc-600" />
                </Link>
                <div>
                    <h1 className="text-2xl md:text-3xl font-light text-zinc-900 tracking-wide">
                        Free Style <span className="font-bold text-primary">Builder</span>
                    </h1>
                    <p className="text-zinc-500 text-sm mt-1">Create your own session on the fly.</p>
                </div>
            </header>

            <div className="max-w-3xl mx-auto space-y-4">
                
                {playlist.map((item, index) => {
                     // Calculate Set Number for UI
                     const previousOccurrences = playlist.slice(0, index).filter(i => i.name === item.name).length;
                     const setNumber = previousOccurrences + 1;

                     return (
                        <motion.div 
                            key={item.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white border border-zinc-200 p-4 rounded-xl shadow-sm flex flex-col md:flex-row items-center gap-4 group relative"
                        >
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-zinc-200 group-hover:bg-primary transition-colors rounded-l-xl"></div>
                            
                            {/* Numbering */}
                            <div className="w-8 h-8 rounded-full bg-zinc-50 text-zinc-400 font-bold text-xs flex items-center justify-center shrink-0">
                                {index + 1}
                            </div>

                            {/* Exercise Select */}
                            <div className="flex-1 w-full">
                                <div className="flex justify-between md:hidden mb-1">
                                     <label className="text-[10px] font-bold text-zinc-400 uppercase">Exercise</label>
                                     <span className="text-[10px] font-bold text-blue-500 uppercase bg-blue-50 px-2 rounded-md">Set {setNumber}</span>
                                </div>
                                <div className="relative">
                                    <select 
                                        value={item.name} 
                                        onChange={(e) => updateItem(index, 'name', e.target.value)}
                                        className="w-full bg-transparent font-bold text-zinc-900 focus:outline-none cursor-pointer appearance-none py-1 text-lg"
                                    >
                                        {EXERCISE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                    <span className="hidden md:inline-block absolute right-0 top-1/2 -translate-y-1/2 text-[10px] font-bold text-blue-500 uppercase bg-blue-50 px-2 rounded-md pointer-events-none">
                                        Set {setNumber} (Auto)
                                    </span>
                                </div>
                            </div>

                            {/* Parameters */}
                            <div className="flex gap-2 w-full md:w-auto">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1 text-center">Reps</label>
                                    <input 
                                        type="number" 
                                        value={isNaN(item.reps) ? '' : item.reps}
                                        onChange={(e) => updateItem(index, 'reps', parseInt(e.target.value))}
                                        className="w-full md:w-16 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1.5 text-center font-mono text-sm focus:border-primary outline-none"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1 text-center">Kg</label>
                                    <input 
                                        type="number" 
                                        value={isNaN(item.weight) ? '' : item.weight}
                                        onChange={(e) => updateItem(index, 'weight', parseFloat(e.target.value))}
                                        className="w-full md:w-16 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1.5 text-center font-mono text-sm focus:border-primary outline-none"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1 text-center">Rest(s)</label>
                                    <input 
                                        type="number" 
                                        value={isNaN(item.rest_time_seconds) ? '' : item.rest_time_seconds}
                                        onChange={(e) => updateItem(index, 'rest_time_seconds', parseFloat(e.target.value))}
                                        className="w-full md:w-16 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1.5 text-center font-mono text-sm focus:border-primary outline-none"
                                    />
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 border-l border-zinc-100 pl-4">
                                <button 
                                    type="button" 
                                    onClick={() => removeExercise(index)}
                                    className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        </motion.div>
                    );
                })}

                <div className="flex gap-4 pt-4">
                    <button 
                        type="button" 
                        onClick={addExercise}
                        className="flex-1 bg-white border border-dashed border-zinc-300 text-zinc-500 hover:text-primary hover:border-primary p-4 rounded-xl flex items-center justify-center gap-2 font-bold transition-all hover:bg-zinc-50"
                    >
                        <Plus className="w-5 h-5" /> Add Exercise
                    </button>
                    {/* Add Preset Loader later? */}
                </div>
            </div>
            
            <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-lg border-t border-zinc-200 flex justify-center z-50">
                    <button 
                    type="button" 
                    onClick={startTraining}
                    disabled={playlist.length === 0}
                    className="w-full max-w-md bg-primary hover:bg-primary/90 text-black font-black uppercase tracking-widest py-4 rounded-2xl shadow-[0_0_30px_-5px_var(--color-primary)] transform transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                >
                    <PlayCircle className="w-6 h-6" /> START SESSION
                </button>
            </div>
        </div>
    );
}
