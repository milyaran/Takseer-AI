/* ==========================================================================
   browser.js — Chromium lifecycle for the scraper
   Resolves a local Playwright/Chrome binary and keeps one warm instance.
   ========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

let playwright = null;
let browserPromise = null;
let lastError = null;

function loadPlaywright() {
  if (playwright) return playwright;
  const candidates = ['playwright-core', 'playwright'];
  for (const name of candidates) {
    try {
      playwright = require(name);
      return playwright;
    } catch (e) {
      /* try next */
    }
  }
  throw new Error(
    'Modul "playwright-core" tidak ditemukan. Jalankan: npm install playwright-core'
  );
}

function findExecutable() {
  const envPath = process.env.CHROMIUM_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const roots = [
    path.join(os.homedir(), 'Library/Caches/ms-playwright'),
    path.join(os.homedir(), '.cache/ms-playwright'),
    path.join(os.homedir(), 'AppData/Local/ms-playwright')
  ];

  const relPaths = [
    'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-linux/chrome',
    'chrome-linux64/chrome',
    'chrome-win/chrome.exe',
    'chrome-headless-shell-mac-arm64/chrome-headless-shell',
    'chrome-headless-shell-mac-x64/chrome-headless-shell',
    'chrome-headless-shell-linux64/chrome-headless-shell'
  ];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    let dirs = [];
    try {
      dirs = fs.readdirSync(root);
    } catch (e) {
      continue;
    }
    const sorted = dirs
      .filter((d) => /^chromium(-headless-shell)?-\d+$/.test(d))
      .sort()
      .reverse();
    for (const d of sorted) {
      for (const rel of relPaths) {
        const p = path.join(root, d, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return null;
}

async function getBrowser() {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      if (b.isConnected()) return b;
    } catch (e) {
      /* rebuild below */
    }
  }
  browserPromise = (async () => {
    const pw = loadPlaywright();
    const executablePath = findExecutable();
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--lang=id-ID'
    ];
    const launchOpts = { headless: true, args };
    if (executablePath) launchOpts.executablePath = executablePath;
    try {
      const b = await pw.chromium.launch(launchOpts);
      lastError = null;
      return b;
    } catch (e) {
      lastError = e;
      throw new Error(
        'Chromium tidak dapat dijalankan: ' +
          e.message.split('\n')[0] +
          (executablePath ? '' : ' (binary tidak ditemukan — set CHROMIUM_PATH)')
      );
    }
  })();
  return browserPromise;
}

async function newPage() {
  const browser = await getBrowser();
  const context = await browser.newContext({
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    viewport: { width: 1366, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    extraHTTPHeaders: { 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.6' }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(22000);
  // block heavy assets — we only need the DOM
  await page.route('**/*', (route) => {
    const t = route.request().resourceType();
    if (t === 'image' || t === 'media' || t === 'font') return route.abort();
    return route.continue();
  });
  return { page, context };
}

async function closePage(handle) {
  try {
    await handle.context.close();
  } catch (e) {
    /* ignore */
  }
}

function status() {
  const exe = findExecutable();
  return {
    executable: exe,
    found: !!exe,
    error: lastError ? String(lastError.message || lastError).split('\n')[0] : null
  };
}

async function shutdown() {
  if (!browserPromise) return;
  try {
    const b = await browserPromise;
    await b.close();
  } catch (e) {
    /* ignore */
  }
  browserPromise = null;
}

module.exports = { getBrowser, newPage, closePage, status, shutdown, findExecutable };
