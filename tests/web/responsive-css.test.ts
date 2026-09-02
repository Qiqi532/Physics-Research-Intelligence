import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Today responsive CSS", () => {
  it("declares smooth scrolling on the root layout for Next navigation", async () => {
    const layout = await readFile("apps/web/src/app/layout.tsx", "utf8");

    expect(layout).toContain('data-scroll-behavior="smooth"');
  });

  it("prevents grid children and the mobile hero title from widening the viewport", async () => {
    const css = await readFile("apps/web/src/app/globals.css", "utf8");

    expect(css).toMatch(
      /\.today-layout\s*>\s*\*,\s*\.hero\s*>\s*\*\s*\{[^}]*min-width:\s*0;/u,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*42rem\)[\s\S]*?\.hero h1\s*\{[^}]*max-width:\s*7ch;/u,
    );
  });

  it("styles the interpretation action as an accessible text button", async () => {
    const css = await readFile("apps/web/src/app/globals.css", "utf8");

    expect(css).toMatch(
      /\.interpret-button\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*cursor:\s*pointer;/su,
    );
    expect(css).toMatch(
      /\.interpret-button:disabled\s*\{[^}]*cursor:\s*wait;[^}]*opacity:/su,
    );
  });
});
