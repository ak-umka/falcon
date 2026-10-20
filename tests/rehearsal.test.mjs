import test from "node:test";
import assert from "node:assert/strict";
import { scriptWords, scriptScenes, wordAtCharacter, scriptTemplates } from "../lib/rehearsal.ts";

test("blank script has no fragments or playable words", () => {
  assert.deepEqual(scriptWords(" \n\t\r\n "), []);
  assert.deepEqual(scriptScenes(" \n\t\r\n "), []);
  assert.equal(wordAtCharacter([], 25), 0);
});

test("speech character offsets retain punctuation, Cyrillic and emoji", () => {
  const script = "  Эфир 🎙️\nЗдравствуйте, друзья!";
  const words = scriptWords(script);
  assert.deepEqual(words.map(word => word.text), ["Эфир", "🎙️", "Здравствуйте,", "друзья!"]);
  for (const word of words) assert.equal(script.slice(word.start, word.end), word.text);
  assert.equal(wordAtCharacter(words, script.indexOf("Здравствуйте")), 2);
  assert.equal(wordAtCharacter(words, script.indexOf("друзья") + 2), 3);
  assert.equal(wordAtCharacter(words, 500), 3);
});

test("paragraph navigation maps CRLF, extra whitespace and line wraps back to text", () => {
  const script = "\n  Первая новость\r\nпродолжается.\r\n \r\nВторая новость.\n\n\nФинал!  ";
  const words = scriptWords(script);
  const scenes = scriptScenes(script, words);
  assert.deepEqual(scenes.map(scene => scene.word), [0, 3, 5]);
  for (const scene of scenes) {
    assert.equal(script.slice(scene.start, scene.end).trim(), scene.text);
    assert.equal(words[scene.word].start, scene.start);
  }
});

test("every selectable template fits the editor and has navigable fragments", () => {
  for (const template of scriptTemplates) {
    assert.ok(template.script.length > 0 && template.script.length <= 12000);
    assert.ok(template.title.length <= 120);
    assert.ok(scriptScenes(template.script).length >= 3);
  }
});
