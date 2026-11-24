// Passwort → Schlüssel für die Online-Version. Läuft im Browser: Das Passwort verlässt das Gerät nie.
// PBKDF2 mit 600.000 Runden (Empfehlung OWASP für PBKDF2-HMAC-SHA256) ist absichtlich langsam (am Laptop ca. 0,1 s),
// damit ein gestohlener Datenbestand nicht schnell durchprobiert werden kann. Der Server bildet daraus nur noch
// einen gesalzenen SHA-256 (online/werkzeuge.js). So bleibt jede Anfrage unter der Rechenzeit-Grenze von Cloudflare.
// Auch der Server nutzt normMail, damit beide Seiten dieselbe Adresse als Salz nehmen.

export const RUNDEN = 600000;
export const MIN_PASSWORT = 10;

/** Adresse vereinheitlichen (Leerzeichen weg, Kleinbuchstaben). null, wenn sie nicht wie eine Mailadresse aussieht. */
export function normMail(s) {
  const m = String(s ?? '').trim().toLowerCase();
  return m.length <= 254 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(m) ? m : null;
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** 64 Hex-Zeichen. Gleiche Adresse und gleiches Passwort ergeben auf jedem Gerät denselben Schlüssel. */
export async function leiteSchluesselAb(email, passwort, runden = RUNDEN) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(String(passwort).normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`MathQuest|v1|${normMail(email)}`), iterations: runden }, key, 256);
  return hex(bits);
}
