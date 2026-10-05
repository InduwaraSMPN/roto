// Learner-theory content shapes (plan §5.3, D12). All copy is original, written for
// this app — never copied from the DMT handbook or any other copyrighted source.
// ponytail: si/ta below is a non-native best effort — same review gate as maneuvers.ts
// ("get a native speaker to review before store release").
import type { Lang } from "../types";

export type TriText = Record<Lang, string>;

export type QuizQuestion = {
  q: TriText;
  /** 4 answer options, parallel text in each language. */
  a: Record<Lang, [string, string, string, string]>;
  /** Index (0-3) of the correct option. */
  correct: number;
};

export type LearnModule = {
  slug: string;
  title: TriText;
  /** Concise lesson body (a few short paragraphs, `\n\n`-separated). */
  body: TriText;
  quiz: QuizQuestion[];
};

export type Guide = {
  slug: string;
  title: TriText;
  steps: Record<Lang, string[]>;
};
