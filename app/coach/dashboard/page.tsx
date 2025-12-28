
'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, User, Clock, ShieldAlert, Plus } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
    const [greeting, setGreeting] = useState('');
    const [stats, setStats] = useState({
        totalMenus: 0,
        totalSessions: 0, // All time
        sessionsToday: 0,
        sessionsToday: 0,
        sessionTimeToday: '0m',
        recentMenus: [] as any[],
        recentRecaps: [] as any[]
    });
    
    useEffect(() => {
        const hour = new Date().getHours();
        if (hour < 12) setGreeting('Good Morning');
        else if (hour < 18) setGreeting('Good Afternoon');
        else setGreeting('Good Evening');
        
        async function loadData() {
            try {
                // Fetch Recaps
                const resRecaps = await fetch('/api/recap');
                const recaps = await resRecaps.json();

                // Fetch Menus
                const resMenus = await fetch('/api/menus');
                const menus = await resMenus.json();
                
                if (Array.isArray(recaps) && Array.isArray(menus)) {
                    const today = new Date().toDateString();
                    const todaysRecaps = recaps.filter((r: any) => new Date(r.completed_at).toDateString() === today);
                    
                    const timeTodayMinutes = todaysRecaps.reduce((acc: number, r: any) => {
                        try {
                            const summary = typeof r.summary === 'string' ? JSON.parse(r.summary) : r.summary;
                            if (summary?.startTime && summary?.endTime) {
                                const durationMs = new Date(summary.endTime).getTime() - new Date(summary.startTime).getTime();
                                return acc + (durationMs / 1000 / 60);
                            }
                        } catch (e) { console.warn("Error parsing summary", e); }
                        return acc;
                    }, 0);
                    
                    setStats({
                        totalMenus: menus.length,
                        totalSessions: recaps.length,
                        sessionsToday: todaysRecaps.length,
                        sessionTimeToday: `${Math.round(timeTodayMinutes)}m`,
                        recentMenus: menus.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5),
                        recentRecaps: recaps.sort((a: any, b: any) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()).slice(0, 5)
                    });
                }
            } catch (e) {
                console.error("Failed to load dashboard stats", e);
            }
        }
        loadData();
    }, []);

    // Staggered animation variants
    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };
    
    const item = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <div className="min-h-screen bg-background text-foreground p-10 font-sans selection:bg-primary/30">
            <header className="mb-16 border-b border-zinc-200 pb-8 flex flex-col md:flex-row justify-between items-end gap-6">
                <div>
                    <h1 className="text-5xl font-light tracking-tight text-zinc-800 mb-2">
                        {greeting}, <span className="font-bold text-primary">STRAPS</span> Coach.
                    </h1>
                    <p className="text-secondary text-sm tracking-wide mt-2 flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></span>
                        SYSTEM ACTIVE
                    </p>
                </div>
                <Link href="/coach/menu/new" className="bg-primary hover:bg-primary/90 text-black px-8 py-3 rounded-full font-bold transition-all hover:scale-105 shadow-[0_0_20px_-5px_var(--color-primary)] flex items-center gap-2 text-sm tracking-wide">
                        <Plus className="w-4 h-4" /> NEW PROGRAM
                </Link>
            </header>

            <motion.div 
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
                variants={container}
                initial="hidden"
                animate="show"
            >
                <StatsCard 
                    title="Total Training Menus" 
                    value={stats.totalMenus.toString()} 
                    icon={<Activity className="text-blue-400" />} 
                    variant={item}
                />
                <StatsCard 
                    title="Total Sessions (All Time)" 
                    value={stats.totalSessions.toString()} 
                    icon={<User className="text-purple-400" />} 
                    variant={item}
                />
                 <StatsCard 
                    title="Sessions Today" 
                    value={stats.sessionsToday.toString()} 
                    icon={<ShieldAlert className="text-green-400" />} 
                    variant={item}
                />
                <StatsCard 
                    title="Session Time Today" 
                    value={stats.sessionTimeToday} 
                    icon={<Clock className="text-pink-400" />} 
                    variant={item}
                />
            </motion.div>

             <motion.div 
                className="mt-12 bg-white border border-zinc-200 rounded-xl p-6 shadow-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
            >
                <h2 className="text-xl font-bold mb-4">Live Activity Feed</h2>
                <div className="space-y-4">
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                        <span className="w-16">Now</span>
                        <span className="text-zinc-900">System monitoring active...</span>
                    </div>
                </div>
            </motion.div>

            {/* Recent Menus List */}
            <motion.div 
                className="mt-6 bg-white border border-zinc-200 rounded-xl p-6 shadow-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
            >
                <h2 className="text-xl font-bold mb-4 text-zinc-900">Recent Programs</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-zinc-100 text-zinc-500 text-sm uppercasetracking-wider">
                                <th className="pb-3 font-medium">Program Name</th>
                                <th className="pb-3 font-medium">Created At</th>
                                <th className="pb-3 font-medium">Exercises</th>
                                <th className="pb-3 font-medium">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                            {stats.recentMenus.map((menu: any) => (
                                <tr key={menu.id} className="group hover:bg-zinc-50 transition-colors">
                                    <td className="py-4 font-medium text-zinc-900">{menu.name}</td>
                                    <td className="py-4 text-zinc-500 text-sm">
                                        {new Date(menu.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="py-4 text-zinc-500 text-sm">
                                        {Array.isArray(menu.exercises) ? menu.exercises.length : JSON.parse(menu.exercises as string).length} exercises
                                    </td>
                                    <td className="py-4">
                                        <Link 
                                            href={`/coach/menu/${menu.id}`}
                                            className="text-primary hover:text-blue-700 text-sm font-bold flex items-center gap-1"
                                        >
                                            View Details
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                            {stats.recentMenus.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="py-8 text-center text-zinc-400 italic">No programs created yet.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

            </motion.div>

            {/* Recent Recaps List */}
            <motion.div 
                className="mt-6 bg-white border border-zinc-200 rounded-xl p-6 shadow-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
            >
                <h2 className="text-xl font-bold mb-4 text-zinc-900">Recent Activity Reports</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-zinc-100 text-zinc-500 text-sm uppercasetracking-wider">
                                <th className="pb-3 font-medium">Date</th>
                                <th className="pb-3 font-medium">Program ID</th>
                                <th className="pb-3 font-medium">Status</th>
                                <th className="pb-3 font-medium">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                            {stats.recentRecaps.map((recap: any) => (
                                <tr key={recap.id} className="group hover:bg-zinc-50 transition-colors">
                                    <td className="py-4 text-zinc-500 text-sm">
                                        {new Date(recap.completed_at).toLocaleString()}
                                    </td>
                                    <td className="py-4 font-medium text-zinc-900">
                                        Menu #{recap.menu_id}
                                    </td>
                                    <td className="py-4">
                                        <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">
                                            COMPLETED
                                        </span>
                                    </td>
                                    <td className="py-4">
                                        <Link 
                                            href={`/coach/recap/${recap.id}`}
                                            className="text-primary hover:text-blue-700 text-sm font-bold flex items-center gap-1"
                                        >
                                            View Report
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                            {stats.recentRecaps.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="py-8 text-center text-zinc-400 italic">No activity recorded yet.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </motion.div>
        </div>
    );
}

function StatsCard({ title, value, icon, variant }: any) {
    return (
        <motion.div 
            variants={variant}
            className="p-8 rounded-3xl bg-white border border-zinc-200 hover:border-primary/50 transition-all group relative overflow-hidden shadow-sm hover:shadow-md"
        >
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500 grayscale group-hover:grayscale-0">
                {icon}
            </div>
            <div className="relative z-10">
                <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-[0.2em] mb-3">{title}</h3>
                <div className="text-5xl font-light text-zinc-900 tracking-tighter">{value}</div>
            </div>
        </motion.div>
    );
}
