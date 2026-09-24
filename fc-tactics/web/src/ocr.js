// In-browser OCR with Tesseract.js - screenshots never leave the visitor's device.
import { createWorker, PSM } from "tesseract.js";

let workerPromise = null;
let progressHandler = () => {};

function getWorker() {
  workerPromise ??= (async () => {
    const worker = await createWorker("eng", 1, {
      logger: (m) => m.status === "recognizing text" && progressHandler(m.progress),
    });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    return worker;
  })();
  return workerPromise;
}

const MAX_WIDTH = 4000;   // phone screenshots (~1600px wide) must get the full 2x upscale

// Card names, OVRs and positions are printed in white. Keeping only near-white pixels
// (as black on white) strips the busy card art away - this reads ~3x more cards than
// plain greyscale. Two thresholds catch both crisp and slightly tinted text; the plain
// greyscale pass picks up the odd card whose text isn't white.
const PASSES = [{ white: 205 }, { white: 170 }, { white: 0 }];

async function prepare(file, { white }) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(2, MAX_WIDTH / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";           // the default "low" upscale blurs small digits
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let g;
    if (white) g = Math.min(d[i], d[i + 1], d[i + 2]) > white ? 0 : 255;
    else {
      g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      g = g > 150 ? 255 : g < 90 ? 0 : (g - 90) * 4.25;      // boost contrast
    }
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, scale };
}

function collectWords(data, scale) {
  const words = [];
  for (const block of data.blocks ?? [])
    for (const para of block.paragraphs)
      for (const line of para.lines)
        for (const w of line.words)
          if (w.confidence > 30 && w.text.trim())
            words.push({
              text: w.text,
              confidence: w.confidence,
              bbox: { x0: w.bbox.x0 / scale, y0: w.bbox.y0 / scale, x1: w.bbox.x1 / scale, y1: w.bbox.y1 / scale },
            });
  return words;
}

// Returns one word list per OCR pass, each word with its position in original-image pixels.
// Passes are kept apart so multi-word names are only ever joined within one reading.
export async function readScreenshot(file, onProgress = () => {}) {
  const worker = await getWorker();
  const words = [];
  for (const [pass, options] of PASSES.entries()) {
    progressHandler = (p) => onProgress((pass + p) / PASSES.length);
    const { canvas, scale } = await prepare(file, options);
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    words.push(collectWords(data, scale));
  }
  progressHandler = () => {};
  onProgress(1);
  return words;
}
