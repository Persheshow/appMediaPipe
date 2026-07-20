/**
 * @file poseUtils.js
 * @description Funzioni pure di supporto sui landmark MediaPipe, indipendenti da
 * React e dal ciclo di rendering. Estratte da usePose.js.
 */

/**
 * Determina quale lato del corpo (sinistro/destro) è meglio inquadrato dalla
 * camera, combinando due segnali indipendenti restituiti da MediaPipe:
 * - `visibility`: confidenza del modello sulla presenza/riconoscibilità del landmark;
 * - `z`: profondità relativa (valori minori = più vicino alla camera).
 *
 * Un lato è considerato "inquadrato" se ha visibility sensibilmente maggiore
 * (margine di 0.2) E minore profondità (più vicino) rispetto all'altro lato.
 * In caso di segnali discordanti o non abbastanza netti, si ricade sul solo
 * criterio della visibility.
 *
 * @param {Array<{visibility:number, z:number}>} landmarks - 33 landmark posa MediaPipe.
 * @returns {'LEFT'|'RIGHT'}
 */
export function determinaLatoInquadrato(landmarks) {
    const visSx = landmarks[11].visibility + landmarks[23].visibility + landmarks[25].visibility;
    const visDx = landmarks[12].visibility + landmarks[24].visibility + landmarks[26].visibility;
    const zSx = landmarks[11].z + landmarks[23].z + landmarks[25].z;
    const zDx = landmarks[12].z + landmarks[24].z + landmarks[26].z;

    if (visSx > visDx + 0.2 && zSx < zDx) return 'LEFT';
    if (visDx > visSx + 0.2 && zDx < zSx) return 'RIGHT';
    return visSx >= visDx ? 'LEFT' : 'RIGHT';
}