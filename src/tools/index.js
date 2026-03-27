'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const memory = require('../memory');

// Lazy-load modules that may not always be available
let axios, cheerio, nodeFetch, nodeSchedule;

function getAxios() {
  if (!axios) axios = require('axios');
  return axios;
}

function getCheerio() {
  if (!cheerio) cheerio = require('cheerio');
  return cheerio;
}

function getNodeFetch() {
  if (!nodeFetch) nodeFetch = require('node-fetch');
  return nodeFetch;
}

// Reminder storage
const reminders = new Map();
let reminderCounter = 1;

// ─── Tool definitions ──────────────────────────────────────────────────────────

const tools = {
  read_file: {
    name: 'read_file',
    description: 'Read the contents of a file at a given path.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative path to the file' }
      },
      required: ['path']
    },
    async execute({ path: filePath }) {
      try {
        const resolvedPath = path.resolve(filePath);
        const content = fs.readFileSync(resolvedPath, 'utf8');
        memory.logAction('read_file', { path: filePath }, `Read ${content.length} chars`, true);
        return { content, path: resolvedPath, size: content.length };
      } catch (err) {
        memory.logAction('read_file', { path: filePath }, err.message, false);
        return { error: err.message };
      }
    }
  },

  write_file: {
    name: 'write_file',
    description: 'Write content to a file, creating it if it does not exist.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' },
        content: { type: 'string', description: 'Content to write' }
      },
      required: ['path', 'content']
    },
    async execute({ path: filePath, content }) {
      try {
        const resolvedPath = path.resolve(filePath);
        fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
        fs.writeFileSync(resolvedPath, content, 'utf8');
        memory.logAction('write_file', { path: filePath }, `Wrote ${content.length} chars`, true);
        return { success: true, path: resolvedPath, bytes_written: Buffer.byteLength(content, 'utf8') };
      } catch (err) {
        memory.logAction('write_file', { path: filePath }, err.message, false);
        return { error: err.message };
      }
    }
  },

  append_file: {
    name: 'append_file',
    description: 'Append content to the end of a file.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' },
        content: { type: 'string', description: 'Content to append' }
      },
      required: ['path', 'content']
    },
    async execute({ path: filePath, content }) {
      try {
        const resolvedPath = path.resolve(filePath);
        fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
        fs.appendFileSync(resolvedPath, content, 'utf8');
        memory.logAction('append_file', { path: filePath }, `Appended ${content.length} chars`, true);
        return { success: true, path: resolvedPath };
      } catch (err) {
        memory.logAction('append_file', { path: filePath }, err.message, false);
        return { error: err.message };
      }
    }
  },

  list_directory: {
    name: 'list_directory',
    description: 'List the contents of a directory.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the directory' }
      },
      required: ['path']
    },
    async execute({ path: dirPath }) {
      try {
        const resolvedPath = path.resolve(dirPath);
        const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
        const result = entries.map(entry => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : 'file',
          path: path.join(resolvedPath, entry.name)
        }));
        memory.logAction('list_directory', { path: dirPath }, `Listed ${result.length} entries`, true);
        return { entries: result, count: result.length, path: resolvedPath };
      } catch (err) {
        memory.logAction('list_directory', { path: dirPath }, err.message, false);
        return { error: err.message };
      }
    }
  },

  create_directory: {
    name: 'create_directory',
    description: 'Create a directory (and any parent directories).',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path of the directory to create' }
      },
      required: ['path']
    },
    async execute({ path: dirPath }) {
      try {
        const resolvedPath = path.resolve(dirPath);
        fs.mkdirSync(resolvedPath, { recursive: true });
        memory.logAction('create_directory', { path: dirPath }, 'Created', true);
        return { success: true, path: resolvedPath };
      } catch (err) {
        memory.logAction('create_directory', { path: dirPath }, err.message, false);
        return { error: err.message };
      }
    }
  },

  delete_file: {
    name: 'delete_file',
    description: 'Delete a file or directory.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file or directory to delete' }
      },
      required: ['path']
    },
    async execute({ path: filePath }) {
      try {
        const resolvedPath = path.resolve(filePath);
        const stat = fs.statSync(resolvedPath);
        if (stat.isDirectory()) {
          fs.rmSync(resolvedPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(resolvedPath);
        }
        memory.logAction('delete_file', { path: filePath }, 'Deleted', true);
        return { success: true, path: resolvedPath };
      } catch (err) {
        memory.logAction('delete_file', { path: filePath }, err.message, false);
        return { error: err.message };
      }
    }
  },

  move_file: {
    name: 'move_file',
    description: 'Move or rename a file or directory.',
    input_schema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source path' },
        dest: { type: 'string', description: 'Destination path' }
      },
      required: ['source', 'dest']
    },
    async execute({ source, dest }) {
      try {
        const srcResolved = path.resolve(source);
        const destResolved = path.resolve(dest);
        fs.mkdirSync(path.dirname(destResolved), { recursive: true });
        fs.renameSync(srcResolved, destResolved);
        memory.logAction('move_file', { source, dest }, 'Moved', true);
        return { success: true, source: srcResolved, dest: destResolved };
      } catch (err) {
        memory.logAction('move_file', { source, dest }, err.message, false);
        return { error: err.message };
      }
    }
  },

  search_files: {
    name: 'search_files',
    description: 'Search for files in a directory matching a glob pattern.',
    input_schema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Directory to search in' },
        pattern: { type: 'string', description: 'Glob pattern or filename substring to match' }
      },
      required: ['directory', 'pattern']
    },
    async execute({ directory, pattern }) {
      try {
        const resolvedDir = path.resolve(directory);
        const results = [];

        function searchDir(dir, depth = 0) {
          if (depth > 10) return;
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              if (entry.name.includes(pattern) || matchGlob(entry.name, pattern)) {
                results.push({
                  name: entry.name,
                  path: fullPath,
                  type: entry.isDirectory() ? 'directory' : 'file'
                });
              }
              if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                searchDir(fullPath, depth + 1);
              }
            }
          } catch { /* skip unreadable dirs */ }
        }

        searchDir(resolvedDir);
        memory.logAction('search_files', { directory, pattern }, `Found ${results.length} matches`, true);
        return { matches: results, count: results.length };
      } catch (err) {
        memory.logAction('search_files', { directory, pattern }, err.message, false);
        return { error: err.message };
      }
    }
  },

  web_search: {
    name: 'web_search',
    description: 'Search the web using Brave Search API (falls back to DuckDuckGo).',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' }
      },
      required: ['query']
    },
    async execute({ query }) {
      try {
        const braveKey = process.env.BRAVE_SEARCH_API_KEY;

        if (braveKey && braveKey !== 'your_brave_search_key_here') {
          const ax = getAxios();
          const resp = await ax.get('https://api.search.brave.com/res/v1/web/search', {
            headers: { 'Accept': 'application/json', 'X-Subscription-Token': braveKey },
            params: { q: query, count: 10 }
          });
          const results = (resp.data.web?.results || []).map(r => ({
            title: r.title,
            url: r.url,
            description: r.description
          }));
          memory.logAction('web_search', { query }, `${results.length} Brave results`, true);
          return { results, source: 'brave', query };
        }

        // Fallback: DuckDuckGo instant answer API
        const fetch = getNodeFetch();
        const resp = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
        const data = await resp.json();
        const results = [];
        if (data.AbstractText) results.push({ title: data.Heading, url: data.AbstractURL, description: data.AbstractText });
        (data.RelatedTopics || []).slice(0, 8).forEach(t => {
          if (t.Text && t.FirstURL) results.push({ title: t.Text.substring(0, 80), url: t.FirstURL, description: t.Text });
        });
        memory.logAction('web_search', { query }, `${results.length} DDG results`, true);
        return { results, source: 'duckduckgo', query };
      } catch (err) {
        memory.logAction('web_search', { query }, err.message, false);
        return { error: err.message };
      }
    }
  },

  fetch_url: {
    name: 'fetch_url',
    description: 'Fetch a webpage and return its text content.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' }
      },
      required: ['url']
    },
    async execute({ url }) {
      try {
        const ax = getAxios();
        const resp = await ax.get(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JARVIS/1.0)' },
          timeout: 15000,
          maxContentLength: 5 * 1024 * 1024
        });
        const $ = getCheerio().load(resp.data);
        // Remove scripts, styles, nav, footer
        $('script, style, nav, footer, header, aside, .ad, .advertisement').remove();
        const text = $('body').text().replace(/\s+/g, ' ').trim();
        const title = $('title').text().trim();
        memory.logAction('fetch_url', { url }, `Fetched ${text.length} chars`, true);
        return { title, text: text.substring(0, 8000), url, full_length: text.length };
      } catch (err) {
        memory.logAction('fetch_url', { url }, err.message, false);
        return { error: err.message };
      }
    }
  },

  run_command: {
    name: 'run_command',
    description: 'Execute a shell command and return the output.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' }
      },
      required: ['command']
    },
    async execute({ command }) {
      try {
        const { stdout, stderr } = await execAsync(command, { timeout: 30000, maxBuffer: 1024 * 1024 });
        memory.logAction('run_command', { command }, stdout.substring(0, 500), true);
        return { stdout: stdout.trim(), stderr: stderr.trim(), success: true };
      } catch (err) {
        memory.logAction('run_command', { command }, err.message, false);
        return { error: err.message, stdout: err.stdout || '', stderr: err.stderr || '' };
      }
    }
  },

  get_weather: {
    name: 'get_weather',
    description: 'Get current weather for a city.',
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name (e.g. "London" or "New York,US")' }
      },
      required: ['city']
    },
    async execute({ city }) {
      try {
        const apiKey = process.env.WEATHER_API_KEY;
        if (!apiKey || apiKey === 'your_openweathermap_key_here') {
          return { error: 'WEATHER_API_KEY not configured. Add it to your .env file.' };
        }
        const ax = getAxios();
        const resp = await ax.get('https://api.openweathermap.org/data/2.5/weather', {
          params: { q: city, appid: apiKey, units: 'metric' }
        });
        const d = resp.data;
        const result = {
          city: d.name,
          country: d.sys.country,
          temperature_c: Math.round(d.main.temp),
          feels_like_c: Math.round(d.main.feels_like),
          humidity_percent: d.main.humidity,
          description: d.weather[0].description,
          wind_speed_ms: d.wind.speed,
          visibility_km: (d.visibility / 1000).toFixed(1)
        };
        memory.logAction('get_weather', { city }, JSON.stringify(result), true);
        return result;
      } catch (err) {
        memory.logAction('get_weather', { city }, err.message, false);
        return { error: err.response?.data?.message || err.message };
      }
    }
  },

  save_memory: {
    name: 'save_memory',
    description: 'Save a piece of information to long-term memory.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Information to remember' },
        type: { type: 'string', description: 'Category (e.g. preference, fact, todo, note)', default: 'general' }
      },
      required: ['content']
    },
    async execute({ content, type = 'general' }) {
      try {
        const saved = memory.saveMemory(type, content, { saved_by: 'jarvis' });
        memory.logAction('save_memory', { content: content.substring(0, 100), type }, `Saved as id=${saved.id}`, true);
        return { success: true, id: saved.id, type, content };
      } catch (err) {
        memory.logAction('save_memory', { content }, err.message, false);
        return { error: err.message };
      }
    }
  },

  recall_memory: {
    name: 'recall_memory',
    description: 'Search long-term memory for relevant information.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for in memory' }
      },
      required: ['query']
    },
    async execute({ query }) {
      try {
        const results = memory.recallMemory(query, 10);
        memory.logAction('recall_memory', { query }, `Found ${results.length} memories`, true);
        return { memories: results, count: results.length, query };
      } catch (err) {
        memory.logAction('recall_memory', { query }, err.message, false);
        return { error: err.message };
      }
    }
  },

  get_time: {
    name: 'get_time',
    description: 'Get the current date and time.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    },
    async execute() {
      const now = new Date();
      const result = {
        iso: now.toISOString(),
        date: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        timestamp: now.getTime(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
      memory.logAction('get_time', {}, result.iso, true);
      return result;
    }
  },

  calculate: {
    name: 'calculate',
    description: 'Evaluate a mathematical expression safely.',
    input_schema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Mathematical expression to evaluate (e.g. "2 + 2 * 10")' }
      },
      required: ['expression']
    },
    async execute({ expression }) {
      try {
        // Safe evaluation - only allow math characters
        const safe = expression.replace(/[^0-9+\-*/().,% ]/g, '');
        if (!safe.trim()) return { error: 'Invalid expression: contains non-mathematical characters' };
        // eslint-disable-next-line no-new-func
        const result = Function(`'use strict'; return (${safe})`)();
        if (!isFinite(result)) return { error: 'Result is not finite (division by zero?)' };
        memory.logAction('calculate', { expression }, String(result), true);
        return { expression, result, result_string: String(result) };
      } catch (err) {
        memory.logAction('calculate', { expression }, err.message, false);
        return { error: `Calculation error: ${err.message}` };
      }
    }
  },

  set_reminder: {
    name: 'set_reminder',
    description: 'Set a reminder to be delivered after a specified number of minutes.',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Reminder message' },
        delay_minutes: { type: 'number', description: 'Minutes from now to trigger the reminder' }
      },
      required: ['message', 'delay_minutes']
    },
    async execute({ message, delay_minutes }) {
      try {
        const id = reminderCounter++;
        const fireAt = new Date(Date.now() + delay_minutes * 60 * 1000);
        const timer = setTimeout(() => {
          console.log(`\n\n⏰  REMINDER: ${message}\n`);
          reminders.delete(id);
        }, delay_minutes * 60 * 1000);

        reminders.set(id, { id, message, fireAt: fireAt.toISOString(), timer });
        memory.logAction('set_reminder', { message, delay_minutes }, `Set reminder id=${id}`, true);
        return { success: true, id, message, fires_at: fireAt.toISOString(), delay_minutes };
      } catch (err) {
        memory.logAction('set_reminder', { message }, err.message, false);
        return { error: err.message };
      }
    }
  },

  list_reminders: {
    name: 'list_reminders',
    description: 'List all pending reminders.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    },
    async execute() {
      const list = [];
      for (const [id, r] of reminders) {
        list.push({ id, message: r.message, fires_at: r.fireAt });
      }
      memory.logAction('list_reminders', {}, `${list.length} pending`, true);
      return { reminders: list, count: list.length };
    }
  },

  cancel_reminder: {
    name: 'cancel_reminder',
    description: 'Cancel a pending reminder by its ID.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Reminder ID to cancel' }
      },
      required: ['id']
    },
    async execute({ id }) {
      try {
        const reminder = reminders.get(id);
        if (!reminder) return { error: `No reminder found with id=${id}` };
        clearTimeout(reminder.timer);
        reminders.delete(id);
        memory.logAction('cancel_reminder', { id }, 'Cancelled', true);
        return { success: true, id, message: reminder.message };
      } catch (err) {
        memory.logAction('cancel_reminder', { id }, err.message, false);
        return { error: err.message };
      }
    }
  },

  get_system_info: {
    name: 'get_system_info',
    description: 'Get information about the system (CPU, memory, disk, OS).',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    },
    async execute() {
      try {
        const os = require('os');
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;

        let diskInfo = 'unavailable';
        try {
          const platform = process.platform;
          if (platform === 'win32') {
            const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption');
            diskInfo = stdout.trim();
          } else {
            const { stdout } = await execAsync("df -h / | tail -1 | awk '{print \"Size: \"$2\", Used: \"$3\", Available: \"$4\", Use%: \"$5}'");
            diskInfo = stdout.trim();
          }
        } catch { /* ignore */ }

        const result = {
          platform: process.platform,
          arch: process.arch,
          os_version: os.release(),
          hostname: os.hostname(),
          cpus: os.cpus().length,
          cpu_model: os.cpus()[0]?.model || 'unknown',
          memory: {
            total_gb: (totalMem / 1e9).toFixed(2),
            used_gb: (usedMem / 1e9).toFixed(2),
            free_gb: (freeMem / 1e9).toFixed(2),
            used_percent: ((usedMem / totalMem) * 100).toFixed(1)
          },
          disk: diskInfo,
          uptime_hours: (os.uptime() / 3600).toFixed(1),
          node_version: process.version
        };
        memory.logAction('get_system_info', {}, 'Retrieved system info', true);
        return result;
      } catch (err) {
        memory.logAction('get_system_info', {}, err.message, false);
        return { error: err.message };
      }
    }
  },

  open_application: {
    name: 'open_application',
    description: 'Open an application by name.',
    input_schema: {
      type: 'object',
      properties: {
        app_name: { type: 'string', description: 'Application name to open (e.g. "Chrome", "Finder", "Notepad")' }
      },
      required: ['app_name']
    },
    async execute({ app_name }) {
      try {
        const platform = process.platform;
        let command;

        if (platform === 'darwin') {
          command = `open -a "${app_name}"`;
        } else if (platform === 'win32') {
          command = `start "" "${app_name}"`;
        } else {
          // Linux - try common launchers
          const lowerName = app_name.toLowerCase();
          command = `${lowerName} & disown`;
        }

        await execAsync(command);
        memory.logAction('open_application', { app_name }, 'Opened', true);
        return { success: true, app_name, platform };
      } catch (err) {
        memory.logAction('open_application', { app_name }, err.message, false);
        return { error: err.message, app_name };
      }
    }
  }
};

// ─── Glob helper ──────────────────────────────────────────────────────────────

function matchGlob(filename, pattern) {
  // Simple glob: support * and ?
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  try {
    return new RegExp(`^${regexStr}$`, 'i').test(filename);
  } catch {
    return filename.toLowerCase().includes(pattern.toLowerCase());
  }
}

// ─── Execute dispatcher ───────────────────────────────────────────────────────

async function executeTool(name, input) {
  const tool = tools[name];
  if (!tool) {
    return { error: `Unknown tool: ${name}` };
  }
  try {
    return await tool.execute(input || {});
  } catch (err) {
    return { error: err.message };
  }
}

// Build array format for Claude API
function getToolsForClaude() {
  return Object.values(tools).map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema
  }));
}

module.exports = { tools, executeTool, getToolsForClaude };
