/**
 * electron-builder afterPack hook.
 *
 * Embeds the CodeCollab icon (and metadata) into the packaged exe using rcedit.
 * We do this manually instead of letting electron-builder do it, because the
 * built-in path requires the winCodeSign helper which needs symlink-creation
 * privilege (Developer Mode or admin) on Windows. Calling rcedit directly
 * avoids that entire dependency.
 */

const path = require("path");
const fs = require("fs");

module.exports = async function afterPack(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== "win32") return;

  const exeName = `${packager.appInfo.productFilename}.exe`;
  const exePath = path.join(appOutDir, exeName);
  if (!fs.existsSync(exePath)) {
    console.warn(`[afterPack] exe not found at ${exePath}, skipping icon embed`);
    return;
  }

  const iconPath = path.join(__dirname, "..", "build", "icon.ico");
  if (!fs.existsSync(iconPath)) {
    console.warn(`[afterPack] icon not found at ${iconPath}, skipping icon embed`);
    return;
  }

  const { rcedit } = require("rcedit");
  const appInfo = packager.appInfo;
  const versionString = {
    CompanyName: "CodeCollab Contributors",
    FileDescription: appInfo.productName,
    ProductName: appInfo.productName,
    OriginalFilename: exeName,
    InternalName: appInfo.productName,
    LegalCopyright: appInfo.copyright || "Copyright © CodeCollab Contributors",
  };

  console.log(`[afterPack] Embedding icon into ${exePath}`);
  await rcedit(exePath, {
    icon: iconPath,
    "version-string": versionString,
    "file-version": appInfo.buildVersion || appInfo.version,
    "product-version": appInfo.version,
  });
  console.log(`[afterPack] Icon + metadata embedded.`);
};
