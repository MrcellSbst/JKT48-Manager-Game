const SAVE_KEY = 'JKT48ManagerSaveKey48';

function calculateChecksum(value) {
  let checksum = 0;
  for (let index = 0; index < value.length; index += 1) {
    checksum = (checksum + value.charCodeAt(index) * (index + 1)) % 1_000_000;
  }
  return checksum;
}

export function simpleEncrypt(value) {
  const payload = JSON.stringify({ d: value, c: calculateChecksum(value) });
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(payload);
  const keyBytes = encoder.encode(SAVE_KEY);
  const encrypted = new Uint8Array(payloadBytes.length);
  for (let index = 0; index < payloadBytes.length; index += 1) {
    encrypted[index] = payloadBytes[index] ^ keyBytes[index % keyBytes.length];
  }

  let binary = '';
  for (const byte of encrypted) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function simpleDecrypt(value) {
  try {
    const binary = atob(value);
    const encrypted = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const encoder = new TextEncoder();
    const keyBytes = encoder.encode(SAVE_KEY);
    const payloadBytes = new Uint8Array(encrypted.length);
    for (let index = 0; index < encrypted.length; index += 1) {
      payloadBytes[index] = encrypted[index] ^ keyBytes[index % keyBytes.length];
    }

    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (typeof payload.d !== 'string' || calculateChecksum(payload.d) !== payload.c) {
      throw new Error('Checksum verification failed.');
    }
    return payload.d;
  } catch {
    throw new Error('Decryption failed. The save data is invalid or has been modified.');
  }
}
