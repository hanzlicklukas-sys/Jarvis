'use strict';

let say;
try { say = require('say'); } catch { say = null; }

let nodeWhisper;
try { nodeWhisper = require('nodejs-whisper').nodewhisper; } catch { nodeWhisper = null; }

let recorder;
try { recorder = require('node-record-lpcm16'); } catch { recorder = null; }

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Speak text using native TTS (non-blocking)
 * @param {string} text
 * @returns {Promise<void>}
 */
function speak(text) {
  return new Promise((resolve) => {
    if (!say) {
      console.warn('[voice] say package not available, skipping TTS');
      return resolve();
    }
    if (!text || !text.trim()) return resolve();

    // Stop any current speech
    stopSpeaking();
    _isSpeaking = true;

    // Strip markdown-style formatting for TTS
    const cleanText = text
      .replace(/```[\s\S]*?```/g, 'code block')
      .replace(/`[^`]+`/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();

    _currentSpeech = say.speak(cleanText, null, 1.0, (err) => {
      _isSpeaking = false;
      _currentSpeech = null;
      if (err && err.message !== 'stopped') {
        console.warn('[voice] TTS error:', err.message);
      }
      resolve();
    });
  });
}

/**
 * Stop current TTS playback
 */
function stopSpeaking() {
  if (_isSpeaking && say) {
    try {
      say.stop();
    } catch { /* ignore */ }
    _isSpeaking = false;
    _currentSpeech = null;
  }
}

/**
 * @returns {boolean}
 */
function isSpeaking() {
  return _isSpeaking;
}

/**
 * Record audio and transcribe locally via whisper.cpp (nodejs-whisper, no API key needed)
 * On first use, nodejs-whisper auto-downloads the base.en model (~150 MB).
 * @param {number} durationMs - recording duration in ms (default 5000)
 * @returns {Promise<string>} transcribed text
 */
async function listen(durationMs = 5000) {
  if (!recorder) {
    throw new Error('node-record-lpcm16 not available. Install it for voice input.');
  }
  if (!nodeWhisper) {
    throw new Error('nodejs-whisper not available. Run: npm install nodejs-whisper');
  }

  const tempFile = path.join(os.tmpdir(), `jarvis_rec_${Date.now()}.wav`);

  await new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(tempFile);

    const recording = recorder.record({
      sampleRate: 16000,
      channels: 1,
      audioType: 'wav',
      recorder: process.platform === 'win32' ? 'sox' : 'rec',
      recorderPath: process.platform === 'win32' ? undefined : '/usr/local/bin/rec',
      silence: '1.0',
      threshold: 0.5
    });

    const audioStream = recording.stream();
    audioStream.pipe(fileStream);

    audioStream.on('error', (err) => {
      recording.stop();
      reject(new Error(`Recording error: ${err.message}`));
    });

    setTimeout(() => {
      recording.stop();
      fileStream.end();
      fileStream.on('finish', resolve);
    }, durationMs);
  });

  try {
    const stats = fs.statSync(tempFile);
    if (stats.size < 1000) {
      fs.unlinkSync(tempFile);
      return '';
    }

    // Transcribe locally — downloads base.en model on first run
    const transcript = await nodeWhisper(tempFile, {
      modelName: 'base.en',
      autoDownloadModelName: 'base.en',
      verbose: false,
      whisperOptions: { outputInText: true }
    });

    fs.unlinkSync(tempFile);
    return (transcript || '').trim();
  } catch (err) {
    try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
    throw new Error(`Transcription error: ${err.message}`);
  }
}

module.exports = { speak, stopSpeaking, isSpeaking, listen };
