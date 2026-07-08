import { useState, useEffect } from 'react';
import { usePose } from './hooks/usePose';

const EXERCISE_LABELS = {
  SQUAT: 'Squat',
  DEADLIFT: 'Stacco da terra',
  OVERHEAD_PRESS: 'Pressa militare',
};

export default function App() {
  const [exercise, setExercise] = useState('SQUAT');
  const [isActive, setIsActive] = useState(false);
  const [cameraSide, setCameraSide] = useState('LEFT');
  const [facingMode, setFacingMode] = useState('user');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  // Stato dello storico centralizzato nell'interfaccia principale
  const [sessionLogs, setSessionLogs] = useState([]);

  // Callback per registrare la ripetizione nello stato globale di App.jsx
  const handleNewLog = (newLog) => {
    setSessionLogs(prev => [...prev, newLog]);
  };

  const { videoRef, canvasRef, isLoading, isTrackingLost, loadingMsg, error, validReps, faults, angles, reset } = usePose(
    exercise, isActive, cameraSide, facingMode, handleNewLog
  );

  const exerciseLabel = EXERCISE_LABELS[exercise];
  const mirrorClass = facingMode === 'user' ? 'scale-x-[-1]' : '';

  useEffect(() => {
    async function checkCameras() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(device => device.kind === 'videoinput');
        setHasMultipleCameras(videoInputs.length > 1);
      } catch (err) {
        console.error("Impossibile rilevare i dispositivi video:", err);
      }
    }
    checkCameras();
  }, []);

  // Rimossa la colonna dell'angolo secondario dall'esportazione del file di testo
  const exportCSV = () => {
    const escapeCSV = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const headers = ['Timestamp', 'Ora', 'Esercizio', 'Lato', 'Esito', 'Angolo primario', 'Stato finale', 'Errori'];
    const rows = sessionLogs.map(log => [
      log.timestamp,
      log.time,
      log.ex,
      log.side,
      log.esito,
      log.primaryAngle,
      log.finalState,
      log.errori,
    ].map(escapeCSV).join(',')).join('\n');
    const csv = `${headers.map(escapeCSV).join(',')}\n${rows}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `analisi_cinematica_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Funzione per azzerare l'intero storico memorizzato nella sessione corrente
  const clearAllHistory = () => {
    setSessionLogs([]);
    reset();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center p-4 font-sans">
      <header className="w-full max-w-md text-center my-4">
        <h1 className="text-2xl font-bold tracking-tight text-indigo-400">Analisi Cinematica</h1>
        <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest">{exerciseLabel} - IPF MODE</p>
      </header>

      {!isActive ? (
        <div className="w-full max-w-md flex flex-col gap-8 mt-6">
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-1">1. Esercizio</h2>
            {Object.entries(EXERCISE_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setExercise(key)}
                className={`py-4 rounded-xl text-sm font-semibold uppercase tracking-wider transition-colors ${exercise === key ? 'bg-indigo-600 text-white border-2 border-indigo-400' : 'bg-slate-800 text-slate-400 border-2 border-slate-700 hover:bg-slate-700'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-1">2. Lato videocamera</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setCameraSide('LEFT')}
                className={`flex-1 py-4 rounded-xl text-sm font-semibold uppercase tracking-wider transition-colors ${cameraSide === 'LEFT' ? 'bg-indigo-600 text-white border-2 border-indigo-400' : 'bg-slate-800 text-slate-400 border-2 border-slate-700'}`}
              >
                Sinistra
              </button>
              <button
                onClick={() => setCameraSide('RIGHT')}
                className={`flex-1 py-4 rounded-xl text-sm font-semibold uppercase tracking-wider transition-colors ${cameraSide === 'RIGHT' ? 'bg-indigo-600 text-white border-2 border-indigo-400' : 'bg-slate-800 text-slate-400 border-2 border-slate-700'}`}
              >
                Destra
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1 text-center">Indica da quale lato il telefono osserva l'atleta.</p>
          </div>

          {hasMultipleCameras && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-1">3. Lente Fotocamera</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setFacingMode('user')}
                  className={`flex-1 py-4 rounded-xl text-sm font-semibold uppercase tracking-wider transition-colors ${facingMode === 'user' ? 'bg-indigo-600 text-white border-2 border-indigo-400' : 'bg-slate-800 text-slate-400 border-2 border-slate-700'}`}
                >
                  Frontale
                </button>
                <button
                  onClick={() => setFacingMode('environment')}
                  className={`flex-1 py-4 rounded-xl text-sm font-semibold uppercase tracking-wider transition-colors ${facingMode === 'environment' ? 'bg-indigo-600 text-white border-2 border-indigo-400' : 'bg-slate-800 text-slate-400 border-2 border-slate-700'}`}
                >
                  Posteriore
                </button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">
              {hasMultipleCameras ? "4. Setup" : "3. Setup"}
            </h2>
            <ul className="space-y-2 text-sm text-slate-300">
              <li>Posiziona il dispositivo lateralmente rispetto al corpo.</li>
              <li>Inquadra tutto il corpo, inclusi piedi e mani.</li>
              <li>Mantieni la camera stabile durante la serie.</li>
            </ul>
          </div>

          <button onClick={() => setIsActive(true)} className="mt-4 w-full py-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl font-bold text-lg transition-colors text-white">
            Avvia analisi
          </button>

          {/* Sezione pulsanti di gestione dati: visibile solo se sono presenti record memorizzati */}
          {sessionLogs.length > 0 && (
            <div className="flex flex-col gap-2 mt-2 w-full">
              <button onClick={exportCSV} className="w-full py-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 rounded-xl font-bold text-lg transition-colors text-indigo-400">
                Esporta dati sessione (.CSV)
              </button>
              <button onClick={clearAllHistory} className="w-full py-4 bg-rose-950 hover:bg-rose-900 active:bg-rose-900/80 border border-rose-900 rounded-xl font-bold text-lg transition-colors text-rose-400">
                Azzera Sessione
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="w-full max-w-md flex flex-col items-center">
          {/* Barra contatori modificata con la rimozione del riquadro No-Rep numerico */}
          <section className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 flex justify-around mb-4 shadow-lg">
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider text-slate-400">Rep valide</p>
              <p className="text-3xl font-black text-emerald-400 mt-1">{validReps}</p>
            </div>
            <div className="w-px bg-slate-800 self-stretch" />
            <div className="text-center flex flex-col items-center justify-center">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Dati angoli</p>
              <p className="text-sm font-mono text-slate-300 whitespace-pre-line">
                {exercise === 'SQUAT' && (`K: ${angles.primary ? Math.round(angles.primary) : '--'} deg`)}
                {exercise === 'DEADLIFT' && (`H: ${angles.primary ? Math.round(angles.primary) : '--'} deg\nK: ${angles.secondary ? Math.round(angles.secondary) : '--'} deg`)}
                {exercise === 'OVERHEAD_PRESS' && (`E: ${angles.primary ? Math.round(angles.primary) : '--'} deg\nT: ${angles.secondary ? Math.round(angles.secondary) : '--'} deg`)}
              </p>
            </div>
          </section>

          {faults.length > 0 && (
            <div className="w-full mb-4 bg-rose-950/50 border border-rose-800 rounded-xl p-3 text-center shadow-lg">
              <p className="text-xs font-bold uppercase tracking-wider text-rose-400 mb-1">Motivo no-rep</p>
              <p className="text-sm font-medium text-rose-200">{faults.join(' - ')}</p>
            </div>
          )}

          <main className="w-full relative bg-black rounded-xl overflow-hidden border border-slate-800 shadow-2xl" style={{ aspectRatio: '9/16' }}>
            {isLoading && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-10">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-400 mt-3">{loadingMsg}</p>
              </div>
            )}
            {error && <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center text-sm text-rose-400 z-20">{error}</div>}

            <video ref={videoRef} className={`w-full h-full object-contain ${mirrorClass}`} playsInline muted />
            <canvas ref={canvasRef} className={`absolute top-0 left-0 w-full h-full object-contain ${mirrorClass}`} />

            {isTrackingLost && !isLoading && !error && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-rose-900/90 border border-rose-500 text-white px-4 py-2 rounded-full text-xs font-bold tracking-wide shadow-lg z-20 flex items-center gap-2">
                <span className="w-2 h-2 bg-rose-400 rounded-full animate-pulse" />
                Corpo non rilevato
              </div>
            )}

            {hasMultipleCameras && !isLoading && !error && (
              <button
                onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
                className="absolute bottom-4 right-4 bg-slate-900/80 hover:bg-slate-800 active:bg-slate-950 border border-slate-700 text-indigo-400 p-3 rounded-full shadow-xl z-30 transition-colors backdrop-blur-xs"
                title="Inverti fotocamera"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </button>
            )}
          </main>

          {/* Footer semplificato con la rimozione del pulsante Azzera */}
          <footer className="w-full mt-4 flex gap-2">
            <button onClick={() => setIsActive(false)} className="w-full py-3 bg-rose-950 hover:bg-rose-900 border border-rose-900 rounded-xl font-medium text-sm text-rose-400">
              Ferma e cambia
            </button>
          </footer>
        </div>
      )}

      {/* COMPONENTE STORICO GENERALE: Posizionato esternamente per essere visibile in entrambe le pagine */}
      {sessionLogs.length > 0 && (
        <section className="w-full max-w-md mt-8 rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Ultime ripetizioni (Sessione)</h2>
            <span className="text-[10px] bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded-md font-semibold border border-indigo-800">
              {sessionLogs.length} Totali
            </span>
          </div>
          <ol className="space-y-2">
            {sessionLogs.slice(-5).reverse().map((log, index) => (
              <li key={`${log.timestamp}-${index}`} className="flex items-start justify-between gap-3 text-sm border-b border-slate-800/50 pb-2 last:border-0 last:pb-0">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {log.ex === 'SQUAT' ? 'Squat' : log.ex === 'DEADLIFT' ? 'Stacco' : 'Military'}
                  </span>
                  <span className={log.esito === 'VALID_REP' ? 'text-emerald-300 font-medium' : 'text-rose-300 font-medium'}>
                    {log.esito === 'VALID_REP' ? 'Valida' : 'No-rep'}
                  </span>
                </div>
                <span className="text-right text-xs text-slate-400 self-center">
                  {log.errori === 'Nessuno' ? `${log.time} (${log.primaryAngle}°)` : `${log.time} - ${log.errori}`}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}