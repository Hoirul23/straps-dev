import { Landmark, EXERCISE_CONFIGS } from './ExerciseRules';
import { RepetitionCounter, RepetitionSummary } from './RepetitionCounter';
import { computeConvexHullArea, normalizeLandmarks, calculateAngle, computeDistance } from './MathUtils';

export class RehabCore {
    private counter: RepetitionCounter;
    
    constructor() {
        this.counter = new RepetitionCounter();
    }

    public process(exerciseName: string, landmarks: Landmark[], frameTime: number = 0) {
        // Map exercise name to config key (map web names to python keys)
        // 'bicep_curls' -> 'bicep_curl' (Python logic key)
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
        
        if (!config || !landmarks || landmarks.length === 0) return null;

        this.counter.current_exercise = configKey;

        // 1. Calculate All Required Angles
        // Mediapipe Indices
        const I = {
            sho_l: 11, sho_r: 12,
            elb_l: 13, elb_r: 14,
            wri_l: 15, wri_r: 16,
            hip_l: 23, hip_r: 24,
            kne_l: 25, kne_r: 26,
            ank_l: 27, ank_r: 28
        };
        const lm = (i: number) => landmarks[i];
        const ang = (a: number, b: number, c: number) => calculateAngle(lm(a), lm(b), lm(c));

        // Angles Dictionary
        const angles: {[key: string]: number} = {
            // Arms
            'elbow_l': ang(I.sho_l, I.elb_l, I.wri_l),
            'elbow_r': ang(I.sho_r, I.elb_r, I.wri_r),
            'shoulder_l': ang(I.elb_l, I.sho_l, I.hip_l),
            'shoulder_r': ang(I.elb_r, I.sho_r, I.hip_r),
            // Legs
            'hip_l': ang(I.sho_l, I.hip_l, I.kne_l),
            'hip_r': ang(I.sho_r, I.hip_r, I.kne_r),
            'knee_l': ang(I.hip_l, I.kne_l, I.ank_l),
            'knee_r': ang(I.hip_r, I.kne_r, I.ank_r),
        };

        // Update Counter Buffers
        this.counter.update_angles(
            angles['elbow_r'], angles['elbow_l'],
            angles['shoulder_r'], angles['shoulder_l']
        );

        // 2. Metrics
        // Normalization
        const normLandmarks = normalizeLandmarks(landmarks);
        
        // Convex Hull
        // Convert to Point array for hull calc
        const hullPoints = normLandmarks.map(l => ({x: l.x, y: l.y}));
        const hullArea = computeConvexHullArea(hullPoints);

        // Wrist Distance
        const wristDist = computeDistance(
            {x: normLandmarks[I.wri_l].x, y: normLandmarks[I.wri_l].y},
            {x: normLandmarks[I.wri_r].x, y: normLandmarks[I.wri_r].y}
        );

        // 3. Count
        const [stageR, stageL, completed, summary] = this.counter.count_repetitions(
            angles,
            wristDist,
            hullArea,
            config,
            frameTime || Date.now()
        );

        // 4. Return Standard Format
        return {
            left: { stage: stageL, reps: this.counter.get_raw_reps(configKey), angle: angles['elbow_l'] }, // Simplified angle ret for UI
            right: { stage: stageR, reps: this.counter.get_raw_reps(configKey), angle: angles['elbow_r'] },
            feedback: summary.feedback,
            scores: summary.scores
        };
    }
    
    public getReps(exName: string) {
        // Map back
         const KEY_MAP: {[key:string]: string} = {
            'bicep_curls': 'bicep_curl',
            'shoulder_press': 'shoulder_press'
        };
        const configKey = KEY_MAP[exName] || exName;
        return this.counter.get_raw_reps(configKey);
    }
}

