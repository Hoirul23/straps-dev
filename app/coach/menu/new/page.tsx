'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, Reorder } from 'framer-motion';
import { Plus, Trash2, Save, ArrowLeft, Copy, Layers, GripVertical } from 'lucide-react';
import Link from 'next/link';
import { useAuth, AuthProvider } from '@/lib/auth';

interface ExerciseItem {
    id: string; // Unique ID for UI keys
    name: string;
    reps: number;
    weight: number;
    rest_time_seconds: number;
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
    
    // Playlist State
    const [playlist, setPlaylist] = useState<ExerciseItem[]>([
        { id: 'init-1', name: 'Squat', reps: 10, weight: 20, rest_time_seconds: 30 }
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

    const addExercise = () => {
        setPlaylist([...playlist, {
            id: Math.random().toString(36).substr(2, 9),
            name: 'Bicep Curl',
            reps: 10,
            weight: 10,
            rest_time_seconds: 30
        }]);
    };

    const duplicateLast = () => {
        if (playlist.length === 0) return;
        const last = playlist[playlist.length - 1];
        setPlaylist([...playlist, { ...last, id: Math.random().toString(36).substr(2, 9) }]);
    };

    const duplicateAll = () => {
         // Clones the entire current list and appends it (Simulates "Add Next Round")
         const newItems = playlist.map(item => ({
             ...item,
             id: Math.random().toString(36).substr(2, 9)
         }));
         setPlaylist([...playlist, ...newItems]);
    };

    const removeExercise = (index: number) => {
        setPlaylist(playlist.filter((_, i) => i !== index));
    };

    const updateItem = (index: number, field: keyof ExerciseItem, value: any) => {
        const newPlaylist = [...playlist];
        newPlaylist[index] = { ...newPlaylist[index], [field]: value };
        setPlaylist(newPlaylist);
    };

    const moveItem = (fromIndex: number, direction: 'up' | 'down') => {
        if (direction === 'up' && fromIndex === 0) return;
        if (direction === 'down' && fromIndex === playlist.length - 1) return;

        const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
        const newPlaylist = [...playlist];
        const [movedItem] = newPlaylist.splice(fromIndex, 1);
        newPlaylist.splice(toIndex, 0, movedItem);
        setPlaylist(newPlaylist);
    };

    // --- Submit Logic ---

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            if (!selectedClient) {
                alert("Please select a client.");
                setIsSubmitting(false);
                return;
            }

            // ENRICHMENT ALGORITHM
            // Calculate 'set_index' and 'total_sets' for each item based on name recurrence.
            // Example: Squat, Bench, Squat -> Squat(1/2), Bench(1/1), Squat(2/2)
            
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

            const res = await fetch('/api/menus', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user-id': user?.id || ''
                },
                body: JSON.stringify({
                    name: menuName,
                    exercises: enrichedExercises,
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
        "Bicep Curl", "Hammer Curl", "Overhead Press", "Lateral Raises",
        "Squat", "Lunges", "Deadlift", 
        "Shoulder Flexion", "Shoulder Abduction", "Hip Abduction", "Knee Extension", "Front Raise", "Sit to Stand"
    ];

    return (
        <div className="min-h-screen bg-background text-foreground p-8 font-sans pb-32">
            <header className="max-w-3xl mx-auto mb-10 flex items-center gap-6">
                <Link href="/coach/dashboard" className="p-3 bg-white hover:bg-zinc-100 rounded-full transition-colors border border-zinc-200">
                    <ArrowLeft className="w-5 h-5 text-zinc-600" />
                </Link>
                <div>
                    <h1 className="text-3xl font-light text-zinc-900 tracking-wide">
                        Program <span className="font-bold text-primary">Builder</span>
                    </h1>
                    <p className="text-zinc-500 text-sm mt-1">Design the workout flow step-by-step.</p>
                </div>
            </header>

            <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
                 {/* Meta Info */}
                 <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm mb-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Program Name</label>
                            <input 
                                type="text" 
                                placeholder="e.g. Endurance Circuit" 
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

                {/* Playlist Builder */}
                <div className="space-y-4">
                    <div className="flex justify-between items-end mb-2 px-2">
                        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Workout Sequence ({playlist.length} steps)</h3>
                        <div className="flex gap-2">
                            <button 
                                type="button" 
                                onClick={duplicateAll}
                                className="text-xs font-bold text-zinc-500 hover:text-zinc-800 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                            >
                                <Copy className="w-3 h-3" /> Multiply Rounds
                            </button>
                        </div>
                    </div>

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
                                        className="w-full bg-transparent font-bold text-zinc-900 focus:outline-none cursor-pointer appearance-none py-1"
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
                                    onClick={() => moveItem(index, 'up')}
                                    disabled={index === 0}
                                    className="p-1.5 text-zinc-300 hover:text-zinc-600 disabled:opacity-30"
                                >
                                    ▲
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => moveItem(index, 'down')}
                                    disabled={index === playlist.length - 1}
                                    className="p-1.5 text-zinc-300 hover:text-zinc-600 disabled:opacity-30"
                                >
                                    ▼
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => removeExercise(index)}
                                    className="p-1.5 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-2"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </motion.div>
                    );
                    })}

                    <div className="flex gap-4 pt-4">
                        <button 
                            type="button" 
                            onClick={addExercise}
                            className="flex-1 bg-white border border-dashed border-zinc-300 text-zinc-500 hover:text-primary hover:border-primary p-4 rounded-xl flex items-center justify-center gap-2 font-bold transition-all hover:bg-blue-50/50"
                        >
                            <Plus className="w-5 h-5" /> Add Next Exercise
                        </button>
                    </div>
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
