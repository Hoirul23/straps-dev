'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { PlayCircle, Eye, ArrowRight, Activity as ActivityIcon } from 'lucide-react';
import Link from 'next/link';
import { useAuth, AuthProvider } from '@/lib/auth';

export default function ClientHubWrap() {
    return (
        <AuthProvider>
            <ClientHub />
        </AuthProvider>
    );
}

function ClientHub() {
    const { user } = useAuth();

    return (
        <div className="min-h-screen bg-background text-foreground p-8 font-sans selection:bg-primary/30 flex items-center justify-center">
            <div className="max-w-5xl w-full">
                <header className="mb-16 text-center">
                     <h1 className="text-5xl font-light tracking-widest text-zinc-800 mb-4">Hello, <span className="font-bold text-primary">{user?.name || 'Client'}</span>.</h1>
                     <p className="text-zinc-500 text-lg">What would you like to focus on today?</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Training Mode Card */}
                    <Link href="/client/training" className="group">
                        <motion.div 
                            whileHover={{ y: -5 }}
                            className="bg-white p-10 rounded-[2rem] border border-zinc-200 shadow-xl group-hover:shadow-2xl group-hover:border-primary/30 transition-all h-full flex flex-col items-start"
                        >
                            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-primary flex items-center justify-center mb-8 group-hover:scale-110 transition-transform">
                                <PlayCircle className="w-8 h-8" />
                            </div>
                            <h2 className="text-3xl font-bold text-zinc-900 mb-2">Start Training</h2>
                            <p className="text-zinc-500 mb-8 flex-1">Execute your assigned rehabilitation program. Follow real-time guidance and track your reps.</p>
                            
                            <div className="flex items-center gap-2 text-primary font-bold uppercase tracking-widest text-sm group-hover:gap-4 transition-all">
                                Begin Session <ArrowRight className="w-4 h-4" />
                            </div>
                        </motion.div>
                    </Link>

                    {/* Live Monitor Card */}
                    <Link href="/client/monitor" className="group">
                        <motion.div 
                            whileHover={{ y: -5 }} // Corrected: removed "cursor-pointer" as Link handles it
                            className="bg-zinc-900 p-10 rounded-[2rem] border border-zinc-800 shadow-xl group-hover:shadow-2xl group-hover:border-zinc-700 transition-all h-full flex flex-col items-start"
                        >
                            <div className="w-16 h-16 rounded-2xl bg-zinc-800 text-green-400 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform">
                                <Eye className="w-8 h-8" />
                            </div>
                            <h2 className="text-3xl font-bold text-white mb-2">Live Monitor</h2>
                            <p className="text-zinc-400 mb-8 flex-1">Continuous activity recognition. Monitors posture (Sitting/Standing) and detects falls in real-time.</p>
                            
                            <div className="flex items-center gap-2 text-green-400 font-bold uppercase tracking-widest text-sm group-hover:gap-4 transition-all">
                                Launch Monitor <ArrowRight className="w-4 h-4" />
                            </div>
                        </motion.div>
                    </Link>
                </div>

                {/* Recent Activity Section */}
                <div className="mt-16 bg-white p-8 rounded-[2rem] border border-zinc-200 shadow-sm">
                    <h3 className="text-xl font-bold text-zinc-800 mb-6 flex items-center gap-2">
                        <ActivityIcon className="w-5 h-5 text-blue-500" />
                        Recent Live Activity
                    </h3>
                    <ActivityList />
                </div>
                
                <footer className="mt-16 text-center">
                    <Link href="/" className="text-zinc-400 hover:text-zinc-600 text-sm transition-colors">Log Out</Link>
                </footer>
            </div>
        </div>
    );
}

function ActivityList() {
    const { user } = useAuth();
    const [logs, setLogs] = React.useState<any[]>([]);

    React.useEffect(() => {
        if (user) {
            fetch('/api/logs', { headers: { 'x-user-id': user.id } })
                .then(res => res.json())
                .then(data => {
                    if (data.logs) setLogs(data.logs);
                });
        }
    }, [user]);

    if (logs.length === 0) {
        return <div className="text-zinc-400 italic">No recent activity detected.</div>;
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left">
                <thead>
                    <tr className="text-zinc-400 text-xs uppercase tracking-wider border-b border-zinc-100">
                        <th className="pb-3 font-normal">Time</th>
                        <th className="pb-3 font-normal">Status</th>
                        <th className="pb-3 font-normal">Details</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                    {logs.map((log) => (
                        <tr key={log.id} className="group hover:bg-zinc-50 transition-colors">
                            <td className="py-3 text-sm text-zinc-500">
                                {new Date(log.timestamp).toLocaleTimeString()}
                            </td>
                            <td className="py-3">
                                <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                                    log.status.includes('Fall') || log.status.includes('ALARM') 
                                    ? 'bg-red-50 text-red-600 border border-red-100' 
                                    : 'bg-green-50 text-green-600 border border-green-100'
                                }`}>
                                    {log.status}
                                </span>
                            </td>
                            <td className="py-3 text-sm text-zinc-400">
                                {JSON.stringify(log.details)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
