
export interface Landmark {
    x: number;
    y: number;
    z: number;
    visibility?: number;
}

export interface AnglesDict {
    [key: string]: number;
}

export type FormValidationResult = {
    valid: boolean;
    feedback: string[];
};

// Expanded Configuration Interface to match Python
export interface ExerciseConfig {
    name: string;
    // Core Identification
    detection: {
        shoulder_static?: [number, number];
        shoulder_down?: [number, number];
        hip_static?: [number, number];
    };
    // Counting Logic
    phase_type: 'start_down' | 'start_up'; 
    dynamic_angles: {
        [key: string]: [number, number]; // e.g., elbow_up: [0, 60]
    };
    // Scoring & Validation
    static_angles?: { [key: string]: number }; // Ideal static angle
    wrist_distance?: [number, number];
    convex_hull?: {
        up?: [number, number];
        down?: [number, number];
    };
    
    // Legacy support (optional)
    form_rules?: Array<(landmarks: Landmark[], angles: AnglesDict, side?: 'left' | 'right') => FormValidationResult>;
}

export const EXERCISE_CONFIGS: { [key: string]: ExerciseConfig } = {
    'bicep_curl': {
        name: "Bicep Curl",
        phase_type: 'start_down',
        detection: { shoulder_static: [0, 30] },
        dynamic_angles: {
            'elbow_down': [120, 180],
            'elbow_up': [0, 70],
            'shoulder_down': [0, 30],
            'shoulder_up': [0, 60]
        },
        static_angles: { 'shoulder_r': 15, 'shoulder_l': 15 },
        wrist_distance: [0, 0.3],
        convex_hull: { down: [0, 0.05], up: [0.05, 0.2] }
    },
    'hammer_curl': {
        name: "Hammer Curl",
        phase_type: 'start_down',
        detection: { shoulder_static: [0, 30] },
        dynamic_angles: {
            'elbow_down': [120, 180],
            'elbow_up': [0, 70], // Similar to bicep, maybe slightly different in 3D but same in 2D
            'shoulder_down': [0, 30],
            'shoulder_up': [0, 60]
        },
        static_angles: { 'shoulder_r': 15, 'shoulder_l': 15 },
        wrist_distance: [0, 0.2], // Hammer curl usually keeps weights closer?
        convex_hull: { down: [0, 0.05], up: [0.05, 0.2] }
    },
    'shoulder_press': { // Overhead Press
        name: "Overhead Press",
        phase_type: 'start_down', // Starts at shoulders, goes UP. Actually "Down" state is hands at shoulders. "Up" is hands in air.
        detection: { shoulder_down: [60, 100] },
        dynamic_angles: {
            'elbow_down': [50, 100], // At shoulders
            'elbow_up': [150, 180], // Extended up
            'shoulder_down': [60, 100], // At shoulders
            'shoulder_up': [140, 180] // Arms up
        },
        static_angles: { 'hip_r': 170, 'hip_l': 170 }, // Standing straight
        convex_hull: { down: [0.05, 0.15], up: [0.15, 0.3] }
    },
    'lateral_raises': {
        name: "Lateral Raises",
        phase_type: 'start_down', // Arms at sides
        detection: {},
        dynamic_angles: {
            'shoulder_down': [0, 30],
            'shoulder_up': [80, 110], // T-pose
            'elbow_down': [140, 180], // Straight arm
            'elbow_up': [140, 180]  // Keep arms straight
        },
        static_angles: { 'elbow_r': 160, 'elbow_l': 160 },
        convex_hull: { down: [0, 0.1], up: [0.2, 0.4] } // Wide hull when arms up
    },
    'squat': {
        name: "Squat",
        phase_type: 'start_up', // Standing -> Squat -> Standing
        detection: {},
        dynamic_angles: {
            'hip_up': [160, 180], // Standing
            'hip_down': [50, 100], // Squat depth
            'knee_up': [160, 180],
            'knee_down': [50, 100]
        },
        static_angles: { 'shoulder_r': 20, 'shoulder_l': 20 }, // Torso relatively upright
        convex_hull: { up: [0.1, 0.2], down: [0.05, 0.15] } // Hull shrinks when squatting? Or stays same?
    },
    'deadlift': {
        name: "Deadlift",
        // Actually deadlift starts on floor. So 'start_down' (hips low) -> 'up' (hips high/standing).
        phase_type: 'start_down', // Down (at floor) -> Up (Standing). Warning: Logic usually assumes "Down" means "Rest/Start".
        detection: {},
        dynamic_angles: {
            'hip_down': [45, 100], // Hips flexed at bottom
            'hip_up': [160, 180], // Hips extended at top
            'knee_down': [60, 120], // Knees bent
            'knee_up': [160, 180] // Knees locked
        },
        static_angles: { 'elbow_r': 170, 'elbow_l': 170 }, // Arms straight
        convex_hull: { down: [0.1, 0.2], up: [0.1, 0.2] }
    },
    'lunges': {
        name: "Lunges",
        phase_type: 'start_up', // Standing -> Lunge -> Standing
        detection: {},
        dynamic_angles: {
            'knee_up': [160, 180], // Standing
            'knee_down': [70, 110], // Lunge depth
            'hip_up': [160, 180],
            'hip_down': [70, 110]
        },
        static_angles: {},
        convex_hull: {}
    }
};

