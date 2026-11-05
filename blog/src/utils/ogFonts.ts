import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SatoriOptions } from "satori";

type SatoriFont = SatoriOptions["fonts"][number];

/**
 * Noto Sans TC Bold, subset to Big5 level-1 (5,401 common Traditional
 * Chinese characters) + ASCII/CJK punctuation + every character in ../til at
 * subset time (~2 MB instead of ~7 MB). Regenerate when a title shows tofu:
 *
 *   curl -sL -o NotoSansTC-Bold.ttf "$(curl -s 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@700' | grep -o 'https://[^)]*\.ttf')"
 *   pyftsubset NotoSansTC-Bold.ttf --text-file=chars.txt --layout-features='*' \
 *     --no-hinting --desubroutinize --output-file=src/assets/fonts/NotoSansTC-Bold-subset.ttf
 *
 * Read from disk (not bundled) at build time; never shipped to the browser.
 */
const FONT_FILE = path.join(
  process.cwd(),
  "src/assets/fonts/NotoSansTC-Bold-subset.ttf"
);

export const OG_FONT_FAMILY = "Noto Sans TC";

let cached: Promise<SatoriFont[]> | undefined;

/**
 * Fonts for satori, loaded once per build. The same array instance is
 * returned every time so satori's per-fonts cache skips re-parsing.
 */
export function getOgFonts(): Promise<SatoriFont[]> {
  cached ??= readFile(FONT_FILE).then(data => [
    { name: OG_FONT_FAMILY, data, weight: 700, style: "normal" },
  ]);
  return cached;
}
