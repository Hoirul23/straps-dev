
export type Vec3 = { x: number; y: number; z: number; visibility?: number };

export const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,  // NEW
  RIGHT_PINKY: 18, // NEW
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,  // NEW
  RIGHT_THUMB: 22, // NEW
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

function clamp(x: number, a: number, b: number) { return Math.max(a, Math.min(b, x)); }

function sub(a: Vec3, b: Vec3) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function dot(a: Vec3, b: Vec3) { return a.x*b.x + a.y*b.y + a.z*b.z; }
function norm(a: Vec3) { return Math.sqrt(dot(a,a)) + 1e-8; }

export function angleDeg(A: Vec3, B: Vec3, C: Vec3): number {
  const BA = sub(A,B);
  const BC = sub(C,B);
  const cos = clamp(dot(BA,BC) / (norm(BA)*norm(BC)), -1, 1);
  return Math.acos(cos) * 180 / Math.PI;
}

function ema(prev: number | null, x: number, alpha: number): number {
  return prev === null ? x : alpha*x + (1-alpha)*prev;
}

function meanVisibility(lms: Vec3[], idxs: number[]): number {
  const v = idxs.map(i => (lms[i]?.visibility ?? 1.0));
  const s = v.reduce((a,b)=>a+b, 0);
  return v.length ? s / v.length : 0;
}

export type PoseFeatures = {
  tMs: number;
  leftElbow: number; rightElbow: number;
  leftKnee: number; rightKnee: number;
  leftHip: number; rightHip: number;

  // normalized coords (0..1), y lebih besar = lebih bawah
  leftWristY: number; rightWristY: number;
  leftShoulderY: number; rightShoulderY: number;
  noseY: number;

  // NEW: Hand Orientation Data
  leftThumbY: number; leftPinkyY: number;
  rightThumbY: number; rightPinkyY: number;

  // NEW: X Coordinates for Width/Rotation Check
  leftThumbX: number; leftPinkyX: number;
  rightThumbX: number; rightPinkyX: number;

  visArms: number; visLegs: number;
};

export function computeFeatures(
  normalized: Vec3[],   // landmarks (image coords normalized)
  world: Vec3[],        // worldLandmarks (meters)
  tMs: number
): PoseFeatures {
  const A = (i: number) => world[i];
  const N = (i: number) => normalized[i];

  const leftElbow = angleDeg(A(LM.LEFT_SHOULDER), A(LM.LEFT_ELBOW), A(LM.LEFT_WRIST));
  const rightElbow = angleDeg(A(LM.RIGHT_SHOULDER), A(LM.RIGHT_ELBOW), A(LM.RIGHT_WRIST));

  const leftKnee = angleDeg(A(LM.LEFT_HIP), A(LM.LEFT_KNEE), A(LM.LEFT_ANKLE));
  const rightKnee = angleDeg(A(LM.RIGHT_HIP), A(LM.RIGHT_KNEE), A(LM.RIGHT_ANKLE));

  const leftHip = angleDeg(A(LM.LEFT_SHOULDER), A(LM.LEFT_HIP), A(LM.LEFT_KNEE));
  const rightHip = angleDeg(A(LM.RIGHT_SHOULDER), A(LM.RIGHT_HIP), A(LM.RIGHT_KNEE));

  const armsIdx = [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST, LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST];
  const legsIdx = [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE];

  return {
    tMs,
    leftElbow, rightElbow,
    leftKnee, rightKnee,
    leftHip, rightHip,

    leftWristY: N(LM.LEFT_WRIST).y,
    rightWristY: N(LM.RIGHT_WRIST).y,
    leftShoulderY: N(LM.LEFT_SHOULDER).y,
    rightShoulderY: N(LM.RIGHT_SHOULDER).y,
    noseY: N(LM.NOSE).y,

    // Capture Thumb/Pinky Y for grip check
    leftThumbY: N(LM.LEFT_THUMB).y,
    leftPinkyY: N(LM.LEFT_PINKY).y,
    rightThumbY: N(LM.RIGHT_THUMB).y,
    rightPinkyY: N(LM.RIGHT_PINKY).y,

    // NEW: Capture X coordinates
    leftThumbX: N(LM.LEFT_THUMB).x,
    leftPinkyX: N(LM.LEFT_PINKY).x,
    rightThumbX: N(LM.RIGHT_THUMB).x,
    rightPinkyX: N(LM.RIGHT_PINKY).x,

    visArms: meanVisibility(world, armsIdx),
    visLegs: meanVisibility(world, legsIdx),
  };
}

// =======================
// Robust FSM base
// =======================
export class RepFSM {
  public state: "LOW" | "HIGH" = "LOW";
  public reps = 0;

  private metricS: number | null = null;
  private metricPrev: number | null = null;
  private lastMotionT: number | null = null;

  private enteredHighT: number | null = null;
  private cycleStartT: number | null = null;
  private cycleMin: number | null = null;
  private cycleMax: number | null = null;

  constructor(
    public name: string,
    public minVis = 0.6,
    public emaAlpha = 0.25,
    public idleVelTh = 0.8,
    public idleMs = 900,
    public highHoldMs = 120,
    public minRepMs = 500,
    public maxRepMs = 12000,
    public minRomDeg = 60,
  ) {}

  visibilityOk(_f: PoseFeatures): boolean { return true; }
  metric(_f: PoseFeatures): number { throw new Error("metric not implemented"); }
  isLow(_m: number, _f: PoseFeatures): boolean { throw new Error("isLow not implemented"); }
  isHigh(_m: number, _f: PoseFeatures): boolean { throw new Error("isHigh not implemented"); }
  extraValid(_f: PoseFeatures): boolean { return true; }

  private updateRom(m: number) {
    this.cycleMin = this.cycleMin === null ? m : Math.min(this.cycleMin, m);
    this.cycleMax = this.cycleMax === null ? m : Math.max(this.cycleMax, m);
  }

  update(f: PoseFeatures): { delta: number; debug: any } {
    const t = f.tMs;
    if (!this.visibilityOk(f)) {
      return { delta: 0, debug: { name: this.name, state: this.state, note: "visibility_fail" } };
    }

    const mRaw = this.metric(f);
    this.metricS = ema(this.metricS, mRaw, this.emaAlpha);

    if (this.metricPrev === null) {
      this.metricPrev = this.metricS;
      this.lastMotionT = t;
      return { delta: 0, debug: { name: this.name, state: this.state, m: this.metricS } };
    }

    const vel = Math.abs(this.metricS - this.metricPrev);
    this.metricPrev = this.metricS;

    if (vel >= this.idleVelTh) this.lastMotionT = t;

    if (this.lastMotionT !== null && (t - this.lastMotionT) > this.idleMs) {
      // idle -> reset to safe state
      this.state = "LOW";
      this.enteredHighT = null;
      this.cycleStartT = null;
      this.cycleMin = null;
      this.cycleMax = null;
      return { delta: 0, debug: { name: this.name, state: this.state, note: "idle" } };
    }

    this.updateRom(this.metricS);

    if (this.state === "LOW") {
      if (this.isHigh(this.metricS, f) && this.extraValid(f)) {
        this.state = "HIGH";
        this.enteredHighT = t;
        if (this.cycleStartT === null) this.cycleStartT = t;
      }
      return { delta: 0, debug: { name: this.name, state: this.state, m: this.metricS } };
    }

    // state HIGH
    if (this.enteredHighT !== null && (t - this.enteredHighT) < this.highHoldMs) {
      return { delta: 0, debug: { name: this.name, state: this.state, m: this.metricS, note: "hold_high" } };
    }

    if (this.isLow(this.metricS, f)) {
      const dur = this.cycleStartT ? (t - this.cycleStartT) : 0;
      const rom = (this.cycleMax !== null && this.cycleMin !== null) ? (this.cycleMax - this.cycleMin) : 0;
      const okDur = dur >= this.minRepMs && dur <= this.maxRepMs;
      const okRom = rom >= this.minRomDeg;

      let delta = 0;
      if (okDur && okRom) {
        this.reps += 1;
        delta = 1;
      }

      // reset
      this.state = "LOW";
      this.enteredHighT = null;
      this.cycleStartT = null;
      this.cycleMin = null;
      this.cycleMax = null;

      return { delta, debug: { name: this.name, state: this.state, m: this.metricS, dur, rom, okDur, okRom } };
    }

    return { delta: 0, debug: { name: this.name, state: this.state, m: this.metricS } };
  }
}

// =======================
// Exercise counters
// =======================
// --- Base Class for Curls ---
class BaseCurlCounter extends RepFSM {
  constructor(public side: "left" | "right", name: string) {
    super(name, 0.6, 0.25, 0.8, 900, 120, 500, 12000, 70);
  }
  private highTh = 85;
  private lowTh = 140;

  visibilityOk(f: PoseFeatures) { return f.visArms >= this.minVis; }
  metric(f: PoseFeatures) { return this.side === "right" ? f.rightElbow : f.leftElbow; }
  isLow(m: number) { return m >= this.lowTh; }
  isHigh(m: number) { return m <= this.highTh; }
}

export class BicepCurlCounter extends BaseCurlCounter {
  constructor(side: "left" | "right" = "right") {
    super(side, "bicep_curl");
  }

  // LOGIC: Simultaneous Lift
  // Valid ONLY if the OTHER arm is also active (Bent).
  extraValid(f: PoseFeatures) {
    const otherArmAngle = this.side === "right" ? f.leftElbow : f.rightElbow;

    // Check: Is the other arm bent? (< 120 degrees)
    // If the other arm is straight (> 120), then we are NOT doing simultaneous curls.
    if (otherArmAngle > 120) {
        return false; // Reject: Other arm is lazy/resting
    }
    return true; // Accept: Both arms are working
  }
}

export class HammerCurlCounter extends BaseCurlCounter {
  constructor(side: "left" | "right" = "right") {
    super(side, "hammer_curl");
  }

  // LOGIC: Alternating Lift
  // Valid ONLY if the OTHER arm is resting (Straight).
  extraValid(f: PoseFeatures) {
    const otherArmAngle = this.side === "right" ? f.leftElbow : f.rightElbow;

    // Check: Is the other arm straight? (> 130 degrees)
    // If the other arm is bent (< 130), it means we are moving both (Simultaneous).
    if (otherArmAngle < 130) {
        return false; // Reject: Both arms are moving
    }
    return true; // Accept: Only this arm is moving
  }
}

export class OverheadPressCounter extends RepFSM {
  constructor() { 
      // Using relaxed Min ROM (30) to ensuring counting
      super("overhead_press", 0.6, 0.25, 0.8, 900, 120, 500, 12000, 30); 
  }
  
  visibilityOk(f: PoseFeatures) { return f.visArms >= this.minVis; }
  
  metric(f: PoseFeatures) { 
      // Use MIN elbow angle to require at least one arm to lock out
      return Math.min(f.leftElbow, f.rightElbow); 
  }
  
  // High State (Lockout) > 140 deg
  isHigh(m: number) { 
      return m > 140; 
  }
  
  // Low State (Start/Chin level) < 120 deg
  isLow(m: number) { 
      return m < 110; 
  } 

  // Validation: Ensure hands are ABOVE shoulders
  extraValid(f: PoseFeatures) { 
      const isHandsUpL = f.leftWristY < f.leftShoulderY;
      const isHandsUpR = f.rightWristY < f.rightShoulderY;
      return isHandsUpL && isHandsUpR;
  }
}

export class LateralRaiseCounter extends RepFSM {
  private highMargin = 0.05;
  private lowMargin = 0.12;
  constructor() { 
      super("lateral_raise", 0.6, 0.25, 0.003, 900, 120, 500, 12000, 0); 
  }
  visibilityOk(f: PoseFeatures) { return f.visArms >= this.minVis; }
  metric(f: PoseFeatures) {
    const dl = Math.abs(f.leftWristY - f.leftShoulderY);
    const dr = Math.abs(f.rightWristY - f.rightShoulderY);
    return 0.5*(dl+dr);
  }
  isHigh(m: number) { return m < this.highMargin; }
  isLow(m: number) { return m > this.lowMargin; }
  extraValid(f: PoseFeatures) { return f.leftElbow > 120 && f.rightElbow > 120; }
}

export class SquatCounter extends RepFSM {
  private topTh = 165;
  private bottomTh = 100;
  constructor() { super("squat", 0.6, 0.25, 0.8, 900, 120, 600, 12000, 40); }
  visibilityOk(f: PoseFeatures) { return f.visLegs >= this.minVis; }
  metric(f: PoseFeatures) { return Math.min(f.leftKnee, f.rightKnee); }
  isLow(m: number) { return m >= this.topTh; }     // standing
  isHigh(m: number) { return m <= this.bottomTh; } // bottom
  extraValid(f: PoseFeatures) { return Math.min(f.leftHip, f.rightHip) < 140; }
}

export class DeadliftCounter extends RepFSM {
  private topHipTh = 165;
  private bottomHipTh = 120;
  constructor() { super("deadlift", 0.6, 0.25, 0.8, 900, 120, 600, 12000, 35); }
  visibilityOk(f: PoseFeatures) { return f.visLegs >= this.minVis && f.visArms >= 0.4; }
  metric(f: PoseFeatures) { return Math.min(f.leftHip, f.rightHip); }
  isLow(m: number) { return m >= this.topHipTh; }
  isHigh(m: number, f: PoseFeatures) {
    const knee = Math.min(f.leftKnee, f.rightKnee);
    return m <= this.bottomHipTh && knee > 110;
  }
}

export class LungeCounter extends RepFSM {
  private topKneeTh = 165;
  private bottomFrontTh = 105;
  private bottomBackTh = 130;
  constructor() { super("lunge", 0.6, 0.25, 0.8, 900, 120, 600, 12000, 25); }
  visibilityOk(f: PoseFeatures) { return f.visLegs >= this.minVis; }
  metric(f: PoseFeatures) { return Math.min(f.leftKnee, f.rightKnee); }
  isLow(_m: number, f: PoseFeatures) {
    return f.leftKnee > this.topKneeTh && f.rightKnee > this.topKneeTh;
  }
  isHigh(_m: number, f: PoseFeatures) {
    const front = Math.min(f.leftKnee, f.rightKnee);
    const back  = Math.max(f.leftKnee, f.rightKnee);
    return front < this.bottomFrontTh && back < this.bottomBackTh;
  }
}
