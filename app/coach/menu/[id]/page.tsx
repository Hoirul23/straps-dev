
'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Dumbbell, Clock, Repeat } from 'lucide-react';
import Link from 'next/link';

export default function MenuDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [menu, setMenu] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!params.id) return;

        async function fetchMenu() {
            try {
                const res = await fetch(`/api/menus/${params.id}`);
                if (!res.ok) throw new Error('Failed to fetch');
                const data = await res.json();
                
                // Parse exercises if string
                if (typeof data.exercises === 'string') {
                    data.exercises = JSON.parse(data.exercises);
                }
                setMenu(data);
            } catch (err) {
                console.error(err);
                // Optionally redirect or show error
            } finally {
                setIsLoading(false);
            }
        }

        fetchMenu();
    }, [params.id]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!menu) {
        return (
            <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center text-zinc-500">
                <p className="mb-4">Menu not found.</p>
                <Link href="/coach/dashboard" className="text-primary hover:underline">Return to Dashboard</Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground p-8 font-sans">
            <header className="max-w-4xl mx-auto mb-10">
                <Link 
                    href="/coach/dashboard" 
                    className="inline-flex items-center gap-2 text-zinc-500 hover:text-primary transition-colors mb-6 group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Back to Dashboard
                </Link>
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-4xl font-light text-zinc-900 tracking-tight mb-2">
                            {menu.name}
                        </h1>
                        <div className="flex items-center gap-4 text-sm text-zinc-500">
                            <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {new Date(menu.created_at).toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1">
                                <Dumbbell className="w-4 h-4" />
                                {menu.exercises?.length || 0} Exercises
                            </span>
                        </div>
                    </div>
                    
                    <button 
                        onClick={() => window.print()}
                        className="px-6 py-2 bg-white border border-zinc-200 text-zinc-700 rounded-lg hover:bg-zinc-50 text-sm font-medium shadow-sm transition-all"
                    >
                        Print Program
                    </button>
                </div>
            </header>

            <main className="max-w-4xl mx-auto">
                <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
                    <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center">
                        <h2 className="font-bold text-zinc-700 uppercase text-xs tracking-widest">Exercise Schedule</h2>
                        <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">ACTIVE</span>
                    </div>
                    
                    <div className="divide-y divide-zinc-100">
                        {menu.exercises?.map((ex: any, idx: number) => (
                            <div key={idx} className="p-6 hover:bg-zinc-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-full bg-blue-50 text-primary flex items-center justify-center font-bold text-lg shrink-0">
                                        {idx + 1}
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-zinc-900">{ex.name}</h3>
                                        <p className="text-sm text-zinc-500 mt-1">Target Muscles: General</p>
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-8 text-sm">
                                    <div className="flex flex-col items-center">
                                        <span className="text-zinc-400 text-xs uppercase tracking-wider font-bold mb-1">Sets</span>
                                        <span className="text-xl font-light text-zinc-900">{ex.sets}</span>
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <span className="text-zinc-400 text-xs uppercase tracking-wider font-bold mb-1">Reps</span>
                                        <span className="text-xl font-light text-zinc-900">{ex.reps}</span>
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <span className="text-zinc-400 text-xs uppercase tracking-wider font-bold mb-1">Weight</span>
                                        <span className="text-xl font-light text-zinc-900">{ex.weight}kg</span>
                                    </div>
                                    <div className="flex flex-col items-center w-20">
                                        <span className="text-zinc-400 text-xs uppercase tracking-wider font-bold mb-1 flex items-center gap-1"><Clock className="w-3 h-3"/> Rest</span>
                                        <span className="text-xl font-light text-zinc-900">{ex.rest_time_seconds || 0}s</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-6 bg-blue-50 rounded-xl border border-blue-100">
                        <h4 className="text-blue-900 font-bold mb-2">Coach Notes</h4>
                        <p className="text-blue-700/80 text-sm">Ensure client maintains proper form during the eccentric phase of each movement.</p>
                    </div>
                     <div className="p-6 bg-orange-50 rounded-xl border border-orange-100">
                        <h4 className="text-orange-900 font-bold mb-2">Safety Protocols</h4>
                        <p className="text-orange-700/80 text-sm">Stop immediately if pain is reported in joints. Monitor heart rate variations.</p>
                    </div>
                </div>
            </main>
        </div>
    );
}
