'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Plus, Trash2, Save, ArrowLeft, Copy, Layers, GripVertical } from 'lucide-react';
import Link from 'next/link';
import { useAuth, AuthProvider } from '@/lib/auth';

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

export default function CreateMenuPageWrap() {
    return (
        <AuthProvider>
            <CreateMenuPage />
        </AuthProvider>
    );
}

function CreateMenuPage() {
    const router = useRouter();
    const { user } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [menuName, setMenuName] = useState('');
    
    // Round-Based State
    const [rounds, setRounds] = useState<RoundData[]>([
        { 
            id: 'round-1', 
            exercises: [
                { id: 'ex-1', name: 'Squat', reps: 10, weight: 20, rest_time_seconds: 30 }
            ]
        }
    ]);
    
    const [clients, setClients] = useState<any[]>([]);
    const [selectedClient, setSelectedClient] = useState('');

    useEffect(() => {
        if (user) {
            fetch(`/api/users?coachId=${encodeURIComponent(user.id)}`)
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) setClients(data);
                });
        }
    }, [user]);

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
        
        setRounds([...rounds, {
            id: Math.random().toString(36).substr(2, 9),
            exercises: newExercises
        }]);
    };

    const removeRound = (index: number) => {
        setRounds(rounds.filter((_, i) => i !== index));
    };

    const addExerciseToRound = (roundIndex: number) => {
        const newRounds = [...rounds];
        newRounds[roundIndex].exercises.push({
            id: Math.random().toString(36).substr(2, 9),
            name: 'Bicep Curl', 
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

    // --- Submit Logic (Flattening) ---

    // We assume the user creates rounds sequentially: Set 1, Set 2.
    // So distinct Sets of "Squat" will imply Set 1, Set 2 logic naturally in the list.
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            if (!selectedClient) {
                alert("Please select a client.");
                setIsSubmitting(false);
                return;
            }

            // FLATTEN ROUNDS
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
            rounds.forEach((round, roundIndex) => {
                round.exercises.forEach(ex => {
                    counts[ex.name] = (counts[ex.name] || 0) + 1;
                    
                    flatList.push({
                        name: ex.name,
                        reps: ex.reps,
                        weight: ex.weight,
                        rest_time_seconds: ex.rest_time_seconds,
                        // This corresponds to "Which instance of Squat is this?" -> Set Number
                        set_index: counts[ex.name], 
                        total_sets: totals[ex.name]
                    });
                });
            });

            const res = await fetch('/api/menus', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user-id': user?.id || ''
                },
                body: JSON.stringify({
                    name: menuName,
                    exercises: flatList,
                    client_id: selectedClient
                })
            });

            if (!res.ok) throw new Error('Failed');
            router.push('/coach/dashboard');
        } catch (error) {
            alert('Error creating menu');
        } finally {
            setIsSubmitting(false);
        }
    };

    const EXERCISE_OPTIONS = [
        "Bicep Curl", "Hammer Curl", "Squat", "Deadlift", "Lunges", "Overhead Press", "Lateral Raises"
    ];

    return (
        <div className="min-h-screen bg-background text-foreground p-8 font-sans pb-32">
            <header className="max-w-4xl mx-auto mb-10 flex items-center gap-6">
                <Link href="/coach/dashboard" className="p-3 bg-white hover:bg-zinc-100 rounded-full transition-colors border border-zinc-200 shadow-sm">
                    <ArrowLeft className="w-5 h-5 text-zinc-600" />
                </Link>
                <div>
                    <h1 className="text-3xl font-light text-zinc-900 tracking-wide">
                        Program <span className="font-bold text-primary">Composer</span>
                    </h1>
                    <p className="text-zinc-500 text-sm mt-1">Design training blocks set-by-set.</p>
                </div>
            </header>

            <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-8">
                 {/* Meta Info */}
                 <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Program Name</label>
                            <input 
                                type="text" 
                                placeholder="e.g. Hypertrophy A" 
                                value={menuName}
                                onChange={(e) => setMenuName(e.target.value)}
                                className="w-full text-xl font-bold border-b-2 border-zinc-100 focus:border-primary outline-none py-2 transition-colors placeholder:font-normal"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Assign To Client</label>
                            <select
                                value={selectedClient}
                                onChange={(e) => setSelectedClient(e.target.value)}
                                className="w-full text-lg border-b-2 border-zinc-100 focus:border-primary outline-none py-2 bg-transparent transition-colors"
                            >
                                <option value="" disabled>Select a client...</option>
                                {clients.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Rounds */}
                <div className="grid grid-cols-1 gap-6">
                    {rounds.map((round, roundIndex) => (
                        <motion.div 
                            key={round.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-zinc-50 border border-zinc-200 rounded-3xl p-6 md:p-8 relative shadow-sm group/round"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-black text-zinc-300 uppercase tracking-tighter flex items-center gap-2">
                                    <span className="text-4xl text-zinc-200">#{ (roundIndex + 1).toString().padStart(2, '0') }</span>
                                    SET
                                </h3>
                                
                                <div className="flex items-center gap-2">
                                    <button 
                                        type="button" 
                                        onClick={() => duplicateRound(roundIndex)}
                                        className="p-2 text-zinc-400 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                                        title="Duplicate this Set"
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

                            {/* Exercises in Round */}
                            <div className="space-y-3">
                                {round.exercises.map((ex, exIndex) => (
                                    <div key={ex.id} className="bg-white p-4 rounded-xl shadow-sm border border-zinc-100 flex flex-col md:flex-row gap-4 items-center group/ex">
                                        <div className="flex-1 w-full">
                                            <label className="block text-[10px] font-bold text-zinc-300 uppercase mb-1 md:hidden">Exercise</label>
                                            <select 
                                                value={ex.name} 
                                                onChange={(e) => updateExercise(roundIndex, exIndex, 'name', e.target.value)}
                                                className="w-full bg-transparent font-bold text-zinc-900 focus:outline-none cursor-pointer"
                                            >
                                                {EXERCISE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        </div>
                                         <div className="flex gap-2 w-full md:w-auto">
                                            <div>
                                                <label className="block text-[10px] font-bold text-zinc-300 uppercase mb-1 text-center">Reps</label>
                                                <input 
                                                    type="number" 
                                                    value={isNaN(ex.reps) ? '' : ex.reps}
                                                    onChange={(e) => updateExercise(roundIndex, exIndex, 'reps', parseInt(e.target.value))}
                                                    className="w-full md:w-16 bg-zinc-50 border border-zinc-100 rounded-lg px-2 py-1.5 text-center font-mono text-sm focus:border-primary outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-zinc-300 uppercase mb-1 text-center">Kg</label>
                                                <input 
                                                    type="number" 
                                                    value={isNaN(ex.weight) ? '' : ex.weight}
                                                    onChange={(e) => updateExercise(roundIndex, exIndex, 'weight', parseFloat(e.target.value))}
                                                    className="w-full md:w-16 bg-zinc-50 border border-zinc-100 rounded-lg px-2 py-1.5 text-center font-mono text-sm focus:border-primary outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-zinc-300 uppercase mb-1 text-center">Rest</label>
                                                <input 
                                                    type="number" 
                                                    value={isNaN(ex.rest_time_seconds) ? '' : ex.rest_time_seconds}
                                                    onChange={(e) => updateExercise(roundIndex, exIndex, 'rest_time_seconds', parseFloat(e.target.value))}
                                                    className="w-full md:w-16 bg-zinc-50 border border-zinc-100 rounded-lg px-2 py-1.5 text-center font-mono text-sm focus:border-primary outline-none"
                                                />
                                            </div>
                                        </div>
                                        <button 
                                            type="button" 
                                            onClick={() => removeExerciseFromRound(roundIndex, exIndex)}
                                            className="p-2 text-zinc-300 hover:text-red-500 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                
                                <button 
                                    type="button" 
                                    onClick={() => addExerciseToRound(roundIndex)}
                                    className="w-full py-3 border-2 border-dashed border-zinc-200 rounded-xl text-zinc-400 hover:text-primary hover:border-primary hover:bg-blue-50/50 transition-all font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                                >
                                    <Plus className="w-4 h-4" /> Add Exercise
                                </button>
                            </div>

                        </motion.div>
                    ))}
                </div>

                <div className="flex justify-center py-6">
                    <button 
                        type="button" 
                        onClick={addRound}
                        className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 px-8 py-3 rounded-full font-bold shadow-sm hover:scale-105 transition-all flex items-center gap-2"
                    >
                        <Plus className="w-5 h-5" /> ADD NEW SET
                    </button>
                 </div>

                <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-lg border-t border-zinc-200 flex justify-center z-50">
                     <button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="w-full max-w-md bg-primary hover:bg-primary/90 text-black font-black uppercase tracking-widest py-4 rounded-2xl shadow-[0_0_30px_-5px_var(--color-primary)] transform transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                        {isSubmitting ? 'Saving...' : 'Deploy Program'}
                    </button>
                </div>

            </form>
        </div>
    );
}
