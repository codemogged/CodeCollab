/**
 * Creates or updates a desktop shortcut pointing to the latest
 * win-unpacked build so the shortcut always launches the current version.
 *
 * Usage:  node scripts/update-desktop-shortcut.js
 * Called automatically by the build:electron npm script.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const exePath = path.resolve(__dirname, "..", "dist-electron", "win-unpacked", "CodeCollab.exe");
const workingDir = path.dirname(exePath);
const shortcutPath = path.join(os.homedir(), "Desktop", "CodeCollab.lnk");

if (!fs.existsSync(exePath)) {
  console.error(`Build output not found: ${exePath}`);
  console.error("Run 'npm run build:electron' first.");
  process.exit(1);
}

// Use WScript.Shell COM object to create a standard Windows .lnk shortcut.
// The PowerShell script is written to a temp file to avoid shell-escaping issues.
const psScript = `
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut('${shortcutPath.replace(/'/g, "''")}')
$sc.TargetPath = '${exePath.replace(/'/g, "''")}'
$sc.WorkingDirectory = '${workingDir.replace(/'/g, "''")}'
$sc.Description = 'CodeCollab – collaborative vibe coding'
$sc.Save()
`;

const tmpFile = path.join(os.tmpdir(), "codebuddy-shortcut.ps1");
fs.writeFileSync(tmpFile, psScript, "utf8");

try {
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`, { stdio: "inherit" });
  console.log(`Desktop shortcut updated → ${shortcutPath}`);
} finally {
  fs.unlinkSync(tmpFile);
}
