import type { Project } from "./news";
import { scenePrompt } from "./backgrounds.ts";
export function flowInstructions(project: Project, avatarName?: string, backgroundName?: string) {
  const language = { ru: "Russian", en: "English", uz: "Uzbek", kk: "Kazakh" }[project.language];
  return [
    `PROJECT: ${project.title}`, `Create a news presenter video in ${project.ratio} aspect ratio.`,
    avatarName ? `PRESENTER: ${avatarName}. Use the attached portrait as the identity reference. Keep face, age, hairstyle and accessories consistent. One presenter, direct eye contact.` : "PRESENTER: Choose a presenter before production.",
    backgroundName ? `SETTING: Use the attached scene/background named ${backgroundName}.` : project.background==="recipe"?`SETTING: ${scenePrompt(project.backgroundRecipe)}`:project.background==="original"?"SETTING: Keep the setting of the reference portrait.":`SETTING: A plain ${project.background==="navy"?"midnight navy":project.background==="ivory"?"warm ivory":"graphite grey"} background.`,
    "CAMERA: Stable medium shot, natural restrained gestures, realistic light. Keep the face unobstructed. No invented logos or on-screen text.",
    `VOICE: Speak the script in ${language}, calmly and clearly. Preserve names, numbers and the order of the text.`,
    project.visualDirection ? `ADDITIONAL DIRECTION: ${project.visualDirection}` : "",
    "If the script exceeds the selected model's clip length, split it into consecutive shots and assemble them in sequence. Do not omit sentences to force everything into one short clip.",
    "SPOKEN SCRIPT:\n" + project.script,
    project.captions ? "Add accurate subtitles in the final edit. Check spelling and synchronization." : "No burned-in subtitles.",
    "Before exporting: check likeness, speech, missing words, lip sync and transitions. This packet is production instructions, not a rendered video.",
  ].filter(Boolean).join("\n\n");
}
