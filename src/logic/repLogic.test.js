import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, processFrame } from './repLogic.js';

function landmark(x, y, visibility = 1) {
  return { x, y, z: 0, visibility };
}

function emptyLandmarks() {
  return Array.from({ length: 33 }, () => landmark(0.5, 0.5, 1));
}

function rotate(vector, degrees) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

function withKneeAngle(angle, { hipBelow = false } = {}) {
  const lm = emptyLandmarks();
  const knee = landmark(0.5, 0.5);
  const hipVector = hipBelow ? { x: 0, y: 1 } : { x: 0, y: -1 };
  const ankleVector = hipBelow
    ? { x: Math.sin(angle * Math.PI / 180), y: Math.cos(angle * Math.PI / 180) }
    : { x: Math.sin(angle * Math.PI / 180), y: -Math.cos(angle * Math.PI / 180) };

  lm[23] = landmark(knee.x + hipVector.x * 0.1, knee.y + hipVector.y * 0.1);
  lm[25] = knee;
  lm[27] = landmark(knee.x + ankleVector.x * 0.1, knee.y + ankleVector.y * 0.1);
  return lm;
}

function withDeadliftFrame({ hipAngle, kneeAngle, wristY }) {
  const lm = emptyLandmarks();
  const hip = landmark(0.5, 0.45);
  const shoulderVector = { x: 0, y: -1 };
  const hipToKnee = {
    x: Math.sin(hipAngle * Math.PI / 180),
    y: -Math.cos(hipAngle * Math.PI / 180),
  };
  const knee = landmark(hip.x + hipToKnee.x * 0.1, hip.y + hipToKnee.y * 0.1);
  const kneeToHip = { x: hip.x - knee.x, y: hip.y - knee.y };
  const kneeToAnkle = rotate(kneeToHip, kneeAngle);

  lm[11] = landmark(hip.x + shoulderVector.x * 0.1, hip.y + shoulderVector.y * 0.1);
  lm[23] = hip;
  lm[25] = knee;
  lm[27] = landmark(knee.x + kneeToAnkle.x, knee.y + kneeToAnkle.y);
  lm[15] = landmark(0.45, wristY);
  return lm;
}

function withPressFrame({ elbowAngle, trunkAngle = 0, kneeAngle = 175 }) {
  const lm = emptyLandmarks();
  const shoulder = landmark(0.5, 0.35);
  const elbow = landmark(0.5, 0.45);
  const elbowToWrist = {
    x: Math.sin(elbowAngle * Math.PI / 180),
    y: -Math.cos(elbowAngle * Math.PI / 180),
  };
  const shoulderToHip = {
    x: Math.sin(trunkAngle * Math.PI / 180),
    y: Math.cos(trunkAngle * Math.PI / 180),
  };
  const hip = landmark(shoulder.x + shoulderToHip.x * 0.15, shoulder.y + shoulderToHip.y * 0.15);
  const knee = landmark(hip.x, hip.y + 0.12);
  const kneeToHip = { x: hip.x - knee.x, y: hip.y - knee.y };
  const kneeToAnkle = rotate(kneeToHip, kneeAngle);

  lm[11] = shoulder;
  lm[13] = elbow;
  lm[15] = landmark(elbow.x + elbowToWrist.x * 0.1, elbow.y + elbowToWrist.y * 0.1);
  lm[23] = hip;
  lm[25] = knee;
  lm[27] = landmark(knee.x + kneeToAnkle.x, knee.y + kneeToAnkle.y);
  return lm;
}

function runFrames(exercise, frames) {
  let state = createInitialState();
  let lastEvent = null;

  frames.forEach(frame => {
    const result = processFrame(exercise, state, frame, 'LEFT');
    state = result.state;
    if (result.event) lastEvent = result.event;
  });

  return lastEvent;
}

function repeat(frame, count) {
  return Array.from({ length: count }, () => frame);
}

test('squat counts a valid repetition after reaching depth and standing up', () => {
  const event = runFrames('SQUAT', [
    ...repeat(withKneeAngle(180), 3),
    ...repeat(withKneeAngle(90, { hipBelow: true }), 18),
    ...repeat(withKneeAngle(180), 30),
  ]);

  assert.equal(event?.type, 'VALID_REP');
});

test('squat returns no-rep when depth is insufficient', () => {
  const event = runFrames('SQUAT', [
    ...repeat(withKneeAngle(180), 3),
    ...repeat(withKneeAngle(125), 18),
    ...repeat(withKneeAngle(180), 30),
  ]);

  assert.equal(event?.type, 'NO_REP');
  assert.deepEqual(event.faults, ['Mancato superamento del parallelo']);
});

test('deadlift counts a valid repetition at hip and knee lockout', () => {
  const event = runFrames('DEADLIFT', [
    ...repeat(withDeadliftFrame({ hipAngle: 120, kneeAngle: 120, wristY: 0.8 }), 4),
    ...repeat(withDeadliftFrame({ hipAngle: 145, kneeAngle: 145, wristY: 0.74 }), 8),
    ...repeat(withDeadliftFrame({ hipAngle: 175, kneeAngle: 175, wristY: 0.55 }), 35),
  ]);

  assert.equal(event?.type, 'VALID_REP');
});

test('deadlift returns no-rep if the wrist drops during the pull', () => {
  const event = runFrames('DEADLIFT', [
    ...repeat(withDeadliftFrame({ hipAngle: 120, kneeAngle: 120, wristY: 0.8 }), 4),
    withDeadliftFrame({ hipAngle: 140, kneeAngle: 140, wristY: 0.74 }),
    withDeadliftFrame({ hipAngle: 140, kneeAngle: 140, wristY: 0.8 }),
  ]);

  assert.equal(event?.type, 'NO_REP');
  assert.deepEqual(event.faults, ['Discesa del bilanciere durante la tirata']);
});

test('overhead press counts a valid repetition after full range of motion', () => {
  const event = runFrames('OVERHEAD_PRESS', [
    ...repeat(withPressFrame({ elbowAngle: 170 }), 3),
    ...repeat(withPressFrame({ elbowAngle: 100 }), 20),
    ...repeat(withPressFrame({ elbowAngle: 170 }), 35),
  ]);

  assert.equal(event?.type, 'VALID_REP');
});

test('overhead press returns no-rep when knees bend during the press', () => {
  const event = runFrames('OVERHEAD_PRESS', [
    ...repeat(withPressFrame({ elbowAngle: 170, kneeAngle: 175 }), 3),
    ...repeat(withPressFrame({ elbowAngle: 100, kneeAngle: 130 }), 20),
    ...repeat(withPressFrame({ elbowAngle: 170, kneeAngle: 130 }), 35),
  ]);

  assert.equal(event?.type, 'NO_REP');
  assert.ok(event.faults.includes('Uso delle gambe'));
});

test('tracking loss during a repetition returns no-rep', () => {
  const state = createInitialState();
  state.movementState = 'DESCENDING';
  state.occludedSince = Date.now() - 1100;

  const result = processFrame('SQUAT', state, emptyLandmarks().map(point => ({ ...point, visibility: 0 })), 'LEFT');

  assert.equal(result.event?.type, 'NO_REP');
  assert.deepEqual(result.event.faults, ['Tracking perso (Occlusione)']);
});
