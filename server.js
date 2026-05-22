// ========== ЗАЩИТА ОТ ПАДЕНИЙ ==========
process.on('uncaughtException', (error) => {
    console.error('❌ Непойманная ошибка:', error.message);
    console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Необработанный rejection:', reason);
});

if (!process.env.FROM_RESTART) {
    process.env.FROM_RESTART = 'true';
    process.on('exit', (code) => {
        if (code !== 0) {
            console.log('🔄 Перезапуск через 2 секунды...');
            setTimeout(() => {
                require('child_process').spawn(process.argv.shift(), process.argv, {
                    cwd: process.cwd(),
                    detached: true,
                    stdio: 'inherit'
                });
            }, 2000);
        }
    });
}
// ========== КОНЕЦ ЗАЩИТЫ ==========

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const SmartRouter = require('./SmartRouter');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;

// ========== ФЕНОМЕНАЛЬНАЯ ПАМЯТЬ ==========
const userMemory = new Map();
const userSettings = new Map();
const MAX_MEMORY = 90000;

function getUserMemory(userId) {
    if (!userMemory.has(userId)) {
        userMemory.set(userId, []);
    }
    return userMemory.get(userId);
}

function addToMemory(userId, role, content) {
    const memory = getUserMemory(userId);
    memory.push({ role, content, timestamp: Date.now() });
    while (memory.length > MAX_MEMORY) memory.shift();
}

function getDialogContext(userId, currentMessage) {
    const memory = getUserMemory(userId);
    if (memory.length === 0) return currentMessage;
    
    const recentMessages = memory.slice(-20);
    const context = recentMessages.map(msg => 
        `${msg.role === 'user' ? 'Пользователь' : 'Ассистент'}: ${msg.content}`
    ).join('\n');
    
    return `Контекст диалога:\n${context}\n\nТекущий вопрос: ${currentMessage}\n\nОтветь учитывая историю:`;
}
// ========== КОНЕЦ ПАМЯТЬ ==========

if (!TELEGRAM_TOKEN || !OPENROUTER_KEY) {
    console.error('❌ Ошибка: Не заданы переменные окружения');
    process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const router = new SmartRouter(OPENROUTER_KEY);

// Функция поиска в интернете
async function searchInternet(query) {
    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'nvidia/nemotron-nano-12b-v2-vl:free:online',
                messages: [
                    { role: 'system', content: 'Ты помощник для поиска. Отвечай кратко и по делу. Дай ссылки если есть.' },
                    { role: 'user', content: `Найди: ${query}. Дай короткий ответ.` }
                ],
                temperature: 0.5,
                max_tokens: 2000
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_KEY}`,
                    'HTTP-Referer': 'https://t.me/smart_ai_bot',
                    'X-Title': 'Smart AI Bot'
                }
            }
        );
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('Search error:', error.message);
        return `❌ Ошибка поиска: ${error.message}`;
    }
}

// Функция генерации кода
async function generateCode(prompt, language) {
    try {
        const response = await router.chat(
            `Напиши код на языке ${language} по задаче: ${prompt}

Требования:
1. Код должен быть рабочим и оптимизированным
2. Добавь комментарии на русском языке
3. Объясни алгоритм работы
4. Приведи пример использования
5. Укажи возможные ошибки

Формат ответа:
📝 **Описание решения:**
[объяснение]

💻 **Код:**
\`\`\`${language}
[код]
\`\`\`

🔧 **Пример использования:**
[пример]

⚠️ **Важно:**
[предупреждения]`,
            { systemPrompt: 'Ты эксперт по программированию. Пиши чистый, документарованный код.' }
        );
        return response.choices[0].message.content;
    } catch (error) {
        return `❌ Ошибка генерации кода: ${error.message}`;
    }
}

// Главное меню (открывается/закрывается кнопкой)
const mainMenu = {
    reply_markup: {
        keyboard: [
            [{ text: "📋 Открыть меню" }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

// Полное меню со всеми командами
const fullMenu = {
    reply_markup: {
        keyboard: [
            [{ text: "🤖 Что умеет бот" }, { text: "📊 Статистика" }],
            [{ text: "👤 Мой профиль" }, { text: "🔧 Tools" }],
            [{ text: "✨ Gemini" }, { text: "🎨 Создать изображение" }],
            [{ text: "🎵 Создать музыку" }, { text: "🎬 Создать видео" }],
            [{ text: "🔍 Интернет-поиск" }, { text: "🤖 Выбрать модель" }],
            [{ text: "⚙️ Настройки" }, { text: "🗑️ Удалить контекст" }],
            [{ text: "📜 Соглашение" }, { text: "📋 Закрыть меню" }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

app.get('/', (req, res) => {
    res.send('Бот работает с феноменальной памятью!');
});

// Команда /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!userSettings.has(userId)) {
        userSettings.set(userId, {
            language: 'ru',
            voiceEnabled: false,
            temperature: 0.7,
            maxTokens: 2048
        });
    }
    
    bot.sendMessage(chatId, 
        `🤖 *Добро пожаловать в Smart AI Bot!*\n\n` +
        `👇 *Нажми на кнопку "Открыть меню" ниже!*`,
        { parse_mode: 'Markdown', reply_markup: mainMenu.reply_markup }
    );
});

// Команда /stats
bot.onText(/\/stats/, async (msg) => {
    const stats = router.getStats();
    const memory = getUserMemory(msg.from.id);
    bot.sendMessage(msg.chat.id, 
        `📊 *СТАТИСТИКА БОТА*\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📨 *Всего запросов:* ${stats.totalRequests}\n` +
        `🔤 *Всего токенов:* ${stats.totalTokens?.toLocaleString() || 0}\n` +
        `📈 *Среднее токенов:* ${stats.averageTokensPerRequest || 0}\n` +
        `🧠 *Память:* ${memory.length}/${MAX_MEMORY} сообщений`,
        { parse_mode: 'Markdown' }
    );
});

// Команда /model
bot.onText(/\/model/, async (msg) => {
    bot.sendMessage(msg.chat.id,
        `🤖 *ТЕКУЩАЯ МОДЕЛЬ*\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🔹 *Используется:* умный выбор из 25+ бесплатных моделей\n` +
        `✨ *Все модели бесплатны и с поддержкой интернета!*`,
        { parse_mode: 'Markdown' }
    );
});

// Команда /search
bot.onText(/\/search (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const query = match[1];
    await bot.sendChatAction(chatId, 'typing');
    bot.sendMessage(chatId, `🔍 Ищу: "${query}"...`);
    const result = await searchInternet(query);
    bot.sendMessage(chatId, result, { parse_mode: 'Markdown', disable_web_page_preview: false });
});

// Команда /code
bot.onText(/\/code (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const task = match[1];
    
    await bot.sendChatAction(chatId, 'typing');
    
    try {
        const prompt = `Напиши код на Python для: ${task}. Дай только код и краткое объяснение.`;
        const response = await router.chat(prompt);
        const answer = response.choices[0].message.content;
        
        await bot.sendMessage(chatId, answer, { parse_mode: 'Markdown' });
        console.log(`✅ Код отправлен для: ${task}`);
    } catch(error) {
        console.log('❌ Ошибка кода:', error.message);
        await bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
    }
});

// Команда /memory
bot.onText(/\/memory/, (msg) => {
    const memory = getUserMemory(msg.from.id);
    bot.sendMessage(msg.chat.id, `🧠 *ПАМЯТЬ*\n━━━━━━━━━━━━━━━━━━━\n\n• Сообщений: ${memory.length}/${MAX_MEMORY}`, { parse_mode: 'Markdown' });
});

// Команда /tools
bot.onText(/\/tools/, (msg) => {
    bot.sendMessage(msg.chat.id,
        `🔧 *ДОСТУПНЫЕ ИНСТРУМЕНТЫ*\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🧮 /calc - Калькулятор\n` +
        `📊 /analyze - Анализ текста\n` +
        `✅ /validate - Проверка email\n` +
        `🔐 /encode - Base64 кодирование\n` +
        `🔓 /decode - Base64 декодирование\n` +
        `🔗 /url - Проверка URL\n` +
        `🎲 /random - Случайное число\n` +
        `📅 /date - Текущая дата\n` +
        `✨ /gemini вопрос - Google Gemini 2.0 Flash\n\n` +
        `✨ *Все команды бесплатны!*`,
        { parse_mode: 'Markdown' }
    );
});

// Команда /calc
bot.onText(/\/calc (.+)/, (msg, match) => {
    try {
        const result = eval(match[1]);
        bot.sendMessage(msg.chat.id, `🧮 *Результат:* ${result}`, { parse_mode: 'Markdown' });
    } catch(e) {
        bot.sendMessage(msg.chat.id, `❌ Ошибка: ${e.message}`);
    }
});

// Команда /analyze
bot.onText(/\/analyze (.+)/, (msg, match) => {
    const text = match[1];
    const words = text.split(/\s+/).length;
    const chars = text.length;
    const charsNoSpaces = text.replace(/\s/g, '').length;
    const sentences = text.split(/[.!?]+/).filter(s => s.length > 0).length;
    
    bot.sendMessage(msg.chat.id,
        `📊 *АНАЛИЗ ТЕКСТА*\n━━━━━━━━━━━━━━━━━━━\n📝 Слов: ${words}\n🔤 Символов: ${chars}\n📏 Без пробелов: ${charsNoSpaces}\n📖 Предложений: ${sentences}`,
        { parse_mode: 'Markdown' }
    );
});

// Команда /validate
bot.onText(/\/validate (.+)/, (msg, match) => {
    const email = match[1];
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    bot.sendMessage(msg.chat.id, isValid ? '✅ *Email корректен*' : '❌ *Неверный формат email*', { parse_mode: 'Markdown' });
});

// Команда /encode
bot.onText(/\/encode (.+)/, (msg, match) => {
    const encoded = Buffer.from(match[1]).toString('base64');
    bot.sendMessage(msg.chat.id, `🔐 *Base64:*\n\`${encoded}\``, { parse_mode: 'Markdown' });
});

// Команда /decode
bot.onText(/\/decode (.+)/, (msg, match) => {
    try {
        const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
        bot.sendMessage(msg.chat.id, `🔓 *Декодировано:*\n${decoded}`, { parse_mode: 'Markdown' });
    } catch(e) {
        bot.sendMessage(msg.chat.id, '❌ *Неверный Base64 код*', { parse_mode: 'Markdown' });
    }
});

// Команда /url
bot.onText(/\/url (.+)/, (msg, match) => {
    const url = match[1];
    const isValid = /^https?:\/\/.+/.test(url);
    bot.sendMessage(msg.chat.id, isValid ? '✅ *URL корректен*' : '❌ *Неверный формат URL (нужен http:// или https://)*', { parse_mode: 'Markdown' });
});

// Команда /random
bot.onText(/\/random (\d+) (\d+)/, (msg, match) => {
    const min = parseInt(match[1]);
    const max = parseInt(match[2]);
    const random = Math.floor(Math.random() * (max - min + 1)) + min;
    bot.sendMessage(msg.chat.id, `🎲 *Случайное число:* ${random}`, { parse_mode: 'Markdown' });
});

// Команда /date
bot.onText(/\/date/, (msg) => {
    const now = new Date();
    bot.sendMessage(msg.chat.id, `📅 *Текущая дата и время:*\n${now.toLocaleString('ru-RU')}`, { parse_mode: 'Markdown' });
});

// Команда /help
bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id,
        `🆘 *ПОМОЩЬ*\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n📋 *Основные команды:*\n• /start - Запуск бота\n• /stats - Статистика\n• /model - Текущая модель\n• /memory - Память диалогов\n• /search [текст] - Поиск в интернете\n• /code [задача] - Генерация кода\n• /gemini [вопрос] - Google Gemini\n• /tools - Все инструменты\n• /help - Эта справка\n\n✨ *Я помню всё!*`,
        { parse_mode: 'Markdown' }
    );
});

// Команда /gemini - через OpenRouter
bot.onText(/\/gemini (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const prompt = match[1];
    
    await bot.sendChatAction(chatId, 'typing');
    
    try {
        const response = await router.chat(prompt, { model: 'google/gemini-2.0-flash-exp:free' });
        const answer = response.choices[0].message.content;
        const modelInfo = `\n\n---\n🤖 *Модель:* Gemini 2.0 Flash (Google, OpenRouter)`;
        
        await bot.sendMessage(chatId, answer + modelInfo, { parse_mode: 'Markdown' });
        console.log(`✅ Gemini ответил: ${prompt.substring(0, 50)}`);
    } catch(error) {
        console.error('❌ Ошибка Gemini:', error.message);
        await bot.sendMessage(chatId, `❌ Ошибка Gemini: ${error.message}`);
    }
});

// Команда /image - генерация изображения
bot.onText(/\/image (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const prompt = match[1];
    
    await bot.sendChatAction(chatId, 'upload_photo');
    bot.sendMessage(chatId, `🎨 Генерирую изображение: "${prompt}"...`);
    
    try {
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&model=flux&nologo=true`;
        await bot.sendPhoto(chatId, imageUrl, { caption: `✨ ${prompt}` });
        console.log(`✅ Изображение сгенерировано для: ${prompt}`);
    } catch(error) {
        console.log('❌ Ошибка генерации:', error.message);
        bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
    }
});

// Обработка кнопок и сообщений
bot.on('message', async (msg) => {
    if (!msg.text) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    // Обработка кнопки открытия/закрытия меню
    if (text === '📋 Открыть меню') {
        bot.sendMessage(chatId, '🔽 *Полное меню команд:*', { parse_mode: 'Markdown', reply_markup: fullMenu.reply_markup });
        return;
    }
    
    if (text === '📋 Закрыть меню') {
        bot.sendMessage(chatId, '🔼 *Меню закрыто*', { parse_mode: 'Markdown', reply_markup: mainMenu.reply_markup });
        return;
    }
    
    // Обработка команды Tools
    if (text === '🔧 Tools') {
        bot.sendMessage(chatId,
            `🔧 *ДОСТУПНЫЕ ИНСТРУМЕНТЫ*\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `🧮 /calc - Калькулятор\n` +
            `📊 /analyze - Анализ текста\n` +
            `✅ /validate - Проверка email\n` +
            `🔐 /encode - Base64 кодирование\n` +
            `🔓 /decode - Base64 декодирование\n` +
            `🔗 /url - Проверка URL\n` +
            `🎲 /random - Случайное число\n` +
            `📅 /date - Текущая дата\n` +
            `✨ /gemini вопрос - Google Gemini 2.0 Flash\n\n` +
            `✨ *Все команды бесплатны!*`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    // Обработка кнопки Gemini
    if (text === '✨ Gemini') {
        bot.sendMessage(chatId, 
            `✨ *Google Gemini 2.0 Flash*\n\n` +
            `Отправьте вопрос после команды:\n` +
            `/gemini [ваш вопрос]\n\n` +
            `📝 *Пример:*\n` +
            `/gemini Расскажи о теории относительности`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    // Обработка кнопок из полного меню
    if (text === '🗑️ Удалить контекст') {
        userMemory.set(userId, []);
        bot.sendMessage(chatId, '🗑️ *История диалога очищена!*', { parse_mode: 'Markdown' });
        return;
    }
    
    if (text === '🎵 Создать музыку') {
        bot.sendMessage(chatId, '🎵 *Генерация музыки*\n\nСкоро будет доступно!', { parse_mode: 'Markdown' });
        return;
    }
    
    if (text === '🎬 Создать видео') {
        bot.sendMessage(chatId, '🎬 *Генерация видео*\n\nСкоро будет доступно!', { parse_mode: 'Markdown' });
        return;
    }
    
    if (text === '📊 Статистика') {
        const stats = router.getStats();
        const memory = getUserMemory(userId);
        bot.sendMessage(chatId, `📊 *СТАТИСТИКА*\n━━━━━━━━━━━━━━━━━━━\n📨 Запросов: ${stats.totalRequests}\n🔤 Токенов: ${stats.totalTokens?.toLocaleString() || 0}\n🧠 Память: ${memory.length} сообщений`, { parse_mode: 'Markdown' });
        return;
    }
    
    if (text === '👤 Мой профиль') {
        bot.sendMessage(chatId, `👤 *ПРОФИЛЬ*\n━━━━━━━━━━━━━━━━━━━\n🆔 ID: ${userId}\n📛 Имя: ${msg.from.first_name || '?'}\n🧠 Память: ${getUserMemory(userId).length} сообщений`, { parse_mode: 'Markdown' });
        return;
    }
    
    if (text === '🤖 Что умеет бот') {
        bot.sendMessage(chatId,
            `✨ *ВОЗМОЖНОСТИ БОТА*\n━━━━━━━━━━━━━━━━━━━\n\n🧠 *Феноменальная память*\n💻 *Программирование*\n🔍 *Интернет поиск*\n🌐 *Мультиязычность*\n🎤 *Голосовое сопровождение*\n📊 *Статистика*\n🤖 *Умный выбор модели*`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    if (text === '🤖 Выбрать модель') {
        bot.sendMessage(chatId,
            `🤖 *ТЕКУЩАЯ МОДЕЛЬ*\n━━━━━━━━━━━━━━━━━━━\n\n✨ *Доступные бесплатные модели:*\n\n🏆 *Топовые:*\n• Tencent Hy3 Preview\n• Google Gemma 4 31B\n• DeepSeek V4 Flash\n• NVIDIA Nemotron 3 Super\n\n✅ *Автовыбор:* Бот сам выбирает лучшую модель под задачу\n📊 *Подробнее:* /model`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    if (text === '⚙️ Настройки') {
        const settings = userSettings.get(userId) || { language: 'ru', voiceEnabled: false };
        bot.sendMessage(chatId,
            `⚙️ *НАСТРОЙКИ*\n━━━━━━━━━━━━━━━━━━━\n🌐 Язык: ${settings.language === 'ru' ? 'Русский' : 'English'} → /lang\n🎤 Голос: ${settings.voiceEnabled ? 'Вкл' : 'Выкл'} → /voice\n🧠 Память: ${getUserMemory(userId).length} сообщений\n\n🔧 Инструменты: /tools`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    if (text === '🎨 Создать изображение') {
        bot.sendMessage(chatId, `🎨 *Генерация изображений*\n\nИспользуйте: /image [описание]\n\n📝 Пример: /image кот в космосе`, { parse_mode: 'Markdown' });
        return;
    }
    
    if (text === '🔍 Интернет-поиск') {
        bot.sendMessage(chatId, `🔍 *ИНТЕРНЕТ ПОИСК*\n━━━━━━━━━━━━━━━━━━━\n\n📝 Используйте: /search [запрос]`, { parse_mode: 'Markdown' });
        return;
    }
    
    if (text === '📜 Соглашение') {
        bot.sendMessage(chatId, `📜 *СОГЛАШЕНИЕ*\n━━━━━━━━━━━━━━━━━━━\n\n✅ Бот использует бесплатные AI модели\n❌ Не отправляйте личную информацию\n📧 Контакты: @Stas0878`, { parse_mode: 'Markdown' });
        return;
    }
    
    // Пропускаем команды
    if (text.startsWith('/')) return;
    
    // Обычные сообщения с fallback цепочкой
    try {
        const thinkingMsg = await bot.sendMessage(chatId, '🤔 *Думаю...*', { parse_mode: 'Markdown' });
        addToMemory(userId, 'user', text);
        const contextMessage = getDialogContext(userId, text);
        
        const fallbackModels = [
            'google/gemma-4-31b-it:free:online',
            'deepseek/deepseek-v4-flash:free:online',
            'qwen/qwen3.6-plus-preview:free:online',
            'tencent/hy3-preview:free:online',
            'xiaomi/mimo-v2.5-pro:free'
        ];
        
        let answer = null;
        let usedModel = null;
        
        for (const model of fallbackModels) {
            try {
                const response = await router.chat(contextMessage, { model: model });
                const candidateAnswer = response.choices[0].message.content;
                if (candidateAnswer && candidateAnswer !== 'null' && candidateAnswer.trim() !== '') {
                    answer = candidateAnswer;
                    usedModel = model;
                    break;
                }
            } catch(e) {}
        }
        
        if (!answer) {
            answer = "Извините, все модели временно недоступны. Попробуйте позже.";
            usedModel = "none";
        }
        
        addToMemory(userId, 'assistant', answer);
        router.lastUsedModel = usedModel;
        await bot.deleteMessage(chatId, thinkingMsg.message_id);
        
        const modelInfo = `\n\n---\n🤖 *Модель:* \`${usedModel}\``;
        await bot.sendMessage(chatId, answer + modelInfo, { parse_mode: 'Markdown' });
    } catch(error) {
        console.log('❌ ОШИБКА:', error.message);
        await bot.sendMessage(chatId, '❌ Ошибка, попробуйте позже');
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Бот запущен с феноменальной памятью!`);
    console.log(`✅ Все функции активны: память, поиск, код, язык, голос`);
    console.log(`✅ Память: ${MAX_MEMORY} сообщений на пользователя`);
});