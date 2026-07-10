/**
 * @file exercises.js
 * @description File di configurazione globale per i parametri biomeccanici, 
 * i nodi topologici (landmarks) di MediaPipe e le costanti di rendering.
 * I valori angolari di soglia (thresholds) riflettono i regolamenti tecnici del Powerlifting (IPF).
 */

export const EXERCISES = {
  SQUAT: {
    thresholds: { bottomKnee: 105, topKnee: 160 },
    landmarks: {
      LEFT: { shoulder: 11, hip: 23, knee: 25, ankle: 27 },
      RIGHT: { shoulder: 12, hip: 24, knee: 26, ankle: 28 }
    }
  },
  DEADLIFT: {
    thresholds: { erectKnee: 165, erectHip: 165, setupWristY: 0.65, liftThreshold: 0.02, dropThreshold: 0.05, maxWristDropDuringLift: 0.04 },
    landmarks: {
      LEFT: { shoulder: 11, hip: 23, knee: 25, ankle: 27, wrist: 15 },
      RIGHT: { shoulder: 12, hip: 24, knee: 26, ankle: 28, wrist: 16 }
    }
  },
  OVERHEAD_PRESS: {
    thresholds: { topElbow: 160, bottomElbow: 140, maxTrunkLean: 20, maxKneeBend: 15 },
    landmarks: {
      LEFT: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 },
      RIGHT: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 }
    }
  }
};

/**
 * Palette cromatica istituzionale per il rendering sul Canvas HTML.
 * Allineata rigidamente alle linee guida visive dell'Ateneo (Bianco e Blu UniFI).
 */
export const SKELETON_COLORS = {
  target: '#ffffff',  // Bianco - Tracciamento target (Alto contrasto sul video)
  active: '#ffffff',  // Bianco - Tracciamento standard in movimento (Alto contrasto sul video)
  warning: '#6c0000', // Rosso scuro - Avviso per falli rilevati in tempo reale
  error: '#ffffff',   // Bianco - Errore
};

/**
 * Parametri per il filtro passa-basso (Exponential Moving Average - EMA).
 * Bilanciati per abbattere la latenza garantendo stabilità (Alpha alzato, Beta abbassato).
 */
export const SMOOTHING = {
  alpha: 0.35,  // Reattività immediata al cambio di direzione cinematico
  beta: 0.65,   // Fattore di attenuazione del rumore ad alta frequenza
};