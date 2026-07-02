import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "application/pdf": "pdf",
};

/**
 * Local-disk media storage. Kept behind this narrow interface so swapping to S3/MinIO
 * later (once call/media volume is known) requires no changes outside this file.
 */
export interface MediaStorage {
  /** Returns the path to store on the row (relative, safe to keep in the DB and serve via a signed route). */
  save(category: "messages" | "recordings", bytes: Buffer, mimeType: string): Promise<string>;
  absolutePath(relativePath: string): string;
}

class LocalMediaStorage implements MediaStorage {
  async save(category: "messages" | "recordings", bytes: Buffer, mimeType: string): Promise<string> {
    const ext = EXTENSION_BY_MIME[mimeType] ?? "bin";
    const relativePath = path.join(category, `${randomUUID()}.${ext}`);
    const fullPath = this.absolutePath(relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, bytes);
    return relativePath;
  }

  absolutePath(relativePath: string): string {
    return path.join(env.MEDIA_STORAGE_LOCAL_PATH, relativePath);
  }
}

export const mediaStorage: MediaStorage = new LocalMediaStorage();
