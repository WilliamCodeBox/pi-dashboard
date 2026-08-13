import crypto from "node:crypto";

export const TOKEN = crypto.randomBytes(12).toString("hex");
export const allowedCommands = new Set([
  "prompt",
  "steer",
  "follow_up",
  "abort",
  "set_project",
  "pick_directory",
]);

export function buildAllowedOrigins(port: number): Set<string> {
  return new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
}

export function isOriginAllowed(origin: string | undefined, allowed: Set<string>): boolean {
  return !origin || allowed.has(origin);
}
