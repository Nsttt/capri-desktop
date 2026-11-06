// How loud her own sounds are, asked in her chat ("your sounds at 30 %", "baisse ta voix", "tus
// sonidos, apágalos"). Not your PC's volume: that's "volume 50" or "monte le son" (chat.js, system.js).
// Only a message aimed at her (your sounds, your voice, you're too loud) is hers; a question about
// them ("how loud are your sounds?") is left to her answer, which knows the level (chat.js powers()).

// her sounds, her voice, her being loud: in every language she speaks
const HERS = /\byour (?:own )?(?:sounds?|voice|noises?|blips?|beeps?|volume)\b|\byou(?:['’]re| are) (?:\w+ )?(?:loud|noisy)\b|\b(?:tes sons|ton son|ta voix|tes bruits|tes bips|ton volume)\b|tu (?:es|fais) (?:trop|tellement) (?:fort|de bruit)|\b(?:tus sonidos|tu sonido|tu voz|tus ruidos|tu volumen)\b|(?:haces|eres) (?:\S+ )?(?:ruido|ruidosa)|\b(?:seus sons|seu som|sua voz|teus sons|tua voz|seu volume)\b|(?:voc[êe] (?:est[áa]|t[áa])|tu (?:est[áa]s|t[áa])) (?:muito )?(?:alta|barulhenta)|faz (?:muito )?barulho|твои звуки|свои звуки|твой звук|твой голос|твою громкость|твоя громкость|ты (?:\S+ )?(?:громк|шумн)/i;

const LEVEL = /(\d{1,3})\s*(?:%|pour ?cent|percent|por ?ciento|por ?cento|процент)|(?:volume|sons?|sounds?|voix|voice|sonidos?|voz|volumen|som|звук\p{L}*|громкост\p{L}*|голос\p{L}*)\D{0,14}?(\d{1,3})(?!\d)/iu;
// off before on: "désactive", "desactiva", "desliga" have "active", "activa", "liga" in them
const OFF = /\b(?:mute|silence|turn (?:\w+ )?off|switch (?:\w+ )?off|shut (?:\w+ )?(?:off|up))\b|\boff\b|coupe|[ée]teins|d[ée]sactive|sourdine|tais[- ]toi|desactiva|apaga|silencia|desliga|desativa|tira|выключи|отключи|убери/i;
const ON = /\bunmute\b|back on|turn (?:\w+ )?on\b|switch (?:\w+ )?on\b|remets|r[ée]active|rallume|reactiva|activa|enciende|religa|liga|ativa|volta|включи/i;
const DOWN = /quieter|softer|lower|\bdown\b|too loud|so loud|noisy|moins fort|baisse|trop fort|de bruit|m[áa]s bajo|baja|menos|ruid|mais baixo|abaixa|diminu|barulh|muito alta|тише|убавь|слишком громк|шумн/i;
const UP = /louder|\bup\b|plus fort|monte|augmente|m[áa]s (?:alto|fuerte)|sube|aumenta|mais alto|прибавь|громче/i;

export type LoudnessAsk = { level: number } | { mute: boolean } | { step: 1 | -1 };

// What a message asks of her sounds: a level (0 to 1), off or on, a step louder or quieter, or null.
export function askedLoudness(text: string): LoudnessAsk | null {
  if (!HERS.test(text) || text.trim().split(/\s+/).length > 14) return null;
  const m = LEVEL.exec(text);
  const level = m && Number(m[1] ?? m[2]);
  if (level != null && level <= 100) return level === 0 ? { mute: true } : { level: level / 100 };
  if (OFF.test(text)) return { mute: true };
  if (ON.test(text)) return { mute: false };
  if (DOWN.test(text)) return { step: -1 };
  if (UP.test(text)) return { step: 1 };
  return null;
}

// The next of her menu's levels up or down from where she is (null: already at the end of them).
export function stepVolume(levels: number[], volume: number, step: 1 | -1): number | null {
  const next = step > 0
    ? levels.find((l) => l > volume + 0.001)
    : [...levels].reverse().find((l) => l < volume - 0.001);
  return next ?? null;
}
