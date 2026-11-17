// Face detection and face descriptors, in the browser (library: face-api).
//
// A descriptor is a list of 128 numbers that summarizes a face: two pictures
// of the same person give descriptors that are close to each other. Only the
// descriptor leaves this file; the image is never stored or sent anywhere.

import { headTurn } from "./headTurn.js";

// The model files are served by our own app (see scripts/copy-models.mjs), so
// this works without internet.
const MODELS_URL = "/models";

// Detections less sure than this are ignored (0 = anything, 1 = only certain).
const MIN_CONFIDENCE = 0.5;

let faceapi = null;
let loading = null;

/**
 * Load the library and the three networks, only once. The library is large
 * (about 1 MB, with TensorFlow.js inside), so it is downloaded only when a
 * screen with the camera needs it, not when the app opens.
 */
export function loadFaceModels() {
  if (!loading) {
    loading = import("@vladmandic/face-api/dist/face-api.esm.js")
      .then(async (module) => {
        faceapi = module;
        await faceapi.tf.ready();
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODELS_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
        ]);
        await warmUp();
      })
      .catch((error) => {
        loading = null; // Allow a new attempt later.
        throw error;
      });
  }
  return loading;
}

function detectorOptions() {
  return new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_CONFIDENCE });
}

/**
 * Run each of the three networks once on a blank picture.
 *
 * The first time a network runs, the browser prepares its programs for the
 * graphics card, and the page freezes for a few seconds (measured: 6 s for the
 * first detection, about 50 ms for the next ones). Doing it here, while the
 * screen says "Loading face model…", keeps that pause out of the face checks.
 * Running the detector alone is not enough: with no face in the picture, the
 * other two networks never run.
 */
async function warmUp() {
  const blank = document.createElement("canvas");
  blank.width = 150;
  blank.height = 150;
  await faceapi.detectAllFaces(blank, detectorOptions());
  await faceapi.nets.faceLandmark68Net.detectLandmarks(blank);
  await faceapi.nets.faceRecognitionNet.computeFaceDescriptor(blank);
}

/**
 * Compute the descriptor of the face in the video.
 *
 * Returns `{ descriptor }` (an array of 128 numbers) or `{ error }` with
 * "camera_not_ready", "no_face" or "multiple_faces". Exactly one face is
 * required, so a capture can never belong to the wrong person.
 */
export async function getDescriptor(video) {
  // Without a picture yet (camera starting or blocked), face-api would wait
  // forever for the video, so stop here instead.
  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return { error: "camera_not_ready" };
  }
  await loadFaceModels();
  const faces = await faceapi
    .detectAllFaces(video, detectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptors();

  if (faces.length === 0) return { error: "no_face" };
  if (faces.length > 1) return { error: "multiple_faces" };
  // Float32Array -> plain array, so it can be sent as JSON.
  return { descriptor: Array.from(faces[0].descriptor) };
}

/**
 * How far the head in the video is turned (see headTurn.js).
 *
 * Returns `{ turn }` or `{ error }` with the same codes as getDescriptor.
 * It skips the descriptor network, so it is faster: the head-turn check
 * follows the head many times per second.
 */
export async function getHeadTurn(video) {
  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return { error: "camera_not_ready" };
  }
  await loadFaceModels();
  const faces = await faceapi.detectAllFaces(video, detectorOptions()).withFaceLandmarks();

  if (faces.length === 0) return { error: "no_face" };
  if (faces.length > 1) return { error: "multiple_faces" };
  return { turn: headTurn(faces[0].landmarks.positions) };
}
