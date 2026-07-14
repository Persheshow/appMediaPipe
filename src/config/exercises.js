/**
 * @file exercises.js
 * @description File di configurazione globale.
 */

export const ESERCIZI = {
  SQUAT: {
    thresholds: { bottomKnee: 85, topKnee: 160, minAttemptKnee: 140, },
    landmarks: {
      LEFT: { shoulder: 11, hip: 23, knee: 25, ankle: 27 },
      RIGHT: { shoulder: 12, hip: 24, knee: 26, ankle: 28 }
    }
  },
  DEADLIFT: {
    thresholds: { erectKnee: 165, erectHip: 165, setupWristY: 0.65, liftThreshold: 0.02, dropThreshold: 0.05, maxWristDropDuringLift: 0.04, minAttemptHip: 140, },
    landmarks: {
      LEFT: { shoulder: 11, hip: 23, knee: 25, ankle: 27, wrist: 15 },
      RIGHT: { shoulder: 12, hip: 24, knee: 26, ankle: 28, wrist: 16 }
    }
  },
  OVERHEAD_PRESS: {
    thresholds: { topElbow: 160, bottomElbow: 140, maxTrunkLean: 20, maxKneeBend: 15, minAttemptElbow: 130, },
    landmarks: {
      LEFT: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 },
      RIGHT: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 }
    }
  }
};

export const SKELETON_COLORS = {
  target: '#ffffff',
  active: '#ffffff',
  warning: '#6c0000',
  error: '#ffffff',
};

export const SMOOTHING = {
  alpha: 0.35,
  beta: 0.65,
};