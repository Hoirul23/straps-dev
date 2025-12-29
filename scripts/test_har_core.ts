
import { HARCore } from '../lib/pose/HARCore';
import { Landmark } from '../lib/pose/ExerciseRules';

const har = new HARCore();
const mockLandmarks: Landmark[] = Array(33).fill({ x: 0.5, y: 0.5, z: 0, visibility: 1 });

console.log("Testing HARCore...");

// Test setExercise
console.log("1. Testing setExercise with various inputs...");
const inputs = ["Bicep Curl", "Squats", "deadlift", "Unknown Exercise"];
inputs.forEach(input => {
    har.setExercise(input);
    // Access internal state via hack or just check if process runs
    console.log(`   Set to '${input}'. Invoking process...`);
    try {
        // process returns promise
        har.process(mockLandmarks).then(res => {
            console.log(`   [PASS] '${input}' -> Result:`, res ? `Exercise: ${res.exercise}, Status: ${res.status}` : "NULL");
        }).catch(e => {
            console.error(`   [FAIL] '${input}' -> Error:`, e);
        });
    } catch (e) {
        console.error(`   [FAIL] '${input}' -> Sync Error:`, e);
    }
});

// Wait for promises
setTimeout(() => console.log("Done."), 2000);
