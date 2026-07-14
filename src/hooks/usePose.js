import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { processFrame, createInitialState } from '../logic/repLogic';
import { drawSkeleton, drawSquatOverlays, drawHUD } from '../utils/canvasRenderer';
import { ESERCIZI } from '../config/exercises';

export function usePose(esercizio, attivo, latoCamera, registrazioneAttiva, logCallback) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const modelloRef = useRef(null);
  const frameIdRef = useRef(null);
  const statoRepRef = useRef(createInitialState());
  const primoCaricamentoRef = useRef(true);
  const angoliPrecRef = useRef({ primary: null, secondary: null });
  const framePersiRef = useRef(0);
  const ultimoTempoVideoRef = useRef(-1);
  const ginocchioYSmoothRef = useRef(null);
  const registrazioneRef = useRef(registrazioneAttiva);

  const contatoreValideRef = useRef(0);
  const contatoreNonValideRef = useRef(0);
  const messaggioHudRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isTrackingLost, setIsTrackingLost] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Inizializzazione Modello...');
  const [error, setError] = useState(null);
  const [validReps, setValidReps] = useState(0);
  const [noReps, setNoReps] = useState(0);
  const [faults, setFaults] = useState([]);
  const [angles, setAngles] = useState({ primary: null, secondary: null });

  useEffect(() => {
    statoRepRef.current = createInitialState();
    angoliPrecRef.current = { primary: null, secondary: null };
    framePersiRef.current = 0;
    ginocchioYSmoothRef.current = null;

    contatoreValideRef.current = 0;
    contatoreNonValideRef.current = 0;
    messaggioHudRef.current = null;

    setValidReps(0);
    setNoReps(0);
    setFaults([]);
    setAngles({ primary: null, secondary: null });
    setIsTrackingLost(false);
  }, [esercizio, attivo, latoCamera]);

  useEffect(() => {
    registrazioneRef.current = registrazioneAttiva;
    if (registrazioneAttiva) reset();
  }, [registrazioneAttiva]);

  useEffect(() => {
    let componenteMontato = true;
    async function caricaModello() {
      try {
        const vision = await FilesetResolver.forVisionTasks('/wasm');
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: '/models/pose_landmarker_lite.task', delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
        if (componenteMontato) modelloRef.current = landmarker;
        else landmarker.close();
      } catch (err) {
        if (componenteMontato) setError('Errore caricamento modello: ' + err.message);
      }
    }
    caricaModello();
    return () => {
      componenteMontato = false;
      if (modelloRef.current) {
        modelloRef.current.close();
        modelloRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!attivo) return;
    const elVideo = videoRef.current;
    async function avviaFotocamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: latoCamera }, audio: false });
        if (elVideo) {
          elVideo.srcObject = stream;
          elVideo.onloadedmetadata = () => elVideo.play();
        }
      } catch (err) {
        setError('Impossibile accedere al sensore ottico: ' + err.message);
      }
    }
    avviaFotocamera();
    return () => {
      if (elVideo?.srcObject) {
        elVideo.srcObject.getTracks().forEach(t => t.stop());
        elVideo.srcObject = null;
      }
    };
  }, [attivo, latoCamera]);

  useEffect(() => {
    if (!attivo) return;

    function calcolaLatoInquadrato(punti) {
      const visSx = punti[11].visibility + punti[23].visibility + punti[25].visibility;
      const visDx = punti[12].visibility + punti[24].visibility + punti[26].visibility;
      const zSx = punti[11].z + punti[23].z + punti[25].z;
      const zDx = punti[12].z + punti[24].z + punti[26].z;
      if (visSx > visDx + 0.2 && zSx < zDx) return 'LEFT';
      if (visDx > visSx + 0.2 && zDx < zSx) return 'RIGHT';
      return visSx >= visDx ? 'LEFT' : 'RIGHT';
    }

    function ciclo() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = modelloRef.current;

      if (video && canvas && landmarker && video.readyState >= 2) {
        if (video.currentTime === ultimoTempoVideoRef.current) {
          frameIdRef.current = requestAnimationFrame(ciclo);
          return;
        }
        ultimoTempoVideoRef.current = video.currentTime;

        const ctx = canvas.getContext('2d');
        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const specchiato = latoCamera === 'user';
        ctx.save();
        if (specchiato) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        if (primoCaricamentoRef.current) {
          setIsLoading(false); primoCaricamentoRef.current = false;
        }

        if (!registrazioneRef.current) {
          ctx.restore();
          drawHUD(ctx, canvas.width, canvas.height, contatoreValideRef.current, null, false, null);
          frameIdRef.current = requestAnimationFrame(ciclo);
          return;
        }

        const risultati = landmarker.detectForVideo(video, performance.now());
        let bersaglioOk = false;
        let latoRilevato = 'LEFT';

        if (risultati.landmarks?.length > 0) {
          framePersiRef.current = 0;
          setIsTrackingLost(prev => { if (prev) return false; return prev; });

          const punti = risultati.landmarks[0];
          latoRilevato = calcolaLatoInquadrato(punti);

          const esito = processFrame(esercizio, statoRepRef.current, punti, latoRilevato);
          statoRepRef.current = esito.state;
          const { event, primaryAngle, secondaryAngle } = esito;
          bersaglioOk = esito.isTarget;

          if (Math.abs((primaryAngle ?? 0) - (angoliPrecRef.current.primary ?? 0)) > 1 || Math.abs((secondaryAngle ?? 0) - (angoliPrecRef.current.secondary ?? 0)) > 1) {
            setAngles({ primary: primaryAngle, secondary: secondaryAngle });
            angoliPrecRef.current = { primary: primaryAngle, secondary: secondaryAngle };
          }

          if (event?.type === 'VALID_REP' || event?.type === 'NO_REP') {
            const isValida = event.type === 'VALID_REP';

            if (isValida) {
              contatoreValideRef.current += 1;
              setValidReps(contatoreValideRef.current);
              setFaults([]);
              messaggioHudRef.current = { type: 'VALID', text: '✓ RIPETIZIONE VALIDA', expires: performance.now() + 2000 };
            }
            else {
              contatoreNonValideRef.current += 1;
              setNoReps(contatoreNonValideRef.current);
              setFaults(event.faults);
              messaggioHudRef.current = { type: 'INVALID', text: `NO REP: ${event.faults.join(' - ')}`, expires: performance.now() + 3000 };
            }

            const adesso = new Date();
            if (logCallback) {
              logCallback({
                timestamp: adesso.toISOString(),
                time: adesso.toLocaleTimeString('it-IT', { hour12: false }),
                ex: esercizio,
                side: latoRilevato,
                esito: event.type,
                primaryAngle: primaryAngle === null ? '' : Math.round(primaryAngle),
                finalState: statoRepRef.current.movementState,
                errori: event.faults?.length ? event.faults.join(' - ') : 'Nessuno',
              });
            }
          }

          const erroreLampeggiante = messaggioHudRef.current && performance.now() < messaggioHudRef.current.expires && messaggioHudRef.current.type === 'INVALID';

          drawSkeleton(ctx, punti, canvas.width, canvas.height, bersaglioOk, latoRilevato, esercizio, erroreLampeggiante);

          if (esercizio === 'SQUAT') {
            const puntoGinocchio = punti[ESERCIZI.SQUAT.landmarks[latoRilevato].knee];
            drawSquatOverlays(ctx, canvas.width, canvas.height, puntoGinocchio, bersaglioOk, ginocchioYSmoothRef);
          }

        } else {
          framePersiRef.current++;
          if (framePersiRef.current > 30) {
            setIsTrackingLost(prev => { if (!prev) return true; return prev; });
          }
        }

        ctx.restore();

        drawHUD(
          ctx,
          canvas.width,
          canvas.height,
          contatoreValideRef.current,
          messaggioHudRef.current,
          framePersiRef.current > 30,
          statoRepRef.current.lastAngle
        );
      }
      frameIdRef.current = requestAnimationFrame(ciclo);
    }

    frameIdRef.current = requestAnimationFrame(ciclo);
    return () => { if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current); };
  }, [esercizio, attivo, latoCamera]);

  function reset() {
    statoRepRef.current = createInitialState();
    angoliPrecRef.current = { primary: null, secondary: null };
    framePersiRef.current = 0;
    ginocchioYSmoothRef.current = null;

    contatoreValideRef.current = 0;
    contatoreNonValideRef.current = 0;
    messaggioHudRef.current = null;

    setValidReps(0);
    setNoReps(0);
    setFaults([]);
    setAngles({ primary: null, secondary: null });
    setIsTrackingLost(false);
  }

  return { videoRef, canvasRef, isLoading, isTrackingLost, loadingMsg, error, validReps, noReps, faults, angles, reset };
}