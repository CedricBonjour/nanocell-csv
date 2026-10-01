import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseDir = path.resolve(__dirname, 'app/js');

function getAllJsFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllJsFiles(fullPath));
    } else if (file.endsWith('.js')) {
      results.push(fullPath);
    }
  });
  return results;
}

function parseImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const importRegex = /(?:import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|export\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"])/g;
  const imports = [];
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1] || match[2];
    if (importPath && (importPath.startsWith('.') || importPath.startsWith('/'))) {
      imports.push(importPath);
    }
  }
  return imports;
}

function resolveImport(sourceFile, importPath) {
  const dir = path.dirname(sourceFile);
  let resolved = path.resolve(dir, importPath);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    resolved = path.join(resolved, 'index.js');
  }
  if (!resolved.endsWith('.js') && fs.existsSync(resolved + '.js')) {
    resolved = resolved + '.js';
  }
  return resolved;
}

function findCycles() {
  const files = getAllJsFiles(baseDir);
  const graph = new Map();
  const fileSet = new Set(files.map(f => path.normalize(f)));

  files.forEach(file => {
    const normFile = path.normalize(file);
    const imports = parseImports(file);
    const targets = new Set();
    imports.forEach(imp => {
      const resolved = path.normalize(resolveImport(file, imp));
      if (fileSet.has(resolved)) {
        targets.add(resolved);
      }
    });
    graph.set(normFile, Array.from(targets));
  });

  const cycles = [];
  const visited = new Map(); // unvisited: 0, visiting: 1, visited: 2
  const pathStack = [];

  function dfs(node) {
    visited.set(node, 1);
    pathStack.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (visited.get(neighbor) === 1) {
        // Cycle found
        const cycleStartIndex = pathStack.indexOf(neighbor);
        const cycle = pathStack.slice(cycleStartIndex).concat(neighbor);
        cycles.push(cycle);
      } else if (!visited.get(neighbor)) {
        dfs(neighbor);
      }
    }

    pathStack.pop();
    visited.set(node, 2);
  }

  for (const node of graph.keys()) {
    if (!visited.get(node)) {
      dfs(node);
    }
  }

  return { graph, cycles };
}

const { graph, cycles } = findCycles();
const rel = p => path.relative(baseDir, p).replace(/\\/g, '/');

console.log(`Analyzing ${graph.size} JS files in app/js/...\n`);

if (cycles.length === 0) {
  console.log('✅ ZERO circular dependencies found! The import graph is a strict DAG.');
  process.exit(0);
} else {
  console.log(`❌ Found ${cycles.length} circular dependency cycle(s):\n`);
  cycles.forEach((cycle, index) => {
    console.log(`Cycle ${index + 1}: (${cycle.length - 1} nodes)`);
    console.log(`  ` + cycle.map(rel).join(' -> ') + '\n');
  });
  process.exit(1);
}
