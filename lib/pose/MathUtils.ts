
import { Landmark } from './ExerciseRules';

// --- Types ---
export type Point = { x: number; y: number };

// --- Basic Geometry ---

export function computeDistance(p1: Point, p2: Point): number {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

export function calculateAngle(a: Point, b: Point, c: Point): number {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
}

export function inRange(val: number, low: number, high: number): boolean {
    return val >= low && val <= high;
}

// --- Normalization (Port of normalize_v2) ---

function formatLandmark(lm: Landmark): Point {
    return { x: lm.x, y: lm.y };
}

export function normalizeLandmarks(landmarks: Landmark[]): Point[] {
    // Indices for torso: 11(sho_l), 12(sho_r), 23(hip_l), 24(hip_r)
    // Note: Python mediapipe indices match JS.
    const indices = [11, 12, 23, 24];
    
    // Prepare points for least squares (Torso alignment)
    const pts = indices.map(i => ({ x: landmarks[i].x, y: landmarks[i].y }));
    
    // Linear Regression (Least Squares) to find torso centerline angle
    // We want line y = mx + c. But vertical lines fail, so we often do PCA or simple regression.
    // Python code uses np.linalg.lstsq on X to predict Y.
    
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    const n = pts.length;
    for (const p of pts) {
        sumX += p.x;
        sumY += p.y;
        sumXY += p.x * p.y;
        sumXX += p.x * p.x;
    }
    
    const m = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    // If undefined (perfect vertical), theta is 90 deg.
    const theta = !isFinite(m) ? Math.PI / 2 : Math.atan(m);
    
    const cos_t = Math.cos(-theta);
    const sin_t = Math.sin(-theta);
    
    // Centers
    const sho_l = landmarks[11];
    const sho_r = landmarks[12];
    const hip_l = landmarks[23];
    const hip_r = landmarks[24];
    
    const shoulder_center = { x: (sho_l.x + sho_r.x) / 2, y: (sho_l.y + sho_r.y) / 2 };
    const hip_center = { x: (hip_l.x + hip_r.x) / 2, y: (hip_l.y + hip_r.y) / 2 };
    
    const scale_factor = computeDistance(shoulder_center, hip_center);
    
    // Normalize logic from Python:
    // 1. Shift by hip_center
    // 2. Rotate by theta
    // 3. Scale by scale_factor
    
    return landmarks.map(lm => {
        const x = lm.x - hip_center.x;
        const y = lm.y - hip_center.y;
        
        const x_rot = (x * cos_t - y * sin_t) / scale_factor;
        const y_rot = (x * sin_t + y * cos_t) / scale_factor;
        
        return { x: x_rot, y: y_rot };
    });
}

// --- Convex Hull (Monotone Chain Algorithm) ---

function crossProduct(o: Point, a: Point, b: Point): number {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function computeConvexHullArea(points: Point[]): number {
    const n = points.length;
    if (n <= 2) return 0;
    
    // Sort points by x, then y
    const sorted = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
    
    // Build lower hull
    const lower: Point[] = [];
    for (const p of sorted) {
        while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
            lower.pop();
        }
        lower.push(p);
    }
    
    // Build upper hull
    const upper: Point[] = [];
    for (let i = n - 1; i >= 0; i--) {
        const p = sorted[i];
        while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
            upper.pop();
        }
        upper.push(p);
    }
    
    // Concatenate (remove last point of lower and upper as they are duplicates of start/end)
    const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
    
    // Shoelace Formula for Area
    let area = 0;
    for (let i = 0; i < hull.length; i++) {
        const j = (i + 1) % hull.length;
        area += hull[i].x * hull[j].y;
        area -= hull[j].x * hull[i].y;
    }
    
    return Math.abs(area) / 2;
}

// --- Scoring Utilities ---

export function calculateContainmentScore(userRange: [number, number], refRange: [number, number]): number {
    const [user_min, user_max] = userRange;
    const [ref_min, ref_max] = refRange;

    if (user_min === user_max) {
        return (user_min >= ref_min && user_min <= ref_max) ? 1.0 : 0.0;
    }

    const user_length = user_max - user_min;
    if (user_length <= 0) return 1.0;

    const intersection_min = Math.max(user_min, ref_min);
    const intersection_max = Math.min(user_max, ref_max);
    
    const intersection_length = Math.max(0, intersection_max - intersection_min);
    
    return intersection_length / user_length;
}

/*
* Calculates the Mean Absolute Error (MAE) for a value against a target range.
 * If the value is within range, error is 0.
 * If outside, error is distance to the nearest bound.
 */
export function calculateRangeDeviation(value: number, range: [number, number]): number {
    const [min, max] = range;
    // If value is smaller than min, return difference
    if (value < min) return Math.abs(min - value);
    // If value is larger than max, return difference
    if (value > max) return Math.abs(value - max);
    // Within range, perfect score (0 deviation)
    return 0;
}

/**
 * Computes average deviation across multiple joints.
 */
export function computeMAE(errors: number[]): number {
    if (errors.length === 0) return 0;
    const sum = errors.reduce((a, b) => a + b, 0);
    return sum / errors.length;
}

// End of file
