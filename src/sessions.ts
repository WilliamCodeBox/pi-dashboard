import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function listSessions(): any[] {
  const base = path.join(os.homedir(), ".pi", "agent", "sessions");
  try {
    const out: any[] = [];
    for (const dir of fs.readdirSync(base, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const sub = path.join(base, dir.name);
      for (const f of fs.readdirSync(sub)) {
        if (!f.endsWith(".jsonl")) continue;
        const fp = path.join(sub, f);
        let projectCwd = "";
        try {
          const fh = fs.openSync(fp, "r");
          const buf = Buffer.alloc(4096);
          const n = fs.readSync(fh, buf, 0, 4096, 0);
          fs.closeSync(fh);
          const line = buf.toString("utf8", 0, n).split("\n", 1)[0];
          const m = line.match(/"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/);
          if (m) { try { projectCwd = JSON.parse('"' + m[1] + '"'); } catch { projectCwd = ""; } }
        } catch { /* 读首行失败 → 视为未知项目 */ }
        const st = fs.statSync(fp);
        out.push({ dir: dir.name, file: f, size: st.size, mtime: st.mtime.toISOString(), projectCwd });
      }
    }
    out.sort((a, b) => b.mtime.localeCompare(a.mtime));
    return out.slice(0, 50);
  } catch { return []; }
}
