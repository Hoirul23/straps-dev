
'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, User, Clock, CheckCircle } from 'lucide-react';
import Link from 'next/link';

export default function RecapDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [recap, setRecap] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!params.id) return;

        async function fetchRecap() {
            try {
                const res = await fetch(`/api/recap/${params.id}`);
                if (!res.ok) throw new Error('Failed to fetch');
                const data = await res.json();
                
                // Parse summary/exercises if string (though usually JSON in Prisma)
                // Assuming Prisma handles JSON parsing automatically for `details` field
                setRecap(data);
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }

        fetchRecap();
    }, [params.id]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!recap) {
        return (
            <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center text-zinc-500">
                <p className="mb-4">Report not found.</p>
                <Link href="/coach/dashboard" className="text-primary hover:underline">Return to Dashboard</Link>
            </div>
        );
    }

    const { summary, training_menus } = recap;
    const exercises = summary?.exercises || [];

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
                            Session Report <span className="text-zinc-400">#{recap.id}</span>
                        </h1>
                        <div className="flex items-center gap-4 text-sm text-zinc-500">
                            <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {new Date(recap.completed_at).toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1">
                                <User className="w-4 h-4" />
                                {training_menus ? training_menus.name : `Menu #${recap.menu_id}`}
                            </span>
                             <span className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {new Date(recap.completed_at).toLocaleTimeString()}
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto space-y-8">
                {/* Performance Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200">
                         <h2 className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-4">Completion Status</h2>
                         <div className="flex items-center gap-3">
                            <CheckCircle className="w-10 h-10 text-green-500" />
                            <div>
                                <div className="text-2xl font-bold text-zinc-900">Completed</div>
                                <div className="text-sm text-zinc-500">All exercises finished</div>
                            </div>
                         </div>
                    </div>
                    {/* Placeholder for future detailed analysis */}
                     <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200 opacity-60 grayscale">
                         <h2 className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-4">Total Load</h2>
                         <div className="text-3xl font-light text-zinc-800">-- kg</div>
                         <div className="text-xs text-blue-500 font-bold uppercase mt-2">Analysis Coming Soon</div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
                    <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
                        <h2 className="font-bold text-zinc-700 uppercase text-xs tracking-widest">Exercise Log</h2>
                    </div>
                    
                    <div className="divide-y divide-zinc-100">
                        {exercises.map((ex: any, idx: number) => (
                            <div key={idx} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:bg-zinc-50 transition-colors">
                                <div className="flex items-start gap-4">
                                    <div className="w-8 h-8 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center font-bold text-sm shrink-0">
                                        {idx + 1}
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-zinc-900">{ex.name}</h3>
                                        <div className="flex gap-2 text-xs font-medium uppercase tracking-wider text-zinc-400 mt-1">
                                            <span>{ex.sets} Sets</span>
                                            <span>•</span>
                                            <span>{ex.reps} Reps</span>
                                            <span>•</span>
                                            <span>{ex.weight} kg</span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                     <span className="px-3 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-bold uppercase border border-green-100">
                                        Target Met
                                     </span>
                                </div>
                            </div>
                        ))}
                         {exercises.length === 0 && (
                            <div className="p-8 text-center text-zinc-400 italic">
                                No exercise details available for this session.
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
