#!/usr/bin/env node
// Generates notification WAV files for the ERP.
// Run: node erp/scripts/generate-notification-sounds.js
// Output: erp/public/sounds/transaction.wav  erp/public/sounds/livechat.wav
//
// Sound design:
//   transaction — double bell "Ding Ding" (C6 + E6), additive harmonics, louder
//   livechat    — ascending two-tone "boop boop" (A5 + D6), soft sine, quieter
//
// To replace sounds in the future, simply overwrite the WAV files.
// No code changes required.

'use strict';
const fs   = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;

// ── WAV writer ────────────────────────────────────────────────────────────────
function writeWav(filePath, samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  }
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0);
  hdr.writeUInt32LE(36 + data.length, 4);
  hdr.write('WAVE', 8);
  hdr.write('fmt ', 12);
  hdr.writeUInt32LE(16, 16);
  hdr.writeUInt16LE(1,  20);              // PCM
  hdr.writeUInt16LE(1,  22);              // mono
  hdr.writeUInt32LE(SAMPLE_RATE, 24);
  hdr.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate (16-bit mono)
  hdr.writeUInt16LE(2,  32);              // block align
  hdr.writeUInt16LE(16, 34);              // bits per sample
  hdr.write('data', 36);
  hdr.writeUInt32LE(data.length, 40);
  fs.writeFileSync(filePath, Buffer.concat([hdr, data]));
  console.log(`✓ ${filePath}  (${((44 + data.length) / 1024).toFixed(1)} KB)`);
}

// ── Synthesis helpers ─────────────────────────────────────────────────────────

// Bell tone using additive synthesis (fundamental + harmonic partials).
// partials: [{ freqRatio, amp }] — freqRatio is relative to fundamental.
// Envelope: fast attack → short decay to sustain → exponential release.
function bellTone(fundamentalHz, durationSec, masterAmp, partials) {
  const n       = Math.round(SAMPLE_RATE * durationSec);
  const attack  = Math.round(SAMPLE_RATE * 0.005);  // 5 ms attack
  const decay   = Math.round(SAMPLE_RATE * 0.04);   // 40 ms decay
  const sustain = 0.38;
  const relStart = Math.round(SAMPLE_RATE * durationSec * 0.55);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let env;
    if (i < attack) {
      env = i / attack;
    } else if (i < attack + decay) {
      env = 1 - (1 - sustain) * ((i - attack) / decay);
    } else if (i < relStart) {
      env = sustain;
    } else {
      env = sustain * Math.exp(-6 * (i - relStart) / (n - relStart));
    }
    let wave = 0;
    for (const { freqRatio, amp } of partials) {
      wave += amp * Math.sin(2 * Math.PI * fundamentalHz * freqRatio * t);
    }
    out[i] = masterAmp * env * wave;
  }
  return out;
}

// Soft chime — single sine with gentle exponential decay (livechat style).
function chimeTone(freqHz, durationSec, masterAmp) {
  const n      = Math.round(SAMPLE_RATE * durationSec);
  const attack = Math.round(SAMPLE_RATE * 0.004);
  const out    = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t   = i / SAMPLE_RATE;
    const env = i < attack
      ? i / attack
      : Math.exp(-5 * (i - attack) / (n - attack));
    out[i] = masterAmp * env * Math.sin(2 * Math.PI * freqHz * t);
  }
  return out;
}

// Concatenate two arrays with a silence gap (seconds).
function concat(a, b, gapSec) {
  const gap = Math.round(SAMPLE_RATE * gapSec);
  const out = new Float64Array(a.length + gap + b.length);
  out.set(a, 0);
  out.set(b, a.length + gap);
  return out;
}

// Normalize peak amplitude to targetPeak.
function normalize(samples, targetPeak = 0.88) {
  let peak = 0;
  for (const v of samples) if (Math.abs(v) > peak) peak = Math.abs(v);
  if (peak === 0) return samples;
  return samples.map(v => v * (targetPeak / peak));
}

// ── Transaction: "Ding Ding!" service-bell (C6 → E6) ─────────────────────────
// Additive harmonics create a warm metallic bell quality.
// Two dings at different pitches are instantly recognisable as "action needed".
const bellPartials = [
  { freqRatio: 1.00, amp: 1.00 },  // fundamental — body
  { freqRatio: 1.26, amp: 0.48 },  // major 3rd overtone — brightness
  { freqRatio: 2.00, amp: 0.16 },  // octave — warmth
  { freqRatio: 3.01, amp: 0.06 },  // 12th — air
];
const txDing1 = bellTone(1046, 0.30, 0.94, bellPartials); // C6
const txDing2 = bellTone(1318, 0.30, 0.84, bellPartials); // E6
const transactionSamples = normalize(concat(txDing1, txDing2, 0.11), 0.95);

// ── Livechat: "boop boop" ascending soft chime (A5 → D6) ─────────────────────
// Pure sine with gentle envelope — friendly, non-alarming, clearly different
// from the metallic transaction bell.
const lc1 = chimeTone(880,  0.14, 0.68); // A5
const lc2 = chimeTone(1175, 0.17, 0.65); // D6
const livechatSamples = normalize(concat(lc1, lc2, 0.028), 0.72);

// ── Write files ───────────────────────────────────────────────────────────────
const outDir = path.resolve(__dirname, '../public/sounds');
fs.mkdirSync(outDir, { recursive: true });
writeWav(path.join(outDir, 'transaction.wav'), transactionSamples);
writeWav(path.join(outDir, 'livechat.wav'),    livechatSamples);
console.log('\nDone. To replace sounds later, overwrite the WAV files — no code changes needed.');
