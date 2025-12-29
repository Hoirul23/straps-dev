'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Plus, Trash2, Save, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useAuth, AuthProvider } from '@/lib/auth';

interface Exercise {
    name: string;
    sets: number;
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
    const [exercises, setExercises] = useState<Exercise[]>([
        { name: 'Bicep Curl', sets: 3, reps: 10, weight: 10, rest_time_seconds: 0 }
    ]);
    const [clients, setClients] = useState<any[]>([]);
    const [selectedClient, setSelectedClient] = useState('');

    useEffect(() => {
        if (user) {
            // Fetch clients
            fetch(`/api/users?coachId=${encodeURIComponent(user.id)}`)
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) setClients(data);
                });
        }
    }, [user]);

    const handleExerciseChange = (index: number, field: string, value: any) => {
        const newExercises = [...exercises];
        (newExercises[index] as any)[field] = value;
        setExercises(newExercises);
    };

    const addExercise = () => {
        setExercises([...exercises, { name: 'Squat', sets: 3, reps: 10, weight: 20, rest_time_seconds: 0 }]);
    };

    const removeExercise = (index: number) => {
        const newExercises = exercises.filter((_, i) => i !== index);
        setExercises(newExercises);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            // Validation
            if (!selectedClient) {
                alert("Please select a client to assign this menu to.");
                setIsSubmitting(false);
                return;
            }
            if (!user?.id) {
                alert("User not authenticated.");
                setIsSubmitting(false);
                return;
            }

            const res = await fetch('/api/menus', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user-id': user.id
                },
                body: JSON.stringify({
                    name: menuName,
                    exercises: exercises,
                    client_id: selectedClient
                })
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || 'Failed to create menu');
            }

            router.push('/coach/dashboard');
        } catch (error: any) {
            alert('Failed to create menu: ' + error.message);
            console.error(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground p-8 font-sans">
            <header className="max-w-4xl mx-auto mb-12 flex items-center gap-6">
                <Link href="/coach/dashboard" className="p-3 bg-white hover:bg-zinc-100 rounded-full transition-colors text-zinc-600 hover:text-zinc-900 border border-zinc-200 shadow-sm">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h1 className="text-3xl font-light text-zinc-900 tracking-wide">
                        Create <span className="font-bold text-primary">STRAPS Program</span>
                    </h1>
                    <p className="text-zinc-500 text-sm mt-1 tracking-wide">Design the optimal progression.</p>
                </div>
            </header>

            <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-8">
                <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm mb-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Program Name</label>
                            <input 
                                type="text" 
                                placeholder="e.g. Morning Mobility" 
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
                                    <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-center px-2">
                        <h3 className="text-xl font-semibold">Exercises</h3>
                        <button 
                            type="button" 
                            onClick={addExercise}
                            className="flex items-center gap-2 text-sm font-medium text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-4 py-2 rounded-lg transition-colors border border-indigo-500/20"
                        >
                            <Plus className="w-4 h-4" /> Add Exercise
                        </button>
                    </div>

                    {exercises.map((ex, index) => (
                        <motion.div 
                            key={index}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white border border-zinc-200 rounded-2xl p-6 relative group hover:border-zinc-300 transition-all shadow-sm"
                        >
                            <button 
                                type="button" 
                                onClick={() => removeExercise(index)}
                                className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>

                            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                                <div className="md:col-span-3">
                                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Type</label>
                                    <select 
                                        value={ex.name} 
                                        onChange={(e) => handleExerciseChange(index, 'name', e.target.value)}
                                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors appearance-none text-zinc-900"
                                    >
                                        <option value="Bicep Curl">Bicep Curl</option>
                                        <option value="Hammer Curl">Hammer Curl</option>
                                        <option value="Overhead Press">Overhead Press</option>
                                        <option value="Lateral Raises">Lateral Raises</option>
                                        <option value="Squat">Squat</option>
                                        <option value="Lunges">Lunges</option>
                                        <option value="Deadlift">Deadlift</option>
                                        <option value="Shoulder Flexion">Shoulder Flexion</option>
                                        <option value="Shoulder Abduction">Shoulder Abduction</option>
                                        <option value="Hip Abduction">Hip Abduction</option>
                                        <option value="Knee Extension">Knee Extension</option>
                                        <option value="Front Raise">Front Raise</option>
                                        <option value="Sit to Stand">Sit to Stand</option>
                                    </select>
                                </div>
                                <div className="md:col-span-1">
                                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Sets</label>
                                    <input 
                                        type="number" 
                                        min="1"
                                        value={ex.sets}
                                        onChange={(e) => handleExerciseChange(index, 'sets', parseInt(e.target.value))}
                                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2 py-3 text-center focus:outline-none focus:border-indigo-500 transition-colors text-zinc-900"
                                    />
                                </div>
                                <div className="md:col-span-1">
                                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Reps</label>
                                    <input 
                                        type="number" 
                                        min="1"
                                        value={ex.reps}
                                        onChange={(e) => handleExerciseChange(index, 'reps', parseInt(e.target.value))}
                                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2 py-3 text-center focus:outline-none focus:border-indigo-500 transition-colors text-zinc-900"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Weight</label>
                                    <input 
                                        type="number" 
                                        min="0"
                                        value={ex.weight}
                                        onChange={(e) => handleExerciseChange(index, 'weight', parseFloat(e.target.value))}
                                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors text-zinc-900"
                                    />
                                </div>
                                <div className="md:col-span-3">
                                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Rest (s)</label>
                                    <input 
                                        type="number" 
                                        min="0"
                                        value={(ex as any).rest_time_seconds || 0}
                                        onChange={(e) => handleExerciseChange(index, 'rest_time_seconds', parseFloat(e.target.value))}
                                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors text-zinc-900"
                                        placeholder="Rest per set"
                                    />
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                <div className="pt-8 pb-32">
                    <button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="w-full bg-primary hover:bg-primary/90 text-black font-black uppercase tracking-widest py-5 rounded-2xl shadow-[0_0_30px_-5px_var(--color-primary)] transform transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                        {isSubmitting ? (
                            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <Save className="w-5 h-5" />
                                Send Plan to Client
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>

    );
}
