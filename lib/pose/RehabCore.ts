import { Landmark } from './ExerciseRules';
import { 
    computeFeatures, RepFSM, Vec3,
    BicepCurlCounter, HammerCurlCounter, OverheadPressCounter, 
    LateralRaiseCounter, SquatCounter, DeadliftCounter, LungeCounter 
} from './RehabFSM';

// Map UI names to Counter Classes
const COUNTER_MAP: { [key: string]: () => RepFSM[] } = {
    'bicep_curl': () => [new BicepCurlCounter('left'), new BicepCurlCounter('right')],
    'hammer_curl': () => [new HammerCurlCounter('left'), new HammerCurlCounter('right')],
    'shoulder_press': () => [new OverheadPressCounter()], // Bilateral logic inside? No, it's single counter based on avg/both
    'lateral_raises': () => [new LateralRaiseCounter()],
    'squat': () => [new SquatCounter()],
    'deadlift': () => [new DeadliftCounter()],
    'lunges': () => [new LungeCounter()] // Bilateral or unified? FSM seems unified (min of both knees)
};

export class RehabCore {
    private counters: { [key: string]: RepFSM[] } = {};
    private worldLandmarksCache: Vec3[] = []; // If we had world landmarks, for now we might approximate or expect them passed

    constructor() {
        // Initialize all counters? Or lazy load?
        // Let's lazy load or init on reset.
    }

    public reset() {
        this.counters = {};
    }

    public process(exerciseName: string, landmarks: Landmark[], worldLandmarks: Landmark[] = [], frameTime: number = 0) {
         // Normalize exercise name
         const KEY_MAP: {[key:string]: string} = {
            'bicep_curls': 'bicep_curl',
            'shoulder_press': 'shoulder_press',
            'hammer_curls': 'hammer_curl',
            'lateral_raises': 'lateral_raises',
            'squats': 'squat',
            'deadlifts': 'deadlift',
            'lunges': 'lunges'
        };
        const configKey = KEY_MAP[exerciseName] || exerciseName;

        // Init counters if not exists
        if (!this.counters[configKey]) {
            const factory = COUNTER_MAP[configKey];
            if (factory) {
                this.counters[configKey] = factory();
            } else {
                return null; // Unknown exercise
            }
        }

        const activeCounters = this.counters[configKey];
        if (!activeCounters) return null;

        // Data Conversion
        // We usually need World Landmarks for accurate angles (meters). 
        // MediaPipe Pose returns:
        // 1. poseLandmarks (normalized x,y,z)
        // 2. poseWorldLandmarks (meters x,y,z)
        // 
        // The current `landmarks` input in Straps usually comes from `poseLandmarks` (normalized).
        // The new algorithm expects `normalized` AND `world`.
        // If we only have normalized, we can pass normalized as world, but angles might be skewed by perspective.
        // HOWEVER, `angleDeg` uses `sub` and `dot`. If z is normalized (0..1 scale relative to image width), it's roughly ok for basic 2D-ish angles.
        // Ideally we update `HARCore` to pass world landmarks too.
        // For now, I will use `landmarks` for BOTH, assuming the user is aware or `z` is roughly scaled.
        // Actually `HARCore` sees `Landmark` interface which has x,y,z.
        
        const vecLandmarks: Vec3[] = landmarks.map(l => ({ x: l.x, y: l.y, z: l.z || 0, visibility: l.visibility }));
        const vecWorld: Vec3[] = (worldLandmarks && worldLandmarks.length > 0) 
            ? worldLandmarks.map(l => ({ x: l.x, y: l.y, z: l.z || 0, visibility: l.visibility }))
            : vecLandmarks; // Fallback
        
        // Compute Features
        const features = computeFeatures(vecLandmarks, vecWorld, frameTime || Date.now());

        // Update Counters
        const results = activeCounters.map(c => c.update(features));

        // Format Output for HARCore
        // Old format: { left: { stage, reps, angle }, right: { stage, reps, angle }, feedback, scores }
        
        // Determine Left/Right results
        // If we have 2 counters, usually [0]=Left, [1]=Right (based on my factory above)
        // Wait, BicepCurlCounter('left') is first?
        // Let's look at factory:
        // 'bicep_curl': () => [new BicepCurlCounter('left'), new BicepCurlCounter('right')],
        
        let leftRes = { stage: 'REST', reps: 0, angle: 0 };
        let rightRes = { stage: 'REST', reps: 0, angle: 0 };
        let feedback = "";
        
        if (configKey === 'bicep_curl' || configKey === 'hammer_curl') {
            const lCounter = activeCounters[0];
            const rCounter = activeCounters[1];
            
            leftRes = { 
                stage: lCounter.state === 'HIGH' ? 'UP' : 'DOWN', 
                reps: lCounter.reps, 
                angle: features.leftElbow 
            };
            rightRes = { 
                stage: rCounter.state === 'HIGH' ? 'UP' : 'DOWN', 
                reps: rCounter.reps, 
                angle: features.rightElbow 
            };
        } else {
            // Unified counters (Squat, Press, etc)
            // We apply result to "Both" or just map to nice UI
            const main = activeCounters[0];
            const stage = main.state === 'HIGH' ? 'UP' : 'DOWN';
            const reps = main.reps;
            
            leftRes = { stage, reps, angle: 0 }; // Angle 0 for now as main metric might be diff
            rightRes = { stage, reps, angle: 0 };
            
            // Populate specific angles for UI if needed
            if (configKey === 'squat') { leftRes.angle = features.leftKnee; rightRes.angle = features.rightKnee; }
            if (configKey === 'shoulder_press') { leftRes.angle = features.leftElbow; rightRes.angle = features.rightElbow; } // Approx
        }
        
        // Accumulate feedback? FSM has `debug`
        // results.forEach(r => if(r.debug.note) feedback += r.debug.note + " ");

        return {
            left: leftRes,
            right: rightRes,
            feedback: feedback.trim(),
            scores: {} // No scores in new FSM yet
        };
    }
    
    public getReps(exName: string) {
         // Normalized key
         const KEY_MAP: {[key:string]: string} = {
            'bicep_curls': 'bicep_curl',
            'shoulder_press': 'shoulder_press',
            'hammer_curls': 'hammer_curl',
            'lateral_raises': 'lateral_raises',
            'squats': 'squat',
            'deadlifts': 'deadlift',
            'lunges': 'lunges'
        };
        const configKey = KEY_MAP[exName] || exName;
        const counters = this.counters[configKey];
        if (!counters || counters.length === 0) return 0;
        
        // If multiple counters (bilateral), usually we return the SUM or MAX or MIN?
        // Old logic was: wait for both to complete -> increment total.
        // New FSM logic tracks reps independently.
        // For Curls, it likely makes sense to show Total Reps (L+R) or Max?
        // Usually "1 Rep" means both arms if simultaneous, or 1 each.
        // For now, let's return the AVG or MAX.
        // If unilateral exercise mode?
        // Straps usually assumes bilateral simultaneous.
        // If I do 10 left and 10 right = 20 total? or 10 sets?
        // Let's return MAX for now (assuming users try to keep sync).
        // Actually, if I do alternate curls, I want sum?
        // Let's stick to MAX for synchronized exercises.
        return Math.max(...counters.map(c => c.reps));
    }
}

