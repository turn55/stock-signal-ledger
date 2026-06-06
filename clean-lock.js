const fs = require('fs');
const data = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Collect all dependency names from package.json
const allDeps = new Set();
for (const kind of ['dependencies', 'devDependencies']) {
  for (const dep of Object.keys(pkg[kind] || {})) {
    allDeps.add(dep);
    allDeps.add(dep);
  }
}

// Remove any packages from lockfile that are not in package.json
for (const key of Object.keys(data.packages || {})) {
  if (key === '') continue;
  const parts = key.split('node_modules/');
  const depName = parts[parts.length - 1].split('/')[0];
  if (!allDeps.has(depName) && !key.startsWith('node_modules/@types')) {
    delete data.packages[key];
  }
}

fs.writeFileSync('package-lock.json', JSON.stringify(data, null, 2) + '\n');
console.log('Cleaned package-lock.json');
