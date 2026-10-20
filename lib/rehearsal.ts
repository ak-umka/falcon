export type ScriptWord = { text: string; start: number; end: number };

export function scriptWords(script: string): ScriptWord[] {
  return Array.from(script.matchAll(/\S+/gu), match => ({
    text: match[0], start: match.index!, end: match.index! + match[0].length,
  }));
}

export function wordAtCharacter(words: ScriptWord[], character: number) {
  let low = 0, high = words.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (words[middle].start <= character) low = middle;
    else high = middle - 1;
  }
  return words.length ? low : 0;
}

export function scriptScenes(script: string, words = scriptWords(script)) {
  return Array.from(script.matchAll(/\S[^]*?(?=\n\s*\n|$)/gu), match => ({
    text: match[0].trim(), start: match.index!, end: match.index! + match[0].length,
    word: wordAtCharacter(words, match.index!),
  })).filter(scene => scene.text);
}

export const scriptTemplates = [
  {
    id: "welcome", label: "Попробовать студию", kind: "Демонстрационный текст", title: "Знакомство со студией",
    description: "Готовый текст для первой репетиции. Можно сразу нажать Play.",
    script: "Добрый день! Вы смотрите Falcon News Studio.\n\nЗдесь начинается ваш выпуск: выберите фотографию ведущего и добавьте текст. Перед созданием видео проверьте сценарий в режиме репетиции.\n\nГоворите о главном, используйте короткие предложения и объясняйте сложное простыми словами. Уточняйте имена, даты и цифры.\n\nКогда всё готово, создайте ролик, просмотрите результат и выберите площадки для публикации. Ваши новости — вашим голосом.",
  },
  {
    id: "news", label: "Новостной выпуск", kind: "Шаблон с полями", title: "Главная новость дня",
    description: "Главное событие, контекст и вывод. Замените поля в скобках.",
    script: "Здравствуйте! Главная новость сегодня — [что произошло].\n\nПо информации [источник], [ключевой подтверждённый факт]. Событие произошло [когда и где].\n\nПочему это важно? [Объясните, что меняется для вашей аудитории].\n\nЧто будет дальше: [подтверждённый следующий шаг или срок]. Ссылка на источник — в описании. Следите за следующими выпусками.",
  },
  {
    id: "announcement", label: "Анонс события", kind: "Шаблон с полями", title: "Приглашение на событие",
    description: "Короткое приглашение с датой, пользой и следующим шагом.",
    script: "Есть новость для тех, кто интересуется [тема]!\n\n[Дата] в [время и часовой пояс] состоится [название события]. Место встречи — [адрес или онлайн-площадка].\n\nМы обсудим [главная тема]. Вы узнаете [конкретная польза для участника].\n\nЧтобы присоединиться, [действие для регистрации]. Подробности и ссылка — в описании. До встречи!",
  },
] as const;
