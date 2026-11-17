import type { FastifyPluginCallback, FastifyRequest } from "fastify";
import { requireAuth } from "../auth/guards.js";
import { HttpError } from "../errors.js";
import {
  extOf,
  IMAGE_TYPES,
  isImageKey,
  MAX_IMAGE_BYTES,
  newImageKey,
  sniffImage,
  type ImageFolder,
  type ImageStore,
} from "../images.js";

export interface ImagesRoutesOptions {
  images: ImageStore;
}

/**
 * Lets routes in this scope receive a raw image body (PUT …/image with Content-Type image/png,
 * image/jpeg or image/webp). Other content types get Fastify's 415.
 */
export function acceptImageBodies(app: Parameters<FastifyPluginCallback>[0]) {
  app.addContentTypeParser(
    Object.values(IMAGE_TYPES),
    { parseAs: "buffer", bodyLimit: MAX_IMAGE_BYTES },
    (_request, body, done) => done(null, body),
  );
}

/** Checks an uploaded body is a PNG, JPEG or WebP image and saves it; returns its key. */
export async function storeUploadedImage(
  images: ImageStore,
  request: FastifyRequest,
  folder: ImageFolder,
  id: number,
) {
  const body = request.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new HttpError(400, "Send the image file as the request body");
  }
  const ext = sniffImage(body);
  if (!ext) throw new HttpError(400, "Only PNG, JPEG and WebP images are accepted");
  const key = newImageKey(folder, id, ext);
  await images.save(key, body);
  return key;
}

/** GET /api/images/<key>: any signed-in user. Keys are unique per upload, so cache forever. */
export const imagesRoutes: FastifyPluginCallback<ImagesRoutesOptions> = (app, { images }, done) => {
  app.get("/images/*", { preHandler: requireAuth }, async (request, reply) => {
    const key = (request.params as { "*": string })["*"];
    if (!isImageKey(key)) throw new HttpError(404, "Image not found");
    const data = await images.read(key);
    if (!data) throw new HttpError(404, "Image not found");
    return reply
      .header("Content-Type", IMAGE_TYPES[extOf(key)])
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", "private, max-age=31536000, immutable")
      .send(data);
  });
  done();
};
