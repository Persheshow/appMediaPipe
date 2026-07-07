# Analisi cinematica in tempo reale con MediaPipe

Applicazione web mobile-first per il monitoraggio dell'esecuzione di esercizi di forza tramite computer vision. Il progetto usa MediaPipe Pose Landmarker per stimare la posa dell'utente dalla videocamera e una logica a stati per distinguere ripetizioni valide da ripetizioni non valide.

L'obiettivo del prototipo e' valutare in tempo reale alcuni parametri cinematici osservabili da una singola camera laterale, fornendo conteggio delle ripetizioni, feedback sull'errore principale e registrazione dei risultati della sessione.

## Funzionalita implementate

* **Tracciamento della posa**: acquisizione video da browser tramite `navigator.mediaDevices` e stima dei landmark corporei con MediaPipe Pose Landmarker.
* **Esecuzione locale del modello**: i file WASM e il modello `.task` sono serviti dalla cartella `public`, evitando dipendenze runtime da CDN esterne.
* **Analisi in tempo reale**: elaborazione frame-by-frame con smoothing degli angoli articolari per ridurre oscillazioni e falsi cambi di stato.
* **Conteggio rep/no-rep**: ogni esercizio usa una state machine dedicata per riconoscere le fasi principali del movimento.
* **Feedback a schermo**: in caso di no-rep viene mostrato il motivo rilevato, ad esempio profondita insufficiente o tracking perso.
* **Setup guidato**: la schermata iniziale indica come posizionare telefono, corpo e camera prima della serie.
* **Storico sessione**: durante l'analisi vengono mostrate le ultime ripetizioni con esito e motivo dell'eventuale no-rep.
* **Export CSV**: la sessione puo essere esportata con timestamp, esercizio, lato camera, esito, angoli principali, stato finale ed errori.
* **PWA mobile-first**: l'app e' configurata come Progressive Web App in orientamento verticale.
* **Test automatici**: la logica rep/no-rep e' coperta da test sintetici sui landmark.

## Esercizi e regole implementate

### Squat

La valutazione dello squat usa il lato selezionato della videocamera e monitora principalmente l'angolo del ginocchio.

Regole implementate:

* rilevamento della fase di discesa quando il ginocchio si flette rispetto alla posizione iniziale;
* rilevamento del punto di inversione e della fase di risalita;
* validazione della profondita quando l'anca scende sotto il ginocchio e l'angolo del ginocchio supera la soglia configurata;
* conteggio di una ripetizione valida quando l'utente torna in estensione;
* no-rep per mancato superamento del parallelo;
* no-rep per perdita prolungata del tracking durante una ripetizione.

### Deadlift

La valutazione dello stacco usa gli angoli di anca e ginocchio, insieme alla posizione verticale del polso come indicatore approssimato della traiettoria della mano/bilanciere.

Regole implementate:

* rilevamento della posizione di setup quando l'atleta non e' ancora in estensione completa;
* rilevamento dell'inizio della tirata tramite risalita del polso;
* validazione della ripetizione quando anca e ginocchio raggiungono una posizione eretta oltre le soglie configurate;
* gestione dello stato di lockout e successiva fase di discesa;
* no-rep se il polso, usato come proxy della mano/bilanciere, scende durante la fase di tirata;
* no-rep per perdita prolungata del tracking durante una ripetizione.

### Overhead Press

La valutazione della pressa militare monitora l'angolo del gomito, l'inclinazione del tronco e la flessione del ginocchio.

Regole implementate:

* rilevamento della fase di discesa quando il gomito si flette;
* validazione del range di movimento minimo tramite soglia inferiore del gomito;
* rilevamento della fase di risalita;
* conteggio della ripetizione quando il gomito torna in estensione;
* no-rep per range di movimento incompleto;
* no-rep per eccessiva inclinazione del tronco, indicata come iperlordosi lombare;
* no-rep per uso delle gambe, rilevato tramite flessione del ginocchio rispetto alla posizione iniziale;
* no-rep per perdita prolungata del tracking durante una ripetizione.

## Limiti attuali

Il prototipo non implementa ancora tutte le regole tecniche ufficiali del powerlifting o della pesistica. In particolare, al momento non vengono validati:

* staticita dei piedi nello squat;
* doppio rimbalzo o cambi multipli di direzione nello squat;
* contatto tra braccia e gambe nello squat;
* hitching/ramping dello stacco con rilevamento diretto e affidabile del bilanciere;
* confronto bilaterale tra lato destro e sinistro;
* calibrazione automatica delle soglie in base all'utente.

Questi punti possono essere trattati come sviluppi futuri o come limiti sperimentali nella relazione di tesi.

## Tecnologie impiegate

* **React 19**: gestione dell'interfaccia utente e dello stato applicativo.
* **Vite 8**: ambiente di sviluppo e build di produzione.
* **Tailwind CSS v4**: styling responsive mobile-first.
* **MediaPipe Tasks Vision**: stima della posa umana nel browser.
* **vite-plugin-pwa**: generazione della Progressive Web App.

## Requisiti

* Node.js installato.
* Browser moderno con supporto a WebGL e `navigator.mediaDevices`.
* Fotocamera frontale o webcam.
* Inquadratura laterale dell'intero corpo durante l'esercizio.

## Installazione

1. Clonare il repository.
2. Aprire il terminale nella directory principale del progetto.
3. Installare le dipendenze:

   ```bash
   npm install
   ```

4. Avviare l'ambiente di sviluppo:

   ```bash
   npm run dev
   ```

5. Aprire l'URL mostrato da Vite nel browser.

## Script disponibili

```bash
npm run dev
npm run build
npm run lint
npm test
npm run preview
```

## Note per la validazione sperimentale

Per la tesi e' consigliabile valutare il sistema su una serie di video o sessioni controllate, annotando manualmente l'esito atteso delle ripetizioni e confrontandolo con l'output dell'app. Il file CSV esportato puo essere usato per raccogliere i risultati e calcolare accuratezza, falsi positivi e falsi negativi.

I test automatici inclusi nel progetto verificano casi controllati per squat, deadlift, pressa militare e perdita del tracking. Non sostituiscono la validazione su video reali, ma aiutano a documentare e proteggere la logica decisionale dell'app.
