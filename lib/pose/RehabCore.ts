import { Landmark, EXERCISE_CONFIGS } from './ExerciseRules';
import { 
    computeFeatures, RepFSM, Vec3, PoseFeatures,
    BicepCurlCounter, HammerCurlCounter, OverheadPressCounter, 
    LateralRaiseCounter, SquatCounter, DeadliftCounter, LungeCounter 
} from './RehabFSM';
import { calculateRangeDeviation, computeMAE } from './MathUtils';

const normalizeExerciseName = (input: string): string => {
    if (!input) return '';
    const clean = input.toLowerCase().trim().replace(/\s+/g, '_'); // "Overhead Press" -> "overhead_press"

    // Map common variations to internal keys
    if (clean.includes('bicep')) return 'bicep_curl';
    if (clean.includes('hammer')) return 'hammer_curl';
    if (clean.includes('overhead') || clean.includes('shoulder_press')) return 'shoulder_press';
    if (clean.includes('lateral')) return 'lateral_raises';
    if (clean.includes('squat')) return 'squat';
    if (clean.includes('deadlift')) return 'deadlift';
    if (clean.includes('lunge')) return 'lunges';

    return clean; // Fallback
};

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
    // NEW: Threshold for warning (degrees)
    private readonly DEVIATION_THRESHOLD = 15.0;

    constructor() {
        // Initialize all counters? Or lazy load?
        // Let's lazy load or init on reset.
    }

    public reset() {
        this.counters = {};
        console.log("RehabCore: Counters reset");
    }

    // --- UPDATED: Comprehensive 6-Way Wrong Exercise Detection ---
    private validateExerciseType(
        configKey: string, 
        features: PoseFeatures
    ): string | null {
        // Feature Extraction
        const minKneeAngle = Math.min(features.leftKnee, features.rightKnee);
        const isLegsBent = minKneeAngle < 130; 
        
        const minElbowAngle = Math.min(features.leftElbow, features.rightElbow);
        const isElbowsBent = minElbowAngle < 110; 
        const isArmsStraight = minElbowAngle > 140; 
        
        const isHandsOverhead = (features.leftWristY < features.noseY) || (features.rightWristY < features.noseY);
        const isHandsLow = (features.leftWristY > features.leftShoulderY) && (features.rightWristY > features.rightShoulderY);
        
        const diffElbow = Math.abs(features.leftElbow - features.rightElbow);
        const isAlternating = diffElbow > 40; 
        const isSimultaneous = diffElbow < 20;

       if (configKey === 'bicep_curl') {
            if (isLegsBent) return "Detected: Squat/Lunge. Stand straight for Curls.";
            if (isHandsOverhead) return "Detected: Overhead Press. Keep elbows down.";
            if (isArmsStraight && !isHandsLow) return "Detected: Lateral Raise. Bend your elbows.";
            if (isAlternating) return "Detected: Hammer Curl (Alternating). Move both arms together.";
            return null;
        }

        if (configKey === 'hammer_curl') {
            if (isLegsBent) return "Detected: Squat/Lunge. Stand straight.";
            if (isHandsOverhead) return "Detected: Overhead Press. Keep elbows down.";
            if (isArmsStraight && !isHandsLow) return "Detected: Lateral Raise. Bend your elbows.";
            if (isSimultaneous && isElbowsBent) return "Detected: Bicep Curl (Simultaneous). Alternate arms.";
            return null;
        }

        if (configKey === 'shoulder_press') {
            if (isLegsBent) return "Detected: Squat/Lunge. Focus on upper body.";
            if (isHandsLow && isElbowsBent) return "Detected: Bicep Curl. Push weight UP, not curl.";
            if (isArmsStraight && !isHandsOverhead) return "Detected: Lateral Raise/Deadlift. Press overhead.";
            if (isAlternating) return "Detected: Alternating Press. Push both arms together.";
            return null;
        }

        if (configKey === 'lateral_raises') {
            if (isLegsBent) return "Detected: Squat/Lunge. Stand straight.";
            if (isHandsOverhead) return "Detected: Overhead Press. Stop at shoulder height.";
            if (isElbowsBent) return "Detected: Bicep/Hammer Curl. Keep arms straight (T-pose).";
            return null;
        }

        if (configKey === 'squat') {
            if (!isLegsBent && isElbowsBent) return "Detected: Bicep/Hammer Curl. Bend your knees!";
            if (!isLegsBent && isHandsOverhead) return "Detected: Overhead Press. Focus on legs.";
            const diffKnee = Math.abs(features.leftKnee - features.rightKnee);
            if (isLegsBent && diffKnee > 30) return "Detected: Lunge. Keep knees symmetrical for Squat.";
            return null;
        }

        if (configKey === 'lunges') {
             if (!isLegsBent && isElbowsBent) return "Detected: Curl. Focus on legs.";
             if (!isLegsBent && isHandsOverhead) return "Detected: Press. Focus on legs.";
             const diffKnee = Math.abs(features.leftKnee - features.rightKnee);
             if (isLegsBent && diffKnee < 15) return "Detected: Squat. Step one foot back for Lunge.";
             return null;
        }

        if (configKey === 'deadlift') {
            const isHipsBent = features.leftHip < 140 || features.rightHip < 140;
            if (!isHipsBent && isElbowsBent) return "Detected: Curl. Keep arms straight/locked.";
            if (!isHipsBent && isHandsOverhead) return "Detected: Press. Keep bar low.";
            if (!isHipsBent && isLegsBent) return "Detected: Squat (Too much knee). Hinge at hips more.";
            return null;
        }

        return null;
    }

    private calculateDeviation(
        configKey: string, 
        features: any, 
        fsmState: "LOW" | "HIGH"
    ): { mae: number; isDeviating: boolean; details: string[] } {
        
        const config = EXERCISE_CONFIGS[configKey];
        
        if (!config || !config.dynamic_angles) {
            return { mae: 0, isDeviating: false, details: [] };
        }

        let targetSuffix = '';
        if (config.phase_type === 'start_down') {
            targetSuffix = (fsmState === 'HIGH') ? '_up' : '_down';
        } else {
            targetSuffix = (fsmState === 'HIGH') ? '_down' : '_up'; 
        }

        const errors: number[] = [];
        const details: string[] = [];

        Object.keys(config.dynamic_angles).forEach(key => {
            if (key.endsWith(targetSuffix)) {
                const prefix = key.replace(targetSuffix, ''); 
                let val = 0;

                // --- FIX: Specific Handling for Overhead Press & Curls (Dual Arm Checks) ---
                if ((configKey === 'bicep_curl' || configKey === 'hammer_curl' || configKey === 'shoulder_press') && prefix === 'elbow') {
                    const errL = calculateRangeDeviation(features.leftElbow, config.dynamic_angles[key]);
                    const errR = calculateRangeDeviation(features.rightElbow, config.dynamic_angles[key]);
                    errors.push(errL, errR);
                    if(errL > 0) details.push(`L_${key} dev ${errL.toFixed(0)}`);
                    if(errR > 0) details.push(`R_${key} dev ${errR.toFixed(0)}`);
                    return; 
                }
                
                // Standard Averaging Logic (As requested)
                if (prefix.includes('elbow')) val = (features.leftElbow + features.rightElbow) / 2;
                else if (prefix.includes('knee')) val = (features.leftKnee + features.rightKnee) / 2;
                else if (prefix.includes('hip')) val = (features.leftHip + features.rightHip) / 2;
                else if (prefix.includes('shoulder')) val = (features.leftShoulderY * 180); 
                
                if(val > 0) {
                     const err = calculateRangeDeviation(val, config.dynamic_angles[key]);
                     errors.push(err);
                     if(err > 0) details.push(`${key} dev ${err.toFixed(0)}`);
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
        //  // Normalize exercise name
        //  const KEY_MAP: {[key:string]: string} = {
        //     'bicep_curls': 'bicep_curl',
        //     'shoulder_press': 'shoulder_press',
        //     'hammer_curls': 'hammer_curl',
        //     'lateral_raises': 'lateral_raises',
        //     'squats': 'squat',
        //     'deadlifts': 'deadlift',
        //     'lunges': 'lunges'
        // };
        const configKey = normalizeExerciseName(exerciseName);

        // Init counters if not exists
        if (!this.counters[configKey]) {
            const factory = COUNTER_MAP[configKey];
            if (factory) {
                console.log(`RehabCore: Initialized counter for ${configKey}`);
                this.counters[configKey] = factory();
            } else {
                console.warn(`RehabCore: No factory found for exercise "${configKey}" (Raw: ${exerciseName})`);
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
        
        // Determine dominant state (Use the first counter as primary reference)
        const mainCounter = this.counters[configKey]?.[0];
        const fsmState = mainCounter ? mainCounter.state : "LOW";

        // Calculate Deviation
        const deviationAnalysis = this.calculateDeviation(exerciseName, features, fsmState);

        const wrongExerciseWarning = this.validateExerciseType(configKey, features);
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

        if (wrongExerciseWarning) {
            feedback = `⚠️ ${wrongExerciseWarning}`;
        }

        // Append Deviation info to feedback
        else if (deviationAnalysis.isDeviating) {
            const detailText = deviationAnalysis.details.join(", ");
            feedback += ` | Fix Form: ${detailText}`;
        }
        // Accumulate feedback? FSM has `debug`
        // results.forEach(r => if(r.debug.note) feedback += r.debug.note + " ");

        return {
            left: leftRes,
            right: rightRes,
            feedback: feedback.trim(),
            scores: {deviation_mae: deviationAnalysis.mae} // No scores in new FSM yet
            
        };
    }
    
    public getReps(exName: string) {
        //  // Normalized key
        //  const KEY_MAP: {[key:string]: string} = {
        //     'bicep_curls': 'bicep_curl',
        //     'shoulder_press': 'shoulder_press',
        //     'hammer_curls': 'hammer_curl',
        //     'lateral_raises': 'lateral_raises',
        //     'squats': 'squat',
        //     'deadlifts': 'deadlift',
        //     'lunges': 'lunges'
        // };
        const configKey = normalizeExerciseName(exName);
        const counters = this.counters[configKey];
        if (!counters || counters.length === 0) return 0;

        if (configKey === 'hammer_curl') {
             return Math.min(...counters.map(c => c.reps));
        }
        
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

