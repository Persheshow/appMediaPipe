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
        console.error("Errore nell'enumerazione delle periferiche video:", err);
      }
    }
    checkCameras();
  }, []);

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
    link.setAttribute('download', `dataset_cinematica_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const clearAllHistory = () => {
    setSessionLogs([]);
    reset();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center p-4 font-sans selection:bg-[#002f6c] selection:text-white">

      {/* HEADER ISTITUZIONALE */}
      <header className="w-full max-w-xl text-center my-6 md:my-10">
        <h2 className="text-[11px] md:text-xs font-bold tracking-widest text-[#002f6c] uppercase mb-2">
          Università degli Studi di Firenze
        </h2>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
          Analisi Cinematica basata su Computer Vision
        </h1>
        <div className="flex items-center justify-center gap-2 mt-3 text-xs md:text-sm text-slate-500 font-medium">
          <span>Corso di Laurea in Informatica</span>
          <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
          <span>Acquisizione Dati (IPF)</span>
        </div>
      </header>

      {!isActive ? (
        <div className="w-full max-w-xl flex flex-col gap-6">

          {/* PANNELLO CONFIGURAZIONE */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-8">

            {/* Esercizio */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">1. Protocollo di test</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {Object.entries(EXERCISE_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setExercise(key)}
                    className={`py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 border ${exercise === key
                        ? 'bg-[#002f6c] text-white border-[#002f6c] shadow-md'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Lato Videocamera */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">2. Posizione Sensore</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setCameraSide('LEFT')}
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-200 border ${cameraSide === 'LEFT' ? 'bg-[#002f6c] text-white border-[#002f6c] shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                    }`}
                >
                  Prospettiva Sinistra
                </button>
                <button
                  onClick={() => setCameraSide('RIGHT')}
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-200 border ${cameraSide === 'RIGHT' ? 'bg-[#002f6c] text-white border-[#002f6c] shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                    }`}
                >
                  Prospettiva Destra
                </button>
              </div>
            </div>

            {/* Hardware */}
            {hasMultipleCameras && (
              <div className="flex flex-col gap-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">3. Selezione Ottica</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFacingMode('user')}
                    className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-200 border ${facingMode === 'user' ? 'bg-[#002f6c] text-white border-[#002f6c] shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                  >
                    Fotocamera Anteriore
                  </button>
                  <button
                    onClick={() => setFacingMode('environment')}
                    className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-200 border ${facingMode === 'environment' ? 'bg-[#002f6c] text-white border-[#002f6c] shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                  >
                    Fotocamera Posteriore
                  </button>
                </div>
              </div>
            )}
          </div>

          <button onClick={() => setIsActive(true)} className="w-full py-4 bg-[#002f6c] hover:bg-[#00224d] active:scale-[0.99] rounded-xl font-bold text-lg text-white shadow-lg transition-all">
            Inizializza Rilevamento
          </button>

          {/* ESPORTAZIONE DATI */}
          {sessionLogs.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between px-2 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Gestione Dati Locali</span>
                <span className="text-xs font-semibold text-[#002f6c] bg-blue-50 px-2 py-1 rounded-md">
                  {sessionLogs.length} Record
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={clearAllHistory} className="flex-1 py-3 bg-white border border-red-200 hover:bg-red-50 active:bg-red-100 rounded-xl font-bold text-sm text-red-600 transition-colors">
                  Azzera Storico
                </button>
                <button onClick={exportCSV} className="flex-[2] py-3 bg-[#002f6c]/10 hover:bg-[#002f6c]/20 border border-[#002f6c]/20 rounded-xl font-bold text-sm text-[#002f6c] transition-colors">
                  Esporta Dataset (.CSV)
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="w-full max-w-xl flex flex-col items-center">

          {/* DASHBOARD TELEMETRIA (Active Mode) */}
          <section className="w-full bg-white border border-slate-200 rounded-2xl p-4 flex justify-around mb-4 shadow-sm">
            <div className="text-center w-1/3">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Ripetizioni Valide</p>
              <p className="text-3xl font-black text-green-600">{validReps}</p>
            </div>
            <div className="w-px bg-slate-100 self-stretch" />
            <div className="text-center w-2/3 flex flex-col items-center justify-center">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Telemetria Articolare</p>
              <p className="text-sm font-mono text-slate-700 whitespace-pre-line bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                {exercise === 'SQUAT' && (`Ginocchio: ${angles.primary ? Math.round(angles.primary) : '--'}°`)}
                {exercise === 'DEADLIFT' && (`Anca: ${angles.primary ? Math.round(angles.primary) : '--'}° | Gin: ${angles.secondary ? Math.round(angles.secondary) : '--'}°`)}
                {exercise === 'OVERHEAD_PRESS' && (`Gomito: ${angles.primary ? Math.round(angles.primary) : '--'}° | Tr: ${angles.secondary ? Math.round(angles.secondary) : '--'}°`)}
              </p>
            </div>
          </section>

          {faults.length > 0 && (
            <div className="w-full mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-center shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-500 mb-1">Criterio Invalidazione</p>
              <p className="text-sm font-semibold text-red-700">{faults.join(' • ')}</p>
            </div>
          )}

          {/* VIEWPORT VIDEOCAMERA */}
          <main className="w-full relative bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 shadow-md ring-4 ring-white" style={{ aspectRatio: '9/16' }}>

            {isLoading && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/90 backdrop-blur-sm z-10">
                <div className="w-8 h-8 border-4 border-[#002f6c] border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-semibold text-[#002f6c] mt-4 uppercase tracking-widest">Inizializzazione Rete Neurale...</p>
              </div>
            )}

            {error && <div className="absolute inset-0 flex items-center justify-center bg-red-50/95 p-6 text-center text-sm font-semibold text-red-600 z-20 border-4 border-red-200">{error}</div>}

            <video ref={videoRef} className={`w-full h-full object-contain ${mirrorClass}`} playsInline muted />
            <canvas ref={canvasRef} className={`absolute top-0 left-0 w-full h-full object-contain ${mirrorClass}`} />

            {/* AVVISO OCCLUSIONE */}
            {isTrackingLost && !isLoading && !error && (
              <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-red-600 text-white px-5 py-2.5 rounded-full text-xs font-bold tracking-widest shadow-lg z-20 flex items-center gap-2 border-2 border-white/20">
                <span className="w-2 h-2 bg-white rounded-full animate-ping" />
                Target Anatomico Non Rilevato
              </div>
            )}

            {/* PULSANTE SWITCH LENTE */}
            {hasMultipleCameras && !isLoading && !error && (
              <button
                onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
                className="absolute bottom-6 right-6 bg-white/90 hover:bg-white border border-slate-200 text-[#002f6c] p-3.5 rounded-full shadow-lg z-30 transition-all backdrop-blur-md"
                title="Inverti fotocamera"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </button>
            )}
          </main>

          <footer className="w-full mt-6">
            <button onClick={() => setIsActive(false)} className="w-full py-4 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl font-bold text-sm text-slate-700 shadow-sm transition-colors">
              Interrompi Sessione di Acquisizione
            </button>
          </footer>
        </div>
      )}

      {/* REGISTRO DATI (Visibile globalmente se ci sono dati) */}
      {sessionLogs.length > 0 && (
        <section className="w-full max-w-xl mt-10 mb-8 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-4 flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Registro Acquisizioni</h2>
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#002f6c] bg-[#002f6c]/10 px-2.5 py-1 rounded">
              Buffer: {sessionLogs.length}
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {sessionLogs.slice(-10).reverse().map((log, index) => (
              <div key={`${log.timestamp}-${index}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {log.time}
                    </span>
                    <span className="font-semibold text-slate-700">
                      {log.ex === 'SQUAT' ? 'Squat' : log.ex === 'DEADLIFT' ? 'Stacco' : 'Pressa'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  <span className={`text-xs font-bold uppercase tracking-wider ${log.esito === 'VALID_REP' ? 'text-green-600' : 'text-red-600'}`}>
                    {log.esito === 'VALID_REP' ? 'Valida' : 'Non Valida'}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {log.errori === 'Nessuno' ? `Rilevamento: ${log.primaryAngle}°` : log.errori}
                  </span>
                </div>
              </div>
            ))}
            {sessionLogs.length > 10 && (
              <div className="px-5 py-3 text-center text-xs text-slate-400 font-medium bg-slate-50">
                Visualizzati gli ultimi 10 record. Esporta in CSV per l'analisi completa.
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}