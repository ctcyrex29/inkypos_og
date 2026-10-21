const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'web');
const dest = path.join(process.cwd(), 'web-build');

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    console.error('Source web folder not found:', src);
    process.exit(1);
  }
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const ent of entries) {
    const srcPath = path.join(src, ent.name);
    const destPath = path.join(dest, ent.name);
    if (ent.isDirectory()) copyRecursive(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

copyRecursive(src, dest);
console.log('web-build created at', dest);
