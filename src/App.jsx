/**
 * @file App.jsx
 */

import { useState, useEffect } from 'react';
import { usePose } from './hooks/usePose';
import { useVideoRecorder } from './hooks/useVideoRecorder';
import logoUnifi from './assets/logo_unifi.png';

const EXERCISE_LABELS = {
  SQUAT: 'Squat',
  DEADLIFT: 'Stacco da terra',
  OVERHEAD_PRESS: 'Pressa militare',
};

export default function App() {
  const [exercise, setExercise] = useState('SQUAT');
  const [isActive, setIsActive] = useState(false);
  const [facingMode, setFacingMode] = useState('user');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [sessionLogs, setSessionLogs] = useState([]);
  const [isRecording, setIsRecording] = useState(false);

  const handleNewLog = (newLog) => {
    setSessionLogs(prev => [...prev, newLog]);
  };

  const { videoRef, canvasRef, isLoading, error, validReps, reset } = usePose(
    exercise, isActive, facingMode, isRecording, handleNewLog
  );

  const { startRecording, stopRecording } = useVideoRecorder(canvasRef, setIsRecording);

  const playValidationSound = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const audioCtx = new AudioContext();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime);

      gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.25);
    } catch (e) {
      console.warn("Esecuzione del flusso audio interrotta", e);
    }
  };

  useEffect(() => {
    if (validReps > 0) playValidationSound();
  }, [validReps]);

  useEffect(() => {
    async function checkCameras() {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        setHasMultipleCameras(true);
        return;
      }
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(device => device.kind === 'videoinput');
        setHasMultipleCameras(videoInputs.length > 1);
      } catch (err) {
        console.error("Errore nell'inizializzazione della fotocamera:", err);
      }
    }
    checkCameras();
  }, []);

  const clearAllHistory = () => {
    setSessionLogs([]);
    reset();
  };

  return (
    <div className="min-h-screen bg-white text-[#002f6c] flex flex-col items-center p-4 font-sans selection:bg-[#002f6c] selection:text-white">

      <header className="w-full max-w-xl text-center flex flex-col items-center my-8">
        <img src={logoUnifi} alt="Logo Università degli Studi di Firenze" className="w-48 h-auto object-contain mb-8" />
        <h1 className="text-2xl uppercase tracking-widest leading-tight">
          Analisi cinematica in tempo reale per il riconoscimento di ripetizioni valide e non valide
        </h1>
      </header>

      {!isActive ? (
        <div className="w-full max-w-xl flex flex-col gap-6">
          <div className="bg-white border border-[#002f6c] rounded-none p-6 flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <h3 className="text-xs uppercase tracking-widest mb-1">Esercizio</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {Object.entries(EXERCISE_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setExercise(key)}
                    className={`py-3 px-4 rounded-none text-sm border transition-none ${exercise === key ? 'bg-[#002f6c] text-white border-[#002f6c]' : 'bg-white text-[#002f6c] border-[#002f6c] hover:bg-[#002f6c] hover:text-white'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {hasMultipleCameras && (
              <div className="flex flex-col gap-3">
                <h3 className="text-xs uppercase tracking-widest mb-1">2. Seleziona Fotocamera</h3>
                <div className="flex gap-2">
                  <button onClick={() => setFacingMode('user')} className={`flex-1 py-3 rounded-none text-sm border transition-none ${facingMode === 'user' ? 'bg-[#002f6c] text-white' : 'bg-white text-[#002f6c] border-[#002f6c] hover:bg-[#002f6c] hover:text-white'}`}>Fotocamera Anteriore</button>
                  <button onClick={() => setFacingMode('environment')} className={`flex-1 py-3 rounded-none text-sm border transition-none ${facingMode === 'environment' ? 'bg-[#002f6c] text-white' : 'bg-white text-[#002f6c] border-[#002f6c] hover:bg-[#002f6c] hover:text-white'}`}>Fotocamera Posteriore</button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white border border-[#002f6c] rounded-none p-6 flex flex-col gap-3">
            <h3 className="text-xs uppercase tracking-widest">Istruzioni</h3>
            <ul className="list-disc list-outside text-sm space-y-2 ml-4">
              <li>Posizionare il dispositivo al lato del soggetto.</li>
              <li>Assicurarsi che l'intera figura, incluse mani e piedi, siano nell'inquadratura.</li>
              <li>Garantire un elevato contrasto tra il soggetto e lo sfondo.</li>
              <li>Mantenere il dispositivo stabile durante l'intera durata dell'acquisizione.</li>
            </ul>
          </div>

          <button onClick={() => setIsActive(true)} className="w-full py-4 bg-[#002f6c] text-white border border-[#002f6c] rounded-none text-lg uppercase tracking-widest transition-none hover:bg-white hover:text-[#002f6c]">Inizia</button>
        </div>
      ) : (
        <div className="w-full max-w-xl flex flex-col items-center">

          <main className="w-full relative min-h-[50vh] bg-white rounded-none overflow-hidden border border-[#002f6c]">
            {isLoading && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
                <div className="w-8 h-8 border-4 border-[#002f6c] border-t-transparent rounded-none animate-spin" />
                <p className="text-xs text-[#002f6c] mt-4 uppercase tracking-widest">Inizializzazione Modello...</p>
              </div>
            )}

            {error && <div className="absolute inset-0 flex items-center justify-center bg-white p-6 text-center text-sm z-30 border-4 border-[#002f6c] uppercase">{error}</div>}

            {!isLoading && !error && (
              <div className="absolute top-4 right-4 z-30">
                <button
                  onClick={isRecording ? () => stopRecording(true) : startRecording}
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-widest rounded-none border transition-none ${isRecording
                      ? 'bg-red-600 text-white border-red-600 animate-pulse'
                      : 'bg-white text-[#002f6c] border-[#002f6c] hover:bg-[#002f6c] hover:text-white'
                    }`}
                >
                  <span className={`w-3 h-3 rounded-full ${isRecording ? 'bg-white' : 'bg-red-600'}`}></span>
                  {isRecording ? 'STOP E SALVA' : 'INIZIA'}
                </button>
              </div>
            )}

            {/* Il Canvas ora è la vista definitiva. Nessuna classe CSS mirrorClass */}
            <video ref={videoRef} className="hidden" playsInline muted />
            <canvas ref={canvasRef} className="w-full h-auto block" />

            {hasMultipleCameras && !isLoading && !error && !isRecording && (
              <button onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')} className="absolute bottom-16 right-4 bg-white border border-[#002f6c] text-[#002f6c] p-3 rounded-none z-30 transition-none hover:bg-[#002f6c] hover:text-white">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
              </button>
            )}
          </main>
        </div>
      )}

      {sessionLogs.length > 0 && (
        <div className={`w-full max-w-xl flex flex-col gap-6 mt-8 ${!isActive ? 'mb-8' : ''}`}>
          <section className="bg-white border border-[#002f6c] rounded-none overflow-hidden">
            <div className="bg-white border-b border-[#002f6c] px-5 py-4 flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-widest">Registro Acquisizioni</h2>
              <span className="text-[10px] uppercase tracking-wider border border-[#002f6c] px-2.5 py-1 rounded-none">TOTALE: {sessionLogs.length}</span>
            </div>
            <div className="flex flex-col">
              {sessionLogs.slice(-10).reverse().map((log, index) => (
                <div key={`${log.timestamp}-${index}`} className="flex items-center justify-between px-5 py-3 text-sm border-b border-[#002f6c] last:border-b-0">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-widest">{log.time}</span>
                      <span className="uppercase tracking-widest text-xs mt-1">{log.ex === 'SQUAT' ? 'Squat' : log.ex === 'DEADLIFT' ? 'Stacco' : 'Pressa'}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-xs uppercase tracking-wider">{log.esito === 'VALID_REP' ? 'VALIDA' : 'NON VALIDA'}</span>
                    {log.errori !== 'Nessuno' && <span className="text-[10px] uppercase mt-1">{log.errori}</span>}
                  </div>
                </div>
              ))}
              {sessionLogs.length > 10 && <div className="px-5 py-3 text-center text-[10px] border-t border-[#002f6c] uppercase tracking-widest">Visualizzati gli ultimi 10 record della sessione attiva.</div>}
            </div>
          </section>

          {!isActive && (
            <div className="bg-white border border-[#002f6c] rounded-none p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between px-2"><span className="text-xs uppercase tracking-widest">Gestisci Sessione</span></div>
              <button onClick={clearAllHistory} className="w-full py-3 bg-white border border-[#002f6c] hover:bg-[#002f6c] hover:text-white rounded-none text-sm uppercase tracking-widest transition-none">
                Azzera Storico
              </button>
            </div>
          )}
        </div>
      )}

      {isActive && (
        <footer className="w-full max-w-xl mt-6 mb-8">
          <button
            onClick={() => {
              if (isRecording) stopRecording(false);
              setIsActive(false);
            }}
            className="w-full py-4 bg-white border border-[#002f6c] rounded-none text-sm uppercase tracking-widest transition-none hover:bg-[#002f6c] hover:text-white"
          >
            Indietro
          </button>
        </footer>
      )}
    </div>
  );
}