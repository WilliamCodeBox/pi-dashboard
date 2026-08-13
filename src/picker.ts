import { spawn } from "node:child_process";

export function pickDirectory(): Promise<{ success: boolean; error?: string; path?: string }> {
  if (process.platform !== "win32") return Promise.resolve({ success: false, error: "仅 Windows 支持浏览选择目录" });
  return new Promise((resolve) => {
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$f = New-Object System.Windows.Forms.FolderBrowserDialog",
      "$f.Description = '选择 pi 的项目目录'",
      "$f.ShowNewFolderButton = $true",
      "if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath } else { Write-Output '' }",
    ].join("\n");
    const ps = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: false });
    let out = "";
    ps.stdout.on("data", (d) => { out += d.toString(); });
    let done = false;
    const finish = (r: { success: boolean; error?: string; path?: string }) => { if (!done) { done = true; resolve(r); } };
    ps.on("close", () => { const sel = out.trim(); finish(sel ? { success: true, path: sel } : { success: false, error: "已取消" }); });
    ps.on("error", (e) => finish({ success: false, error: String(e) }));
    setTimeout(() => { try { ps.kill(); } catch {} finish({ success: false, error: "选择超时" }); }, 120000);
  });
}
