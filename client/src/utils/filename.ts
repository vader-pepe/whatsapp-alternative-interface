export function sanitizeFileName(base64FileName: string) {
  return base64FileName
    .replace(/\//g, "_")
    .replace(/\+/g, "-")
    .replace(/=/g, "");
}
