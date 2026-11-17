// Stufen: `npm run quick` fährt nur eine kleine Auswahl der langen Bot-Läufe, `npm test` (SLOW=1) alle.
export const SLOW = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SLOW;
/** schnelle Stufe: nur Einträge, deren id in `quick` steht; volle Stufe: alle */
export const pick = <T extends { id: string }>(all: T[], quick: string[]): T[] => (SLOW ? all : all.filter((x) => quick.includes(x.id)));
