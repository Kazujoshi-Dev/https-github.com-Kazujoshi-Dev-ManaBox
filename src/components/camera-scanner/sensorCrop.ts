/**
 * Przeliczenie celownika skanera z interfejsu na piksele obrazu z kamery.
 */

export interface CardCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Dokładnie mapuje prostokąt wizjera z interfejsu DOM na fizyczne piksele wideo.
 */
export function calculateVideoSensorCrop(
  videoElement: HTMLVideoElement,
  reticleElement: HTMLElement,
  containerElement: HTMLElement
): CardCropRect {
  const vWidth = videoElement.videoWidth || 1280;
  const vHeight = videoElement.videoHeight || 720;

  const containerRect = containerElement.getBoundingClientRect();
  const reticleRect = reticleElement.getBoundingClientRect();

  const scale = Math.max(containerRect.width / vWidth, containerRect.height / vHeight);
  const displayedWidth = vWidth * scale;
  const displayedHeight = vHeight * scale;

  const offsetX = (displayedWidth - containerRect.width) / 2;
  const offsetY = (displayedHeight - containerRect.height) / 2;

  const reticleRelX = reticleRect.left - containerRect.left;
  const reticleRelY = reticleRect.top - containerRect.top;

  const sensorX = Math.max(0, Math.round((reticleRelX + offsetX) / scale));
  const sensorY = Math.max(0, Math.round((reticleRelY + offsetY) / scale));
  const sensorW = Math.min(vWidth - sensorX, Math.round(reticleRect.width / scale));
  const sensorH = Math.min(vHeight - sensorY, Math.round(reticleRect.height / scale));

  return {
    x: sensorX,
    y: sensorY,
    width: sensorW,
    height: sensorH,
  };
}
