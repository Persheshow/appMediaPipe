export const EXERCISES = {
  SQUAT: {
    thresholds: { bottomKnee: 105, topKnee: 160 },
    landmarks: {
      LEFT:  { shoulder: 11, hip: 23, knee: 25, ankle: 27 },
      RIGHT: { shoulder: 12, hip: 24, knee: 26, ankle: 28 }
    }
  },
  DEADLIFT: {
    thresholds: { erectKnee: 165, erectHip: 165, setupWristY: 0.65, liftThreshold: 0.02, dropThreshold: 0.05 },
    landmarks: {
      LEFT:  { shoulder: 11, hip: 23, knee: 25, ankle: 27, wrist: 15 },
      RIGHT: { shoulder: 12, hip: 24, knee: 26, ankle: 28, wrist: 16 }
    }
  },
  OVERHEAD_PRESS: {
    thresholds: { topElbow: 160, bottomElbow: 140, maxTrunkLean: 20 },
    landmarks: {
      LEFT:  { shoulder: 11, elbow: 13, wrist: 15, hip: 23 },
      RIGHT: { shoulder: 12, elbow: 14, wrist: 16, hip: 24 }
    }
  }
};

// Colori scheletro
export const SKELETON_COLORS = {
  target:  '#00ff88',  // verde — rep valida / posizione corretta
  active:  '#c084fc',  // viola — in movimento
  warning: '#f59e0b',  // giallo — borderline
  error:   '#ef4444',  // rosso — fault rilevato
};

// Smoothing factor per gli angoli
export const SMOOTHING = {
  alpha: 0.15,   // peso del valore corrente
  beta:  0.85,   // peso della media precedente
};