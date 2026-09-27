import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, storage } from "@/lib/firebase/config";
import { compressImage } from "./compressImage";

export class UploadError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "UploadError";
    this.code = code;
  }
}

export async function uploadPhoto(
  file: File,
  path: string,
  onProgress?: (pct: number) => void
): Promise<string> {

  // ── Step 1: Offline check ─────────────────────────────────────
  if (!navigator.onLine) {
    throw new UploadError("You are offline. Connect to upload photos.", "offline");
  }

  // ── Step 2: Auth check ────────────────────────────────────────
  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.error("[Storage] Upload aborted — auth.currentUser is null. User must be logged in.");
    throw new UploadError("You must be logged in to upload photos.", "unauthenticated");
  }
  console.log("[Storage] Auth OK — uid:", currentUser.uid);

  // ── Step 3: Validate file ─────────────────────────────────────
  if (!file || file.size === 0) {
    throw new UploadError("No file selected or file is empty.", "invalid-file");
  }
  console.log("[Storage] File:", file.name, `(${(file.size / 1024).toFixed(1)} KB)`, file.type);

  // ── Step 4: Compress ──────────────────────────────────────────
  let toUpload: File = file;
  try {
    toUpload = await compressImage(file, { maxWidth: 800, quality: 0.7 });
    console.log("[Storage] Compressed:", `${(toUpload.size / 1024).toFixed(1)} KB`);
  } catch (compressErr) {
    console.warn("[Storage] Compression failed, uploading original:", compressErr);
  }

  onProgress?.(20);

  // ── Step 5: Upload ────────────────────────────────────────────
  console.log("[Storage] Uploading to path:", path);
  try {
    const storageRef = ref(storage, path);
    onProgress?.(40);

    await uploadBytes(storageRef, toUpload);
    console.log("[Storage] uploadBytes OK");
    onProgress?.(80);

    const url = await getDownloadURL(storageRef);
    console.log("[Storage] Download URL:", url);
    onProgress?.(100);

    return url;

  } catch (err: any) {
    const code = err?.code ?? "unknown";
    const msg  = err?.message ?? "";
    console.error("[Storage] Upload FAILED — code:", code, "| message:", msg, "\nFull error:", err);

    if (code === "storage/unauthorized") {
      throw new UploadError(
        "Permission denied.\n\nFix in Firebase Console → Storage → Rules:\n\nallow read, write: if request.auth != null;",
        code
      );
    }
    if (code === "storage/unauthenticated") {
      throw new UploadError("Not authenticated. Please log out and log in again.", code);
    }
    if (code === "storage/canceled") {
      throw new UploadError("Upload was cancelled.", code);
    }
    if (code === "storage/quota-exceeded") {
      throw new UploadError("Storage quota exceeded.", code);
    }
    if (msg.includes("CORS") || code === "storage/unknown") {
      throw new UploadError(
        "CORS error — Firebase Storage is blocking requests from this domain.\n\nYou need to configure CORS in Firebase (see docs).",
        "cors"
      );
    }
    throw new UploadError(
      `Upload failed (${code}): ${msg || "Unknown error. Check console for details."}`,
      code
    );
  }
}

export function createLocalPreview(file: File): string {
  return URL.createObjectURL(file);
}

export function revokeLocalPreview(url: string) {
  try { URL.revokeObjectURL(url); } catch {}
}
