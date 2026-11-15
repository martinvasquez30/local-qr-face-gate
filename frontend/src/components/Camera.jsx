import { useEffect, useState } from "react";
import ErrorMessage from "./ErrorMessage.jsx";

/**
 * Live camera preview. The parent passes `videoRef` and reads the frames from
 * it (for example with getDescriptor). The camera is turned off when this
 * component leaves the screen.
 *
 * Browsers only allow the camera on https or on localhost.
 */
function Camera({ videoRef }) {
  const [errorCode, setErrorCode] = useState(null);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorCode("camera_unavailable"); // For example, not on localhost/https.
      return undefined;
    }

    let stream = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((newStream) => {
        // The component may have left the screen while the user was answering
        // the permission prompt: then turn the camera off right away.
        if (cancelled) {
          newStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = newStream;
        videoRef.current.srcObject = newStream;
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorCode(error.name === "NotAllowedError" ? "camera_denied" : "camera_unavailable");
        }
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [videoRef]);

  return (
    <div className="camera">
      {/* muted + playsInline let the video start on its own, also on phones. */}
      <video ref={videoRef} className="camera__video" autoPlay muted playsInline />
      <ErrorMessage code={errorCode} />
    </div>
  );
}

export default Camera;
