import type { AutomationCDPSession } from '../automation/types';

export interface CdpKeyPayload {
  key: string;
  code: string;
  windowsVirtualKeyCode: number;
}

export function convertToCdpKeyPayload(inputKey: string): CdpKeyPayload {
  const lowerKey = inputKey.trim().toLowerCase();
  const isMac = navigator.userAgent.toLowerCase().includes('mac os x');

  if (isMac) {
    if (lowerKey === 'control' || lowerKey === 'ctrl') {
      return { key: 'Meta', code: 'MetaLeft', windowsVirtualKeyCode: 91 };
    }
    if (lowerKey === 'command' || lowerKey === 'cmd') {
      return { key: 'Meta', code: 'MetaLeft', windowsVirtualKeyCode: 91 };
    }
    if (lowerKey === 'option' || lowerKey === 'opt') {
      return { key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18 };
    }
  }

  const keyMap: Record<string, CdpKeyPayload> = {
    a: { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 },
    b: { key: 'b', code: 'KeyB', windowsVirtualKeyCode: 66 },
    c: { key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67 },
    d: { key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 },
    e: { key: 'e', code: 'KeyE', windowsVirtualKeyCode: 69 },
    f: { key: 'f', code: 'KeyF', windowsVirtualKeyCode: 70 },
    g: { key: 'g', code: 'KeyG', windowsVirtualKeyCode: 71 },
    h: { key: 'h', code: 'KeyH', windowsVirtualKeyCode: 72 },
    i: { key: 'i', code: 'KeyI', windowsVirtualKeyCode: 73 },
    j: { key: 'j', code: 'KeyJ', windowsVirtualKeyCode: 74 },
    k: { key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75 },
    l: { key: 'l', code: 'KeyL', windowsVirtualKeyCode: 76 },
    m: { key: 'm', code: 'KeyM', windowsVirtualKeyCode: 77 },
    n: { key: 'n', code: 'KeyN', windowsVirtualKeyCode: 78 },
    o: { key: 'o', code: 'KeyO', windowsVirtualKeyCode: 79 },
    p: { key: 'p', code: 'KeyP', windowsVirtualKeyCode: 80 },
    q: { key: 'q', code: 'KeyQ', windowsVirtualKeyCode: 81 },
    r: { key: 'r', code: 'KeyR', windowsVirtualKeyCode: 82 },
    s: { key: 's', code: 'KeyS', windowsVirtualKeyCode: 83 },
    t: { key: 't', code: 'KeyT', windowsVirtualKeyCode: 84 },
    u: { key: 'u', code: 'KeyU', windowsVirtualKeyCode: 85 },
    v: { key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86 },
    w: { key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 },
    x: { key: 'x', code: 'KeyX', windowsVirtualKeyCode: 88 },
    y: { key: 'y', code: 'KeyY', windowsVirtualKeyCode: 89 },
    z: { key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 },
    '0': { key: '0', code: 'Digit0', windowsVirtualKeyCode: 48 },
    '1': { key: '1', code: 'Digit1', windowsVirtualKeyCode: 49 },
    '2': { key: '2', code: 'Digit2', windowsVirtualKeyCode: 50 },
    '3': { key: '3', code: 'Digit3', windowsVirtualKeyCode: 51 },
    '4': { key: '4', code: 'Digit4', windowsVirtualKeyCode: 52 },
    '5': { key: '5', code: 'Digit5', windowsVirtualKeyCode: 53 },
    '6': { key: '6', code: 'Digit6', windowsVirtualKeyCode: 54 },
    '7': { key: '7', code: 'Digit7', windowsVirtualKeyCode: 55 },
    '8': { key: '8', code: 'Digit8', windowsVirtualKeyCode: 56 },
    '9': { key: '9', code: 'Digit9', windowsVirtualKeyCode: 57 },
    control: { key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 },
    ctrl: { key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 },
    shift: { key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 },
    alt: { key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18 },
    meta: { key: 'Meta', code: 'MetaLeft', windowsVirtualKeyCode: 91 },
    enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 },
    backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
    delete: { key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 },
    arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
    arrowright: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
    arrowup: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
    arrowdown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
    escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
    tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
    space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32 },
  };

  const convertedKey = keyMap[lowerKey];
  if (convertedKey) {
    return convertedKey;
  }
  const fallbackVk = inputKey.length === 1 ? inputKey.toUpperCase().charCodeAt(0) : 0;
  return {
    key: inputKey,
    code: inputKey,
    windowsVirtualKeyCode: fallbackVk,
  };
}

async function dispatchKeyEvent(
  cdp: AutomationCDPSession,
  type: 'keyDown' | 'keyUp',
  payload: CdpKeyPayload,
): Promise<void> {
  await cdp.send('Input.dispatchKeyEvent', {
    type,
    key: payload.key,
    code: payload.code,
    windowsVirtualKeyCode: payload.windowsVirtualKeyCode,
  });
}

export async function sendKeyCombination(cdp: AutomationCDPSession, keys: string): Promise<void> {
  const keyParts = keys.split('+');
  const modifiers = keyParts.slice(0, -1);
  const mainKey = keyParts[keyParts.length - 1];

  try {
    for (const modifier of modifiers) {
      await dispatchKeyEvent(cdp, 'keyDown', convertToCdpKeyPayload(modifier));
    }
    const mainPayload = convertToCdpKeyPayload(mainKey);
    await dispatchKeyEvent(cdp, 'keyDown', mainPayload);
    await dispatchKeyEvent(cdp, 'keyUp', mainPayload);
  } finally {
    for (const modifier of [...modifiers].reverse()) {
      await dispatchKeyEvent(cdp, 'keyUp', convertToCdpKeyPayload(modifier)).catch(() => undefined);
    }
  }
}
