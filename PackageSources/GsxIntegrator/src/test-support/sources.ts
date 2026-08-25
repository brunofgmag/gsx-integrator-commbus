import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export function sourceFiles(dir: string, keep: (entry: string) => boolean): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path, keep);
    }
    return keep(entry) ? [path] : [];
  });
}
