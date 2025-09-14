const { Bot } = require("grammy");
const express = require("express");
const { userService, getSystemPrompt } = require("./services/userProfile");
const { askGigaChat } = require("./services/gigaChat");
const { initDatabase } = require("./database/db");
const externalData = require("./services/externalData");
const path = require("path");
const {
  addRow,
  writeToCell,
  writeToRange,
} = require("./services/googleSheets");

// Загрузка переменных окружения
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ status: "Bot is running!" });
});

// Запускаем сервер
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

async function startBot() {
  try {
    console.log("🔄 Инициализация базы данных...");
    await initDatabase();
    await userService.init();
    console.log("✅ База данных готова");

    const bot = new Bot(process.env.BOT_TOKEN);

    // Команды
    bot.command("start", (ctx) => {
      ctx.reply(`🤖 Бот запущен! Поддерживаются голосовые сообщения 🎤

Как работать с голосовыми сообщениями:
1. Отправьте голосовое сообщение
2. Нажмите на него и выберите "Распознать речь"
3. Скопируйте текст и отправьте его боту

Доступные команды:
/currency - Все валюты
/crypto - Все криптовалюты  
/weather - Погода
/add - Добавить запись в таблицу (формат: /add A1 Текст)
/clear - Очистить историю`);
    });

    bot.command("currency", async (ctx) => {
      const data =
        await externalData.currencyService.getCurrencyDataFormatted();
      await ctx.reply(data || "Не удалось получить данные о валютах");
    });

    bot.command("crypto", async (ctx) => {
      const data = await externalData.cryptoService.getCryptoDataFormatted();
      await ctx.reply(data || "Не удалось получить данных о криптовалютах");
    });

    bot.command("weather", async (ctx) => {
      const weather =
        await externalData.weatherService.getWeatherDataFormatted();
      await ctx.reply(weather);
    });

    // Команда для добавления данных в конкретную ячейку
    bot.command("add", async (ctx) => {
      // Формат: /add B1 Текст для ячейки
      const args = ctx.message.text.split(" ");

      // Проверяем минимальное количество аргументов
      if (args.length < 3) {
        await ctx.reply(
          "❌ Формат команды: /add [ячейка] [текст]\nНапример: /add B1 Привет мир\nИли: /add A1 Артем"
        );
        return;
      }

      const cell = args[1].toUpperCase(); // B1 → B1
      const text = args.slice(2).join(" "); // Объединяем все остальные слова в текст

      // Пытаемся записать в указанную ячейку
      const success = await writeToCell(cell, text);

      if (success) {
        await ctx.reply(`✅ Текст "${text}" успешно записан в ячейку ${cell}!`);
      } else {
        await ctx.reply(
          "❌ Ошибка! Не удалось записать в ячейку. Смотри логи бота."
        );
      }
    });

    bot.command("clear", async (ctx) => {
      await userService.clearHistory(ctx.from.id);
      await ctx.reply("🗑️ История диалога очищена!");
    });

    bot.command("debug_voice", async (ctx) => {
      if (ctx.message.reply_to_message && ctx.message.reply_to_message.voice) {
        const voiceMsg = ctx.message.reply_to_message;
        await ctx.reply(
          `Структура голосового сообщения:\n${JSON.stringify(
            voiceMsg,
            null,
            2
          )}`
        );
      } else {
        await ctx.reply(
          "Ответьте этой командой на голосовое сообщение для диагностики"
        );
      }
    });

    // ОБЩИЙ ОБРАБОТЧИК СООБЩЕНИЙ
    bot.on("message", async (ctx) => {
      if (ctx.from.id !== parseInt(process.env.YOUR_USER_ID)) {
        return ctx.reply("🔒 Доступ ограничен");
      }

      // Если сообщение уже обработано как команда - выходим
      if (ctx.message.text && ctx.message.text.startsWith("/")) {
        return;
      }

      // Обработка голосовых сообщений
      if (ctx.message.voice) {
        try {
          await ctx.reply(
            '🎤 Голосовое сообщение получено! \n\nЧтобы я мог его обработать, пожалуйста:\n1. Нажмите на голосовое сообщение\n2. Выберите "Распознать речь"\n3. Скопируйте распознанный текст\n4. Отправьте его мне как текстовое сообщение'
          );
          return;
        } catch (error) {
          console.error("Ошибка обработки голосового:", error);
          await ctx.reply("❌ Ошибка обработки голосового сообщения");
          return;
        }
      }

      // Обработка пересланных сообщений
      if (ctx.message.forward_from_message_id && ctx.message.text) {
        try {
          const originalMessage = await ctx.api.getMessage(
            ctx.chat.id,
            ctx.message.forward_from_message_id
          );

          if (originalMessage.voice && ctx.message.text) {
            await processTextMessage(ctx, ctx.message.text);
            return;
          }
        } catch (error) {
          console.error("Ошибка обработки пересланного сообщения:", error);
        }
      }

      // Обработка обычных текстовых сообщений
      if (ctx.message.text) {
        await processTextMessage(ctx, ctx.message.text);
      }
    });

    // Функция обработки текстовых сообщений
    async function processTextMessage(ctx, text) {
      const userId = ctx.from.id;

      try {
        const preciseData = await externalData.getPreciseData(text);

        if (preciseData) {
          await ctx.reply(preciseData);
          await userService.addToHistory(userId, text, "user");
          await userService.addToHistory(userId, preciseData, "assistant");
          return;
        }

        await ctx.api.sendChatAction(ctx.chat.id, "typing");
        await userService.addToHistory(userId, text, "user");
        const history = await userService.getChatHistory(userId);
        const messages = [getSystemPrompt(), ...history];

        const aiResponse = await askGigaChat(messages);
        await userService.addToHistory(userId, aiResponse, "assistant");
        await ctx.reply(aiResponse);
      } catch (error) {
        console.error("❌ Ошибка обработки:", error);
        await ctx.reply("❌ Произошла ошибка при обработке запроса");
      }
    }

    // Обработчик ошибок бота
    bot.catch((error) => {
      console.error("❌ Ошибка в обработчике бота:", error);
    });

    console.log("🚀 Запуск бота с поддержкой голосовых...");
    await bot.start();
    console.log("✅ Бот успешно запущен");
  } catch (error) {
    console.error("💥 Критическая ошибка при запуске бота:", error);
    process.exit(1);
  }
}

// Единые обработчики завершения процесса
function setupProcessHandlers() {
  process.on("SIGINT", () => {
    console.log("\n🛑 Остановка бота...");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n🛑 Получен сигнал завершения...");
    process.exit(0);
  });
}

// Настройка обработчиков и запуск бота
setupProcessHandlers();
startBot().catch((error) => {
  console.error("💥 Необработанная ошибка:", error);
  process.exit(1);
});
