import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

function calculateAngle(a, b, c) {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360.0 - angle;
  return angle;
}

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  
  const poseLandmarkerRef = useRef(null);
  const requestRef = useRef(null);
  
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [error, setError] = useState(null);

  const [validReps, setValidReps] = useState(0);
  const [noReps, setNoReps] = useState(0);
  const [faultReason, setFaultReason] = useState("");
  
  // Gestione Esercizio: 'SQUAT' o 'DEADLIFT'
  const [uiExercise, setUiExercise] = useState('SQUAT');
  const exerciseRef = useRef('SQUAT'); 

  const movementState = useRef('STANDING'); 
  const lastAngle = useRef(180);
  const smoothedKneeRef = useRef(null); 
  const smoothedHipRef = useRef(null); 

  const strictMetrics = useRef({
    faults: new Set(),
    startX: null,          
    maxAscentAngle: 0,     
    lockedAtStart: false,  
    deepEnough: false,
    minWristY: 1.0         // Per tracciare la traiettoria verticale del bilanciere
  });

  const toggleExercise = () => {
    const nextEx = uiExercise === 'SQUAT' ? 'DEADLIFT' : 'SQUAT';
    setUiExercise(nextEx);
    exerciseRef.current = nextEx;
    
    // Reset di tutti i contatori e stati al cambio di esercizio
    setValidReps(0);
    setNoReps(0);
    setFaultReason("");
    movementState.current = 'STANDING';
    strictMetrics.current = { faults: new Set(), startX: null, maxAscentAngle: 0, lockedAtStart: false, deepEnough: false, minWristY: 1.0 };
    smoothedKneeRef.current = null;
    smoothedHipRef.current = null;
  };

  useEffect(() => {
    async function loadMediaPipeModel() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
        );
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numPoses: 1
        });
        poseLandmarkerRef.current = landmarker;
        setIsModelLoaded(true);
      } catch (err) {
        setError("Errore caricamento MediaPipe: " + err.message);
      }
    }
    loadMediaPipeModel();
  }, []);

  useEffect(() => {
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            setIsCameraReady(true);
          };
        }
      } catch (err) {
        setError("Impossibile accedere fotocamera: " + err.message);
      }
    }
    setupCamera();
  }, []);

  const predictAndDraw = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = poseLandmarkerRef.current;
    const currentEx = exerciseRef.current;

    if (video && canvas && landmarker && video.readyState >= 2) {
      const ctx = canvas.getContext("2d");
      
      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const results = landmarker.detectForVideo(video, performance.now());
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (results.landmarks && results.landmarks.length > 0) {
        const landmarks = results.landmarks[0];
        
        const shoulder = landmarks[11];
        const hip = landmarks[23];
        const knee = landmarks[25];
        const ankle = landmarks[27];
        const wrist = landmarks[15]; 

        let kneeAngle = null;
        let hipAngle = null;
        let isTargetReached = false;

        if (hip.visibility > 0.4 && knee.visibility > 0.4 && ankle.visibility > 0.4 && shoulder.visibility > 0.4) {
          
          // Smoothing Ginocchio
          const rawKneeAngle = calculateAngle(hip, knee, ankle);
          if (smoothedKneeRef.current === null) smoothedKneeRef.current = rawKneeAngle;
          else smoothedKneeRef.current = (rawKneeAngle * 0.15) + (smoothedKneeRef.current * 0.85);
          kneeAngle = smoothedKneeRef.current;

          // Smoothing Anca (Postura eretta)
          const rawHipAngle = calculateAngle(shoulder, hip, knee);
          if (smoothedHipRef.current === null) smoothedHipRef.current = rawHipAngle;
          else smoothedHipRef.current = (rawHipAngle * 0.15) + (smoothedHipRef.current * 0.85);
          hipAngle = smoothedHipRef.current;

          const metrics = strictMetrics.current;

          // ==============================
          // LOGICA SQUAT
          // ==============================
          if (currentEx === 'SQUAT') {
            if (hip.y > knee.y && kneeAngle < 95) metrics.deepEnough = true;
            isTargetReached = metrics.deepEnough;

            const isKneeLocked = kneeAngle > 165;
            const wristKneeDist = Math.hypot(wrist.x - knee.x, wrist.y - knee.y);
            const isArmTouchingLeg = wrist.visibility > 0.4 && wristKneeDist < 0.05;

            if (movementState.current === 'STANDING') {
              if (isKneeLocked) {
                metrics.lockedAtStart = true;
                metrics.startX = ankle.x; 
              }
              if (kneeAngle < 150) {
                movementState.current = 'DESCENDING';
                metrics.maxAscentAngle = 0;
                if (!metrics.lockedAtStart) metrics.faults.add("Ginocchia non bloccate in partenza");
              }
            } 
            else if (movementState.current === 'DESCENDING') {
              if (kneeAngle > lastAngle.current + 2) {
                movementState.current = 'ASCENDING';
                metrics.maxAscentAngle = kneeAngle;
              }
            } 
            else if (movementState.current === 'ASCENDING') {
              if (kneeAngle > metrics.maxAscentAngle) metrics.maxAscentAngle = kneeAngle;
              else if (metrics.maxAscentAngle - kneeAngle > 4) metrics.faults.add("Doppio rimbalzo (discesa in risalita)");

              if (kneeAngle > 160) {
                if (!metrics.deepEnough) metrics.faults.add("Mancato superamento del parallelo");
                if (metrics.faults.size === 0) { setValidReps(prev => prev + 1); setFaultReason(""); } 
                else { setNoReps(prev => prev + 1); setFaultReason(Array.from(metrics.faults).join(" • ")); }
                
                movementState.current = 'STANDING';
                metrics.faults.clear();
                metrics.lockedAtStart = false;
                metrics.deepEnough = false;
                if (ankle.visibility > 0.4) metrics.startX = ankle.x;
              }
            }
            if (movementState.current !== 'STANDING') {
              if (metrics.startX !== null && Math.abs(ankle.x - metrics.startX) > 0.04) metrics.faults.add("Passo / Movimento dei piedi");
              if (isArmTouchingLeg) metrics.faults.add("Contatto tra braccia e gambe");
            }
            lastAngle.current = kneeAngle;
          }

          // ==============================
          // LOGICA DEADLIFT
          // ==============================
          else if (currentEx === 'DEADLIFT') {
            const isKneesLocked = kneeAngle > 165;
            const isHipsLocked = hipAngle > 165;
            const isErect = isKneesLocked && isHipsLocked;
            isTargetReached = isErect; // Diventa verde alla chiusura dell'alzata

            // FASE DI SETUP: Atleta abbassato, bilanciere a terra
            if (movementState.current === 'STANDING' || movementState.current === 'DROPPING') {
              if (!isErect && wrist.y > 0.65) { 
                movementState.current = 'SETUP';
                metrics.faults.clear();
                metrics.minWristY = wrist.y;
                setFaultReason("");
              }
            }
            // FASE DI TRAZIONE (INIZIO)
            else if (movementState.current === 'SETUP') {
              // Il polso sale (Y diminuisce) di oltre il 2%
              if (wrist.y < metrics.minWristY - 0.02) {
                movementState.current = 'LIFTING';
              } else {
                metrics.minWristY = Math.max(metrics.minWristY, wrist.y);
              }
            }
            // FASE DI ASCESA
            else if (movementState.current === 'LIFTING') {
              // Aggiorna il punto più alto raggiunto dal bilanciere (valore Y più piccolo)
              if (wrist.y < metrics.minWristY) {
                metrics.minWristY = wrist.y;
              } 
              // Regola: Movimento verso il basso. Se la Y del polso aumenta oltre la tolleranza
              else if (wrist.y > metrics.minWristY + 0.02) {
                metrics.faults.add("Movimento verso il basso (Ramping/Hitching)");
              }

              // Chiusura alzata
              if (isErect) {
                if (metrics.faults.size === 0) {
                  setValidReps(prev => prev + 1);
                  setFaultReason("");
                } else {
                  setNoReps(prev => prev + 1);
                  setFaultReason(Array.from(metrics.faults).join(" • "));
                }
                movementState.current = 'LOCKED';
              }
            }
            // FASE DI CHIUSURA / RITORNO A TERRA
            else if (movementState.current === 'LOCKED') {
              // Se le articolazioni si flettono e il bilanciere scende, preparati per la rep successiva
              if (!isErect && wrist.y > metrics.minWristY + 0.05) {
                movementState.current = 'DROPPING';
              }
            }
          }

          // --- DISEGNO CONDIVISO ---
          const skeletonColor = isTargetReached ? "#00ff88" : "#c084fc";
          ctx.lineWidth = 5;
          ctx.strokeStyle = skeletonColor; 
          
          const connections = [[11, 23], [23, 25], [25, 27], [27, 31]];
          connections.forEach(([s, e]) => {
            const p1 = landmarks[s], p2 = landmarks[e];
            if (p1.visibility > 0.4 && p2.visibility > 0.4) {
              ctx.beginPath();
              ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
              ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
              ctx.stroke();
            }
          });

          ctx.fillStyle = isTargetReached ? "#00ff88" : "#ffffff";
          [11, 23, 25, 27, 31, 15].forEach(idx => {
            const p = landmarks[idx];
            if (p.visibility > 0.4) {
              ctx.beginPath();
              if (idx === 15) ctx.fillStyle = "#64748b"; 
              else ctx.fillStyle = isTargetReached ? "#00ff88" : "#ffffff";
              ctx.arc(p.x * canvas.width, p.y * canvas.height, 6, 0, 2 * Math.PI);
              ctx.fill();
            }
          });

          // Testo UI (Angolo Ginocchio per Squat, Angolo Anca/Ginocchio per Stacco)
          let angleText = currentEx === 'SQUAT' ? `${Math.round(kneeAngle)}°` : `H:${Math.round(hipAngle)}° K:${Math.round(kneeAngle)}°`;
          ctx.font = "bold 20px sans-serif";
          
          const textX = hip.x * canvas.width + 25;
          const textY = hip.y * canvas.height;
          const textWidth = ctx.measureText(angleText).width;

          ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
          ctx.beginPath();
          ctx.roundRect(textX - 10, textY - 24, textWidth + 20, 34, 8);
          ctx.fill();

          ctx.fillStyle = isTargetReached ? "#00ff88" : "#ffffff";
          ctx.fillText(angleText, textX, textY);
        }
      }
      ctx.restore();
    }
    requestRef.current = requestAnimationFrame(predictAndDraw);
  };

  useEffect(() => {
    if (isCameraReady && isModelLoaded) requestRef.current = requestAnimationFrame(predictAndDraw);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [isCameraReady, isModelLoaded]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center p-4 font-sans">
      <header className="w-full max-w-md text-center my-4">
        <h1 className="text-2xl font-bold tracking-tight text-indigo-400">FormCheck AI</h1>
        <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest">{uiExercise} IPF MODE</p>
      </header>

      <section className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-4 flex justify-around mb-4 shadow-lg">
        <div className="text-center">
          <p className="text-xs uppercase tracking-wider text-slate-400">Rep Valide</p>
          <p className="text-3xl font-black text-emerald-400 mt-1">{validReps}</p>
        </div>
        <div className="w-px bg-slate-800 self-stretch"></div>
        <div className="text-center">
          <p className="text-xs uppercase tracking-wider text-slate-400">No-Rep</p>
          <p className="text-3xl font-black text-rose-500 mt-1">{noReps}</p>
        </div>
      </section>

      {faultReason && (
        <div className="w-full max-w-md mb-4 bg-rose-950/50 border border-rose-800 rounded-xl p-3 text-center shadow-lg">
          <p className="text-xs font-bold uppercase tracking-wider text-rose-400 mb-1">Motivo No-Rep:</p>
          <p className="text-sm font-medium text-rose-200">{faultReason}</p>
        </div>
      )}

      <main className="w-full max-w-md relative aspect-[3/4] bg-black rounded-xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center">
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center text-sm text-rose-400 z-20">
            {error}
          </div>
        )}
        
        {(!isCameraReady || !isModelLoaded) && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-10">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs text-slate-400 mt-3">
              {!isModelLoaded ? "Caricamento rete neurale..." : "Avvio fotocamera..."}
            </p>
          </div>
        )}

        <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" playsInline muted />
        <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full object-cover scale-x-[-1]" />
      </main>

      <footer className="w-full max-w-md mt-4 flex gap-2">
        <button 
          onClick={toggleExercise}
          className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-xl font-medium text-sm transition-colors shadow-md">
          Passa a {uiExercise === 'SQUAT' ? 'DEADLIFT' : 'SQUAT'}
        </button>
        <button 
          onClick={() => { setValidReps(0); setNoReps(0); setFaultReason(""); }}
          className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 rounded-xl font-medium text-sm transition-colors shadow-md text-slate-300">
          Azzera
        </button>
      </footer>
    </div>
  );
}

export default App;