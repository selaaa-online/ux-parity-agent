import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_THRESHOLDS = {
  lookScore: 0.98,
  pixelMismatchRatio: 0.015,
  styleMatchRatio: 0.98,
  layoutMatchRatio: 0.95,
  plateauDelta: 0.005,
  maxIterations: 12,
  layoutTolerance: 2
};

const DEFAULT_LIMITS = {
  maxStates: 80,
  maxCrawlActions: 24,
  maxNodes: 350
};

export function interpolate(value, env = process.env) {
  if (typeof value !== 'string') return value;
  return value.replace(/\$\{ENV:([A-Z0-9_]+)\}/g, (_, name) => {
    if (env[name] == null || env[name] === '') {
      throw new Error(`Missing environment variable ${name} referenced by the manifest.`);
    }
    return env[name];
  });
}

function interpolateDeep(value, env) {
  if (typeof value === 'string') return interpolate(value, env);
  if (Array.isArray(value)) return value.map((item) => interpolateDeep(item, env));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolateDeep(item, env)]));
  }
  return value;
}

export function resolveUrl(base, resourcePath) {
  if (!resourcePath) return base;
  if (/^https?:\/\//i.test(resourcePath)) return resourcePath;
  const baseWithSlash = base.endsWith('/') ? base : `${base}/`;
  return new URL(resourcePath, baseWithSlash).href;
}

export function loadManifest(manifestPath, env = process.env) {
  const absolute = path.resolve(manifestPath);
  const raw = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  const manifest = interpolateDeep(raw, env);
  if (!manifest.reference?.baseUrl) throw new Error('manifest.reference.baseUrl is required.');
  if (!manifest.target?.baseUrl) throw new Error('manifest.target.baseUrl is required.');
  if (!manifest.target?.sourceRoot) throw new Error('manifest.target.sourceRoot is required.');
  if (!Array.isArray(manifest.viewports) || manifest.viewports.length === 0) {
    throw new Error('manifest.viewports must contain at least one viewport.');
  }
  for (const viewport of manifest.viewports) {
    if (!viewport.name || !viewport.width || !viewport.height) {
      throw new Error('Each viewport needs name, width, and height.');
    }
  }
  if (!Array.isArray(manifest.flows) || manifest.flows.length === 0) {
    throw new Error('manifest.flows must contain at least one flow. Use a flow with an empty steps array to capture the initial page.');
  }

  const repoRoot = path.resolve(path.dirname(absolute), manifest.root || '.');
  const sourceRoot = manifest.target.sourceRoot.replaceAll('\\', '/').replace(/\/$/, '');
  const editAllowlist = manifest.target.editAllowlist?.length
    ? manifest.target.editAllowlist
    : [
        `${sourceRoot}/**/*.css`,
        `${sourceRoot}/**/*.scss`,
        `${sourceRoot}/**/*.sass`,
        `${sourceRoot}/**/*.less`,
        `${sourceRoot}/**/*.html`,
        `${sourceRoot}/**/*.svg`,
        `${sourceRoot}/**/*.png`,
        `${sourceRoot}/**/*.woff2`
      ];

  return {
    ...manifest,
    manifestPath: absolute,
    repoRoot,
    reference: {
      allowMutations: false,
      ...manifest.reference
    },
    target: {
      allowMutations: true,
      ...manifest.target,
      sourceRoot,
      editAllowlist
    },
    thresholds: { ...DEFAULT_THRESHOLDS, ...manifest.thresholds },
    limits: { ...DEFAULT_LIMITS, ...manifest.limits },
    ignore: {
      selectors: [],
      styleProperties: [],
      ...manifest.ignore
    },
    crawl: manifest.crawl === false
      ? false
      : {
          actions: ['hover', 'focus', 'probe'],
          ...(manifest.crawl || {})
        },
    readySelector: manifest.readySelector || 'body',
    entryPath: manifest.entryPath || manifest.flows[0].path || '/'
  };
}
