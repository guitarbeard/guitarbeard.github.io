// Meow mode: a visitor who only meows gets a sentence back with every word turned into "meow",
// keeping the punctuation and capitalization. It never touches the model, so it answers instantly.

// Cat sounds, loosely: meow, meeeow, mew, miaow, miau, mrow, mrrp, purr, nya, nyan, and so on.
const CAT_SOUND = /^(m+[eiy]*a*o*w+|m+e+w+|m+i+a+u+|m+r+[aeiou]*[wp]*|p+u+r+|n+y+a+n?)$/i;

export function isMeow(text: string): boolean {
  const words = text.match(/[\p{L}\p{N}]+/gu);
  return Boolean(words?.length) && words!.length <= 12 && words!.every((w) => CAT_SOUND.test(w));
}

// Sentences alxdnAI would say anyway, before they become meows.
const SENTENCES = [
  "Hi, I'm alxdnAI! Ask me anything about Alex's work.",
  "Alex builds fast, accessible Shopify storefronts with React.",
  "Want to hire Alex? Email alxdna@gmail.com, and he'll get back to you.",
  "Alex has 14 years of web development experience, mostly in e-commerce.",
  "Have you seen Maps On Maps? It's Alex's own app, built with Expo and React Native.",
];

// A word is letters and digits, plus any apostrophe inside it ("Alex's" is one meow). Everything
// else is punctuation and stays, so "alxdna@gmail.com" becomes "meow@meow.meow".
const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

export function meowify(sentence: string): string {
  return sentence.replace(WORD, (w) => {
    if (w.length > 1 && w === w.toUpperCase() && /\p{Lu}/u.test(w)) return "MEOW";
    return /^\p{Lu}/u.test(w) ? "Meow" : "meow";
  });
}

export function meowReply(random = Math.random): string {
  return meowify(SENTENCES[Math.floor(random() * SENTENCES.length)]);
}
