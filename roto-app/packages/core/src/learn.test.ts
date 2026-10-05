// Shape tests for learner content (D14: vitest for pure logic in packages/core only).
import { describe, expect, it } from "vitest";
import { BRANDS } from "./brands";
import { GUIDES } from "./learn/guides";
import { LEARN_MODULES, MODULE_SLUGS } from "./learn/index";
import type { Lang } from "./types";

const LANGS: Lang[] = ["en", "si", "ta"];

describe("learn modules", () => {
  it("has exactly the five D12 modules, in order", () => {
    expect(MODULE_SLUGS).toEqual([
      "road-signs",
      "right-of-way",
      "buses-three-wheelers-animals",
      "rain-monsoon",
      "licence-documents",
    ]);
  });

  it("every module has a non-empty title and body in all three languages", () => {
    for (const m of LEARN_MODULES) {
      for (const lang of LANGS) {
        expect(m.title[lang].trim().length, `${m.slug} title.${lang}`).toBeGreaterThan(0);
        expect(m.body[lang].trim().length, `${m.slug} body.${lang}`).toBeGreaterThan(100);
      }
    }
  });

  it("every module has exactly 10 quiz questions", () => {
    for (const m of LEARN_MODULES) {
      expect(m.quiz, m.slug).toHaveLength(10);
    }
  });

  it("every question has 4 answers per language and a correct index in bounds", () => {
    for (const m of LEARN_MODULES) {
      m.quiz.forEach((qq, i) => {
        const tag = `${m.slug} q${i}`;
        expect(qq.q.en.trim().length, `${tag} q`).toBeGreaterThan(0);
        for (const lang of LANGS) {
          expect(qq.a[lang], `${tag} a.${lang}`).toHaveLength(4);
          for (const opt of qq.a[lang]) expect(opt.trim().length, `${tag} opt`).toBeGreaterThan(0);
        }
        expect(Number.isInteger(qq.correct), `${tag} correct int`).toBe(true);
        expect(qq.correct, `${tag} correct bounds`).toBeGreaterThanOrEqual(0);
        expect(qq.correct, `${tag} correct bounds`).toBeLessThanOrEqual(3);
      });
    }
  });
});

describe("learn guides", () => {
  it("covers revenue-licence, emission-test, insurance and transfer", () => {
    expect(GUIDES.map((g) => g.slug).sort()).toEqual(
      ["emission-test", "insurance", "revenue-licence", "transfer"].sort(),
    );
  });

  it("every guide has a title and at least 3 steps per language", () => {
    for (const g of GUIDES) {
      for (const lang of LANGS) {
        expect(g.title[lang].trim().length, `${g.slug} title.${lang}`).toBeGreaterThan(0);
        expect(g.steps[lang].length, `${g.slug} steps.${lang}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe("brands", () => {
  it("lists the 13 plan brands with unique slugs", () => {
    expect(BRANDS).toHaveLength(13);
    const slugs = BRANDS.map((b) => b.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const want of ["bajaj", "hero", "honda", "yamaha", "tvs", "ktm", "suzuki", "revolt", "demak"]) {
      expect(slugs).toContain(want);
    }
  });
});
