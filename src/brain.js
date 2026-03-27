'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');
const { getToolsForClaude, executeTool } = require('./tools/index');

const DEFAULT_SYSTEM_PROMPT = `You are JARVIS, an advanced AI assistant. You are helpful, precise, and slightly witty - like Tony Stark's AI.
You have access to the user's filesystem, web, and system. Use tools proactively when needed.
Always be concise - get to the point. When using tools, explain briefly what you're doing.`;

const SYSTEM_PROMPT_PATH = path.join(__dirname, '..', 'data', 'system_prompt.txt');
const MAX_HISTORY = 20;

let client = null;
const conversationHistory = [];

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === 'your_anthropic_key_here') {
      throw new Error('ANTHROPIC_API_KEY not configured. Please set it in your .env file.');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

function getSystemPrompt() {
  try {
    if (fs.existsSync(SYSTEM_PROMPT_PATH)) {
      const custom = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf8').trim();
      if (custom) return custom;
    }
  } catch { /* fall through to default */ }
  return DEFAULT_SYSTEM_PROMPT;
}

function trimHistory() {
  while (conversationHistory.length > MAX_HISTORY) {
    conversationHistory.shift();
  }
}

/**
 * Main chat function. Streams response tokens via onToken callback.
 * Handles multi-step tool use loops.
 * @param {string} userMessage
 * @param {function} onToken - called with each text chunk as it streams
 * @returns {Promise<string>} full response text
 */
async function chat(userMessage, onToken = null) {
  const anthropic = getClient();
  const claudeTools = getToolsForClaude();

  // Add user message to history
  conversationHistory.push({ role: 'user', content: userMessage });
  trimHistory();

  let fullResponse = '';

  // Tool execution loop
  while (true) {
    const messages = [...conversationHistory];

    // Use streaming for the final text response, non-streaming for tool calls
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      system: getSystemPrompt(),
      messages,
      tools: claudeTools,
      stream: true
    });

    let assistantContent = [];
    let currentText = '';
    let toolUseBlocks = [];
    let stopReason = null;

    // Process the stream
    for await (const event of response) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'text') {
          // Starting a text block
        } else if (event.content_block.type === 'tool_use') {
          toolUseBlocks.push({
            type: 'tool_use',
            id: event.content_block.id,
            name: event.content_block.name,
            input: ''
          });
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          const token = event.delta.text;
          currentText += token;
          fullResponse += token;
          if (onToken) onToken(token);
        } else if (event.delta.type === 'input_json_delta') {
          // Accumulate tool input JSON
          if (toolUseBlocks.length > 0) {
            toolUseBlocks[toolUseBlocks.length - 1].input += event.delta.partial_json;
          }
        }
      } else if (event.type === 'message_delta') {
        stopReason = event.delta.stop_reason;
      }
    }

    // Build assistant content blocks
    if (currentText) {
      assistantContent.push({ type: 'text', text: currentText });
    }
    for (const tb of toolUseBlocks) {
      let parsedInput = {};
      try { parsedInput = JSON.parse(tb.input || '{}'); } catch { parsedInput = {}; }
      assistantContent.push({
        type: 'tool_use',
        id: tb.id,
        name: tb.name,
        input: parsedInput
      });
    }

    // Add assistant message to history
    conversationHistory.push({ role: 'assistant', content: assistantContent });
    trimHistory();

    // If no tool use, we're done
    if (stopReason !== 'tool_use' || toolUseBlocks.length === 0) {
      break;
    }

    // Execute tools and build tool_result messages
    const toolResults = [];
    for (const toolBlock of toolUseBlocks) {
      let parsedInput = {};
      try { parsedInput = JSON.parse(toolBlock.input || '{}'); } catch { parsedInput = {}; }

      if (onToken) onToken(`\n[Tool: ${toolBlock.name}]\n`);

      const result = await executeTool(toolBlock.name, parsedInput);
      const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolBlock.id,
        content: resultText
      });
    }

    // Add tool results to history and continue the loop
    conversationHistory.push({ role: 'user', content: toolResults });
    trimHistory();
  }

  return fullResponse;
}

function clearHistory() {
  conversationHistory.length = 0;
}

function getHistory() {
  return [...conversationHistory];
}

module.exports = { chat, clearHistory, getHistory };
