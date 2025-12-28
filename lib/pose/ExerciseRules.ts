
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

export interface ExerciseRule {
    name: string;
    dynamic_joints: string[];
    static_joints: string[];
    critical_angles: { [key: string]: [number, number] };
    form_rules: Array<(landmarks: Landmark[], angles: AnglesDict, side?: 'left' | 'right') => FormValidationResult>;
    detection_condition: (angles: AnglesDict) => boolean;
    state_machine: { start: string; peak: string };
    bilateral: boolean;
    get_dynamic_range: (joint: string, stage: string) => [number, number];
}

// --- Utilities ---

export function calculateAngle(a: Landmark, b: Landmark, c: Landmark): number {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
}

export function computeDistance(a: {x:number, y:number}, b: {x:number, y:number}): number {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

function inRange(val: number, low: number, high: number): boolean {
    return val >= low && val <= high;
}

export function detectStage(angle: number, upRange: [number, number], downRange: [number, number]): "up" | "down" | null {
    if (inRange(angle, downRange[0], downRange[1])) return "down";
    if (inRange(angle, upRange[0], upRange[1])) return "up";
    return null;
}

// --- Validators (Direct Port) ---

const validateBicepCurl = (landmarks: Landmark[], angles: AnglesDict, side: 'left' | 'right' = 'right'): FormValidationResult => {
    const sideIdx = side === 'right' ? 12 : 11;
    const shoulderIdx = sideIdx;
    const elbowIdx = shoulderIdx + 2;
    // hip is 23 (left) or 24 (right). 
    // shoulder 11 -> hip 23. shoulder 12 -> hip 24.
    const hipIdx = sideIdx + 12;

    // Rule 1: Elbow stability
    const elbowPos = landmarks[elbowIdx];
    const hipPos = landmarks[hipIdx];
    const dist = computeDistance(elbowPos, hipPos);

    // Rule 2: Shoulder stability
    const shoulderAngle = angles[`shoulder_${side === 'right' ? 'r' : 'l'}`] || 0;

    const feedback: string[] = [];
    if (dist >= 0.2) feedback.push(`${side} elbow drifting`);
    if (Math.abs(shoulderAngle - 25) >= 20) feedback.push(`${side} shoulder moving`);

    return { valid: feedback.length === 0, feedback };
};

const validateSquat = (landmarks: Landmark[], angles: AnglesDict): FormValidationResult => {
    const hipL = angles['hip_l'] || 0;
    const hipR = angles['hip_r'] || 0;
    const avgHip = (hipL + hipR) / 2;
    
    // Knee valgus check (simplified x-diff checking)
    const kneeL = landmarks[25].x;
    const ankleL = landmarks[27].x;
    const valgusL = Math.abs(kneeL - ankleL) > 0.05;

    const feedback: string[] = [];
    if (valgusL) feedback.push("Knee caving in");
    if (avgHip < 160 && avgHip > 180) feedback.push("Back not neutral"); // logic matches python roughly

    return { valid: feedback.length === 0, feedback };
};

// --- Rules Registry ---

export const EXERCISE_RULES: { [key: string]: ExerciseRule } = {
    'bicep_curl': {
        name: "Bicep Curl",
        dynamic_joints: ['elbow'],
        static_joints: ['shoulder', 'hip'],
        critical_angles: {
            'elbow_up': [0, 45],
            'elbow_down': [140, 180],
        },
        form_rules: [validateBicepCurl],
        detection_condition: (a) => (a['shoulder_r'] < 40 && a['shoulder_l'] < 40 && (a['elbow_r'] > 140 || a['elbow_l'] > 140)),
        state_machine: { start: 'down', peak: 'up' },
        bilateral: true,
        get_dynamic_range: function(joint, stage) {
            return this.critical_angles[`${joint}_${stage}`] || [0,0];
        }
    },
    'squat': {
        name: "Squat",
        dynamic_joints: ['hip', 'knee'],
        static_joints: ['torso'],
        critical_angles: {
            'hip_up': [160, 180],
            'hip_down': [40, 100],
            'knee_up': [160, 180],
            'knee_down': [40, 100]
        },
        form_rules: [validateSquat],
        detection_condition: (a) => (a['hip_l'] < 140 || a['knee_l'] < 140),
        state_machine: { start: 'up', peak: 'down' },
        bilateral: true,
        get_dynamic_range: function(joint, stage) {
            return this.critical_angles[`${joint}_${stage}`] || [0,0];
        }
    }
};
