# GDD: SoulForge

## Концепция

Roguelike deckbuilder + Souls-like combat с уникальной механикой: карта вашей души определяет стиль боя. Собирайте "фрагменты души", комбинируйте их в колоду, сражайтесь с боссами, которые олицетворяют ваши слабости.

**Играбельные аналоги:** Pawned Souls ("Soulslike combat meets strict chess rules" — 新品, trending) + HoloCure (survivors-like, 5,198 ratings, 4.9★) + Friday Night Funkin' (12,354 ratings — rhythm/mechanical mastery) + The Ruins of Calaworm (retro pixel + Lovecraftian horror, top seller).

## Почему это будет успешно

- **Souls-like + deckbuilder = proving ground:** Pawned Souls только что вышел и уже trending — спрос подтверждён
- **Roguelike структура:** Высокий replay value, подходит для контента
- **Уникальная механика:** "Карта души" — не просто колода, а буквально олицетворение внутреннего мира
- **Визуальный стиль:** Пиксель-арт + dark fantasy — проверенная формула
- **Стоимость:** $5-10 — идеальный price point для itch.io

## Жанр

Roguelike / Deckbuilder / Action RPG / Souls-like

## Платформа

Windows, macOS, Linux (потом Steam)

## Целевая аудитория

18-35, фанаты Dark Souls, Slay the Spire, Hades, Into the Breach

## Ключевые механики

### 1. Карта Души (Soul Cards)
- Каждая карта — фрагмент вашей души (страх, надежда, ярость, покой и т.д.)
- Комбинации карт определяют "стиль души" (build)
- Пример: 3 "страха" + 1 "ярость" = Aggressive Terror build
- Каждый build меняет не только статы, но и визуал персонажа

### 2. Souls-like Combat (Turn-based)
- Пошаговые бои с элементами Souls-like: stamina management, timing windows
- Каждый раунд: выберите карту → атака/защита/магия
- "Perfect timing" бонус: правильно сыгранная карта даёт крит
- Боссы имеют " phase transitions" как в Dark Souls

### 3. Roguelike Structure
- Забег: случайные комнаты, случайные карты, случайные боссы
- Death = reset, но "мудрость" остаётся (unlocks новых карт и builds)
- 6 "Worlds" (Reflections), каждый с уникальным тематическим боссом
- "Blessings" после каждой победы: модификаторы для следующего забега

### 4. Narrative Through Combat
- Каждый босс — аспект вашего прошлого (дoubt, regret, lost love)
- Победа над боссом = принятие этой части себя
- Финальный босс = "Вы сами" (механически: все builds в одном)
- Концовка зависит от того, какие "фрагменты души" вы принимали

### 5. Build Diversity
| Стиль души | Механика | Визуал |
|------------|----------|--------|
| Rage | Мощные атаки, низкая защита | Красный огонь |
| Sorrow | Лечение, debuffs, замедление | Синий туман |
| Hope | Блокировка, counter-attacks | Золотой свет |
| Void | Random effects, high risk/high reward | Чёрные трещины |
| Harmony | Баланс всех статов, мульти-класс | Разноцветные узоры |

## Структура контента

| Мир | Тема | Босс | Уникальная механика |
|-----|------|------|---------------------|
| 1. Зеркальный лес | Страх | The Watcher | Карты переворачиваются вверх ногами |
| 2. Кристальный город | Гордость | The Architect | Стройте "стены" из карт для защиты |
| 3. Пепельные поля | Потеря | The Wanderer | Карты исчезают после использования |
| 4. Бездонный колодец | Ярость | The Furnace | Ускоренный темп боя |
| 5. Небесный сад | Любовь | The Gardener | Карты "растут" (эволюционируют) |
| 6. Точка | Принятие | Yourself | Все механики в одном |

## Визуальный стиль

- **Пиксель-арт** высокого разрешения (16x16-32x32)
- **Dark fantasy** эстетика: мрак, свет, контраст
- Влияние: Celeste (эмоции), Hollow Knight (атмосфера), Slay the Spire (UI)
- Анимации атак: динамичные, particle effects
- Каждый build визуально отличается (aura, trail, weapon glow)

## Звук

- Orchestral ambient + электронные элементы
- Каждый "стиль души" имеет уникальный звуковой мотив
- Боссы: динамическая музыка (phase transitions)
-_death sound: грустный, не жуткий

## Технологии

- Godot 4 (идеально для 2D roguelike)
- Или Unity (для мобильного порта в будущем)
- Yarn Spinner для нарратива

## Монетизация

- **Paid:** $7.99 (itch.io), $9.99 (Steam)
- **DLC:** $3.99 — "New Game+" с дополнительными мирами
- **Нет microtransactions:** Стиль itch.io

## Конкурентные преимущества

- Уникальная механика "Soul Cards" — ничего подобного нет
- Эмоциональный нарратив через gameplay (не через cutscenes)
- Высокий replay value (roguelike + build diversity)
- Идеально для Twitch/YouTube (strategical + visual)

## Примерная оценка времени разработки

4-6 месяцев (команда 2-3) / 8-10 месяцев (1 человек)

## Риски и митигация

| Риск | Решение |
|------|---------|
| Слишком сложная боевая система | Прототип early, iterate, playtest |
| Конкуренция с Slay the Spire/Hades | Уникальный narrative hook — "игра о психологии" |
| Долгая разработка | Начать с demo (мир 1-2), выпустить как free preview |
