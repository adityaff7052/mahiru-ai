import type { Session } from "@google/genai";

export const CAMERA_FRAME_INTERVAL_MS = 1000;
export const CAMERA_FRAME_WIDTH = 320;
export const CAMERA_FRAME_HEIGHT = 180;

/** The SDK's Blob is a base64 data object, not a browser Blob. Never persisted. */
export function captureVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
  canvas.width = CAMERA_FRAME_WIDTH;
  canvas.height = CAMERA_FRAME_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
  const width = video.videoWidth * scale;
  const height = video.videoHeight * scale;
  context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  const data = canvas.toDataURL("image/jpeg", 0.65).split(",")[1];
  return data ? { data, mimeType: "image/jpeg" } : null;
}

export function startVideoFrames(
  session: Pick<Session, "sendRealtimeInput">,
  getVideo: () => HTMLVideoElement | null,
  onError: (error: unknown) => void,
) {
  const canvas = document.createElement("canvas");
  const timer = window.setInterval(() => {
    const video = getVideo();
    if (!video) return;
    try {
      const frame = captureVideoFrame(video, canvas);
      if (frame) session.sendRealtimeInput({ video: frame });
    } catch (error) {
      window.clearInterval(timer);
      onError(error);
    }
  }, CAMERA_FRAME_INTERVAL_MS);
  return () => {
    window.clearInterval(timer);
    canvas.width = canvas.height = 0;
  };
}

export function hasRequiredMedia(stream: MediaStream) {
  return stream.getAudioTracks().some((track) => track.readyState === "live") &&
    stream.getVideoTracks().some((track) => track.readyState === "live");
}