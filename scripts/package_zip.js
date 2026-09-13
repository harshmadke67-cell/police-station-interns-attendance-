const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const parentDir = path.resolve(rootDir, '..');
const downloadsDir = 'c:\\Users\\HARSH\\Downloads';

const targetZip1 = path.join(downloadsDir, 'StationTrack_Supabase_Cybersecurity_FINAL.zip');
const targetZip2 = path.join(parentDir, 'StationTrack_Police_Attendance_FINAL.zip');
const stagingDir = path.join(parentDir, 'staging_zip');
const stagingProjectDir = path.join(stagingDir, 'police_station_attendance');

console.log('Packaging project...');
console.log('Source:', rootDir);

// 1. Clean staging directory
if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
fs.mkdirSync(stagingProjectDir, { recursive: true });

// Helper to copy recursively excluding node_modules, .env, and .zip files
function copyFolderRecursive(source, target) {
  const items = fs.readdirSync(source);
  for (const item of items) {
    if (item === 'node_modules' || item === '.env' || item.endsWith('.zip') || item === '.git') {
      continue;
    }
    const srcPath = path.join(source, item);
    const dstPath = path.join(target, item);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      fs.mkdirSync(dstPath, { recursive: true });
      copyFolderRecursive(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

copyFolderRecursive(rootDir, stagingProjectDir);
console.log('Copied project files to staging.');

// PowerShell script to compress staging contents
const psScript = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory('${stagingDir.replace(/\\/g, '\\\\')}', '${targetZip1.replace(/\\/g, '\\\\')}')
`;

if (fs.existsSync(targetZip1)) fs.unlinkSync(targetZip1);
execSync(`powershell -NoProfile -Command "${psScript.trim().replace(/\n/g, '; ')}"`, { stdio: 'inherit' });
console.log('Created:', targetZip1, '(' + fs.statSync(targetZip1).size + ' bytes)');

// Copy to targetZip2
fs.copyFileSync(targetZip1, targetZip2);
console.log('Created:', targetZip2, '(' + fs.statSync(targetZip2).size + ' bytes)');

// Clean staging directory
fs.rmSync(stagingDir, { recursive: true, force: true });
console.log('Packaging complete!');
