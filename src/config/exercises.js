/**
 * @file exercises.js
 * @description File di configurazione globale per i parametri biomeccanici, 
 * i nodi topologici (landmarks) di MediaPipe e le costanti di rendering.
 * I valori angolari di soglia (thresholds) riflettono i regolamenti tecnici del Powerlifting (IPF).
 */

export const EXERCISES = {
  SQUAT: {
    // topKnee: Estensione completa (Lockout) | bottomKnee: Soglia base per la flessione
    thresholds: { bottomKnee: 105, topKnee: 160 },
    landmarks: {
      LEFT: { shoulder: 11, hip: 23, knee: 25, ankle: 27 },
      RIGHT: { shoulder: 12, hip: 24, knee: 26, ankle: 28 }
    }
  },
  DEADLIFT: {
    // erectKnee/erectHip: Estensione di lockout | setupWristY: Altezza bilanciere in partenza
    // liftThreshold: Delta Y per inizio tirata | maxWristDropDuringLift: Tolleranza discesa (IPF Rule)
    thresholds: { erectKnee: 165, erectHip: 165, setupWristY: 0.65, liftThreshold: 0.02, dropThreshold: 0.05, maxWristDropDuringLift: 0.04 },
    landmarks: {
      LEFT: { shoulder: 11, hip: 23, knee: 25, ankle: 27, wrist: 15 },
      RIGHT: { shoulder: 12, hip: 24, knee: 26, ankle: 28, wrist: 16 }
    }
  },
  OVERHEAD_PRESS: {
    // topElbow: Estensione omero (Lockout) | bottomElbow: Massima flessione eccentrica
    // maxTrunkLean: Limite iperlordosi | maxKneeBend: Limite cheating arti inferiori (Push press)
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
  warning: '#6c0000',  // Rosso - Avviso (Riservato - Mappato su colore primario per coerenza)
  error: '#ffffff',  // Bianco - Errore (Riservato - Mappato su colore secondario per coerenza)
};

/**
 * Parametri per il filtro passa-basso (Exponential Moving Average - EMA).
 * Definiscono l'inerzia del segnale angolare per mitigare il rumore di acquisizione (Jittering).
 */
export const SMOOTHING = {
  alpha: 0.35,   // Fattore di reattività (peso attribuito al nuovo frame)
  beta: 0.65,   // Fattore di inerzia (peso attribuito allo storico precedente)
};