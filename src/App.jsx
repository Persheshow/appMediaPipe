import { useState } from 'react';
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

  // Destruttura la nuova variabile isTrackingLost
  const { videoRef, canvasRef, isLoading, isTrackingLost, loadingMsg, error, validReps, noReps, faults, angles, sessionLogs, reset } = usePose(exercise, isActive, cameraSide, facingMode);
  
  const exerciseLabel = EXERCISE_LABELS[exercise];
  const mirrorClass = facingMode === 'user' ? 'scale-x-[-1]' : '';

  const exportCSV = () => {
    const escapeCSV = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const headers = ['Timestamp', 'Ora', 'Esercizio', 'Lato', 'Esito', 'Angolo primario', 'Angolo secondario', 'Stato finale', 'Errori'];
    const rows = sessionLogs.map(log => [
      log.timestamp,
      log.time,
      log.ex,
      log.side,
      log.esito,
      log.primaryAngle,
      log.secondaryAngle,
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

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">4. Setup</h2>
            <ul className="space-y-2 text-sm text-slate-300">
              <li>Posiziona il telefono lateralmente rispetto al corpo.</li>
              <li>Inquadra tutto il corpo, inclusi piedi e mani.</li>
              <li>Mantieni la camera stabile durante la serie.</li>
            </ul>
          </div>

          <button onClick={() => setIsActive(true)} className="mt-4 w-full py-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl font-bold text-lg transition-colors text-white">
            Avvia analisi
          </button>

          {sessionLogs.length > 0 && (
            <button onClick={exportCSV} className="mt-2 w-full py-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 rounded-xl font-bold text-lg transition-colors text-indigo-400">
              Esporta dati sessione (.CSV)
            </button>
          )}
        </div>
      ) : (
        <div className="w-full max-w-md flex flex-col items-center">
          <section className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 flex justify-around mb-4 shadow-lg">
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider text-slate-400">Rep valide</p>
              <p className="text-3xl font-black text-emerald-400 mt-1">{validReps}</p>
            </div>
            <div className="w-px bg-slate-800 self-stretch" />
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider text-slate-400">No-rep</p>
              <p className="text-3xl font-black text-rose-500 mt-1">{noReps}</p>
            </div>
            <div className="w-px bg-slate-800 self-stretch" />
            <div className="text-center flex items-center justify-center">
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
            
            {/* CARICAMENTO INIZIALE */}
            {isLoading && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-10">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-400 mt-3">{loadingMsg}</p>
              </div>
            )}
            
            {error && <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center text-sm text-rose-400 z-20">{error}</div>}

            <video ref={videoRef} className={`w-full h-full object-contain ${mirrorClass}`} playsInline muted />
            <canvas ref={canvasRef} className={`absolute top-0 left-0 w-full h-full object-contain ${mirrorClass}`} />

            {/* NUOVO WARNING NON BLOCCANTE */}
            {isTrackingLost && !isLoading && !error && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-rose-900/90 border border-rose-500 text-white px-4 py-2 rounded-full text-xs font-bold tracking-wide shadow-lg z-20 flex items-center gap-2">
                <span className="w-2 h-2 bg-rose-400 rounded-full animate-pulse" />
                Corpo non rilevato
              </div>
            )}
          </main>

          <footer className="w-full mt-4 flex gap-2">
            <button onClick={() => setIsActive(false)} className="flex-1 py-3 bg-rose-950 hover:bg-rose-900 border border-rose-900 rounded-xl font-medium text-sm text-rose-400">
              Ferma e cambia
            </button>
            <button onClick={reset} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl font-medium text-sm text-slate-300">
              Azzera
            </button>
          </footer>

          {sessionLogs.length > 0 && (
            <section className="w-full mt-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Ultime ripetizioni</h2>
                <button onClick={exportCSV} className="text-xs font-semibold text-indigo-300 hover:text-indigo-200">
                  CSV
                </button>
              </div>
              <ol className="space-y-2">
                {sessionLogs.slice(-5).reverse().map((log, index) => (
                  <li key={`${log.timestamp}-${index}`} className="flex items-start justify-between gap-3 text-sm">
                    <span className={log.esito === 'VALID_REP' ? 'text-emerald-300' : 'text-rose-300'}>
                      {log.esito === 'VALID_REP' ? 'Valida' : 'No-rep'}
                    </span>
                    <span className="text-right text-slate-400">
                      {log.errori === 'Nessuno' ? log.time : `${log.time} - ${log.errori}`}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </div>
  );
}