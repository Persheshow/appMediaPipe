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
  
  // Stato per mostrare a schermo il motivo della No-Rep
  const [faultReason, setFaultReason] = useState("");

  // Macchina a stati e metriche Powerlifting
  const movementState = useRef('STANDING'); 
  const lastAngle = useRef(180);
  const smoothedAngleRef = useRef(null); 

  // Oggetto per tracciare rigorosamente le regole IPF
  const strictMetrics = useRef({
    faults: new Set(),
    startX: null,          // Posizione iniziale del piede
    maxAscentAngle: 0,     // Per tracciare il doppio rimbalzo
    lockedAtStart: false,  // Ginocchia bloccate in partenza
    deepEnough: false      // Parallelo rotto
  });

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
        
        // Punti analizzati (Lato sinistro)
        const shoulder = landmarks[11];
        const hip = landmarks[23];
        const knee = landmarks[25];
        const ankle = landmarks[27];
        const wrist = landmarks[15]; // Polso per contatto braccia-gambe

        let angle = null;
        let isDeepEnough = false;

        if (hip.visibility > 0.4 && knee.visibility > 0.4 && ankle.visibility > 0.4) {
          const rawAngle = calculateAngle(hip, knee, ankle);
          
          if (smoothedAngleRef.current === null) smoothedAngleRef.current = rawAngle;
          else smoothedAngleRef.current = (rawAngle * 0.15) + (smoothedAngleRef.current * 0.85);
          
          angle = smoothedAngleRef.current;
          const metrics = strictMetrics.current;

          // Regola 4 (Profondità): La piega dell'anca deve scendere sotto la parte superiore del ginocchio.
          // Nelle coordinate Y del canvas, i valori aumentano verso il basso. Quindi Hip Y > Knee Y significa anca più bassa.
          if (hip.y > knee.y && angle < 95) {
            metrics.deepEnough = true;
          }
          isDeepEnough = metrics.deepEnough;

          const isKneeLocked = angle > 165;
          // Calcola distanza polso-ginocchio (Regola 6) per contatto
          const wristKneeDist = Math.hypot(wrist.x - knee.x, wrist.y - knee.y);
          const isArmTouchingLeg = wrist.visibility > 0.4 && wristKneeDist < 0.05;

          // --- LOGICA IPF POWERLIFTING ---
          
          // FASE 1: IN PIEDI / SETUP
          if (movementState.current === 'STANDING') {
            if (isKneeLocked) {
              metrics.lockedAtStart = true;
              metrics.startX = ankle.x; // Fissa la posizione iniziale del piede
            }
            
            // Inizio discesa
            if (angle < 150) {
              movementState.current = 'DESCENDING';
              metrics.maxAscentAngle = 0;
              
              // Regola 2: Ginocchia non bloccate in partenza
              if (!metrics.lockedAtStart) metrics.faults.add("Ginocchia non bloccate in partenza");
            }
          } 
          
          // FASE 2: DISCESA
          else if (movementState.current === 'DESCENDING') {
            // Inversione del movimento (buca)
            if (angle > lastAngle.current + 2) {
              movementState.current = 'ASCENDING';
              metrics.maxAscentAngle = angle;
            }
          } 
          
          // FASE 3: RISALITA E CHIUSURA
          else if (movementState.current === 'ASCENDING') {
            
            // Regola 1: Doppio rimbalzo. Se l'angolo diminuisce di colpo in risalita...
            if (angle > metrics.maxAscentAngle) {
              metrics.maxAscentAngle = angle;
            } else if (metrics.maxAscentAngle - angle > 4) {
              metrics.faults.add("Doppio rimbalzo (discesa in risalita)");
            }

            // Conclusione ripetizione (Torno su)
            if (angle > 160) {
              // Regola 4: Parallelo
              if (!metrics.deepEnough) metrics.faults.add("Mancato superamento del parallelo");

              if (metrics.faults.size === 0) {
                setValidReps(prev => prev + 1);
                setFaultReason(""); // Nessun errore
              } else {
                setNoReps(prev => prev + 1);
                // Estrae gli errori e li formatta
                setFaultReason(Array.from(metrics.faults).join(" • "));
              }

              // Reset totale per la ripetizione successiva
              movementState.current = 'STANDING';
              metrics.faults.clear();
              metrics.lockedAtStart = false;
              metrics.deepEnough = false;
              if (ankle.visibility > 0.4) metrics.startX = ankle.x;
            }
          }

          // CONTROLLI GLOBALI (attivi durante tutto il sollevamento)
          if (movementState.current !== 'STANDING') {
            // Regola 3 e 5: Movimento del piede. Tolleranza del 4% (0.04) sulla X del canvas
            if (metrics.startX !== null && Math.abs(ankle.x - metrics.startX) > 0.04) {
              metrics.faults.add("Passo / Movimento dei piedi");
            }
            // Regola 6: Contatto braccia-gambe
            if (isArmTouchingLeg) {
              metrics.faults.add("Contatto tra braccia e gambe");
            }
          }

          lastAngle.current = angle;

          // --- DISEGNO ---
          const skeletonColor = isDeepEnough ? "#00ff88" : "#c084fc";
          
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

          ctx.fillStyle = isDeepEnough ? "#00ff88" : "#ffffff";
          [11, 23, 25, 27, 31, 15].forEach(idx => {
            const p = landmarks[idx];
            if (p.visibility > 0.4) {
              ctx.beginPath();
              // Polso (15) colorato in grigio per differenziarlo
              if (idx === 15) ctx.fillStyle = "#64748b"; 
              else ctx.fillStyle = isDeepEnough ? "#00ff88" : "#ffffff";
              
              ctx.arc(p.x * canvas.width, p.y * canvas.height, 6, 0, 2 * Math.PI);
              ctx.fill();
            }
          });

          // Testo angolo
          const angleText = `${Math.round(angle)}°`;
          ctx.font = "bold 24px sans-serif";
          const textX = knee.x * canvas.width + 25;
          const textY = knee.y * canvas.height;
          const textWidth = ctx.measureText(angleText).width;

          ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
          ctx.beginPath();
          ctx.roundRect(textX - 10, textY - 24, textWidth + 20, 34, 8);
          ctx.fill();

          ctx.fillStyle = isDeepEnough ? "#00ff88" : "#ffffff";
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
        <p className="text-xs text-slate-400 mt-1">Modalità Gara Powerlifting</p>
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

      {/* Riquadro Messaggi No-Rep */}
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
          onClick={() => { setValidReps(0); setNoReps(0); setFaultReason(""); }}
          className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 rounded-xl font-medium text-sm transition-colors shadow-md text-slate-300">
          Azzera Contatori
        </button>
      </footer>
    </div>
  );
}

export default App;