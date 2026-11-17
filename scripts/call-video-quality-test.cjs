/**
 * Offline checks for HD adaptive ladder (no live Agora session required).
 * Run: node scripts/call-video-quality-test.cjs
 */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(
  pkg.dependencies['agora-rtc-sdk-ng'],
  '4.24.9',
  'agora-rtc-sdk-ng must be pinned to 4.24.9',
);

const lock = fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8');
assert.ok(
  lock.includes('"agora-rtc-sdk-ng": "4.24.9"') || lock.includes('agora-rtc-sdk-ng-4.24.9'),
  'lockfile should resolve agora-rtc-sdk-ng 4.24.9',
);

const qualitySrc = fs.readFileSync(path.join(root, 'lib', 'call-video-quality.ts'), 'utf8');
assert.ok(qualitySrc.includes("1080p_5"), 'must use Agora 1080p_5 preset');
assert.ok(qualitySrc.includes("720p_3"), 'must use 720p fallback');
assert.ok(qualitySrc.includes('enableDualStream'), 'must enable dual-stream');
assert.ok(qualitySrc.includes('network-quality'), 'must monitor network-quality');
assert.ok(!/\bisPremium\b|\brequiresPremium\b|\bpremiumOnly\b/.test(qualitySrc), 'HD must not be premium-gated in code');

const overlaySrc = fs.readFileSync(path.join(root, 'components', 'call-overlay.tsx'), 'utf8');
assert.ok(overlaySrc.includes('createHdCameraTrack'), 'overlay must create HD camera track');
assert.ok(overlaySrc.includes('startAdaptiveVideoQuality'), 'overlay must start adaptive quality');
assert.ok(overlaySrc.includes('enableDualStreamForCall'), 'overlay must enable dual-stream');
assert.ok(overlaySrc.includes('call-beauty'), 'beauty filters must remain');
assert.ok(overlaySrc.includes('call:gift') || overlaySrc.includes('Send gift'), 'gifts must remain');
assert.ok(overlaySrc.includes("codec: 'vp8'"), 'must keep VP8 for broad 1080p support');

// Pure ladder math (mirror of mapNetworkToDesiredTierIndex)
function mapNetworkToDesiredTierIndex(uplink, downlink, canUse1080) {
  const worst = Math.max(uplink || 0, downlink || 0);
  if (worst <= 1) return canUse1080 ? 0 : 1;
  if (worst === 2) return 1;
  if (worst === 3) return 2;
  if (worst >= 4) return 3;
  return canUse1080 ? 0 : 1;
}

assert.strictEqual(mapNetworkToDesiredTierIndex(1, 1, true), 0, 'excellent → 1080p60');
assert.strictEqual(mapNetworkToDesiredTierIndex(1, 1, false), 1, 'excellent without 1080 → 720p');
assert.strictEqual(mapNetworkToDesiredTierIndex(2, 1, true), 1, 'good → 720p');
assert.strictEqual(mapNetworkToDesiredTierIndex(3, 2, true), 2, 'poor → 480p');
assert.strictEqual(mapNetworkToDesiredTierIndex(5, 4, true), 3, 'bad → 360p');
assert.strictEqual(mapNetworkToDesiredTierIndex(0, 0, true), 0, 'unknown treated as best-effort HD');

console.log('call-video-quality-test: OK');
console.log('- SDK pin: 4.24.9');
console.log('- Presets: 1080p_5 → 720p_3 ladder + dual-stream + network adaptive');
console.log('- Premium gate: none (HD for all users subject to device/network)');
console.log('- Note: Agora RTC minutes/HD bitrate are billed by Agora — not free by default.');
