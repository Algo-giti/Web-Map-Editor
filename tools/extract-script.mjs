// Hilfsmodul: extrahiert einzelne Deklarationen aus dem Inline-Script von
// index.html, damit reine Hilfsfunktionen in Node getestet werden können,
// ohne die Anwendung umzubauen oder ein Build-System einzuführen.
//
// Der Scanner überspringt Strings, Template-Literale und Kommentare, damit
// darin enthaltene Klammern und Semikolons die Klammerbilanz nicht verfälschen.

import { readFileSync } from "node:fs";

export function readInlineScript() {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const match = html.match(/<script>([\s\S]*?)<\/script>/);

  if (!match) throw new Error("Kein Inline-Script in index.html gefunden.");

  return match[1];
}

/** Findet das Ende einer Deklaration ab startIndex. */
function scanDeclaration(source, startIndex, stopAtSemicolon) {
  let depth = 0;
  let started = false;

  for (let i = startIndex; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];

    if (char === "/" && next === "/") {
      i = source.indexOf("\n", i);
      if (i < 0) break;
      continue;
    }

    if (char === "/" && next === "*") {
      i = source.indexOf("*/", i + 2) + 1;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      i++;
      while (i < source.length) {
        if (source[i] === "\\") i++;
        else if (source[i] === quote) break;
        i++;
      }
      continue;
    }

    if (char === "{" || char === "[" || char === "(") {
      depth++;
      started = true;
    } else if (char === "}" || char === "]" || char === ")") {
      depth--;
      if (depth === 0 && started && !stopAtSemicolon) return i + 1;
    } else if (char === ";" && depth === 0 && stopAtSemicolon) {
      return i + 1;
    }
  }

  throw new Error("Deklaration konnte nicht abgegrenzt werden.");
}

/** Extrahiert benannte Funktionsdeklarationen und const/let-Deklarationen. */
export function extractDeclarations(source, names) {
  const parts = [];

  for (const name of names) {
    const functionIndex = source.search(
      new RegExp(`(^|\\n)function ${name}\\s*\\(`)
    );

    if (functionIndex >= 0) {
      /* Erst die Parameterliste überspringen, dann den Rumpf abgrenzen. */
      const paramStart = source.indexOf("(", functionIndex);
      const bodyStart = source.indexOf(
        "{",
        scanDeclaration(source, paramStart, false)
      );

      parts.push(
        source.slice(functionIndex, scanDeclaration(source, bodyStart, false))
      );
      continue;
    }

    const bindingMatch = source.match(
      new RegExp(`(^|\\n)(const|let) ${name}\\s*=`)
    );

    if (!bindingMatch) {
      throw new Error(`Deklaration nicht gefunden: ${name}`);
    }

    const bindingIndex = bindingMatch.index + (bindingMatch[1] ? 1 : 0);
    parts.push(
      source.slice(bindingIndex, scanDeclaration(source, bindingIndex, true))
    );
  }

  return parts.join("\n\n");
}
