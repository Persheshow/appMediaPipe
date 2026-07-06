export const EXERCISES = {
  SQUAT: {
    name: 'Squat',
    // Landmark usati (lato sinistro)
    landmarks: {
      shoulder: 11,
      hip: 23,
      knee: 25,
      ankle: 27,
      wrist: 15,
    },
    // Soglie per la macchina a stati
    thresholds: {
      bottomKnee: 95,      // angolo ginocchio MAX per considerare il fondo valido
      topKnee: 160,        // angolo ginocchio MIN per considerare la posizione eretta
      startLock: 165,      // angolo per considerare le ginocchia bloccate in partenza
      parallelCheck: true, // controlla se l'anca scende sotto il ginocchio
      wristKneeDist: 0.05, // distanza MAX polso-ginocchio prima di segnalare contatto
      bounceTolerance: 4,  // gradi di oscillazione prima di segnalare doppio rimbalzo
    },
    // Angoli da mostrare nell'HUD
    display: {
      primary: 'knee',
      label: (knee) => `${Math.round(knee)}°`,
    },
    // Connessioni scheletro da disegnare
    connections: [[11, 23], [23, 25], [25, 27], [27, 31]],
    nodes: [11, 23, 25, 27, 31, 15],
  },

  DEADLIFT: {
    name: 'Stacco',
    landmarks: {
      shoulder: 11,
      hip: 23,
      knee: 25,
      ankle: 27,
      wrist: 15,
    },
    thresholds: {
      erectKnee: 165,       // ginocchio bloccato
      erectHip: 165,        // anca bloccata (lockout completo)
      setupWristY: 0.65,    // Y minima del polso per considerare setup a terra
      liftThreshold: 0.02,  // quanto deve salire il polso per iniziare la fase di trazione
      hitchTolerance: 0.02, // tolleranza prima di segnalare ramping/hitching
      dropThreshold: 0.05,  // quanto deve scendere il polso per tornare in setup
    },
    display: {
      primary: 'both',
      label: (hip, knee) => `H:${Math.round(hip)}° K:${Math.round(knee)}°`,
    },
    connections: [[11, 23], [23, 25], [25, 27], [27, 31]],
    nodes: [11, 23, 25, 27, 31, 15],
  },

  OVERHEAD_PRESS: {
  name: 'Overhead Press',
  landmarks: {
    shoulder: 11,  // spalla sinistra
    elbow: 13,     // gomito sinistro
    wrist: 15,     // polso sinistro
    hip: 23,       // anca sinistra (per iperlordosi)
  },
  thresholds: {
    bottomElbow: 90,   // angolo gomito MAX per considerare bottom valido
    topElbow: 155,     // angolo gomito MIN per lockout
    maxTrunkLean: 20,  // gradi MAX inclinazione tronco prima di segnalare iperlordosi
  },
  display: {
    primary: 'elbow',
    label: (elbow) => `${Math.round(elbow)}°`,
  },
  connections: [[11, 13], [13, 15], [11, 23]],
  nodes: [11, 13, 15, 23],
},
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