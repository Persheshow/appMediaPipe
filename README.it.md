# Analisi Cinematica in Tempo Reale tramite Computer Vision

[🇮🇹 Leggi in Italiano](README.it.md) | [🇬🇧 Read in English](README.md)

Progetto software sviluppato per il monitoraggio e la validazione biomeccanica di esercizi di forza (Powerlifting) attraverso l'impiego della Computer Vision. L'architettura sfrutta MediaPipe Pose Landmarker per la stima topologica dell'utente e implementa una serie di Macchine a Stati Finiti (FSM) per discernere istantaneamente le ripetizioni valide (secondo gli standard IPF) dai compensi tecnici.

L'interfaccia, progettata con un rigoroso design istituzionale (Università degli Studi di Firenze), è ottimizzata per l'utilizzo sul campo tramite dispositivi mobili (PWA) e garantisce l'acquisizione, l'elaborazione e l'esportazione dei dati telemetrici in locale.

## Architettura e Funzionalità

* **Tracciamento Topologico (Pose Estimation)**: Acquisizione del flusso video tramite l'API `navigator.mediaDevices` ed estrazione di 33 landmark corporei 3D a 60 FPS.
* **Inferenza Edge (Local Execution)**: Allocazione in memoria del modello neurale `.task` e dei moduli WebAssembly (WASM) eseguiti interamente sul client (delegando i calcoli alla GPU locale), azzerando la latenza e garantendo la privacy.
* **Filtraggio del Segnale (Smoothing)**: Applicazione di una Media Mobile Esponenziale (EMA) sui vettori angolari per mitigare il rumore ad alta frequenza (jittering) tipico dei sensori ottici.
* **Macchine a Stati Finiti (FSM)**: Motori logici indipendenti per ogni alzata, progettati per tracciare le transizioni di fase (Setup, Eccentrica, Concentrica, Lockout).
* **Supporto Hardware Dinamico**: Rilevamento automatico delle periferiche ottiche (multicamera) e switch on-the-fly tra sensore frontale e posteriore senza interruzione del thread di analisi.
* **Esportazione Dataset (CSV)**: Generazione di log storici formattati con codifica UTF-8 BOM e delimitatori standard per l'incolonnamento nativo e l'analisi statistica su software come Excel, R o MATLAB.

## Modelli Biomeccanici e Regolamenti (IPF Mode)

### Squat
La valutazione sfrutta il tracciamento del profilo laterale, calcolando l'angolo del ginocchio e la traslazione sull'asse Y dell'anca.

* **Fase di Discesa**: Innescata dalla flessione del ginocchio rispetto al vettore di lockout iniziale.
* **Validazione della Profondità (Parallelo)**: Confermata geometricamente quando la coordinata Y dell'anca supera lo zenit del ginocchio o quando l'articolazione raggiunge la soglia angolare critica di rottura.
* **Transizione**: Rilevamento del punto di inversione cinematica tramite analisi derivata del buffer angolare.
* **Criteri di Invalidazione**: Mancato superamento del parallelo; Target anatomico non rilevato (occlusione prolungata).

### Stacco da Terra (Deadlift)
Il sistema valuta l'estensione combinata di anca e ginocchio, utilizzando la coordinata spaziale del polso come proxy per il tracciamento della traiettoria del bilanciere.

* **Fase di Setup**: Registrazione del punto di minima elevazione del polso prima della spinta.
* **Lockout**: Raggiungimento simultaneo dell'estensione target di anche e ginocchia.
* **Criteri di Invalidazione**: Discesa del bilanciere durante la fase di tirata concentrica (rilevata tramite drop della coordinata Y del polso); Target anatomico non rilevato.

### Pressa Militare (Overhead Press)
Il modello monitora l'angolo di spinta del gomito, correlando i dati con la postura del tronco e delle articolazioni inferiori per rilevare compensi.

* **Validazione (Lockout)**: Estensione completa dell'omero al di sopra della soglia critica.
* **Criteri di Invalidazione**: Range di movimento incompleto; Iperlordosi lombare (calcolata tramite il tilt del tronco rispetto all'asse verticale); Uso delle gambe (flessione del ginocchio indicativa di un cheating in stile Push Press); Target anatomico non rilevato.

## Limiti Sperimentali

Il prototipo è ottimizzato per l'analisi cinematica vettoriale 2D/3D da singola prospettiva laterale. Allo stato attuale, non convalida regole tecniche complesse che richiedono un'analisi multiprospettica o il rilevamento di oggetti esterni:
* Staticità plantare (Squat/Deadlift).
* Contatto fisico tra gomiti e ginocchia.
* Hitching/Ramping (Stacco) senza il tracciamento fisico dell'hardware (bilanciere).
* Analisi delle asimmetrie di spinta bilaterali.
* Auto-calibrazione antropometrica delle soglie (attualmente definite staticamente in `config/exercises.js`).

Questi confini applicativi rappresentano un punto di partenza per l'estensione futura della ricerca.

## Stack Tecnologico

* **React 19**: Rendering UI e gestione dello stato reattivo.
* **Vite 8**: Build tool e server di sviluppo.
* **Tailwind CSS v4**: Utility-first CSS framework.
* **MediaPipe Tasks Vision**: Rete neurale pre-addestrata per la Pose Estimation.
* **vite-plugin-pwa**: Service worker generation per l'installazione nativa sui dispositivi mobili.

## Requisiti di Sistema

* Node.js (v18+ consigliato).
* Browser basato su Chromium o WebKit compatibile con API WebGL e `navigator.mediaDevices`.
* Per l'acquisizione: Fotocamera stabilizzata (treppiede) con inquadratura laterale pulita e ad alto contrasto.

## Installazione e Avvio

1. Clonare il repository locale.
2. Accedere alla directory radice da terminale.
3. Installare l'albero delle dipendenze:

   ```bash
   npm install