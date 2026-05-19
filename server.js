// ========== ЗАЩИТА ОТ ПАДЕНИЙ (В САМОМ НАЧАЛЕ) ==========
process.on('uncaughtException', (error) => {
    console.error('❌ Непойманная ошибка:', error.message);
    console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Необработанный rejection:', reason);
});

// Автоматический перезапуск при падении
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
                model: 'openrouter/free',
                messages: [
                    { role: 'system', content: 'Ты помощник для поиска информации в интернете. Найди актуальную информацию по запросу. Если есть ссылки - обязательно укажи их в формате [текст](url). Отвечай на русском.' },
                    { role: 'user', content: `Найди актуальную информацию: ${query}. Дай ответ с работающими ссылками.` }
                ],
                temperature: 0.5,
                max_tokens: 90000
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
        return `❌ Ошибка поиска. Попробуйте позже.\n\nВот что я знаю по запросу "${query}":\nИспользуйте Google или Яндекс для поиска актуальной информации.`;
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
            [{ text: "🎨 Создать изображение" }, { text: "🎵 Создать музыку" }],
            [{ text: "🎬 Создать видео" }, { text: "🔍 Интернет-поиск" }],
            [{ text: "🤖 Выбрать модель" }, { text: "⚙️ Настройки" }],
            [{ text: "🗑️ Удалить контекст" }, { text: "📜 Соглашение" }],
            [{ text: "📋 Закрыть меню" }]
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
            maxTokens: 90048
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
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const stats = router.getStats();
    const memory = getUserMemory(userId);
    
    bot.sendMessage(chatId,
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
        `Используется умный выбор из 25+ бесплатных моделей\n` +
        `DeepSeek-V3, Llama-3.1-405B, Qwen-3-80B, Mistral-7B`,
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
    const code = await generateCode(task, 'python');
    bot.sendMessage(chatId, code, { parse_mode: 'Markdown' });
});

// Команда /memory
bot.onText(/\/memory/, (msg) => {
    const userId = msg.from.id;
    const memory = getUserMemory(userId);
    bot.sendMessage(msg.chat.id,
        `🧠 *ПАМЯТЬ*\n━━━━━━━━━━━━━━━━━━━\n\n` +
        `• Сообщений: ${memory.length}/${MAX_MEMORY}`,
        { parse_mode: 'Markdown' }
    );
});

// Команда /tools
bot.onText(/\/tools/, (msg) => {
    bot.sendMessage(msg.chat.id,
        `🔧 *ДОСТУПНЫЕ ИНСТРУМЕНТЫ*\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🧮 \`/calc 2+2*10\` - Калькулятор\n` +
        `📊 \`/analyze текст\` - Анализ текста\n` +
        `✅ \`/validate email@test.ru\` - Проверка email\n` +
        `🔐 \`/encode текст\` - Base64 кодирование\n` +
        `🔓 \`/decode dGV4dA==\` - Base64 декодирование\n` +
        `🔗 \`/url https://google.com\` - Проверка URL\n` +
        `🎲 \`/random 1 100\` - Случайное число\n` +
        `📅 \`/date\` - Текущая дата`,
        { parse_mode: 'Markdown' }
    );
});

// Команда /calc
bot.onText(/\/calc (.+)/, (msg, match) => {
    const expression = match[1];
    try {
        const result = eval(expression);
        bot.sendMessage(msg.chat.id, `🧮 *Результат:* ${result}`, { parse_mode: 'Markdown' });
    } catch(e) {
        bot.sendMessage(msg.chat.id, `❌ Ошибка: ${e.message}`);
    }
});

// ========== НОВЫЕ КОМАНДЫ ==========
// Команда /analyze
bot.onText(/\/analyze (.+)/, (msg, match) => {
    const text = match[1];
    const words = text.split(/\s+/).length;
    const chars = text.length;
    const charsNoSpaces = text.replace(/\s/g, '').length;
    const sentences = text.split(/[.!?]+/).filter(s => s.length > 0).length;
    
    bot.sendMessage(msg.chat.id,
        `📊 *АНАЛИЗ ТЕКСТА*\n━━━━━━━━━━━━━━━━━━━\n` +
        `📝 Слов: ${words}\n` +
        `🔤 Символов: ${chars}\n` +
        `📏 Без пробелов: ${charsNoSpaces}\n` +
        `📖 Предложений: ${sentences}`,
        { parse_mode: 'Markdown' }
    );
});

// Команда /validate
bot.onText(/\/validate (.+)/, (msg, match) => {
    const email = match[1];
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    bot.sendMessage(msg.chat.id, 
        isValid ? '✅ *Email корректен*' : '❌ *Неверный формат email*',
        { parse_mode: 'Markdown' }
    );
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
    bot.sendMessage(msg.chat.id, 
        isValid ? '✅ *URL корректен*' : '❌ *Неверный формат URL (нужен http:// или https://)*',
        { parse_mode: 'Markdown' }
    );
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
// ========== КОНЕЦ НОВЫХ КОМАНД ==========

// Обработка кнопок и сообщений
bot.on('message', async (msg) => {
    if (!msg.text) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    // Обработка кнопки открытия/закрытия меню
    if (text === '📋 Открыть меню') {
        bot.sendMessage(chatId, '🔽 *Полное меню команд:*', {
            parse_mode: 'Markdown',
            reply_markup: fullMenu.reply_markup
        });
        return;
    }
    
    if (text === '📋 Закрыть меню') {
        bot.sendMessage(chatId, '🔼 *Меню закрыто*', {
            parse_mode: 'Markdown',
            reply_markup: mainMenu.reply_markup
        });
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
            `📅 /date - Текущая дата\n\n` +
            `✨ *Все команды бесплатны!*`,
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
    
    if (text === '📊 Статистика') {
        const stats = router.getStats();
        const memory = getUserMemory(userId);
        bot.sendMessage(chatId,
            `📊 *СТАТИСТИКА*\n━━━━━━━━━━━━━━━━━━━\n` +
            `📨 Запросов: ${stats.totalRequests}\n` +
            `🔤 Токенов: ${stats.totalTokens?.toLocaleString() || 0}\n` +
            `🧠 Память: ${memory.length} сообщений`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    if (text === '👤 Мой профиль') {
        bot.sendMessage(chatId,
            `👤 *ПРОФИЛЬ*\n━━━━━━━━━━━━━━━━━━━\n` +
            `🆔 ID: ${userId}\n` +
            `📛 Имя: ${msg.from.first_name || '?'}\n` +
            `🧠 Память: ${getUserMemory(userId).length} сообщений`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    if (text === '🤖 Что умеет бот') {
        bot.sendMessage(chatId,
            `✨ *ВОЗМОЖНОСТИ БОТА*\n━━━━━━━━━━━━━━━━━━━\n\n` +
            `🧠 *Феноменальная память* - помню ВСЁ\n` +
            `💻 *Программирование* - пишу код\n` +
            `🔍 *Интернет поиск* - ищу ссылки\n` +
            `📊 *Статистика* - слежу за использованием`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    if (text === '🤖 Выбрать модель') {
        bot.sendMessage(chatId,
            `🤖 *ТЕКУЩАЯ МОДЕЛЬ*\n━━━━━━━━━━━━━━━━━━━\n\n` +
            `Автовыбор из 25+ бесплатных моделей\n` +
            `Используйте /model для подробностей`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    if (text === '⚙️ Настройки') {
        bot.sendMessage(chatId,
            `⚙️ *НАСТРОЙКИ*\n━━━━━━━━━━━━━━━━━━━\n\n` +
            `🧠 Память: ${getUserMemory(userId).length} сообщений\n` +
            `🔧 Инструменты: /tools`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    if (text === '🎨 Создать изображение') {
        bot.sendMessage(chatId, 
            `🎨 *Генерация изображений*\n\n` +
            `Скоро будет доступно!`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    if (text === '🔍 Интернет-поиск') {
        bot.sendMessage(chatId,
            `🔍 *ИНТЕРНЕТ ПОИСК*\n━━━━━━━━━━━━━━━━━━━\n\n` +
            `📝 Используйте: /search [запрос]`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    if (text === '📜 Соглашение') {
        bot.sendMessage(chatId,
            `📜 *СОГЛАШЕНИЕ*\n━━━━━━━━━━━━━━━━━━━\n\n` +
            `✅ Бот использует бесплатные AI модели\n` +
            `❌ Не отправляйте личную информацию\n` +
            `📧 Контакты: @Stas0878`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    // Пропускаем команды
    if (text.startsWith('/')) return;
    
    // Обычные сообщения - с контекстом и памятью
    try {
        await bot.sendChatAction(chatId, 'typing');
        
        addToMemory(userId, 'user', text);
        const contextMessage = getDialogContext(userId, text);
        const response = await router.chat(contextMessage);
        const answer = response.choices[0].message.content;
        addToMemory(userId, 'assistant', answer);
        
        await bot.sendMessage(chatId, answer);
        console.log(`✅ Ответ отправлен`);
    } catch(error) {
        console.log('❌ ОШИБКА:', error.message);
        await bot.sendMessage(chatId, '❌ Ошибка, попробуйте позже');
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Бот запущен на порту ${PORT}`);
    console.log(`✅ Память: ${MAX_MEMORY} сообщений на пользователя`);
});