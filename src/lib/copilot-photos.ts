// Photos attached to a copilot message (upload or camera).
//
// Each photo is downscaled to a JPEG (long edge <= 1600 px) before it is sent,
// so a few phone photos stay well under the 4.5 MB request limit of the chat
// proxy and the model gets a sharp enough image. The original file is kept so
// the New Observation form can save the full-quality photo.

export const COPILOT_MAX_PHOTOS = 3;
const MAX_EDGE = 1600;
const THUMB_EDGE = 160;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export type CopilotPhoto = {
  id: string;
  /** The original file, attached to the observation form on submit. */
  file: File;
  /** Sent to the model: image/jpeg, base64 without the data: prefix. */
  mediaType: "image/jpeg";
  data: string;
  /** Small data URL for the chat bubble and the composer tray. */
  thumb: string;
};

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // Respect EXIF orientation so phone photos aren't sideways.
      return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    } catch {
      /* fall back to <img> (e.g. HEIC in Safari) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(src: ImageBitmap | HTMLImageElement, edge: number, quality: number): string {
  const w = "naturalWidth" in src ? src.naturalWidth : src.width;
  const h = "naturalHeight" in src ? src.naturalHeight : src.height;
  const scale = Math.min(1, edge / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot process photos.");
  ctx.fillStyle = "#fff"; // transparent PNGs become white, not black, as JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Turn a picked or captured file into a copilot photo. Throws a user-readable error. */
export async function prepareCopilotPhoto(file: File): Promise<CopilotPhoto> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name || "That file"} is not a photo.`);
  if (file.size > MAX_INPUT_BYTES) throw new Error(`${file.name || "That photo"} is larger than 25 MB.`);
  let src: ImageBitmap | HTMLImageElement;
  try {
    src = await loadBitmap(file);
  } catch {
    throw new Error(`${file.name || "That photo"} could not be opened. Try a JPEG or PNG.`);
  }
  const full = draw(src, MAX_EDGE, 0.82);
  const thumb = draw(src, THUMB_EDGE, 0.7);
  if ("close" in src && typeof src.close === "function") src.close();
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()),
    file,
    mediaType: "image/jpeg",
    data: full.split(",", 2)[1] ?? "",
    thumb
  };
}
