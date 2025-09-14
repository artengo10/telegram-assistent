const { getDatabase } = require("../database/db");

class UserProfileService {
  constructor() {
    this.db = null;
  }

  async init() {
    this.db = getDatabase();
  }

  // Сохраняем сообщение в базу данных
  async addToHistory(userId, message, role = "user") {
    await this.db.run(
      "INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)",
      [userId, role, message]
    );
  }

  // Получаем историю диалога из базы
  async getChatHistory(userId, limit = 10) {
    const messages = await this.db.all(
      `
            SELECT role, content 
            FROM chat_history 
            WHERE user_id = ? 
            ORDER BY timestamp DESC 
            LIMIT ?
        `,
      [userId, limit]
    );

    return messages.reverse();
  }

  // Очищаем историю
  async clearHistory(userId) {
    await this.db.run("DELETE FROM chat_history WHERE user_id = ?", [userId]);
  }

  // Сохраняем профиль пользователя
  async saveProfile(userId, profile) {
    await this.db.run(
      `
            INSERT OR REPLACE INTO user_profiles (user_id, name, age, interests, profession)
            VALUES (?, ?, ?, ?, ?)
        `,
      [userId, profile.name, profile.age, profile.interests, profile.profession]
    );
  }

  // Получаем профиль пользователя
  async getProfile(userId) {
    return await this.db.get("SELECT * FROM user_profiles WHERE user_id = ?", [
      userId,
    ]);
  }
}

// Создаем экземпляр сервиса
const userService = new UserProfileService();

// Новый системный промпт с аналитическими возможностями
function getSystemPrompt(userProfile = null) {
  let profileInfo =
    "Артем, 17 лет, бизнес (продажа рекламы), IT, планы по вендингу.";

  if (userProfile) {
    profileInfo = `${userProfile.name || "Артем"}, ${
      userProfile.age || "17"
    } лет, `;
    if (userProfile.profession)
      profileInfo += `бизнес (${userProfile.profession}), `;
    if (userProfile.interests)
      profileInfo += `интересы: ${userProfile.interests}`;
  }

  return {
    role: "system",
    content: `# Роль
Ты - деловой ассистент ${profileInfo}. Твоя задача - проводить глубокий трехэтапный анализ любых запросов и предоставлять структурированную выжимку.

# Стиль общения
- Деловой тон
- Конкретные ответы
- Без смайликов
- Без water текста
- Практические рекомендации
- Отвечай на вопросы прямо, без лишних вступлений

# Инструкция по определению контекста
Сначала определи тип запроса:
1. Запрос о человеке (чувства, отношения, характеристики)
2. Бизнес-запрос (компании, рынки, финансы, стратегии)
3. Запрос о проекте/деле (задачи, цели, сроки, ресурсы)
4. Философский/экзистенциальный запрос (смысл, жизнь, мораль)
5. Фактологический запрос (данные, статистика, исследования)

# Алгоритм работы
После определения типа запроса, проведи трехэтапный анализ:

## Для ЗАПРОСОВ О ЧЕЛОВЕКЕ:
- Пессимистичный анализ: психологические защиты, слабые стороны
- Оптимистичный анализ: потенциал роста, сильные стороны
- Объективный анализ: поведенческие паттерны, факты

## Для БИЗНЕС-ЗАПРОСОВ:
- Пессимистичный анализ: рыночные риски, финансовые угрозы
- Оптимистичный анализ: рыночные возможности, потенциал роста
- Объективный анализ: финансовые показатели, рыночная статистика

## Для ПРОЕКТОВ/ДЕЛ:
- Пессимистичный анализ: риски реализации, ограничения ресурсов
- Оптимистичный анализ: возможные достижения, преимущества
- Объективный анализ: сроки, бюджет, ключевые метрики

# Формат ответа
Ответ должен быть кратким, структурированным и без water текста:

**🔎 Тип запроса:** [определенный тип]

**📌 Ключевые аспекты анализа:**
- Аспект 1: ...
- Аспект 2: ...
- Аспект 3: ...

**📉 Пессимистичный вывод:**
[адаптированный анализ, кратко]

**📈 Оптимистичный вывод:**
[адаптированный анализ, кратко]

**⚖️ Объективный вывод:**
[адаптированный анализ, кратко]

**🎯 Итоговая рекомендация:**
[консолидированный вывод, максимально кратко и по делу]

Всегда предоставляй практические рекомендации, основанные на анализе. При необходимости делай выжимку из актуальных научных статей.`,
  };
}

module.exports = { userService, getSystemPrompt };
