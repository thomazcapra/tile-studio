// Thin wrapper around Google's Gemini image generation. Used by the
// `generate_image_with_gemini` and `gemini_to_tileset` tools.

import { GoogleGenerativeAI } from '@google/generative-ai';

export interface GeminiImageResult {
  bytes: Uint8Array;
  mimeType: string;
}

export async function generateImageWithGemini(opts: {
  prompt: string;
  apiKey?: string;
  model?: string;
}): Promise<GeminiImageResult> {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY (or GOOGLE_API_KEY) env var is required for Gemini image generation.');
  }
  const client = new GoogleGenerativeAI(apiKey);
  // gemini-2.0-flash-exp-image-generation supports inline image output;
  // newer image-specific endpoints can be substituted via opts.model.
  const model = client.getGenerativeModel({
    model: opts.model ?? 'gemini-2.0-flash-exp-image-generation',
    // @ts-expect-error responseModalities is part of the image gen preview API
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  });
  const resp = await model.generateContent([opts.prompt]);
  const parts = resp.response.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const inline = (p as { inlineData?: { data: string; mimeType: string } }).inlineData;
    if (inline?.data) {
      return {
        bytes: Buffer.from(inline.data, 'base64'),
        mimeType: inline.mimeType ?? 'image/png',
      };
    }
  }
  throw new Error('Gemini response contained no inline image.');
}
