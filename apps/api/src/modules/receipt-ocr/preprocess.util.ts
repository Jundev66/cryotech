import sharp from 'sharp';

/** Long edge we upscale small screenshots to before OCR. */
const OCR_TARGET_LONG_EDGE = 1600;
/** Long edge we downscale to before sending an image to the AI reader. */
const AI_TARGET_LONG_EDGE = 1000;
/** Mean luminance below this means the screenshot uses a dark theme. */
const DARK_THEME_THRESHOLD = 110;

/**
 * Ceiling on decoded pixels, and therefore on memory.
 *
 * sharp's own default is 268 megapixels, which is far above anything a phone
 * produces and well within range of a decompression bomb: a few-kilobyte PNG
 * can declare enormous dimensions and be expanded here. 40 MP comfortably
 * covers a 200-megapixel-era phone screenshot while keeping the worst case
 * bounded.
 */
const MAX_INPUT_PIXELS = 40_000_000;

/** Applied to every sharp pipeline built from untrusted input. */
const SHARP_OPTIONS = { failOn: 'none', limitInputPixels: MAX_INPUT_PIXELS } as const;

export interface PreprocessResult {
  /** High-contrast greyscale PNG, the input to Tesseract. */
  ocrImage: Buffer;
  /** Downscaled JPEG, the input to the AI reader — smaller means fewer tokens. */
  aiImage: Buffer;
  aiMimeType: 'image/jpeg';
  wasInverted: boolean;
  width: number;
  height: number;
}

/**
 * Prepares a WhatsApp screenshot for reading.
 *
 * Two things this has to survive: dark-mode receipts, which Tesseract reads
 * poorly as light-on-dark and which we invert first; and WhatsApp's
 * re-compression, which softens glyph edges — hence the upscale and the
 * contrast normalisation.
 *
 * Also emits a downscaled copy for the AI fallback. Image tokens scale with
 * area, so shrinking a 1080x2400 screenshot to a 1000px long edge roughly
 * halves what that call costs.
 */
export async function preprocessReceipt(input: Buffer): Promise<PreprocessResult> {
  const base = sharp(input, SHARP_OPTIONS).rotate();
  const metadata = await base.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  const grey = sharp(input, SHARP_OPTIONS).rotate().greyscale();
  const stats = await grey.stats();
  const meanLuminance = stats.channels[0]?.mean ?? 255;
  const wasInverted = meanLuminance < DARK_THEME_THRESHOLD;

  const longEdge = Math.max(width, height) || OCR_TARGET_LONG_EDGE;
  const upscale = longEdge < OCR_TARGET_LONG_EDGE ? OCR_TARGET_LONG_EDGE / longEdge : 1;

  let pipeline = sharp(input, SHARP_OPTIONS).rotate().greyscale();
  if (wasInverted) pipeline = pipeline.negate();
  if (upscale > 1) {
    pipeline = pipeline.resize({
      width: Math.round(width * upscale),
      height: Math.round(height * upscale),
      kernel: 'lanczos3',
    });
  }

  const ocrImage = await pipeline.normalise().sharpen().png({ compressionLevel: 6 }).toBuffer();

  const aiImage = await sharp(input, SHARP_OPTIONS)
    .rotate()
    .resize({
      width: width >= height ? AI_TARGET_LONG_EDGE : undefined,
      height: height > width ? AI_TARGET_LONG_EDGE : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80 })
    .toBuffer();

  return { ocrImage, aiImage, aiMimeType: 'image/jpeg', wasInverted, width, height };
}
