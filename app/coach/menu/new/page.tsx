'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Plus, Trash2, Save, ArrowLeft, Copy } from 'lucide-react';
import Link from 'next/link';
import { useAuth, AuthProvider } from '@/lib/auth';

interface SetData {
    reps: number;
    weight: number;
    rest_time_seconds: number;
}

interface ExerciseGroup {
    id: string; // Internal ID for keys
    name: string;
    sets: SetData[];
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
    
    // Initial State: One Group with One Set
    const [groups, setGroups] = useState<ExerciseGroup[]>([
        { 
            id: '1', 
            name: 'Bicep Curl', 
            sets: [{ reps: 10, weight: 10, rest_time_seconds: 30 }] 
        }
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

    // --- State Management ---

    const addGroup = () => {
        setGroups([...groups, {
            id: Math.random().toString(36).substr(2, 9),
            name: 'Squat',
            sets: [{ reps: 10, weight: 20, rest_time_seconds: 60 }]
        }]);
    };

    const removeGroup = (index: number) => {
        setGroups(groups.filter((_, i) => i !== index));
    };

    const updateGroupName = (index: number, name: string) => {
        const newGroups = [...groups];
        newGroups[index].name = name;
        setGroups(newGroups);
    };

    const addSet = (groupIndex: number) => {
        const newGroups = [...groups];
        const previousSet = newGroups[groupIndex].sets[newGroups[groupIndex].sets.length - 1];
        // Clone previous set values for convenience
        newGroups[groupIndex].sets.push({ ...previousSet });
        setGroups(newGroups);
    };

    const removeSet = (groupIndex: number, setIndex: number) => {
        const newGroups = [...groups];
        if (newGroups[groupIndex].sets.length > 1) {
            newGroups[groupIndex].sets = newGroups[groupIndex].sets.filter((_, i) => i !== setIndex);
            setGroups(newGroups);
        }
    };

    const updateSet = (groupIndex: number, setIndex: number, field: keyof SetData, value: number) => {
        const newGroups = [...groups];
        newGroups[groupIndex].sets[setIndex][field] = value;
        setGroups(newGroups);
    };

    // --- Submit Logic (Flammable Flattening) ---

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
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

            // FLATTEN LOGIC: Interleave sets for Circuit Interleaved behavior
            // or just flatten them if sequential? 
            // User requested "Circuit Mode" is now standard.
            // Algorithm: 
            // 1. Find max set count.
            // 2. Iterate 1..Max.
            // 3. For each group, take Set[i] if exists.
            
            const flatExercises: any[] = [];
            const maxSets = Math.max(...groups.map(g => g.sets.length));

            for (let i = 0; i < maxSets; i++) {
                for (const group of groups) {
                    if (group.sets[i]) {
                        flatExercises.push({
                            name: group.name,
                            reps: group.sets[i].reps,
                            weight: group.sets[i].weight,
                            rest_time_seconds: group.sets[i].rest_time_seconds,
                            // Legacy fields for context if needed, but client relies on set_index now
                            sets: 1, 
                            set_index: i + 1,
                            total_sets: group.sets.length
                        });
                    }
                }
            }

            const res = await fetch('/api/menus', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user-id': user.id
                },
                body: JSON.stringify({
                    name: menuName,
                    exercises: flatExercises, // Sending the flat playlist
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

    const EXERCISE_OPTIONS = [
        "Bicep Curl", "Hammer Curl", "Overhead Press", "Lateral Raises",
        "Squat", "Lunges", "Deadlift", 
        "Shoulder Flexion", "Shoulder Abduction", "Hip Abduction", "Knee Extension", "Front Raise", "Sit to Stand"
    ];

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
                    <p className="text-zinc-500 text-sm mt-1 tracking-wide">Design per-set customized circuits.</p>
                </div>
            </header>

            <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-8">
                {/* Meta Info */}
                <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm mb-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Program Name</label>
                            <input 
                                type="text" 
                                placeholder="e.g. Full Body Circuit" 
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

                {/* Exercise Groups */}
                <div className="space-y-6">
                    <div className="flex justify-between items-center px-2">
                        <h3 className="text-xl font-semibold">Circuit Definition</h3>
                        <button 
                            type="button" 
                            onClick={addGroup}
                            className="flex items-center gap-2 text-sm font-medium text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-4 py-2 rounded-lg transition-colors border border-indigo-500/20"
                        >
                            <Plus className="w-4 h-4" /> Add Exercise Type
                        </button>
                    </div>

                    {groups.map((group, groupIndex) => (
                        <motion.div 
                            key={group.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white border border-zinc-200 rounded-2xl p-6 relative group transition-all shadow-sm"
                        >
                            <button 
                                type="button" 
                                onClick={() => removeGroup(groupIndex)}
                                className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                title="Remove Exercise Group"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>

                            <div className="mb-6">
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Exercise</label>
                                <select 
                                    value={group.name} 
                                    onChange={(e) => updateGroupName(groupIndex, e.target.value)}
                                    className="w-full md:w-1/2 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors appearance-none text-zinc-900 font-bold"
                                >
                                    {EXERCISE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>

                            {/* Sets Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="text-xs text-zinc-400 uppercase tracking-wider border-b border-zinc-100">
                                            <th className="pb-2 font-medium w-16">Set</th>
                                            <th className="pb-2 font-medium">Reps</th>
                                            <th className="pb-2 font-medium">Weight (kg)</th>
                                            <th className="pb-2 font-medium">Rest (s)</th>
                                            <th className="pb-2 font-medium w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-50">
                                        {group.sets.map((set, setIndex) => (
                                            <tr key={setIndex} className="group/row">
                                                <td className="py-3 text-zinc-500 font-mono text-sm">
                                                    #{setIndex + 1}
                                                </td>
                                                <td className="py-3 px-2">
                                                    <input 
                                                        type="number" 
                                                        value={isNaN(set.reps) ? '' : set.reps}
                                                        onChange={(e) => updateSet(groupIndex, setIndex, 'reps', parseInt(e.target.value))}
                                                        className="w-20 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-center"
                                                    />
                                                </td>
                                                <td className="py-3 px-2">
                                                    <input 
                                                        type="number" 
                                                        value={isNaN(set.weight) ? '' : set.weight}
                                                        onChange={(e) => updateSet(groupIndex, setIndex, 'weight', parseFloat(e.target.value))}
                                                        className="w-20 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-center"
                                                    />
                                                </td>
                                                <td className="py-3 px-2">
                                                    <input 
                                                        type="number" 
                                                        value={isNaN(set.rest_time_seconds) ? '' : set.rest_time_seconds}
                                                        onChange={(e) => updateSet(groupIndex, setIndex, 'rest_time_seconds', parseFloat(e.target.value))}
                                                        className="w-20 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-center"
                                                    />
                                                </td>
                                                <td className="py-3 text-right">
                                                    <button 
                                                        type="button" 
                                                        onClick={() => removeSet(groupIndex, setIndex)}
                                                        className="text-zinc-300 hover:text-red-500 transition-colors"
                                                        disabled={group.sets.length === 1}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            
                            <div className="mt-4">
                                <button 
                                    type="button" 
                                    onClick={() => addSet(groupIndex)}
                                    className="text-xs font-bold text-primary hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-3 py-2 rounded-lg transition-colors"
                                >
                                    <Plus className="w-3 h-3" /> Add Set
                                </button>
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
                                Send Program
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
