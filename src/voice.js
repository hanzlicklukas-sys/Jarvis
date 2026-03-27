'use strict';

let say;
try { say = require('say'); } catch { say = null; }

let OpenAI;
try { OpenAI = require('openai').OpenAI; } catch { OpenAI = null; }

let recorder;
try { recorder = require('node-record-lpcm16'); } catch { recorder = null; }

const fs = require('fs');
const path = require('path');
const os = require('os');

let _isSpeaking = false;
let _currentSpeech = null;
let openaiClient = null;

function getOpenAIClient() {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'your_openai_key_here_for_whisper_stt') {
      throw new Error('OPENAI_API_KEY not configured. Add it to .env for STT support.');
    }
    if (!OpenAI) throw new Error('openai package not available');
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

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
 * Record audio and transcribe via OpenAI Whisper
 * @param {number} durationMs - recording duration in ms (default 5000)
 * @returns {Promise<string>} transcribed text
 */
async function listen(durationMs = 5000) {
  if (!recorder) {
    throw new Error('node-record-lpcm16 not available. Install it for voice input.');
  }

  const client = getOpenAIClient();
  const tempFile = path.join(os.tmpdir(), `jarvis_rec_${Date.now()}.wav`);

  return new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(tempFile);
    
    const recording = recorder.record({
      sampleRate: 16000,
      channels: 1,
      audioType: 'wav',
      recorder: process.platform === 'win32' ? 'sox' : 'rec',
      silence: '1.0',
      threshold: 0.5
    });

    const audioStream = recording.stream();
    audioStream.pipe(fileStream);

    audioStream.on('error', (err) => {
      recording.stop();
      reject(new Error(`Recording error: ${err.message}`));
    });

    // Stop after duration
    setTimeout(async () => {
      recording.stop();
      fileStream.end();
      
      // Wait for file to be written
      await new Promise(res => fileStream.on('finish', res));

      try {
        const stats = fs.statSync(tempFile);
        if (stats.size < 1000) {
          fs.unlinkSync(tempFile);
          return resolve('');
        }

        const transcription = await client.audio.transcriptions.create({
          file: fs.createReadStream(tempFile),
          model: 'whisper-1',
          language: 'en'
        });

        fs.unlinkSync(tempFile);
        resolve(transcription.text || '');
      } catch (err) {
        try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
        reject(new Error(`Transcription error: ${err.message}`));
      }
    }, durationMs);
  });
}

module.exports = { speak, stopSpeaking, isSpeaking, listen };
