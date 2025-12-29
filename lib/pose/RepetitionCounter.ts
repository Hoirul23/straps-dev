
import { Landmark, AnglesDict } from './ExerciseRules';
import { 
    computeConvexHullArea, 
    normalizeLandmarks, 
    inRange,
    calculateContainmentScore 
} from './MathUtils';

// --- Types ---
export type RepData = {
    elbow_r: { up: number[], down: number[] };
    elbow_l: { up: number[], down: number[] };
    shoulder_r: { up: number[], down: number[] };
    shoulder_l: { up: number[], down: number[] };
    hull_area: { up: number[], down: number[] };
    wrist_dist: number[];
    static_angles: { [key: string]: number[] };
    feedback: string[];
    frame_times: number[];
};

export type RepetitionSummary = {
    scores: any;
    feedback: string;
    fps: number;
    count?: number; 
};

export class RepetitionCounter {
    // Buffers (Max len 15)
    private elbow_hist_r: number[] = [];
    private elbow_hist_l: number[] = [];
    private shoulder_hist_r: number[] = [];
    private shoulder_hist_l: number[] = [];

    // State
    public current_exercise: string = "unknown";
    public stage_right: string | null = null;
    public stage_left: string | null = null;

    // Phase State Machine
    private right_phase: "idle" | "down_prep" | "up" | "done" = "idle";
    private left_phase: "idle" | "down_prep" | "up" | "done" = "idle";
    private hull_phase: "idle" | "down" | "up" = "idle";

    // Raw Reps
    private raw_reps: { [key: string]: number } = {
        "hammer_curl": 0,
        "overhead_press": 0
    };
    private raw_right_phase: "idle" | "down_prep" | "up" | "done" = "idle";
    private raw_left_phase: "idle" | "down_prep" | "up" | "done" = "idle";

    // Debounce / Bad Frame Tolerance
    private bad_frame_count_r = 0;
    private bad_frame_count_l = 0;

    // Data Collection
    private rep_data: RepData;
    public all_scores: any[] = [];
    public last_score: any = {};

    constructor() {
        this.rep_data = this._reset_rep_data();
    }

    private _reset_rep_data(): RepData {
        return {
            elbow_r: { up: [], down: [] }, elbow_l: { up: [], down: [] },
            shoulder_r: { up: [], down: [] }, shoulder_l: { up: [], down: [] },
            hull_area: { up: [], down: [] },
            wrist_dist: [],
            static_angles: {
                knee_r: [], knee_l: [],
                hip_r: [], hip_l: [],
                shoulder_r: [], shoulder_l: []
            },
            feedback: [],
            frame_times: []
        };
    }

    private updateBuffer(buffer: number[], val: number) {
        buffer.push(val);
        if (buffer.length > 15) buffer.shift();
    }

    public update_angles(elbow_r: number, elbow_l: number, shoulder_r: number, shoulder_l: number) {
        this.updateBuffer(this.elbow_hist_r, elbow_r);
        this.updateBuffer(this.shoulder_hist_r, shoulder_r);
        this.updateBuffer(this.elbow_hist_l, elbow_l);
        this.updateBuffer(this.shoulder_hist_l, shoulder_l);
    }

    public get_raw_reps(exercise_name: string): number {
        return this.raw_reps[exercise_name] || 0;
    }

    // --- Scoring Logic (Ported) ---
    private _calculate_dynamic_angle_score(
        dynamic_thresholds: any, 
        relevant_joints: string[], 
        buffer: number
    ): { [key: string]: number } {
        const joint_scores: { [key: string]: number } = {};
        
        for (const joint of relevant_joints) {
            const joint_base = joint.split('_')[0]; // e.g., elbow_r -> elbow
            
            for (const stage of ['up', 'down'] as const) {
                // Access rep_data dynamically. 
                // Note: Typescript dynamic access requires careful typing or casting.
                const user_angles = (this.rep_data as any)[joint]?.[stage] as number[];
                const score_key = `${joint}_${stage}`;
                
                if (user_angles && user_angles.length > 0) {
                    const user_min = Math.min(...user_angles);
                    const user_max = Math.max(...user_angles);
                    
                    const ref_key = `${joint_base}_${stage}`; // e.g. elbow_up
                    const ref_range = dynamic_thresholds[ref_key] || [0, 0];
                    const [ref_min, ref_max] = ref_range;

                    const out_low = Math.max(0, ref_min - user_min);
                    const out_high = Math.max(0, user_max - ref_max);
                    
                    const pen_low = Math.max(0, out_low - buffer);
                    const pen_high = Math.max(0, out_high - buffer);
                    
                    const total_penalty = pen_low + pen_high;
                    const user_length = user_max - user_min;
                    
                    let score = 0.0;
                    if (user_min >= ref_min && user_max <= ref_max) {
                        score = 1.0;
                    } else if (user_length > 0) {
                         score = Math.max(0, (user_length - total_penalty) / user_length);
                    }
                    
                    joint_scores[score_key] = score * 100;
                }
            }
        }
        return joint_scores;
    }

    private calculate_repetition_score(
        config: any, 
        dynamic_thresholds: any, 
        current_exercise: string
    ): any {
        const gender_thresholds = config; // Assuming full config passed
        const global_config = { static_angle_tolerance: 12, dynamic_angle_buffer: 10 }; // Defaults

        // 1. Convex Hull
        const hull_scores: number[] = [];
        for (const stage of ['up', 'down'] as const) {
            const user_vals = this.rep_data.hull_area[stage];
            if (user_vals && user_vals.length > 0) {
                 const user_range: [number, number] = [Math.min(...user_vals), Math.max(...user_vals)];
                 const ref_range = gender_thresholds.convex_hull?.[stage];
                 if (ref_range) {
                     hull_scores.push(calculateContainmentScore(user_range, ref_range));
                 }
            }
        }
        const avg_hull_score = hull_scores.length > 0 
            ? hull_scores.reduce((a, b) => a + b, 0) / hull_scores.length 
            : 0;

        // 2. Dynamic Angles
        const exercise_joints_map: {[key: string]: string[]} = {
            "hammer_curl": ["elbow_r", "elbow_l"],
            "overhead_press": ["elbow_r", "elbow_l", "shoulder_r", "shoulder_l"]
        };
        const relevant = exercise_joints_map[current_exercise] || [];
        const dynamic_scores = this._calculate_dynamic_angle_score(
            dynamic_thresholds, 
            relevant, 
            global_config.dynamic_angle_buffer
        );

        // 3. Static Angles
        const static_scores: {[key: string]: number} = {};
        const ref_static = gender_thresholds.static_angles || {};
        for (const [joint, ref_val] of Object.entries(ref_static)) {
             const user_vals = this.rep_data.static_angles[joint];
             if (user_vals && user_vals.length > 0) {
                 const user_range: [number, number] = [Math.min(...user_vals), Math.max(...user_vals)];
                 const tolerance = global_config.static_angle_tolerance;
                 // ref_val is number, need range [val, val+tol]
                 const r_val = ref_val as number;
                 static_scores[joint] = calculateContainmentScore(user_range, [r_val, r_val + tolerance]) * 100;
             }
        }

        // 4. Wrist Distance
        let wrist_score = 0;
        if (this.rep_data.wrist_dist.length > 0) {
             const user_vals = this.rep_data.wrist_dist;
             const user_range: [number, number] = [Math.min(...user_vals), Math.max(...user_vals)];
             const ref_range = gender_thresholds.wrist_distance;
             if (ref_range) {
                 wrist_score = calculateContainmentScore(user_range, ref_range);
             }
        }

        return {
            "Hull Score": avg_hull_score * 100,
            "Dynamic Angle Score": dynamic_scores,
            "Static Angle Score": static_scores,
            "Wrist Distance Score": wrist_score * 100
        };
    }

    // --- Main Logic ---
    public count_repetitions(
        angles: AnglesDict, 
        wrist_dist: number, 
        hull_area: number, 
        exercise_config: any,
        frame_time: number
    ): [string | null, string | null, boolean, RepetitionSummary] {
        
        let completed = false;
        let rep_summary: RepetitionSummary = { scores: {}, feedback: '', fps: 0 };

        const thresholds = exercise_config; 
        const dynamic_thresholds = thresholds.dynamic_angles;
        const phase_type = thresholds.phase_type || 'start_down'; // Default to curl behavior

        if (!dynamic_thresholds) return [this.stage_right, this.stage_left, false, rep_summary];

        // 1. Detect Stages for EACH joint involved
        // Helper to detect generic stage for a value against a config key
        const detect_raw = (val: number, key: string) => {
            // key e.g., 'elbow' -> checks 'elbow_up' and 'elbow_down'
            const up = dynamic_thresholds[`${key}_up`];
            const down = dynamic_thresholds[`${key}_down`];
            if (down && inRange(val, down[0], down[1])) return "down";
            if (up && inRange(val, up[0], up[1])) return "up";
            return null;
        };

        const detect_joint_stage = (joint_prefix: string, side_suffix: string) => {
             // e.g. joint_prefix='elbow', side_suffix='_r' -> angle 'elbow_r'
             // check thresholds 'elbow_up', 'elbow_down'
             const angle = angles[`${joint_prefix}${side_suffix}`];
             if (angle === undefined) return null;
             return detect_raw(angle, joint_prefix);
        };

        // Determine relevant joints from the config keys
        // e.g. keys: 'elbow_up', 'shoulder_down' -> joints: ['elbow', 'shoulder']
        const keys = Object.keys(dynamic_thresholds);
        const joint_prefixes = Array.from(new Set(keys.map(k => k.split('_')[0])));

        // Determine Composite Stage for Right and Left
        // Logic: All relevant joints must match the target stage to trigger that stage?
        // OR: At least one matches?
        // Python logic for HC: "up" if elbow OR shoulder is up. "down" if elbow AND shoulder is down.
        // Python logic for OV: "up" if shoulder IS up AND matches elbow.
        
        // Revised Generic Logic:
        // "UP" = Primary Mover is UP.
        // "DOWN" = Primary Mover is DOWN.
        
        // We will define specific "Primary Joints" logic or simple dominant logic.
        // For simplicity and robustness across these 7 exercises:
        // - Bicep/Hammer: Elbow is primary.
        // - Press/Raise: Shoulder & Elbow.
        // - Squat/Dead/Lunge: Hip & Knee.
        
        // Let's iterate all tracked joints. 
        // If ANY tracked joint is "up", we lean towards "up".
        // If ALL tracked joints are "down", we are "down".
        // (This matches the loose Python logic for 'up' and strict for 'down' in Curls)
        
        const get_side_stage = (suffix: string) => {
            const stages = joint_prefixes.map(j => detect_joint_stage(j, suffix));
            
            // Special overrides based on exercise type if needed, but trying to be generic:
            if (phase_type === 'start_down') {
                // E.g. Curl: Start Down. 
                // Up if ANY is Up (e.g. slight shoulder raise + full curl = Up)
                // Down if ALL are Down (Full extension)
                if (stages.some(s => s === 'up')) return 'up';
                if (stages.every(s => s === 'down')) return 'down';
            } else {
                // E.g. Squat: Start Up (Standing).
                // Down (Squatting) if ANY is Down (e.g. hip OR knee flexes deep) -> Actually usually both flex.
                // Up (Standing) if ALL are Up (Full extension)
                // Let's invert:
                if (stages.some(s => s === 'down')) return 'down'; // Dipping
                if (stages.every(s => s === 'up')) return 'up'; // Standing tall
            }
            return null;
        };

        let stage_r = get_side_stage('_r');
        let stage_l = get_side_stage('_l');
        
        // Convex Hull Stage (Override/Filter)
        const ch = thresholds.convex_hull || {};
        const ch_up = ch.up;
        const ch_down = ch.down;
        
        if (inRange(hull_area, ch_down?.[0] || 0, ch_down?.[1] || 0)) this.hull_phase = "down";
        else if (this.hull_phase === "down" && inRange(hull_area, ch_up?.[0] || 0, ch_up?.[1] || 999)) this.hull_phase = "up";
        
        // Data Collection
        const current_stage = this.stage_right || this.stage_left;
        if (current_stage && (current_stage === 'up' || current_stage === 'down')) {
            // ... (Data collection remains same) ...
             this.rep_data.elbow_r[current_stage].push(angles['elbow_r']);
             this.rep_data.elbow_l[current_stage].push(angles['elbow_l']);
             this.rep_data.shoulder_r[current_stage].push(angles['shoulder_r']);
             this.rep_data.shoulder_l[current_stage].push(angles['shoulder_l']);
             this.rep_data.hull_area[current_stage].push(hull_area);
             this.rep_data.wrist_dist.push(wrist_dist);
             this.rep_data.frame_times.push(frame_time);
             
             const ref_static = thresholds.static_angles || {};
             for (const joint of Object.keys(ref_static)) {
                 if (this.rep_data.static_angles[joint]) {
                     this.rep_data.static_angles[joint].push(angles[joint] || 0);
                 }
             }
        }

        // Debounce / Smoothing
        const bad_limit = 5;
        if (stage_r) { this.stage_right = stage_r; this.bad_frame_count_r = 0; }
        else { this.bad_frame_count_r++; if (this.bad_frame_count_r >= bad_limit) this.stage_right = null; }

        if (stage_l) { this.stage_left = stage_l; this.bad_frame_count_l = 0; }
        else { this.bad_frame_count_l++; if (this.bad_frame_count_l >= bad_limit) this.stage_left = null; }

        // --- State Machine (Generic) ---
        // We track "Right" and "Left" independently for completion, but increment one counter.
        // Logic: Both sides must complete the rep cycle? Or just one?
        // Python logic: "if self.raw_right_phase == 'done' and self.raw_left_phase == 'done'" -> REQUIRES BOTH.
        
        const update_phase = (current_phase: string, stage: string | null) => {
            if (phase_type === 'start_down') {
                // Idle -> Down (Start) -> Up (Peak) -> Down (Done)
                // Note: "Down" is the REST state. "Up" is the ACTIVE state.
                // If we are IDLE, we wait for DOWN (Prep).
                // Actually, usually you start "Down".
                if (current_phase === 'idle' && stage === 'down') return 'down_prep';
                if (current_phase === 'down_prep' && stage === 'up') return 'up';
                if (current_phase === 'up' && stage === 'down') return 'done';
            } else {
                // Start Up (Squat).
                // Idle -> Up (Start) -> Down (Peak) -> Up (Done).
                if (current_phase === 'idle' && stage === 'up') return 'up_prep';
                if (current_phase === 'up_prep' && stage === 'down') return 'down'; // Peak
                if (current_phase === 'down' && stage === 'up') return 'done';
            }
            return current_phase;
        };

        this.raw_right_phase = update_phase(this.raw_right_phase, this.stage_right) as any;
        this.raw_left_phase = update_phase(this.raw_left_phase, this.stage_left) as any;

        // Completion Check
        // If bilateral (trackBothSides), wait for both. 
        // We will assume bilateral for now as Python did.
        if (this.raw_right_phase === "done" && this.raw_left_phase === "done") {
             this.raw_reps[this.current_exercise] = (this.raw_reps[this.current_exercise] || 0) + 1;
             completed = true;

             this.last_score = this.calculate_repetition_score(thresholds, dynamic_thresholds, this.current_exercise);
             
             // FPS
             const fps = this.rep_data.frame_times.length > 0 
                ? 1000 / (this.rep_data.frame_times.reduce((a,b)=>a+b,0) / this.rep_data.frame_times.length || 1)
                : 0;

             this.all_scores.push({ exercise: this.current_exercise, scores: this.last_score });
             
             rep_summary = { scores: this.last_score, feedback: "Rep Completed", fps: fps, count: this.raw_reps[this.current_exercise] };
             this.rep_data = this._reset_rep_data();

             this.raw_right_phase = "idle";
             this.raw_left_phase = "idle";
        }

        return [this.stage_right, this.stage_left, completed, rep_summary];
    }
}
