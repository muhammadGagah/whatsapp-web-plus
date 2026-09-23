export const SHORTCUT_ACTIONS = Object.freeze({
  'voice-recording': { label: 'shortcutVoiceRecording', defaultBinding: 'Alt+M' },
  'previous-chat': { label: 'shortcutPreviousChat', defaultBinding: 'Alt+ArrowUp' },
  'next-chat': { label: 'shortcutNextChat', defaultBinding: 'Alt+ArrowDown' },
  'voice-call': { label: 'shortcutVoiceCall', defaultBinding: '' },
  'video-call': { label: 'shortcutVideoCall', defaultBinding: '' }
});

// App commands and common browser/editing commands must keep their existing meaning.
const RESERVED_SHORTCUTS = new Set([
  'Ctrl+Alt+Shift+[', 'Ctrl+Alt+Shift+]',
  'Ctrl+-', 'Ctrl+=', 'Ctrl+Shift+-', 'Ctrl+Shift+=',
  'Alt+F10', 'Ctrl+F4', 'Ctrl+F5',
  ...'0123456789'.split('').map(key => `Ctrl+${key}`),
  'Alt+0', 'Alt+1', 'Alt+2', 'Alt+3', 'Alt+T',
  'Alt+Shift+1', 'Alt+Shift+2', 'Alt+Shift+3', 'Alt+Shift+4', 'Alt+Shift+5',
  'Alt+Shift+C', 'Alt+Shift+D', 'Alt+Shift+N', 'Alt+Shift+L', 'Alt+Shift+7', 'Alt+Shift+8', 'Alt+Shift+9',
  'Ctrl+Alt+A', 'Ctrl+Alt+D', 'Ctrl+Alt+V', 'Ctrl+Alt+M',
  'Ctrl+Alt+R', 'Ctrl+Alt+H', 'Ctrl+Alt+S', 'Ctrl+Alt+W', 'Ctrl+Alt+Shift+R',
  'Alt+ArrowLeft', 'Alt+ArrowRight', 'Alt+Home', 'Alt+F4', 'Alt+F', 'Alt+E', 'Alt+D',
  ...'ACFHKLNOPRSTUVWXYZ'.split('').map(key => `Ctrl+${key}`),
  ...['A', 'B', 'C', 'D', 'I', 'J', 'N', 'O', 'P', 'R', 'T', 'V', 'W', 'Y', 'Z']
    .map(key => `Ctrl+Shift+${key}`)
]);

const PUNCTUATION_CODES = Object.freeze({
  ',': 'Comma', '.': 'Period', '/': 'Slash', ';': 'Semicolon',
  "'": 'Quote', '[': 'BracketLeft', ']': 'BracketRight',
  '-': 'Minus', '=': 'Equal', '`': 'Backquote', '\\': 'Backslash'
});

export function captureShortcutBinding(event) {
  if (event.repeat || event.isComposing || event.metaKey || event.getModifierState?.('AltGraph')) return null;
  const key = Object.keys(PUNCTUATION_CODES).find(key => PUNCTUATION_CODES[key] === event.code)
    || (/^Key[A-Z]$/.test(event.code) ? event.code.slice(3)
      : /^Digit[0-9]$/.test(event.code) ? event.code.slice(5) : event.code);
  return parseShortcutBinding([event.ctrlKey && 'Ctrl', event.altKey && 'Alt',
    event.shiftKey && 'Shift', key].filter(Boolean).join('+'));
}

export function parseShortcutBinding(value) {
  if (typeof value !== 'string') return null;
  if (!value.trim()) return { text: '', code: '', ctrlKey: false, altKey: false, shiftKey: false };
  const parts = value.split('+').map(part => part.trim().toLowerCase());
  const key = parts.pop();
  if (!parts.length || parts.some(part => !['ctrl', 'alt', 'shift'].includes(part)) ||
    new Set(parts).size !== parts.length || !parts.some(part => part === 'ctrl' || part === 'alt')) return null;
  const named = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
    arrowup: 'ArrowUp', arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight' };
  const name = /^[a-z0-9]$/.test(key) ? key.toUpperCase()
    : /^f(?:[1-9]|1[0-2])$/.test(key) ? key.toUpperCase() : named[key] || (PUNCTUATION_CODES[key] ? key : null);
  if (!name) return null;
  const code = /^[A-Z]$/.test(name) ? `Key${name}` : /^\d$/.test(name) ? `Digit${name}` : PUNCTUATION_CODES[name] || name;
  const ctrlKey = parts.includes('ctrl');
  const altKey = parts.includes('alt');
  const shiftKey = parts.includes('shift');
  return { text: [ctrlKey && 'Ctrl', altKey && 'Alt', shiftKey && 'Shift', name].filter(Boolean).join('+'),
    code, ctrlKey, altKey, shiftKey };
}

export function isReservedShortcut(binding) {
  return RESERVED_SHORTCUTS.has(binding.text) ||
    (binding.ctrlKey && binding.altKey && binding.shiftKey &&
      ['ArrowUp', 'ArrowDown'].includes(binding.code));
}

export function matchesShortcutBinding(event, value) {
  const binding = parseShortcutBinding(value);
  return !!binding?.code && !event.metaKey && event.code === binding.code &&
    !!event.ctrlKey === binding.ctrlKey && !!event.altKey === binding.altKey &&
    !!event.shiftKey === binding.shiftKey;
}
