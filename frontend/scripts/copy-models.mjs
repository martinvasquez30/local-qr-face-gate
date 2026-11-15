// Copies the three face models the app uses from the face-api package to
// public/models, so the app serves them itself: no CDN, works without internet.
// public/models is ignored by git (model weights are never committed).
// Runs automatically before `npm run dev` and `npm run build`.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SOURCE = "node_modules/@vladmandic/face-api/model";
const TARGET = "public/models";
const MODELS = [
  "ssd_mobilenetv1_model", // finds where the face is
  "face_landmark_68_model", // 68 points (eyes, nose, mouth) to align the face
  "face_recognition_model", // turns the aligned face into 128 numbers
];

mkdirSync(TARGET, { recursive: true });
for (const model of MODELS) {
  // Each model is a description (manifest) plus the weights (.bin).
  for (const file of [`${model}-weights_manifest.json`, `${model}.bin`]) {
    const target = join(TARGET, file);
    if (!existsSync(target)) copyFileSync(join(SOURCE, file), target);
  }
}
