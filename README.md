# Analisi Cinematica in Tempo Reale per il Powerlifting

Questo progetto consiste in un'applicazione web mobile-first sviluppata per l'analisi cinematica in tempo reale degli esercizi di Powerlifting. Il software utilizza tecniche di computer vision per monitorare i movimenti dell'utente e validare le ripetizioni applicando i parametri tecnici e le regole ufficiali.

## Funzionalità Implementate

* **Tracciamento Visivo**: Utilizzo del modello MediaPipe Pose Landmarker per estrarre le coordinate articolari a 60 fps nel browser, eseguendo i calcoli tramite la GPU del dispositivo mobile o desktop.
* **Valutazione del Movimento**: Distinzione algoritmica tra ripetizioni valide e non valide (No-Rep).
* **Feedback Specifico**: Identificazione ed esposizione a schermo della regola tecnica violata in caso di sollevamento nullo.
* **Esercizi Analizzati**:
  * **Squat**: Verifica del superamento del parallelo, controllo del doppio rimbalzo in fase di risalita, estensione delle ginocchia in partenza, verifica della staticità dei piedi e rilevamento del contatto tra braccia e gambe.
  * **Deadlift**: Verifica della completa e simultanea estensione di anche e ginocchia. Rilevamento di movimenti discendenti del bilanciere (hitching/ramping) prima della conclusione dell'alzata.
  * **Overhead Press (Strict)**: Validazione dell'estensione completa dei gomiti. Rilevamento dell'utilizzo irregolare delle gambe (Push Press) tramite il monitoraggio dell'angolo del ginocchio e controllo del movimento discendente in fase di spinta.

## Tecnologie Impiegate

* **React 19**: Gestione dello stato dell'interfaccia utente e del ciclo di vita dei componenti hardware per l'acquisizione video.
* **Vite 8**: Strumento di compilazione per l'ambiente di sviluppo locale.
* **Tailwind CSS v4**: Framework CSS utility-first per la strutturazione grafica reattiva.
* **MediaPipe Tasks Vision**: Rete neurale convoluzionale per la stima della posa umana (Pose Estimation).

## Requisiti per l'Esecuzione

* Node.js installato nel sistema.
* Un browser web con supporto per WebGL e API `navigator.mediaDevices` per l'accesso alla videocamera.

## Installazione

1. Clonare il repository nella propria macchina locale.
2. Aprire il terminale nella directory principale del progetto.
3. Installare le dipendenze eseguendo il comando:
   ```bash
   npm install