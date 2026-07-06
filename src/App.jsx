import { useState } from 'react';
import { usePose } from './hooks/usePose';

export default function App() {
  const [exercise, setExercise] = useState('SQUAT');

  const {
    videoRef,
    canvasRef,
    isLoading,
    error,
    validReps,
    noReps,
    faults,
    angles,
    reset,
  } = usePose(exercise);

  function handleExerciseChange(ex) {
    setExercise(ex);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center p-4 font-sans">

      {/* HEADER */}
      <header className="w-full max-w-md text-center my-4">
        <h1 className="text-2xl font-bold tracking-tight text-indigo-400">
          FormCheck AI
        </h1>
        <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest">
          {exercise} · IPF MODE
        </p>
      </header>

      {/* SELETTORE ESERCIZIO */}
      <section className="w-full max-w-md flex gap-2 mb-4">
        {['SQUAT', 'DEADLIFT', 'OVERHEAD_PRESS'].map(ex => (
          <button
            key={ex}
            onClick={() => handleExerciseChange(ex)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors
      ${exercise === ex
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
              }`}
          >
            {ex === 'SQUAT' ? 'Squat' : ex === 'DEADLIFT' ? 'Stacco' : 'OHP'}
          </button>
        ))}
      </section>

      {/* CONTATORI */}
      <section className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-4 flex justify-around mb-4 shadow-lg">
        <div className="text-center">
          <p className="text-xs uppercase tracking-wider text-slate-400">Rep Valide</p>
          <p className="text-3xl font-black text-emerald-400 mt-1">{validReps}</p>
        </div>
        <div className="w-px bg-slate-800 self-stretch" />
        <div className="text-center">
          <p className="text-xs uppercase tracking-wider text-slate-400">No-Rep</p>
          <p className="text-3xl font-black text-rose-500 mt-1">{noReps}</p>
        </div>
        {/* ANGOLI */}
        <div className="w-px bg-slate-800 self-stretch" />
        <div className="text-center">
          <p className="text-xs uppercase tracking-wider text-slate-400">Angoli</p>
          <p className="text-sm font-mono text-slate-300 mt-1">
            {exercise === 'SQUAT'
              ? `K: ${angles.knee ? Math.round(angles.knee) : '--'}°`
              : `H: ${angles.hip ? Math.round(angles.hip) : '--'}° K: ${angles.knee ? Math.round(angles.knee) : '--'}°`
            }
          </p>
        </div>
      </section>

      {/* FAULT REASON */}
      {faults.length > 0 && (
        <div className="w-full max-w-md mb-4 bg-rose-950/50 border border-rose-800 rounded-xl p-3 text-center shadow-lg">
          <p className="text-xs font-bold uppercase tracking-wider text-rose-400 mb-1">
            Motivo No-Rep
          </p>
          <p className="text-sm font-medium text-rose-200">
            {faults.join(' · ')}
          </p>
        </div>
      )}

      {/* VIDEO + CANVAS */}
      <main className="w-full max-w-md relative aspect-[3/4] bg-black rounded-xl overflow-hidden border border-slate-800 shadow-2xl">

        {/* LOADING */}
        {isLoading && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-10">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400 mt-3">Caricamento modello...</p>
          </div>
        )}

        {/* ERRORE */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center text-sm text-rose-400 z-20">
            {error}
          </div>
        )}

        <video
          ref={videoRef}
          className="w-full h-full object-cover scale-x-[-1]"
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full object-cover scale-x-[-1]"
        />
      </main>

      {/* FOOTER */}
      <footer className="w-full max-w-md mt-4">
        <button
          onClick={reset}
          className="w-full py-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 rounded-xl font-medium text-sm transition-colors text-slate-300"
        >
          Azzera contatori
        </button>
      </footer>

    </div>
  );
}