
const nextConfig = {
    // Transpile the detector wrapper (ESM) but let @mediapipe/pose be handled by alias or externals
    transpilePackages: ['@tensorflow-models/pose-detection', '@/app/generated/client'],
    experimental: {
        esmExternals: "loose", // Allow mixing CJS/ESM
    },
    webpack: (config: any) => {
        // Alias @mediapipe/pose to our shim which expects window.Pose
        const path = require('path');
        config.resolve.alias['@mediapipe/pose'] = path.resolve(__dirname, 'lib/mediapipe-shim.js');
        
        config.resolve.extensionAlias = {
            '.js': ['.ts', '.tsx', '.js', '.jsx'],
        };
        return config;
    },
    async headers() {
        return [
            {
                source: "/api/:path*",
                headers: [
                    { key: "Access-Control-Allow-Origin", value: "*" },
                    { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS" },
                    { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
                ]
            }
        ];
    }
};

export default nextConfig;
