
import { RehabCore } from '../lib/pose/RehabCore';
import { EXERCISE_CONFIGS, Landmark } from '../lib/pose/ExerciseRules';

const core = new RehabCore();

const mockLandmarks: Landmark[] = Array(33).fill({ x: 0.5, y: 0.5, z: 0, visibility: 1 });

const exercises = [
    'bicep_curls', 
    'hammer_curls', 
    'shoulder_press', 
    'lateral_raises', 
    'squats', 
    'deadlifts', 
    'lunges'
];

console.log("Testing RehabCore Config Loading...");

exercises.forEach(name => {
    try {
        const result = core.process(name, mockLandmarks);
        // We expect result to be valid (not null) even if values are 0
        // Accessing internal counter to check if current_exercise was set correctly
        // (We can't access private members easily in TS without casting, but checking return value is enough)
        
        if (result) {
            console.log(`[PASS] ${name} -> Processed successfully.`);
        } else {
            console.error(`[FAIL] ${name} -> Returned null (Config not found?).`);
        }
    } catch (e) {
        console.error(`[FAIL] ${name} -> Exception:`, e);
    }
});
