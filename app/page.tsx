
import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-8 font-sans">
      <div className="max-w-4xl w-full text-center space-y-12">
        
        <div className="space-y-4">
          <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            STRAPS Unified Platform
          </h1>
          <p className="text-slate-400 text-lg">
            Next.js 16 • Prisma 6 • TensorFlow.js
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          <Link 
            href="/coach/dashboard"
            className="group relative block p-8 bg-slate-900 rounded-2xl border border-slate-800 hover:border-indigo-500 transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-500/20"
          >
            <div className="absolute top-0 right-0 p-4 opacity-50">
              <span className="text-6xl">📊</span>
            </div>
            <h2 className="text-2xl font-semibold mb-4 text-indigo-400 group-hover:text-indigo-300">Coach Dashboard</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Create training menus, monitor live activity, and view performance recaps. 
              Designed for trainers and administrators.
            </p>
          </Link>

          <Link 
            href="/client"
            className="group relative block p-8 bg-slate-900 rounded-2xl border border-slate-800 hover:border-emerald-500 transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-500/20"
          >
            <div className="absolute top-0 right-0 p-4 opacity-50">
              <span className="text-6xl">📷</span>
            </div>
            <h2 className="text-2xl font-semibold mb-4 text-emerald-400 group-hover:text-emerald-300">Client Application</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Raspberry Pi/Camera interface. Runs local AI (TF.js) to track reps and detect falls.
              Optimized for kiosk mode.
            </p>
          </Link>

        </div>

        <div className="pt-12 text-slate-600 text-sm">
          Run <code className="bg-slate-900 px-2 py-1 rounded border border-slate-800">npm run dev</code> to start the development server.
        </div>
      </div>
    </div>
  );
}
