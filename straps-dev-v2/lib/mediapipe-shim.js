
// This shim bridges the gap between Webpack and the MediaPipe global script
module.exports = {
  get Pose() { return (typeof window !== 'undefined' ? window.Pose : undefined); },
  get POSE_CONNECTIONS() { return (typeof window !== 'undefined' ? window.POSE_CONNECTIONS : undefined); },
  get VERSION() { return (typeof window !== 'undefined' ? window.VERSION : undefined); }
};
