
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { User, Shield, ArrowRight, Activity } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth';

export default function LandingPageWrap() {
    return (
        <AuthProvider>
            <LandingPage />
        </AuthProvider>
    );
}

function LandingPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [role, setRole] = useState<'coach' | 'client' | null>(null);
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Registration State
  const [isRegistering, setIsRegistering] = useState(false);
  const [regName, setRegName] = useState('');
  const [regRole, setRegRole] = useState<'COACH' | 'CLIENT' | null>(null);
  const [generatedUser, setGeneratedUser] = useState<any>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName || !regRole) return;
    
    setIsLoading(true);
    setStatus('Creating Account...');
    
    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: regName, role: regRole })
        });
        
        if (res.ok) {
            const newUser = await res.json();
            setGeneratedUser(newUser);
            setStatus('Account Created!');
        } else {
            setStatus('Registration Failed');
        }
    } catch (err) {
        setStatus('Error connecting to server');
    } finally {
        setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role || !userId) return;
    
    setIsLoading(true);
    setStatus('Validating credentials...');
    
    try {
        const user = await login(userId);
        if (user) {
            // Role Validation
            if (role === 'coach') {
                if (user.role !== 'COACH') {
                    setStatus('Access Denied: You are not a Coach');
                    setIsLoading(false);
                    return;
                }
                setStatus('Authenticated. Redirecting...');
                router.push('/coach/dashboard');
            } else {
                if (user.role !== 'CLIENT') {
                    setStatus('Access Denied: You are not a Client');
                    setIsLoading(false);
                    return;
                }
                setStatus('Authenticated. Redirecting...');
                router.push('/client');
            }
        } else {
            setStatus('Invalid User ID');
            setIsLoading(false);
        }
    } catch (err) {
        setStatus('Connection Error');
        setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans selection:bg-blue-100 flex flex-col">
      {/* Decorative Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-blue-50 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 opacity-70"></div>
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-indigo-50 rounded-full blur-3xl translate-x-1/2 translate-y-1/2 opacity-70"></div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 md:p-12">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-md w-full"
        >
          {/* Logo / Header */}
          <div className="text-center mb-10">
            <h1 className="text-5xl font-light tracking-tight text-zinc-900 mb-2">
              STRAPS<span className="font-bold text-primary">-R</span>
            </h1>
            <p className="text-zinc-500 text-lg tracking-wide">Strength Training Pose Recognition and Patient Rehabilitation</p>
          </div>

          {/* Login / Register Card */}
          <div className="bg-white/80 backdrop-blur-xl border border-white/50 shadow-xl rounded-3xl p-8 md:p-10 relative overflow-hidden transition-all">
             
             {/* Mode Toggle */}
             <div className="flex justify-center mb-8">
                <div className="bg-zinc-100 p-1 rounded-full flex">
                    <button 
                        onClick={() => { setIsRegistering(false); setGeneratedUser(null); setStatus(''); }}
                        className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${!isRegistering ? 'bg-white shadow text-zinc-900' : 'text-zinc-500'}`}
                    >
                        LOGIN
                    </button>
                    <button 
                         onClick={() => { setIsRegistering(true); setGeneratedUser(null); setStatus(''); }}
                         className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${isRegistering ? 'bg-white shadow text-zinc-900' : 'text-zinc-500'}`}
                    >
                        REGISTER
                    </button>
                </div>
             </div>

             {isRegistering ? (
                 generatedUser ? (
                    <div className="text-center space-y-6 animate-in fade-in slide-in-from-bottom-4">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600">
                            <Shield className="w-8 h-8" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-zinc-900">Welcome, {generatedUser.name}!</h3>
                            <p className="text-zinc-500 text-sm mt-1">Your account has been created.</p>
                        </div>
                        <div className="bg-zinc-50 border-2 border-dashed border-zinc-200 p-6 rounded-2xl">
                            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Your Unique User ID</p>
                            <p className="text-4xl font-black text-primary tracking-tighter">{generatedUser.id}</p>
                        </div>
                        <p className="text-xs text-red-400">Please save this ID. You will need it to login.</p>
                        <button 
                            onClick={() => {
                                setIsRegistering(false);
                                setRole(generatedUser.role === 'COACH' ? 'coach' : 'client');
                                setUserId(generatedUser.id.toString());
                                setGeneratedUser(null);
                            }}
                            className="w-full py-4 bg-zinc-900 text-white rounded-xl font-bold tracking-widest uppercase hover:bg-black transition-all"
                        >
                            Go to Login
                        </button>
                    </div>
                 ) : (
                    <form onSubmit={handleRegister} className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Full Name</label>
                                <input 
                                    required
                                    type="text"
                                    placeholder="e.g. John Doe"
                                    value={regName}
                                    onChange={(e) => setRegName(e.target.value)}
                                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-zinc-400 transition-colors text-zinc-900"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Role</label>
                                <div className="grid grid-cols-2 gap-3 mt-1">
                                    <button
                                        type="button"
                                        onClick={() => setRegRole('COACH')}
                                        className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                                            regRole === 'COACH' 
                                            ? 'border-primary bg-blue-50 text-primary' 
                                            : 'border-zinc-100 bg-zinc-50 text-zinc-400'
                                        }`}
                                    >
                                        <Shield className="w-5 h-5" />
                                        <span className="font-bold text-xs">COACH</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRegRole('CLIENT')}
                                        className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                                            regRole === 'CLIENT' 
                                            ? 'border-emerald-500 bg-emerald-50 text-emerald-600' 
                                            : 'border-zinc-100 bg-zinc-50 text-zinc-400'
                                        }`}
                                    >
                                         <User className="w-5 h-5" />
                                        <span className="font-bold text-xs">CLIENT</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <button 
                            type="submit"
                            disabled={!regName || !regRole || isLoading}
                            className={`w-full py-4 rounded-xl font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${
                                regName && regRole && !isLoading
                                ? 'bg-zinc-900 text-white hover:bg-black shadow-lg' 
                                : 'bg-zinc-100 text-zinc-300 cursor-not-allowed'
                            }`}
                        >
                            {isLoading ? 'Creating...' : 'Create Account'}
                        </button>
                    </form>
                 )
             ) : (
                <>
             {/* Role Selection */}
             <div className="grid grid-cols-2 gap-4 mb-8">
                <button
                  onClick={() => setRole('coach')}
                  className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-3 ${
                    role === 'coach' 
                      ? 'border-primary bg-blue-50/50 text-primary shadow-sm' 
                      : 'border-zinc-100 bg-zinc-50 text-zinc-400 hover:border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                    <Shield className={`w-8 h-8 ${role === 'coach' ? 'fill-current' : ''}`} />
                    <span className="font-bold tracking-wider text-xs uppercase">Coach</span>
                </button>
                <button
                  onClick={() => setRole('client')}
                  className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-3 ${
                    role === 'client' 
                      ? 'border-emerald-500 bg-emerald-50/50 text-emerald-600 shadow-sm' 
                      : 'border-zinc-100 bg-zinc-50 text-zinc-400 hover:border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                    <User className={`w-8 h-8 ${role === 'client' ? 'fill-current' : ''}`} />
                    <span className="font-bold tracking-wider text-xs uppercase">Client</span>
                </button>
             </div>

             {/* Login Form */}
             <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">
                    {role === 'coach' ? 'Coach Identifier' : 'Client Identifier'}
                  </label>
                  <input 
                    type="text"
                    disabled={!role || isLoading}
                    placeholder={!role ? "Select a role above" : "Enter ID (e.g. A8#k9P)"}
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-4 text-lg text-center tracking-widest focus:outline-none focus:border-zinc-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-zinc-900 placeholder:text-zinc-300 font-mono"
                  />
                  {status && <p className="text-center text-xs font-bold text-primary animate-pulse">{status}</p>}
                </div>

                <button 
                  type="submit"
                  disabled={!role || isLoading}
                  className={`w-full py-4 rounded-xl font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${
                    role 
                      ? 'bg-zinc-900 text-white hover:bg-black shadow-lg hover:shadow-xl hover:-translate-y-0.5' 
                      : 'bg-zinc-100 text-zinc-300 cursor-not-allowed'
                  }`}
                >
                  {isLoading ? (
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      Enter Platform <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
             </form>
             </>
             )}

             {/* Active Status Indicator */}
             <div className="absolute top-6 right-6 flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
             </div>
          </div>

          <p className="text-center text-zinc-400 text-xs mt-8 tracking-widest">
            SECURE ACCESS • v2.0.4
          </p>
        </motion.div>
      </div>
    </div>
  );
}
