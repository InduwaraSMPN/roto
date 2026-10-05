// Learner-theory content (plan §5.3, D12): five modules + four how-to guides.
export type { Guide, LearnModule, QuizQuestion, TriText } from "./types";
export { roadSigns } from "./road-signs";
export { rightOfWay } from "./right-of-way";
export { busesAndAnimals } from "./buses-animals";
export { rainMonsoon } from "./rain-monsoon";
export { licenceDocs } from "./licence-docs";
export { GUIDES, emissionTestGuide, insuranceGuide, revenueLicenceGuide, transferGuide } from "./guides";

import { busesAndAnimals } from "./buses-animals";
import { GUIDES } from "./guides";
import { licenceDocs } from "./licence-docs";
import { rainMonsoon } from "./rain-monsoon";
import { rightOfWay } from "./right-of-way";
import { roadSigns } from "./road-signs";
import type { LearnModule } from "./types";

/** The five D12 modules, in learning order. */
export const LEARN_MODULES: LearnModule[] = [roadSigns, rightOfWay, busesAndAnimals, rainMonsoon, licenceDocs];

export const MODULE_SLUGS = LEARN_MODULES.map((m) => m.slug);

export function getModule(slug: string): LearnModule | undefined {
  return LEARN_MODULES.find((m) => m.slug === slug);
}

export function getGuide(slug: string) {
  return GUIDES.find((g) => g.slug === slug);
}
