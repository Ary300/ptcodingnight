/**
 * The engine's IntelliJ keys as the shortcuts popover lists them, per platform, so the list and
 * handleKey are written down side by side and cannot drift apart unnoticed.
 *
 * Ctrl+W (IntelliJ's Extend Selection off a Mac) closes the browser tab and no page can stop it,
 * so off a Mac Extend and Shrink are Alt+Shift+Right and Left, as VS Code binds them.
 */

import type { LanguageProfile } from "./types";

export interface EngineShortcut {
  readonly keys: readonly string[];
  readonly action: string;
}

export function engineShortcuts(isMac: boolean, profile: LanguageProfile): readonly EngineShortcut[] {
  const mod = isMac ? "Cmd" : "Ctrl";
  const alt = isMac ? "Option" : "Alt";
  const braces = profile.id !== "python";
  return [
    { keys: [isMac ? "Cmd + Backspace" : "Ctrl + Y"], action: "Delete the line" },
    { keys: [`${alt} + Shift + Up / Down`], action: "Move the line" },
    { keys: [`${mod} + Shift + Up / Down`], action: "Move the statement" },
    { keys: [`${mod} + Shift + Enter`], action: "Complete the statement" },
    { keys: [`${mod} + ${alt} + Enter`], action: "Start a new line above" },
    ...(braces ? [{ keys: [isMac ? "Cmd + Option + /" : "Ctrl + Shift + /"], action: "Block comment" }] : []),
    {
      keys: [isMac ? "Option + Up / Down" : "Alt + Shift + Right / Left"],
      action: "Extend or shrink the selection",
    },
    { keys: ["Ctrl + Shift + J"], action: "Join lines" },
    { keys: [`${mod} + Shift + U`], action: "Toggle case" },
    { keys: [isMac ? "Ctrl + M" : "Ctrl + Shift + M"], action: "Jump to the matching bracket" },
    { keys: [isMac ? "Cmd + Left" : "Home"], action: "First character of the line, then column 0" },
    { keys: [`${isMac ? "Option" : "Ctrl"} + Backspace / Delete`], action: "Delete to the word start or end" },
  ];
}
