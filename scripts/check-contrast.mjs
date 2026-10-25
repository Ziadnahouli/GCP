/**
 * WCAG 2.2 Contrast Ratio Verification Script
 * Validates light and dark theme token pairs and accent themes.
 * Target: >= 4.5:1 for normal body text, >= 3.0:1 for large text and UI boundaries.
 */

function hslToRgb(h, s, l) {
  s = s / 100;
  l = l / 100;

  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function parseHsl(str) {
  const parts = str.trim().split(/\s+/);
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1].replace('%', ''));
  const l = parseFloat(parts[2].replace('%', ''));
  return hslToRgb(h, s, l);
}

function getLuminance([r, g, b]) {
  const sRGB = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

function getContrast(hsl1, hsl2) {
  const lum1 = getLuminance(parseHsl(hsl1));
  const lum2 = getLuminance(parseHsl(hsl2));
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

export const lightTokens = {
  background: '0 0% 100%',
  surfaceSidebar: '220 20% 98%',
  surfaceRail: '225 18% 95%',
  surfaceHover: '224 19% 93%',
  surfaceActive: '224 19% 90%',
  card: '0 0% 100%',
  popover: '0 0% 100%',
  border: '222 16% 90%',
  borderStrong: '223 13% 84%',
  foreground: '220 10% 12%',
  mutedForeground: '220 8% 39%',
  primary: '240 55% 50%',
  primaryForeground: '0 0% 100%',
  primaryHover: '240 55% 44%',
  primarySubtle: '240 60% 96%',
  ring: '240 55% 50%',
  success: '156 56% 36%',
  warning: '38 78% 40%',
  danger: '352 56% 48%',
  statusOnline: '156 56% 36%',
  statusIdle: '38 78% 40%',
  statusDnd: '352 56% 48%',
  statusOffline: '220 8% 45%',
};

export const darkTokens = {
  background: '220 10% 6%',
  surfaceSidebar: '225 10% 8%',
  surfaceRail: '210 9% 4%',
  surfaceHover: '225 12% 13%',
  surfaceActive: '225 12% 16%',
  card: '225 10% 8%',
  popover: '225 10% 9%',
  border: '225 10% 15%',
  borderStrong: '225 11% 19%',
  foreground: '220 8% 93%',
  mutedForeground: '220 8% 63%',
  primary: '240 58% 59%',
  primaryForeground: '0 0% 100%',
  primaryHover: '240 58% 65%',
  primarySubtle: '240 30% 16%',
  ring: '235 100% 78%',
  success: '153 42% 51%',
  warning: '40 76% 57%',
  danger: '351 72% 63%',
  statusOnline: '153 42% 51%',
  statusIdle: '40 76% 57%',
  statusDnd: '351 72% 63%',
  statusOffline: '220 6% 44%',
};

export const accents = {
  light: {
    violet: { primary: '240 55% 50%', foreground: '0 0% 100%' },
    cyan: { primary: '199 89% 34%', foreground: '0 0% 100%' },
    emerald: { primary: '152 70% 30%', foreground: '0 0% 100%' },
    crimson: { primary: '350 84% 48%', foreground: '0 0% 100%' },
    amber: { primary: '38 92% 50%', foreground: '224 25% 8%' },
  },
  dark: {
    violet: { primary: '240 58% 59%', foreground: '0 0% 100%' },
    cyan: { primary: '199 89% 48%', foreground: '224 25% 8%' },
    emerald: { primary: '152 70% 30%', foreground: '0 0% 100%' },
    crimson: { primary: '350 84% 48%', foreground: '0 0% 100%' },
    amber: { primary: '38 92% 50%', foreground: '224 25% 8%' },
  },
};

let failures = 0;

function check(name, color1, color2, minRatio, type = 'text') {
  const ratio = getContrast(color1, color2);
  const pass = ratio >= minRatio;
  const status = pass ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${name}: ${ratio.toFixed(2)}:1 (required >= ${minRatio}:1)`);
  if (!pass) {
    failures++;
  }
  return ratio;
}

console.log('=== Checking Light Mode Tokens ===');
check('Light Body (foreground on background)', lightTokens.foreground, lightTokens.background, 4.5);
check('Light Body (foreground on sidebar)', lightTokens.foreground, lightTokens.surfaceSidebar, 4.5);
check('Light Body (foreground on hover)', lightTokens.foreground, lightTokens.surfaceHover, 4.5);
check('Light Muted (muted-foreground on background)', lightTokens.mutedForeground, lightTokens.background, 4.5);
check('Light Button (primary-foreground on primary)', lightTokens.primaryForeground, lightTokens.primary, 4.5);

console.log('\n=== Checking Dark Mode Tokens ===');
check('Dark Body (foreground on background)', darkTokens.foreground, darkTokens.background, 4.5);
check('Dark Body (foreground on sidebar)', darkTokens.foreground, darkTokens.surfaceSidebar, 4.5);
check('Dark Body (foreground on hover)', darkTokens.foreground, darkTokens.surfaceHover, 4.5);
check('Dark Muted (muted-foreground on background)', darkTokens.mutedForeground, darkTokens.background, 4.5);
check('Dark Button (primary-foreground on primary)', darkTokens.primaryForeground, darkTokens.primary, 4.5);

console.log('\n=== Checking Light Mode Accent Buttons (>= 4.5:1) ===');
for (const [name, colors] of Object.entries(accents.light)) {
  check(`Light Accent [${name}]`, colors.foreground, colors.primary, 4.5);
}

console.log('\n=== Checking Dark Mode Accent Buttons (>= 4.5:1) ===');
for (const [name, colors] of Object.entries(accents.dark)) {
  check(`Dark Accent [${name}]`, colors.foreground, colors.primary, 4.5);
}

if (failures > 0) {
  console.error(`\nContrast check FAILED with ${failures} violations.`);
  process.exit(1);
} else {
  console.log('\nAll contrast checks PASSED successfully!');
}
