# Real-Time Kinematic Analysis via Computer Vision

[🇮🇹 Leggi in Italiano](README.it.md) | [🇬🇧 Read in English](README.md)

Software project developed for the biomechanical monitoring and validation of strength exercises (Powerlifting) through the use of Computer Vision. The architecture leverages MediaPipe Pose Landmarker for topological user estimation and implements a set of Finite State Machines (FSM) to instantly distinguish valid repetitions (according to IPF standards) from technical compensations.

The interface, designed with a rigorous institutional look (University of Florence), is optimized for field use on mobile devices (PWA) and ensures local acquisition, processing, and export of telemetry data.

## Architecture and Features

* **Topological Tracking (Pose Estimation)**: Video stream acquisition via the `navigator.mediaDevices` API and extraction of 33 3D body landmarks at 60 FPS.
* **Edge Inference (Local Execution)**: In-memory allocation of the `.task` neural model and WebAssembly (WASM) modules executed entirely on the client (offloading computation to the local GPU), eliminating latency and ensuring privacy.
* **Signal Filtering (Smoothing)**: Application of an Exponential Moving Average (EMA) on angular vectors to mitigate high-frequency noise (jittering) typical of optical sensors.
* **Finite State Machines (FSM)**: Independent logic engines for each lift, designed to track phase transitions (Setup, Eccentric, Concentric, Lockout).
* **Dynamic Hardware Support**: Automatic detection of optical peripherals (multi-camera) and on-the-fly switching between front and rear sensors without interrupting the analysis thread.
* **Telemetry-Embedded Video Export (.webm)**: Generation of video recordings via the Canvas and MediaRecorder APIs, capturing the raw camera feed overlaid with the topological skeleton, dynamic HUD, and real-time kinematic data.

## Biomechanical Models and Regulations (IPF Mode)

### Squat

Evaluation relies on lateral profile tracking, calculating the knee angle through vector math (dot product) applied to the hip-knee-ankle kinematic chain.

* **Descent Phase**: Triggered by knee flexion relative to the initial lockout vector.
* **Depth Validation (Parallel)**: Confirmed geometrically when the knee joint closes below the critical angular threshold.
* **Transition**: Detection of the kinematic inversion point via derivative analysis of the angular buffer.
* **Invalidation Criteria**: Failure to reach parallel.

### Deadlift

The system evaluates combined hip and knee extension, using the wrist's spatial coordinate as a proxy for tracking the barbell trajectory.

* **Setup Phase**: Recording of the wrist's lowest elevation point before the pull.
* **Lockout**: Simultaneous achievement of target hip and knee extension.
* **Invalidation Criteria**: Bar descent during the concentric pull phase.

### Overhead Press

The model monitors the elbow's push angle, correlating the data with trunk posture and lower-joint position to detect compensations.

* **Validation (Lockout)**: Full extension of the humerus above the critical threshold.
* **Invalidation Criteria**: Incomplete range of motion.

## Tech Stack

* **React 19**: UI rendering and reactive state management.
* **Vite 8**: Build tool and development server.
* **Tailwind CSS v4**: Utility-first CSS framework.
* **MediaPipe Tasks Vision**: Pre-trained neural network for Pose Estimation.
* **vite-plugin-pwa**: Service worker generation for native installation on mobile devices.

## System Requirements

* Node.js (v18+ recommended).
* Chromium- or WebKit-based browser compatible with the WebGL and `navigator.mediaDevices` APIs.
* For acquisition: a stabilized camera with a clean, high-contrast lateral framing.

## Installation and Setup

1. Clone the local repository.
2. Navigate to the root directory from the terminal.
3. Install the dependency tree:
```bash
npm install

```