
import { Landmark, calculateAngle } from './ExerciseRules';


// --- CONFIG FROM integrated.js ---
type ExerciseConfig = {
    name: string;
    joints: { left: string[], right: string[] };
    upThreshold: number;
    downThreshold: number;
    upCompare: '<' | '>';
    downCompare: '<' | '>';
    labelLeft?: string;
    labelRight?: string;
    trackBothSides: boolean;
    specialLogic?: string;
};

// Full config ported from integrated.js
export const EXERCISES: { [key: string]: ExerciseConfig } = {
  bicep_curls: {
    name: "Bicep Curl",
    trackBothSides: true,
    labelLeft: "Tangan Kiri",
    labelRight: "Tangan Kanan",
    upThreshold: 30, // Arm curled up
    downThreshold: 160, // Arm extended down
    downCompare: ">",
    upCompare: "<",
    joints: {
      left: ['LEFT_SHOULDER', 'LEFT_ELBOW', 'LEFT_WRIST'],
      right: ['RIGHT_SHOULDER', 'RIGHT_ELBOW', 'RIGHT_WRIST'],
    },
  },
  knee_extension: {
    name: "Knee Extension",
    trackBothSides: true,
    labelLeft: "Lutut Kiri",
    labelRight: "Lutut Kanan",
    upThreshold: 100, // Flexed
    downThreshold: 155, // Extended
    downCompare: ">",
    upCompare: "<",
    joints: {
      left: ['LEFT_HIP', 'LEFT_KNEE', 'LEFT_ANKLE'],
      right: ['RIGHT_HIP', 'RIGHT_KNEE', 'RIGHT_ANKLE'],
    },
  },
  front_raise: {
    name: "Front Raise",
    trackBothSides: true,
    labelLeft: "Bahu Kiri",
    labelRight: "Bahu Kanan",
    upThreshold: 30, // Down position
    downThreshold: 80, // Up position
    downCompare: ">",
    upCompare: "<",
    joints: {
      left: ['LEFT_ELBOW', 'LEFT_SHOULDER', 'LEFT_HIP'],
      right: ['RIGHT_ELBOW', 'RIGHT_SHOULDER', 'RIGHT_HIP'],
    },
  },
  shoulder_flexion: {
    name: "Shoulder Flexion",
    trackBothSides: true,
    labelLeft: "Bahu Kiri",
    labelRight: "Bahu Kanan",
    upThreshold: 30,
    downThreshold: 110, // Higher than front raise
    downCompare: ">",
    upCompare: "<",
    joints: {
      left: ['LEFT_ELBOW', 'LEFT_SHOULDER', 'LEFT_HIP'],
      right: ['RIGHT_ELBOW', 'RIGHT_SHOULDER', 'RIGHT_HIP'],
    },
  },
  sit_to_stand: {
    name: "Sit to Stand",
    trackBothSides: false, // Single counter
    labelLeft: "Sudut Lutut",
    labelRight: "Sudut Pinggul",
    upThreshold: 100, // Sitting
    downThreshold: 155, // Standing
    downCompare: ">",
    upCompare: "<",
    specialLogic: "sit_to_stand",
    joints: {
      left: ['LEFT_HIP', 'LEFT_KNEE', 'LEFT_ANKLE'], // Knee
      right: ['LEFT_SHOULDER', 'LEFT_HIP', 'LEFT_KNEE'], // Hip (Same side for biomechanics)
    },
  },
  shoulder_abduction: {
    name: "Shoulder Abduction",
    trackBothSides: true,
    labelLeft: "Bahu Kiri",
    labelRight: "Bahu Kanan",
    upThreshold: 30,
    downThreshold: 80,
    downCompare: ">",
    upCompare: "<",
    joints: {
      left: ['LEFT_WRIST', 'LEFT_SHOULDER', 'LEFT_HIP'],
      right: ['RIGHT_WRIST', 'RIGHT_SHOULDER', 'RIGHT_HIP'],
    },
  },
  hip_abduction: {
    name: "Hip Abduction",
    trackBothSides: true,
    labelLeft: "Pinggul Kiri",
    labelRight: "Pinggul Kanan",
    upThreshold: 20,
    downThreshold: 45,
    downCompare: ">",
    upCompare: "<",
    joints: {
      left: ['LEFT_ANKLE', 'LEFT_HIP', 'LEFT_SHOULDER'],
      right: ['RIGHT_ANKLE', 'RIGHT_HIP', 'RIGHT_SHOULDER'],
    },
  },
};

type SideState = {
    stage: 'up' | 'down' | null;
    reps: number;
    angle: number;
};

export class RehabCore {
    public states: { [key: string]: { left: SideState, right: SideState } } = {};
    
    constructor() {
        // Init states
        Object.keys(EXERCISES).forEach(key => {
            this.states[key] = {
                left: { stage: null, reps: 0, angle: 0 },
                right: { stage: null, reps: 0, angle: 0 }
            };
        });
    }

    public process(exerciseName: string, landmarks: Landmark[]) {
        const config = EXERCISES[exerciseName];
        if (!config || !landmarks || landmarks.length === 0) return null;

        // Helper to get landmark by name
        const LM_MAP: {[key: string]: number} = {
            'LEFT_SHOULDER': 11, 'RIGHT_SHOULDER': 12,
            'LEFT_ELBOW': 13, 'RIGHT_ELBOW': 14,
            'LEFT_WRIST': 15, 'RIGHT_WRIST': 16,
            'LEFT_HIP': 23, 'RIGHT_HIP': 24,
            'LEFT_KNEE': 25, 'RIGHT_KNEE': 26,
            'LEFT_ANKLE': 27, 'RIGHT_ANKLE': 28
        };

        const getAngle = (jointNames: string[]) => {
            const [a, b, c] = jointNames.map(name => landmarks[LM_MAP[name]]);
            if (!a || !b || !c) return 0;
            return calculateAngle(a, b, c);
        };

        // Process Left (Always processed as primary or left side)
        const angleL = getAngle(config.joints.left);
        this.updateSide(exerciseName, 'left', angleL, config);

        // Process Right (Processed if needed or for secondary metric like in sit_to_stand)
        if (config.joints.right) {
             const angleR = getAngle(config.joints.right);
             this.updateSide(exerciseName, 'right', angleR, config);
        }

        return {
            left: this.states[exerciseName].left,
            right: this.states[exerciseName].right
        };
    }

    private updateSide(exName: string, side: 'left' | 'right', angle: number, config: ExerciseConfig) {
        const state = this.states[exName][side];
        state.angle = angle;

        // Logic from integrated.js (simplified)
        const isDown = config.downCompare === '>' ? angle > config.downThreshold : angle < config.downThreshold;
        const isUp = config.upCompare === '<' ? angle < config.upThreshold : angle > config.upThreshold;

        // State Machine
        if (isDown) {
            state.stage = 'down';
        }
        if (isUp && state.stage === 'down') {
            state.stage = 'up';
            // Only increment reps if we are tracking this side for reps
            // For sit_to_stand (trackBothSides=false), usually we count on 'left' (primary) logic
            if (config.trackBothSides || side === 'left') {
                 state.reps += 1;
            }
        }
    }
    
    public getReps(exName: string) {
        const s = this.states[exName];
        if (!s) return 0;
        const config = EXERCISES[exName];
        if (!config.trackBothSides) return s.left.reps; // Only return primary counter
        return s.left.reps + s.right.reps;
    }
}
