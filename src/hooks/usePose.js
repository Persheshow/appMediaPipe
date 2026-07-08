/**
 * @file usePose.js
 * @description Hook custom React per l'integrazione del modello di Computer Vision MediaPipe.
 * Gestisce l'acquisizione del flusso video, l'allocazione in memoria della rete neurale (WASM),
 * l'elaborazione frame-by-frame (inferenza) e la sincronizzazione con la logica di validazione cinematica.
 */

import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { processFrame, createInitialState } from '../logic/repLogic';
import { EXERCISES } from '../config/exercises';

export function usePose(exercise, isActive, cameraSide, facingMode, onNewLog) {
  // ── RIFERIMENTI MUTABILI (REFS) ────────────────────────────────────────────
  // Utilizzati per mantenere lo stato all'interno del loop di animazione (60 FPS)
  // senza scatenare continui e onerosi re-render del DOM da parte di React.
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null); // Istanza del modello MediaPipe
  const animFrameRef = useRef(null); // ID del requestAnimationFrame per cleanup
  const repStateRef = useRef(createInitialState()); // Memoria della Macchina a Stati
  const isLoadingRef = useRef(true); // Flag sincrono per il caricamento
  const prevAnglesRef = useRef({ primary: null, secondary: null }); // Buffer angoli precedenti
  const noLandmarkFrames = useRef(0); // Contatore per rilevamento occlusione/assenza target
  const lastVideoTimeRef = useRef(-1); // Evita l'elaborazione di frame duplicati

  // ── STATO REATTIVO DELL'INTERFACCIA (STATE) ─────────────────────────────────
  // Variabili che necessitano di aggiornare visivamente la UI quando cambiano.
  const [isLoading, setIsLoading] = useState(true);
  const [isTrackingLost, setIsTrackingLost] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Inizializzazione Modello...');
  const [error, setError] = useState(null);
  const [validReps, setValidReps] = useState(0);
  const [noReps, setNoReps] = useState(0);
  const [faults, setFaults] = useState([]);
  const [angles, setAngles] = useState({ primary: null, secondary: null });

  // ── RESET DEI CONTATORI LOCALI ──────────────────────────────────────────────
  // Si attiva ogni volta che l'utente cambia esercizio, lato o fotocamera,
  // garantendo che la Macchina a Stati parta da un foglio pulito.
  useEffect(() => {
    repStateRef.current = createInitialState();
    prevAnglesRef.current = { primary: null, secondary: null };
    noLandmarkFrames.current = 0;
    setValidReps(0);
    setNoReps(0);
    setFaults([]);
    setAngles({ primary: null, secondary: null });
    setIsTrackingLost(false);
  }, [exercise, isActive, cameraSide, facingMode]);

  // ── INIZIALIZZAZIONE DELLA RETE NEURALE ─────────────────────────────────────
  // Carica il modello MediaPipe Pose Lite in memoria sfruttando WebAssembly (WASM).
  // La computazione viene delegata alla GPU per massimizzare le prestazioni in real-time.
  useEffect(() => {
    let isMounted = true;
    async function loadModel() {
      try {
        const vision = await FilesetResolver.forVisionTasks('/wasm');
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/models/pose_landmarker_lite.task',
            delegate: 'GPU', // Accelerazione hardware
          },
          runningMode: 'VIDEO', // Ottimizzazione per flussi video continui
          numPoses: 1, // Limita la ricerca a un solo soggetto per migliorare le performance
        });
        if (isMounted) { landmarkerRef.current = landmarker; }
        else { landmarker.close(); } // Cleanup se il componente viene smontato prematuramente
      } catch (err) {
        if (isMounted) setError('Errore caricamento modello: ' + err.message);
      }
    }
    loadModel();
    return () => {
      isMounted = false;
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, []);

  // ── ACQUISIZIONE FLUSSO VIDEO ───────────────────────────────────────────────
  // Richiede i permessi all'utente e instrada lo stream della fotocamera scelta
  // all'elemento <video> invisibile utilizzato per l'inferenza.
  useEffect(() => {
    if (!isActive) return;
    const videoElement = videoRef.current;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facingMode }, // 'user' o 'environment'
          audio: false,
        });
        if (videoElement) {
          videoElement.srcObject = stream;
          videoElement.onloadedmetadata = () => videoElement.play();
        }
      } catch (err) {
        setError('Impossibile accedere al sensore ottico: ' + err.message);
      }
    }
    startCamera();

    // Rilascio delle risorse hardware allo smontaggio o al cambio fotocamera
    return () => {
      if (videoElement?.srcObject) {
        videoElement.srcObject.getTracks().forEach(t => t.stop());
        videoElement.srcObject = null;
      }
    };
  }, [isActive, facingMode]);

  // ── PIPELINE DI ELABORAZIONE (MAIN LOOP) ────────────────────────────────────
  // Questo hook gestisce il ciclo continuo di analisi dei frame video.
  useEffect(() => {
    if (!isActive) return;

    /**
     * @function drawSkeleton
     * @description Renderizza un overlay topologico (scheletro) sul canvas HTML.
     * I colori indicano dinamicamente il raggiungimento dei target cinematici (es. parallelo).
     */
    function drawSkeleton(ctx, landmarks, w, h, isTargetReached, side, ex) {
      const color = isTargetReached ? '#00ff88' : '#c084fc'; // Verde (Target ok), Viola (Tracking)
      ctx.lineWidth = 5;
      ctx.strokeStyle = color;

      const lmConfig = EXERCISES[ex]?.landmarks[side];
      if (!lmConfig) return;

      // Definizione dei segmenti ossei da renderizzare in base all'esercizio
      const baseConnections = [[lmConfig.shoulder, lmConfig.hip], [lmConfig.hip, lmConfig.knee], [lmConfig.knee, lmConfig.ankle]];
      const armConnections = (ex === 'OVERHEAD_PRESS' || ex === 'DEADLIFT') && lmConfig.elbow
        ? [[lmConfig.shoulder, lmConfig.elbow], [lmConfig.elbow, lmConfig.wrist]] : [];

      // Tracciamento delle linee di connessione
      [...baseConnections, ...armConnections].forEach(([s, e]) => {
        if (s === undefined || e === undefined) return;
        const p1 = landmarks[s], p2 = landmarks[e];
        if (p1 && p2 && p1.visibility > 0.4 && p2.visibility > 0.4) {
          ctx.beginPath(); ctx.moveTo(p1.x * w, p1.y * h); ctx.lineTo(p2.x * w, p2.y * h); ctx.stroke();
        }
      });

      // Tracciamento dei giunti (nodi) articolari
      const allNodes = Object.values(lmConfig).filter(v => typeof v === 'number');
      allNodes.forEach(idx => {
        const p = landmarks[idx];
        if (p && p.visibility > 0.4) {
          ctx.beginPath();
          ctx.fillStyle = isTargetReached ? '#00ff88' : '#ffffff';
          ctx.arc(p.x * w, p.y * h, 6, 0, 2 * Math.PI); ctx.fill();
        }
      });
    }

    /**
     * @function loop
     * @description Funzione ricorsiva agganciata al refresh rate dello schermo.
     * Invia i frame alla rete neurale, elabora i vettori risultanti e aggiorna UI/Log.
     */
    function loop() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;

      // Esecuzione subordinata alla disponibilità di tutte le risorse
      if (video && canvas && landmarker && video.readyState >= 2) {

        // Evita sprechi computazionali se il frame video è identico al precedente
        if (video.currentTime === lastVideoTimeRef.current) {
          animFrameRef.current = requestAnimationFrame(loop);
          return;
        }
        lastVideoTimeRef.current = video.currentTime;

        const ctx = canvas.getContext('2d');
        // Sincronizzazione delle dimensioni logiche del canvas con la risoluzione video reale
        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        // 1. INFERENZA: Riconoscimento dei landmark 3D tramite la rete neurale
        const results = landmarker.detectForVideo(video, performance.now());
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Pulizia del frame precedente

        // Rimozione del loader iniziale alla prima esecuzione avvenuta con successo
        if (isLoadingRef.current) {
          setIsLoading(false); isLoadingRef.current = false;
        }

        if (results.landmarks?.length > 0) {
          // Soggetto rilevato: azzera il contatore di occlusione
          noLandmarkFrames.current = 0;
          setIsTrackingLost(prev => { if (prev) return false; return prev; });

          const lms = results.landmarks[0]; // Array di 33 landmark (x, y, z, visibility)

          // 2. ELABORAZIONE LOGICA: Delega dell'analisi geometrica alla Macchina a Stati (FSM)
          const { state, event, primaryAngle, secondaryAngle, isTarget } = processFrame(
            exercise, repStateRef.current, lms, cameraSide
          );
          repStateRef.current = state; // Persistenza dello stato logico per il frame successivo

          // 3. AGGIORNAMENTO UI: Trasmette i nuovi angoli allo stato React solo se variati di > 1°
          // (Questo riduce drasticamente il carico sulla CPU evitando re-render inutili)
          if (
            Math.abs((primaryAngle ?? 0) - (prevAnglesRef.current.primary ?? 0)) > 1 ||
            Math.abs((secondaryAngle ?? 0) - (prevAnglesRef.current.secondary ?? 0)) > 1
          ) {
            setAngles({ primary: primaryAngle, secondary: secondaryAngle });
            prevAnglesRef.current = { primary: primaryAngle, secondary: secondaryAngle };
          }

          // 4. GESTIONE EVENTI: Rilevazione del termine di una ripetizione
          if (event?.type === 'VALID_REP' || event?.type === 'NO_REP') {
            const isValida = event.type === 'VALID_REP';

            // Aggiornamento dei contatori globali
            if (isValida) { setValidReps(prev => prev + 1); setFaults([]); }
            else { setNoReps(prev => prev + 1); setFaults(event.faults); }

            const timestamp = new Date();

            // Creazione e invio del record dati al componente padre (App.jsx) per l'export CSV
            if (onNewLog) {
              onNewLog({
                timestamp: timestamp.toISOString(),
                time: timestamp.toLocaleTimeString('it-IT', { hour12: false }),
                ex: exercise,
                side: cameraSide,
                esito: event.type,
                primaryAngle: primaryAngle === null ? '' : Math.round(primaryAngle),
                finalState: state.movementState,
                errori: event.faults?.length ? event.faults.join(' - ') : 'Nessuno',
              });
            }
          }

          // 5. RENDERING OVERLAY GRAFICO
          drawSkeleton(ctx, lms, canvas.width, canvas.height, isTarget, cameraSide, exercise);

        } else {
          // Soggetto NON rilevato: incremento del contatore
          noLandmarkFrames.current++;
          // Se l'occlusione persiste per più di ~0.5s (30 frame), avvisa l'utente
          if (noLandmarkFrames.current > 30) {
            setIsTrackingLost(prev => { if (!prev) return true; return prev; });
          }
        }
      }
      // Richiesta di pianificazione del prossimo frame
      animFrameRef.current = requestAnimationFrame(loop);
    }

    // Innesco iniziale del loop di animazione
    animFrameRef.current = requestAnimationFrame(loop);

    // Cleanup: interruzione del ciclo di rendering alla disattivazione del sensore
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [exercise, isActive, cameraSide, facingMode]); // Dipendenze che causano il riavvio del loop

  /**
   * @function reset
   * @description Espone all'esterno la possibilità di resettare manualmente la telemetria.
   */
  function reset() {
    repStateRef.current = createInitialState();
    prevAnglesRef.current = { primary: null, secondary: null };
    noLandmarkFrames.current = 0;
    setValidReps(0);
    setNoReps(0);
    setFaults([]);
    setAngles({ primary: null, secondary: null });
    setIsTrackingLost(false);
  }

  // Interfaccia pubblica dell'hook
  return { videoRef, canvasRef, isLoading, isTrackingLost, loadingMsg, error, validReps, noReps, faults, angles, reset };
}