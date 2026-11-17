// Head-turn check (liveness check): a real head turns in 3D, a photo is flat.
//
// Pure functions with no camera and no face-api, so they are easy to test.
// They use the 68 face points ("landmarks") that face-api already finds to
// compute the descriptor: points 36-41 outline one eye, 42-47 the other, and
// point 30 is the tip of the nose.
//
// Why it stops photos: the tip of the nose sticks out of the face. When a
// real head turns, the nose moves sideways compared with the eyes. A photo is
// flat: however it is turned or tilted, the nose stays in the middle between
// the eyes, because everything on it moves together.

// How much the turn must change from the start to count, as a share of the
// distance between the eyes. About a 15-20 degree turn of a real head.
export const TURN_NEEDED = 0.15;
// Back to looking straight: within this distance of the starting position.
const FRONT_TOLERANCE = TURN_NEEDED / 2;
// How many first values are used to learn the starting position.
const START_VALUES = 3;

const FIRST_EYE = 36;
const SECOND_EYE = 42;
const NOSE_TIP = 30;

/** The middle of one eye: the average of its 6 points. */
function eyeCenter(points, first) {
  const eye = points.slice(first, first + 6);
  return {
    x: eye.reduce((sum, point) => sum + point.x, 0) / eye.length,
    y: eye.reduce((sum, point) => sum + point.y, 0) / eye.length,
  };
}

/**
 * How far the head is turned, from the 68 face points (objects with x and y).
 *
 * It is how far the nose tip is from the middle between the eyes, measured
 * along the line that joins the eyes and divided by the distance between them:
 * - about 0 when looking straight at the camera;
 * - positive when the person turns to their left, negative to their right
 *   (the camera picture is not mirrored: the person's left is on its right).
 *
 * Measuring along the eye line, not just left-right in the picture, means
 * tilting the head to one side does not count as a turn. Dividing by the eye
 * distance means the distance to the camera does not matter.
 */
export function headTurn(points) {
  const first = eyeCenter(points, FIRST_EYE);
  const second = eyeCenter(points, SECOND_EYE);
  const middle = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  const eyeLine = { x: second.x - first.x, y: second.y - first.y };
  const nose = points[NOSE_TIP];
  const noseFromMiddle = { x: nose.x - middle.x, y: nose.y - middle.y };
  // Dot product: the part of noseFromMiddle that goes along the eye line.
  const along = noseFromMiddle.x * eyeLine.x + noseFromMiddle.y * eyeLine.y;
  return along / (eyeLine.x * eyeLine.x + eyeLine.y * eyeLine.y);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Where the head started: the median of the first values, or null if too few. */
export function startingTurn(values) {
  if (values.length < START_VALUES) return null;
  return median(values.slice(0, START_VALUES));
}

/**
 * True if the turn values (oldest first) show a turn to `side` ("left" or
 * "right", the person's own left or right) compared with where they started.
 *
 * It looks at the change from the start, not at the value alone, so a photo
 * of someone who is already turned does not pass: a photo never changes.
 */
export function hasTurned(values, side) {
  const start = startingTurn(values);
  if (start === null) return false;
  const sign = side === "left" ? 1 : -1;
  return values.slice(START_VALUES).some((value) => (value - start) * sign >= TURN_NEEDED);
}

/** True if `value` is back near the starting position `start`. */
export function isBackToFront(value, start) {
  return Math.abs(value - start) < FRONT_TOLERANCE;
}

/** Which way a turn value points, for the camera check page. */
export function turnSide(value) {
  if (value >= TURN_NEEDED) return "left";
  if (value <= -TURN_NEEDED) return "right";
  return "front";
}
