
'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, User, Clock, ShieldAlert, Plus, Users, UserPlus } from 'lucide-react';
import Link from 'next/link';

import { AuthProvider, useAuth } from '@/lib/auth';

export default function DashboardPageWrap() {
    return (
        <AuthProvider>
            <DashboardPage />
        </AuthProvider>
    );
}

function DashboardPage() {
    const { user } = useAuth();
    const [greeting, setGreeting] = useState('');
    const [stats, setStats] = useState({
        totalMenus: 0,
        totalSessions: 0, // All time
        sessionsToday: 0,

        recentMenus: [] as any[],
        recentRecaps: [] as any[],
        linkedClients: [] as any[]
    });

    // Add Client State
    const [isAddingClient, setIsAddingClient] = useState(false);
    const [clientIdToAdd, setClientIdToAdd] = useState('');
    const [addClientStatus, setAddClientStatus] = useState('');

    const loadData = React.useCallback(async () => {
        if (!user) return;
        
        // Security Check
        if (user.role !== 'COACH') {
            window.location.href = '/'; 
            return;
        }

        try {
            const headers = { 'x-user-id': user.id };
            
            // Fetch Recaps
            const resRecaps = await fetch('/api/recap', { headers });
            const recaps = await resRecaps.json();

            // Fetch Menus
            const resMenus = await fetch('/api/menus', { headers });
            const menus = await resMenus.json();

            // Fetch Linked Clients
            const resClients = await fetch(`/api/users?coachId=${user.id}`);
            const clients = await resClients.json();
            
            if (Array.isArray(recaps) && Array.isArray(menus)) {
                const today = new Date().toDateString();
                const todaysRecaps = recaps.filter((r: any) => new Date(r.completed_at).toDateString() === today);
                
                setStats({
                    totalMenus: menus.length,
                    totalSessions: recaps.length,
                    sessionsToday: todaysRecaps.length,
                    recentMenus: menus.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5),
                    recentRecaps: recaps.sort((a: any, b: any) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()).slice(0, 5),
                    linkedClients: Array.isArray(clients) ? clients : []
                });
            }
        } catch (e) {
            console.error("Failed to load dashboard stats", e);
        }
    }, [user]);

    useEffect(() => {
        const hour = new Date().getHours();
        if (hour < 12) setGreeting('Good Morning');
        else if (hour < 18) setGreeting('Good Afternoon');
        else setGreeting('Good Evening');
        
        loadData();
    }, [user, loadData]);

    const handleAddClient = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !clientIdToAdd) return;
        setAddClientStatus('Linking...');

        try {
            const res = await fetch('/api/coach/link-client', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ coachId: user.id, clientId: clientIdToAdd })
            });
            const data = await res.json();
            if (res.ok) {
                setAddClientStatus('Client Linked!');
                setClientIdToAdd('');
                setIsAddingClient(false);
                // Refresh data
                await loadData();
            } else {
                setAddClientStatus(data.error || 'Failed to link');
            }
        } catch (e) {
            setAddClientStatus('Error linking client');
        }
    };

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
                        {greeting}, <span className="font-bold text-primary">{user?.name || 'Coach'}</span>.
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
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
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

            {/* My Clients Section */}
            <motion.div 
                className="mt-6 bg-white border border-zinc-200 rounded-xl p-6 shadow-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.55 }}
            >
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-zinc-900">My Clients</h2>
                    <button 
                        onClick={() => setIsAddingClient(!isAddingClient)}
                        className="text-primary hover:text-blue-700 text-sm font-bold flex items-center gap-1 bg-blue-50 px-3 py-1 rounded-full transition-colors"
                    >
                        <UserPlus className="w-4 h-4" /> Add Client
                    </button>
                </div>

                {isAddingClient && (
                    <form onSubmit={handleAddClient} className="mb-6 bg-zinc-50 p-4 rounded-xl border border-zinc-200 animate-in fade-in slide-in-from-top-2 flex items-center gap-4">
                        <input 
                            type="text" 
                            placeholder="Enter Client ID" 
                            value={clientIdToAdd}
                            onChange={(e) => setClientIdToAdd(e.target.value)}
                            className="bg-white border border-zinc-200 rounded-lg px-4 py-2 text-sm w-48 font-mono"
                        />
                        <button type="submit" className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-black">
                            Link
                        </button>
                        {addClientStatus && <span className="text-xs font-bold text-primary">{addClientStatus}</span>}
                    </form>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {stats.linkedClients.map((client: any) => (
                        <div key={client.id} className="p-4 rounded-xl border border-zinc-100 bg-zinc-50 flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-primary font-bold">
                                {client.name.charAt(0)}
                            </div>
                            <div>
                                <div className="font-bold text-zinc-900">{client.name}</div>
                                <div className="text-xs text-zinc-500">ID: {client.id}</div>
                            </div>
                        </div>
                    ))}
                    {stats.linkedClients.length === 0 && (
                        <div className="col-span-3 text-center py-8 text-zinc-400 italic">No clients linked yet. Add one above.</div>
                    )}
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
                                <th className="pb-3 font-medium">Client</th>
                                <th className="pb-3 font-medium">Created At</th>
                                <th className="pb-3 font-medium">Exercises</th>
                                <th className="pb-3 font-medium">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                            {stats.recentMenus.map((menu: any) => (
                                <tr key={menu.id} className="group hover:bg-zinc-50 transition-colors">
                                    <td className="py-4 font-medium text-zinc-900">{menu.name}</td>
                                    <td className="py-4 text-zinc-600 font-medium">
                                        {menu.assigned_client ? (
                                            <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-xs border border-blue-100">
                                                {menu.assigned_client.name}
                                            </span>
                                        ) : (
                                            <span className="text-zinc-400 text-xs italic">Unassigned</span>
                                        )}
                                    </td>
                                    <td className="py-4 text-zinc-500 text-sm">
                                        {new Date(menu.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="py-4 text-zinc-500 text-sm">
                                        {(() => {
                                            if (!menu.exercises) return 0;
                                            if (Array.isArray(menu.exercises)) return menu.exercises.length;
                                            try { return JSON.parse(menu.exercises as string).length; } catch { return 0; }
                                        })()} exercises
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
                                <th className="pb-3 font-medium">Client</th>
                                <th className="pb-3 font-medium">Program</th>
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
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">
                                                {recap.user?.name ? recap.user.name[0] : '?'}
                                            </div>
                                            {recap.user?.name || 'Unknown'}
                                        </div>
                                    </td>
                                    <td className="py-4 text-zinc-600 text-sm">
                                        {recap.training_menus?.name || `Menu #${recap.menu_id}`}
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
