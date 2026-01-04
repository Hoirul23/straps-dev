'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, PlayCircle, ArrowLeft, Copy } from 'lucide-react';
import Link from 'next/link';

interface ExerciseItem {
    id: string; 
    name: string;
    reps: number;
    weight: number;
    rest_time_seconds: number;
}

interface RoundData {
    id: string;
    exercises: ExerciseItem[];
}

export default function FreeModeBuilder() {
    const router = useRouter();
    
    // --- Round-Based State ---
    const [rounds, setRounds] = useState<RoundData[]>([
        { 
            id: 'round-1', 
            exercises: [
                { id: 'ex-1', name: 'Squat', reps: 10, weight: 20, rest_time_seconds: 30 }
            ]
        }
    ]);

    // --- Actions ---

    const addRound = () => {
        setRounds([...rounds, {
            id: Math.random().toString(36).substr(2, 9),
            exercises: []
        }]);
    };

    const duplicateRound = (sourceIndex: number) => {
        const source = rounds[sourceIndex];
        const newExercises = source.exercises.map(ex => ({
            ...ex,
            id: Math.random().toString(36).substr(2, 9)
        }));
        
        // Insert after the source round
        const newRounds = [...rounds];
        newRounds.splice(sourceIndex + 1, 0, {
            id: Math.random().toString(36).substr(2, 9),
            exercises: newExercises
        });
        setRounds(newRounds);
    };

    const removeRound = (index: number) => {
        setRounds(rounds.filter((_, i) => i !== index));
    };

    const addExerciseToRound = (roundIndex: number) => {
        const newRounds = [...rounds];
        newRounds[roundIndex].exercises.push({
            id: Math.random().toString(36).substr(2, 9),
            name: 'Squat', 
            reps: 10, 
            weight: 10, 
            rest_time_seconds: 30
        });
        setRounds(newRounds);
    };

    const removeExerciseFromRound = (roundIndex: number, exIndex: number) => {
        const newRounds = [...rounds];
        newRounds[roundIndex].exercises = newRounds[roundIndex].exercises.filter((_, i) => i !== exIndex);
        setRounds(newRounds);
    };

    const updateExercise = (roundIndex: number, exIndex: number, field: keyof ExerciseItem, value: any) => {
        const newRounds = [...rounds];
        newRounds[roundIndex].exercises[exIndex] = { 
            ...newRounds[roundIndex].exercises[exIndex], 
            [field]: value 
        };
        setRounds(newRounds);
    };

    const startTraining = () => {
        if (rounds.length === 0) return;
        if (rounds.every(r => r.exercises.length === 0)) return;

        // Flatten Logic: Expand Rounds into Linear List
        // Matches Coach App logic exactly
        const flatList: any[] = [];
        const counts: Record<string, number> = {};
        const totals: Record<string, number> = {};

        // 1. Calculate Totals (First Pass)
        rounds.forEach(round => {
            round.exercises.forEach(ex => {
                totals[ex.name] = (totals[ex.name] || 0) + 1;
            });
        });

        // 2. Flatten and Assign Indices
        rounds.forEach((round) => {
            round.exercises.forEach(ex => {
                counts[ex.name] = (counts[ex.name] || 0) + 1;
                
                flatList.push({
                    name: ex.name,
                    reps: ex.reps,
                    weight: ex.weight,
                    rest_time_seconds: ex.rest_time_seconds,
                    set_index: counts[ex.name], 
                    total_sets: totals[ex.name]
                });
            });
        });

        // Save to LocalStorage
        const freeMenu = {
            id: 'free-mode',
            name: 'Free Session',
            exercises: flatList
        };
        localStorage.setItem('straps_free_mode_menu', JSON.stringify(freeMenu));

        // Redirect
        router.push('/client/training?mode=free');
    };

    const EXERCISE_OPTIONS = [
        "Bicep Curl", "Hammer Curl", "Squat", "Deadlift", "Lunges", "Overhead Press", "Lateral Raises"
    ];

    return (
        <div className="min-h-screen bg-background text-foreground p-4 md:p-8 font-sans pb-32">
            <header className="max-w-3xl mx-auto mb-10 flex items-center gap-4">
                <Link href="/client" className="p-3 bg-white hover:bg-zinc-100 rounded-full transition-colors border border-zinc-200 shadow-sm">
                    <ArrowLeft className="w-5 h-5 text-zinc-600" />
                </Link>
                <div>
                    <h1 className="text-2xl md:text-3xl font-light text-zinc-900 tracking-wide">
                        Free Style <span className="font-bold text-primary">Composer</span>
                    </h1>
                    <p className="text-zinc-500 text-sm mt-1">Design training blocks set-by-set.</p>
                </div>
            </header>

            <div className="max-w-3xl mx-auto space-y-8">
                <AnimatePresence>
                {rounds.map((round, roundIndex) => (
                    <motion.div 
                        key={round.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-zinc-50 border border-zinc-200 rounded-3xl p-6 md:p-8 relative shadow-sm group/round"
                    >
                        {/* Round Header */}
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-zinc-300 uppercase tracking-tighter flex items-center gap-2">
                                <span className="text-4xl text-zinc-200">#{ (roundIndex + 1).toString().padStart(2, '0') }</span>
                                SET/GROUP
                            </h3>
                            
                            <div className="flex items-center gap-2">
                                <button 
                                    type="button" 
                                    onClick={() => duplicateRound(roundIndex)}
                                    className="p-2 text-zinc-400 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                                    title="Duplicate this Round"
                                >
                                    <Copy className="w-5 h-5" />
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => removeRound(roundIndex)}
                                    disabled={rounds.length === 1}
                                    className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all disabled:opacity-0"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Exercises List */}
                        <div className="space-y-4">
                            {round.exercises.map((ex, exIndex) => (
                                <div key={ex.id} className="bg-white p-4 rounded-xl shadow-sm border border-zinc-100 grid grid-cols-2 md:grid-cols-4 gap-4 items-center group/ex relative">
                                    
                                    {/* Name */}
                                    <div className="col-span-2 md:col-span-1">
                                        <label className="block text-[10px] font-bold text-zinc-300 uppercase mb-1">Exercise</label>
                                        <div className="relative">
                                            <select 
                                                value={ex.name} 
                                                onChange={(e) => updateExercise(roundIndex, exIndex, 'name', e.target.value)}
                                                className="w-full bg-zinc-50 border border-zinc-100 rounded-lg py-2 px-2 font-bold text-zinc-900 focus:outline-none appearance-none cursor-pointer"
                                            >
                                                {EXERCISE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Kg */}
                                    <div>
                                        <label className="block text-[10px] font-bold text-zinc-300 uppercase mb-1 text-center">Kg</label>
                                        <input 
                                            type="number" 
                                            value={isNaN(ex.weight) ? '' : ex.weight}
                                            onChange={(e) => updateExercise(roundIndex, exIndex, 'weight', parseFloat(e.target.value))}
                                            className="w-full bg-zinc-50 border border-zinc-100 rounded-lg px-2 py-2 text-center font-mono text-sm focus:border-primary outline-none"
                                        />
                                    </div>

                                    {/* Reps */}
                                    <div>
                                        <label className="block text-[10px] font-bold text-zinc-300 uppercase mb-1 text-center">Reps</label>
                                        <input 
                                            type="number" 
                                            value={isNaN(ex.reps) ? '' : ex.reps}
                                            onChange={(e) => updateExercise(roundIndex, exIndex, 'reps', parseInt(e.target.value))}
                                            className="w-full bg-zinc-50 border border-zinc-100 rounded-lg px-2 py-2 text-center font-mono text-sm focus:border-primary outline-none"
                                        />
                                    </div>

                                    {/* Rest */}
                                    <div>
                                        <label className="block text-[10px] font-bold text-zinc-300 uppercase mb-1 text-center">Rest(s)</label>
                                        <input 
                                            type="number" 
                                            value={isNaN(ex.rest_time_seconds) ? '' : ex.rest_time_seconds}
                                            onChange={(e) => updateExercise(roundIndex, exIndex, 'rest_time_seconds', parseFloat(e.target.value))}
                                            className="w-full bg-zinc-50 border border-zinc-100 rounded-lg px-2 py-2 text-center font-mono text-sm focus:border-primary outline-none"
                                        />
                                    </div>

                                    {/* Remove Exercise */}
                                    <button 
                                        type="button" 
                                        onClick={() => removeExerciseFromRound(roundIndex, exIndex)}
                                        className="absolute -top-2 -right-2 p-1.5 bg-white border border-zinc-100 text-zinc-300 hover:text-red-500 rounded-full shadow-sm opacity-0 group-hover/ex:opacity-100 transition-opacity"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}

                            <button 
                                type="button" 
                                onClick={() => addExerciseToRound(roundIndex)}
                                className="w-full py-3 border border-dashed border-zinc-300 rounded-xl text-zinc-400 text-sm font-bold hover:text-primary hover:border-primary hover:bg-white transition-all flex items-center justify-center gap-2"
                            >
                                <Plus className="w-4 h-4" /> Add Exercise
                            </button>
                        </div>
                    </motion.div>
                ))}
                </AnimatePresence>

                <div className="flex gap-4 pt-4">
                    <button 
                        type="button" 
                        onClick={addRound}
                        className="flex-1 bg-white border border-dashed border-zinc-300 text-zinc-500 hover:text-primary hover:border-primary p-6 rounded-xl flex items-center justify-center gap-2 font-bold transition-all hover:bg-zinc-50 shadow-sm"
                    >
                        <Plus className="w-5 h-5" /> Add New Round
                    </button>
                </div>
            </div>
            
            <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-lg border-t border-zinc-200 flex justify-center z-50">
                    <button 
                    type="button" 
                    onClick={startTraining}
                    disabled={rounds.length === 0}
                    className="w-full max-w-md bg-zinc-900 hover:bg-black text-white font-black uppercase tracking-widest py-4 rounded-2xl shadow-xl transform transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                >
                    <PlayCircle className="w-6 h-6" /> START SESSION
                </button>
            </div>
        </div>
    );
}
