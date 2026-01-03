
import { XGBoostPredictor } from './XGBoostPredictor';
import { Landmark, EXERCISE_CONFIGS } from './ExerciseRules';
import { RehabCore } from './RehabCore';
import { calculateAngle } from './MathUtils';

// Label Encoder mapping from python: Classes: ['berdiri' 'duduk' 'jatuh']
const LABELS = ['Standing', 'Sitting', 'Fall Detected'];

export class HARCore {
    private predictor: XGBoostPredictor;
    private rehab: RehabCore;
    private currentExercise: string | null = null;
    
    constructor() {
        this.predictor = new XGBoostPredictor();
        this.rehab = new RehabCore();
    }
    
    // Set the active exercise to track (from menu)
    public setExercise(name: string) {
        // Map UI name to internal config name if needed
        // For now assume direct match e.g. "Bicep Curl" -> "bicep_curls"
        // Simple normalizer
        const lowerName = name.toLowerCase();
        
        // Find matching key in EXERCISE_CONFIGS
        // EXERCISE_CONFIGS keys are like 'bicep_curl', 'squat'
        // UI names might be "Bicep Curl", "Squats"
        const key = Object.keys(EXERCISE_CONFIGS).find(k => 
            lowerName.includes(k.replace('_', ' ')) || 
            k.replace('_', ' ').includes(lowerName.split(' ')[0])
        );
        
        this.currentExercise = key || null;
    }

    public resetParams() {
        this.rehab.reset();
        // this.currentExercise = null; // Don't nullify exercise, just counters
    }

    public async process(landmarks: Landmark[], worldLandmarks: Landmark[] = []) {
        if (!landmarks || landmarks.length === 0) return null;

        // 1. Activity Recognition (HAR) - XGBoost
        const features = this.extractFeatures(landmarks);
        const probs = this.predictor.predict(features);
        const maxIdx = probs.indexOf(Math.max(...probs));
        const status = LABELS[maxIdx];
        const confidence = probs[maxIdx];

        // 2. Exercise Counting (Rehab) - Heuristic
        let reps = 0;
        let feedback = "";
        let debug = {};

        if (this.currentExercise) {
            const result = this.rehab.process(this.currentExercise, landmarks, worldLandmarks);
            if (result) {
                // Combine left/right reps for total or max?
                // Usually we want total completed reps.
                reps = this.rehab.getReps(this.currentExercise);
                
                // Construct feedback
                const stateL = result.left.stage;
                const stateR = result.right.stage;
                feedback = `L: ${stateL || '-'} | R: ${stateR || '-'}`;
                if (result.feedback && result.feedback.length > 0) {
                     feedback += ` | ${result.feedback}`; // Add generic feedback
                }
                
                debug = { 
                    angles: { l: result.left.angle, r: result.right.angle },
                    scores: result.scores 
                };
            }
        }

        return {
            status,
            confidence,
            exercise: this.currentExercise,
            reps,
            feedback,
            debug
        };
    }

    private extractFeatures(landmarks: Landmark[]): number[] {
        // 1. Flatten Raw Keypoints (33 * 4 = 132 features)
        const raw: number[] = [];
        landmarks.forEach(lm => {
            raw.push(lm.x, lm.y, lm.z, lm.visibility || 0);
        });

        // 2. Derived Features
        // Helper to get landmark
        const getLm = (idx: number) => landmarks[idx];
        
        // Helper to flatten {x,y} to point for calculateAngle
        const pt = (lm: Landmark) => ({x: lm.x, y: lm.y});
        const calcAng = (a: Landmark, b: Landmark, c: Landmark) => calculateAngle(pt(a), pt(b), pt(c));

        const derived: number[] = [];

        // Angles
        // 0: Left Elbow (11-13-15)
        derived.push(calcAng(getLm(11), getLm(13), getLm(15)));
        // 1: Right Elbow (12-14-16)
        derived.push(calcAng(getLm(12), getLm(14), getLm(16)));
        // 2: Left Hip (11-23-25)
        derived.push(calcAng(getLm(11), getLm(23), getLm(25)));
        // 3: Right Hip (12-24-26)
        derived.push(calcAng(getLm(12), getLm(24), getLm(26)));
        // 4: Left Knee (23-25-27)
        derived.push(calcAng(getLm(23), getLm(25), getLm(27)));
        // 5: Right Knee (24-26-28)
        derived.push(calcAng(getLm(24), getLm(26), getLm(28)));

        // Distances & Ratios
        const dist = (a: Landmark, b: Landmark) => Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
        
        const shoulderWidth = dist(getLm(11), getLm(12));
        const hipWidth = dist(getLm(23), getLm(24));
        
        const midShoulder = { x: (getLm(11).x + getLm(12).x)/2, y: (getLm(11).y + getLm(12).y)/2 };
        const midHip = { x: (getLm(23).x + getLm(24).x)/2, y: (getLm(23).y + getLm(24).y)/2 };
        const torsoHeight = dist(midShoulder as Landmark, midHip as Landmark);
        
        const eps = 1e-6;
        // 6: Shoulder Width Ratio
        derived.push(shoulderWidth / (torsoHeight + eps));
        // 7: Hip Width Ratio
        derived.push(hipWidth / (torsoHeight + eps));
        
        // 8: Torso Vertical Alignment (Cosine Similarity with [0, -1])
        // Vector from Hip to Shoulder (Upwards)
        const torsoVec = { x: midShoulder.x - midHip.x, y: midShoulder.y - midHip.y };
        const verticalVec = { x: 0, y: -1 }; // Up in image coordinates (y is down)? 
        // Python: vertical_vector = np.array([0, -1])
        // In python/opencv y is down. So [0, -1] is UP vector.
        
        const dot = (torsoVec.x * verticalVec.x) + (torsoVec.y * verticalVec.y);
        const norm = Math.sqrt(torsoVec.x * torsoVec.x + torsoVec.y * torsoVec.y);
        
        derived.push(norm > 0 ? dot / norm : 0);

        return [...raw, ...derived];
    }
}
