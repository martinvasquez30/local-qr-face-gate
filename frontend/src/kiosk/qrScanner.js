import jsQR from "jsqr";

/**
 * Look for a QR code in the current picture of the video, using the same
 * camera as face recognition. Returns the text inside the code, or null.
 *
 * The picture is copied to a canvas (an invisible drawing area) because jsQR
 * reads raw pixels. The canvas is reused between calls.
 */
export function readQrFromVideo(video, canvas) {
  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;

  const width = video.videoWidth;
  const height = video.videoHeight;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(video, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);

  const code = jsQR(pixels.data, width, height);
  return code ? code.data : null;
}
