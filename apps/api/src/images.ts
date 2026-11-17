import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// Catalog pictures (CLAUDE.md rule 8): stored as files, the DB keeps only the key, e.g.
// "components/12-<uuid>.png". Local folder in dev; an S3/MinIO store implements the same
// interface for production. Files are never deleted when replaced: a released revision's
// snapshot may still point at the old one.

/** Technical safety cap per upload (no business limit yet). */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export const IMAGE_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
} as const;
export type ImageExt = keyof typeof IMAGE_TYPES;

export const IMAGE_FOLDERS = ["components", "cable-glands"] as const;
export type ImageFolder = (typeof IMAGE_FOLDERS)[number];

const KEY = /^(components|cable-glands)\/[0-9]+-[0-9a-f-]{36}\.(png|jpg|webp)$/;
export const isImageKey = (key: string) => KEY.test(key);

export interface ImageStore {
  save(key: string, data: Buffer): Promise<void>;
  /** null when there's no such file. */
  read(key: string): Promise<Buffer | null>;
}

export class LocalImageStore implements ImageStore {
  constructor(private readonly dir: string) {}

  private path(key: string) {
    if (!isImageKey(key)) throw new Error(`Invalid image key: ${key}`);
    return join(this.dir, key);
  }

  async save(key: string, data: Buffer) {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async read(key: string) {
    try {
      return await readFile(this.path(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }
}

/** The image format from the file's first bytes (the Content-Type header isn't trusted). */
export function sniffImage(data: Buffer): ImageExt | null {
  const startsWith = (bytes: number[], offset = 0) =>
    data.length >= offset + bytes.length && bytes.every((b, i) => data[offset + i] === b);
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith([0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return "webp";
  }
  return null;
}

export const newImageKey = (folder: ImageFolder, id: number, ext: ImageExt) =>
  `${folder}/${id}-${randomUUID()}.${ext}`;

export const extOf = (key: string) => key.slice(key.lastIndexOf(".") + 1) as ImageExt;
