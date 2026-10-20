import { z } from "zod";

export const sceneCategories = [
  { id: "city", name: "Города", caption: "От Манхэттена до Самарканда", tone: "#405975", places: [
    { id: "new-york", name: "Нью-Йорк", prompt: "Manhattan skyline seen from an elegant rooftop terrace, recognizable skyscrapers at a realistic distance" },
    { id: "philadelphia", name: "Филадельфия", prompt: "Philadelphia city skyline from a terrace by the Schuylkill river" },
    { id: "dubai", name: "Дубай", prompt: "Dubai Marina skyline, modern waterfront architecture and a spacious terrace" },
    { id: "samarkand", name: "Самарканд", prompt: "Samarkand, Registan square with intricate turquoise mosaics and historic architecture in the background" },
  ] },
  { id: "forest", name: "Леса", caption: "Тишина и естественный свет", tone: "#386c59", places: [
    { id: "pine", name: "Сосновый лес", prompt: "a serene pine forest clearing with tall trees and soft atmospheric depth" },
    { id: "autumn", name: "Осенний парк", prompt: "an autumn woodland park with amber leaves and a quiet tree-lined path" },
    { id: "tropical", name: "Тропический лес", prompt: "a lush tropical forest with layered green foliage and a calm natural clearing" },
  ] },
  { id: "fields", name: "Поля", caption: "Простор до горизонта", tone: "#9b8052", places: [
    { id: "wheat", name: "Пшеничное поле", prompt: "a golden wheat field stretching to the horizon, a quiet path and open sky" },
    { id: "lavender", name: "Лаванда", prompt: "lavender fields in Provence, purple rows receding toward low rolling hills" },
    { id: "meadow", name: "Зелёные холмы", prompt: "rolling green meadows, wildflowers and distant countryside hills" },
  ] },
  { id: "aircraft", name: "Самолёты", caption: "Private jet и вид над облаками", tone: "#667f9d", places: [
    { id: "cabin", name: "Салон private jet", prompt: "inside a spacious luxury private jet cabin, cream leather seats, walnut details, oval windows and soft cabin lighting" },
    { id: "runway", name: "Рядом с самолётом", prompt: "on a quiet private airport apron, an unbranded elegant white business jet parked behind the presenter, realistic aircraft proportions" },
    { id: "clouds", name: "Над облаками", prompt: "inside a private jet beside a large oval window with bright clouds outside, tasteful calm cabin interior" },
  ] },
  { id: "yacht", name: "Яхты", caption: "Море, палуба, горизонт", tone: "#35768a", places: [
    { id: "deck", name: "Палуба яхты", prompt: "on a spacious teak deck of a luxury yacht, polished railings and a calm Mediterranean sea horizon" },
    { id: "marina", name: "Марина", prompt: "a refined Mediterranean marina with elegant white yachts and a waterfront promenade" },
    { id: "lounge", name: "Лаунж на яхте", prompt: "a luxury yacht lounge with cream furnishings, panoramic windows and open sea views" },
  ] },
  { id: "mountains", name: "Горы", caption: "Воздух и глубина кадра", tone: "#686f88", places: [
    { id: "alps", name: "Альпы", prompt: "a scenic terrace overlooking the Alps, snow-capped peaks, valleys and clean mountain air" },
    { id: "canyon", name: "Каньон", prompt: "a safe scenic overlook above a vast sandstone canyon with rich geological layers" },
    { id: "lake", name: "Горное озеро", prompt: "a tranquil mountain lake with turquoise water, forested shores and distant peaks" },
  ] },
  { id: "coast", name: "Побережье", caption: "Океан и открытое небо", tone: "#588d96", places: [
    { id: "maldives", name: "Мальдивы", prompt: "a refined oceanfront terrace in the Maldives, turquoise lagoon, white sand and distant palm trees" },
    { id: "miami", name: "Майами", prompt: "a Miami oceanfront balcony overlooking the beach, Atlantic Ocean and palm-lined coast" },
    { id: "amalfi", name: "Амальфи", prompt: "an Amalfi Coast terrace overlooking the Mediterranean, pastel coastal architecture and distant cliffs" },
  ] },
  { id: "studio", name: "Интерьеры", caption: "24 пространства для вашего выпуска", tone: "#716352", places: [
    {"id": "newsroom", "name": "Новостная студия", "group": "Студии", "caption": "Панорама города, синий свет", "prompt": "a modern news studio with panoramic city windows and subtle blue lighting, blank screens"},
    {"id": "podcast", "name": "Подкаст-студия", "group": "Студии", "caption": "Акустические панели, тёплое дерево", "prompt": "a professional podcast studio with acoustic panels, walnut walls and discreet microphones at the sides"},
    {"id": "interview", "name": "Студия интервью", "group": "Студии", "caption": "Кресла, мягкий свет", "prompt": "an elegant interview studio with two armchairs at the sides, neutral walls and soft practical lighting"},
    {"id": "virtual-studio", "name": "Технологичная студия", "group": "Студии", "caption": "Стекло, световые линии", "prompt": "a futuristic broadcast studio with glass panels, abstract blue light lines and blank LED walls"},
    {"id": "office", "name": "Кабинет руководителя", "group": "Бизнес", "caption": "Дерево, панорамные окна", "prompt": "a refined executive office with natural wood, tasteful books and panoramic windows"},
    {"id": "boardroom", "name": "Переговорная", "group": "Бизнес", "caption": "Стекло, деловая атмосфера", "prompt": "a modern boardroom with glass partitions, a conference table to the side and a distant city skyline"},
    {"id": "coworking", "name": "Коворкинг", "group": "Бизнес", "caption": "Светлый open space, растения", "prompt": "an airy contemporary coworking interior with oak desks at the sides, indoor plants and tall windows"},
    {"id": "loft-office", "name": "Офис в лофте", "group": "Бизнес", "caption": "Кирпич, металл, высокие потолки", "prompt": "a spacious loft office with exposed brick, steel beams, tall industrial windows and restrained furniture"},
    {"id": "library", "name": "Библиотека", "group": "Дом", "caption": "Книги, тёмное дерево", "prompt": "a stately private library with warm wood shelves and soft ambient light"},
    {"id": "living-room", "name": "Светлая гостиная", "group": "Дом", "caption": "Лён, дуб, естественный свет", "prompt": "a bright contemporary living room with linen sofas, oak details and large windows"},
    {"id": "penthouse", "name": "Пентхаус", "group": "Дом", "caption": "Город с высоты, мрамор", "prompt": "a luxury penthouse living room with floor-to-ceiling city views, cream furniture and marble accents"},
    {"id": "minimalist", "name": "Минимализм", "group": "Дом", "caption": "Чистые линии, спокойные оттенки", "prompt": "a minimalist apartment interior with warm white walls, sculptural furniture and uncluttered open space"},
    {"id": "classic", "name": "Классический салон", "group": "Дом", "caption": "Лепнина, паркет, высокие окна", "prompt": "an elegant classical salon with restrained plaster moldings, parquet flooring and tall windows"},
    {"id": "kitchen", "name": "Дизайнерская кухня", "group": "Дом", "caption": "Камень, дерево, остров сбоку", "prompt": "a modern designer kitchen with stone surfaces, warm wood cabinets and an island at the side"},
    {"id": "hotel-lobby", "name": "Лобби отеля", "group": "Гостеприимство", "caption": "Мрамор, латунь, высокие потолки", "prompt": "a luxury hotel lobby with pale marble, brass details, high ceilings and discreet lounge seating"},
    {"id": "hotel-suite", "name": "Президентский люкс", "group": "Гостеприимство", "caption": "Панорама, просторная гостиная", "prompt": "a presidential hotel suite living area with panoramic windows, cream upholstery and refined artwork"},
    {"id": "restaurant", "name": "Ресторан", "group": "Гостеприимство", "caption": "Панорамные окна, сервировка", "prompt": "a refined panoramic restaurant interior with neatly set tables at the sides and a distant waterfront view"},
    {"id": "cafe", "name": "Кофейня", "group": "Гостеприимство", "caption": "Тёплая керамика, дерево", "prompt": "a cozy contemporary cafe with natural wood, ceramic details and large street-facing windows"},
    {"id": "gallery", "name": "Галерея", "group": "Гостеприимство", "caption": "Белые стены, абстрактное искусство", "prompt": "a spacious contemporary art gallery with white walls, abstract paintings and soft track lighting"},
    {"id": "winter-garden", "name": "Зимний сад", "group": "Гостеприимство", "caption": "Стеклянная крыша, зелень", "prompt": "an elegant indoor winter garden with a glass ceiling, lush plants and a clear central walkway"},
    {"id": "private-jet", "name": "Салон частного самолёта", "group": "Транспорт", "caption": "Кремовая кожа, овальные окна", "prompt": "a spacious private jet cabin with cream leather seats, walnut trim and oval windows overlooking clouds"},
    {"id": "airliner-business", "name": "Бизнес-класс", "group": "Транспорт", "caption": "Современный салон, мягкий свет", "prompt": "a modern aircraft business-class cabin with spacious neutral seats, oval windows and soft cabin lighting"},
    {"id": "yacht-salon", "name": "Салон яхты", "group": "Транспорт", "caption": "Панорамное остекление, море", "prompt": "a luxury yacht salon with cream furnishings, teak details and panoramic windows overlooking calm sea"},
    {"id": "train-lounge", "name": "Лаунж поезда", "group": "Транспорт", "caption": "Дерево, большие окна, пейзаж", "prompt": "a premium train lounge with warm wood, comfortable seating and large windows overlooking countryside"},
  ] },
] as const;

export const sceneLights = {
  daylight: { name: "Дневной свет", prompt: "Soft natural daylight, balanced exposure." },
  golden: { name: "Золотой час", prompt: "Warm golden-hour light, soft directional highlights." },
  evening: { name: "Вечер", prompt: "Blue-hour atmosphere, subtle ambient lights, well-lit face." },
};
export const sceneStyles = {
  natural: { name: "Фотореализм", prompt: "Photorealistic editorial photography, natural colors." },
  cinematic: { name: "Кино", prompt: "Cinematic color grading, subtle depth of field, natural skin." },
  premium: { name: "Премиум", prompt: "Refined luxury editorial style, restrained colors, realistic materials." },
};
export const scenePositions = {
  center: { name: "По центру", prompt: "Presenter centered in the frame." },
  left: { name: "Слева", prompt: "Presenter in the left third, open scenery on the right." },
  right: { name: "Справа", prompt: "Presenter in the right third, open scenery on the left." },
};
export const defaultSceneRecipe = { category: "city", place: "new-york", light: "daylight", style: "natural", position: "center", details: "" } as const;
export const sceneRecipeSchema = z.object({
  category: z.enum(["city", "forest", "fields", "aircraft", "yacht", "mountains", "coast", "studio"]),
  place: z.string().max(40), light: z.enum(["daylight", "golden", "evening"]),
  style: z.enum(["natural", "cinematic", "premium"]), position: z.enum(["center", "left", "right"]), details: z.string().trim().max(250),
}).refine(recipe => sceneCategories.find(c => c.id === recipe.category)?.places.some(p => p.id === recipe.place), "Выберите место из выбранной категории.");
export type SceneRecipe = z.infer<typeof sceneRecipeSchema>;
export type BackgroundItem = {
  id: string; name: string; kind: "generated" | "uploaded"; status: string; avatarId: string | null;
  photoId: string | null; ratio: string | null; recipe: SceneRecipe | null; error: string | null; createdAt: string;
};
export function sceneLocation(recipe: SceneRecipe) {
  return sceneCategories.find(c => c.id === recipe.category)!.places.find(p => p.id === recipe.place)!;
}
export function scenePrompt(recipe: SceneRecipe) {
  return [
    "Keep the reference person's identity, face, age, hairstyle, clothing and accessories. One person only, waist-up, looking at camera, natural proportions. Replace the setting with",
    sceneLocation(recipe).prompt + ".", sceneLights[recipe.light].prompt, sceneStyles[recipe.style].prompt,
    scenePositions[recipe.position].prompt, "Leave space above the head. No text, logos, watermark or extra people.", recipe.details,
  ].filter(Boolean).join(" ");
}
export function sceneVideoMode(background: BackgroundItem | null, avatarId: string | null) {
  if (!background || background.status !== "completed" || !background.photoId) return "unavailable";
  if (background.kind === "uploaded") return "image";
  return background.avatarId === avatarId ? "avatar" : "wrong_avatar";
}

/** Empty background plate: unlike scenePrompt, this request has no reference person. */
export function backgroundPrompt(recipe: SceneRecipe) {
  const space = {center:"center",left:"left third",right:"right third"}[recipe.position];
  return ["Create an empty photorealistic background for a news presenter.", sceneLocation(recipe).prompt + ".",
    sceneLights[recipe.light].prompt.replace(", well-lit face", ""),
    sceneStyles[recipe.style].prompt.replace(", natural skin", ""),
    `Eye-level camera. Keep the ${space} uncluttered for later presenter compositing.`, recipe.details,
    "No people, faces, text, logos or watermarks."].filter(Boolean).join(" ");
}
