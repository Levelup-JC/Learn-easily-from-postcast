import { create } from "zustand";
import { api, type Gloss, type VocabItem } from "./api";

const WORD = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

export function wordKey(word: string) { return word.replace(/’/g, "'").toLowerCase(); }

export function splitOrig(text: string): { word: string | null; text: string }[] {
  const out: { word: string | null; text: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(WORD)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ word: null, text: text.slice(last, i) });
    out.push({ word: m[0], text: m[0] });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ word: null, text: text.slice(last) });
  if (!out.length) out.push({ word: null, text });
  return out;
}

function knownOf(items: VocabItem[]) {
  const known = new Set<string>();
  for (const it of items) for (const f of it.forms) known.add(f.toLowerCase());
  return known;
}

export const useVocab = create<{
  items: VocabItem[];
  known: Set<string>;
  load: () => Promise<void>;
  add: (gloss: Gloss) => Promise<void>;
  remove: (lemma: string) => Promise<void>;
}>((set, get) => ({
  items: [],
  known: new Set(),
  load: async () => {
    const items = await api.vocabList();
    set({ items, known: knownOf(items) });
  },
  add: async (gloss) => {
    const item = await api.vocabAdd(gloss.lemma);
    const items = [item, ...get().items.filter((x) => x.lemma !== item.lemma)];
    set({ items, known: knownOf(items) });
  },
  remove: async (lemma) => {
    await api.vocabRemove(lemma);
    const items = get().items.filter((x) => x.lemma !== lemma);
    set({ items, known: knownOf(items) });
  },
}));
