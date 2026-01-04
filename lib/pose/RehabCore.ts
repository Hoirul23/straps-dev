import { Landmark, EXERCISE_CONFIGS } from './ExerciseRules';
import { 
    computeFeatures, RepFSM, Vec3,
    BicepCurlCounter, HammerCurlCounter, OverheadPressCounter, 
    LateralRaiseCounter, SquatCounter, DeadliftCounter, LungeCounter 
} from './RehabFSM';
import { calculateRangeDeviation, computeMAE } from './MathUtils';

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
    private worldLandmarksCache: Vec3[] = []; 
    // NEW: Threshold for warning (degrees)
    private readonly DEVIATION_THRESHOLD = 15.0;

    constructor() {}

    public reset() {
        this.counters = {};
    }
    
    // Adapted from v2: Deviation Analysis
    private calculateDeviation(
        exerciseName: string, 
        features: any, 
        fsmState: "LOW" | "HIGH"
    ): { mae: number; isDeviating: boolean; details: string[] } {
        
        // 1. Normalize name to match keys in EXERCISE_CONFIGS
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
        const config = EXERCISE_CONFIGS[configKey];
        
        if (!config || !config.dynamic_angles) {
            return { mae: 0, isDeviating: false, details: [] };
        }

        // 2. Map FSM State to Config Phase ('up' or 'down')
        let targetSuffix = '';
        if (config.phase_type === 'start_down') {
            targetSuffix = (fsmState === 'HIGH') ? '_up' : '_down';
        } else {
            // start_up (Squat)
            targetSuffix = (fsmState === 'HIGH') ? '_down' : '_up'; 
        }

        const errors: number[] = [];
        const details: string[] = [];

        // 3. Loop over config keys that match current suffix
        Object.keys(config.dynamic_angles).forEach(key => {
            if (key.endsWith(targetSuffix)) {
                const prefix = key.replace(targetSuffix, ''); // 'elbow', 'shoulder'
                let val = 0;
                
                // Simple heuristics to map config string to feature value
                if (prefix.includes('elbow')) val = (features.leftElbow + features.rightElbow) / 2;
                else if (prefix.includes('knee')) val = (features.leftKnee + features.rightKnee) / 2;
                else if (prefix.includes('hip')) val = (features.leftHip + features.rightHip) / 2;
                else if (prefix.includes('shoulder')) {
                    // Use new Press/Posture angles
                    // Check undefined/null specifically, allowing 0
                    if (features.leftShoulder !== undefined && features.rightShoulder !== undefined) {
                         val = (features.leftShoulder + features.rightShoulder) / 2;
                    } else {
                        val = -1; // Sentinal for missing
                    }
                }
                
                // Specific Overrides for correct angle sources
                if ((configKey === 'bicep_curl' || configKey === 'hammer_curl') && prefix === 'elbow') {
                    // check both arms
                    const errL = calculateRangeDeviation(features.leftElbow, config.dynamic_angles[key]);
                    const errR = calculateRangeDeviation(features.rightElbow, config.dynamic_angles[key]);
                    errors.push(errL, errR);
                    if(errL > 0) details.push(`L_${key} dev ${errL.toFixed(0)}`);
                    if(errR > 0) details.push(`R_${key} dev ${errR.toFixed(0)}`);
                    return; 
                }
                
                if (configKey === 'squat' && (prefix === 'knee' || prefix === 'hip')) {
                     const err = calculateRangeDeviation(val, config.dynamic_angles[key]);
                     errors.push(err);
                     if(err > 0) details.push(`${key} dev ${err.toFixed(0)}`);
                     return;
                }

                // If strictly standard naming
                // Allow 0, check for sentinel -1
                if(val >= 0) {
                     const err = calculateRangeDeviation(val, config.dynamic_angles[key]);
                     errors.push(err);
                }
            }
        });

        const mae = computeMAE(errors);
        
        return {
            mae,
            isDeviating: mae > this.DEVIATION_THRESHOLD,
            details
        };
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

        const vecLandmarks: Vec3[] = landmarks.map(l => ({ x: l.x, y: l.y, z: l.z || 0, visibility: l.visibility }));
        const vecWorld: Vec3[] = (worldLandmarks && worldLandmarks.length > 0) 
            ? worldLandmarks.map(l => ({ x: l.x, y: l.y, z: l.z || 0, visibility: l.visibility }))
            : vecLandmarks; // Fallback
        
        // Compute Features
        const features = computeFeatures(vecLandmarks, vecWorld, frameTime || Date.now());

        // Update Counters
        const results = activeCounters.map(c => c.update(features));

        // Calculate Deviation (New Logic)
        const mainCounter = activeCounters[0];
        const fsmState = mainCounter ? mainCounter.state : "LOW";
        const deviationAnalysis = this.calculateDeviation(exerciseName, features, fsmState);

        // Format Output for HARCore
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
            const main = activeCounters[0];
            const stage = main.state === 'HIGH' ? 'UP' : 'DOWN';
            const reps = main.reps;
            
            leftRes = { stage, reps, angle: 0 }; 
            rightRes = { stage, reps, angle: 0 };
            
            // Populate specific angles for UI if needed
            if (configKey === 'squat') { leftRes.angle = features.leftKnee; rightRes.angle = features.rightKnee; }
            if (configKey === 'shoulder_press') { leftRes.angle = features.leftElbow; rightRes.angle = features.rightElbow; } 
        }
        
        // Append Deviation info to feedback
        if (deviationAnalysis.isDeviating) {
            const detailText = deviationAnalysis.details.join(", ");
            if (detailText) feedback += ` | Fix Form: ${detailText}`;
        }
        
        return {
            left: leftRes,
            right: rightRes,
            feedback: feedback.trim(),
            scores: { deviation_mae: deviationAnalysis.mae } // Include MAE
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

