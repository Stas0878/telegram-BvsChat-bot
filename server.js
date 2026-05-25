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
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
const POLLINATIONS_KEY = process.env.POLLINATIONS_KEY || '';

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
    console.error('❌ Ошибка: Не заданы переменные окружения TELEGRAM_TOKEN и/или OPENROUTER_KEY');
    process.exit(1);
}

// ========== ВСТРОЕННЫЙ SmartRouter (без внешних файлов!) ==========
class SmartRouter {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
        this.lastUsedModel = 'openrouter/free';
        this.stats = { totalRequests: 0, totalTokens: 0, startTime: Date.now() };

        this.models = {
            simple: [
                'google/gemma-2-9b-it:free',
                'meta-llama/llama-3.2-3b-instruct:free',
                'mistralai/mistral-7b-instruct:free'
            ],
            moderate: [
                'meta-llama/llama-3.3-70b-instruct:free',
                'google/gemini-2.0-flash-exp:free',
                'mistralai/mistral-small-3.2-24b-instruct:free',
                'deepseek/deepseek-chat-v3-0324:free'
            ],
            complex: [
                'qwen/qwen3-235b-a22b:free',
                'deepseek/deepseek-r1:free',
                'meta-llama/llama-4-maverick:free',
                'moonshotai/kimi-k2:free',
                'google/gemini-2.5-pro-exp-03-25:free'
            ],
            online: [
                'nvidia/nemotron-3-nano-30b-a3b:free:online',
                'openrouter/free:online',
                'google/gemini-2.0-flash-exp:free:online'
            ],
            code: [
                'qwen/qwen3-coder:free',
                'qwen/qwen-2.5-coder-32b-instruct:free',
                'deepseek/deepseek-r1:free',
                'agentica-org/deepcoder-14b-preview:free'
            ]
        };
    }

    estimateComplexity(prompt) {
        const p = prompt.toLowerCase();

        if (/обновл|актуальн|последн|сейчас|сегодня|202[5-9]|текущ|новост|погод|курс|свеж|интернет|поиск|найди/i.test(p)) {
            return 'online';
        }

        if (/код|code|программ|function|class|python|javascript|java|cpp|html|css|sql|algorithm/i.test(p)) {
            return 'code';
        }

        if (/математ|физик|хими|анализ|сравн|объясни|почему|как работает|принцип работы/i.test(p)) {
            return 'complex';
        }

        if (/привет|hello|как дела|кто ты|сколько|время|дата|погода/i.test(p)) {
            return 'simple';
        }

        if (p.length > 200) return 'complex';
        if (p.length > 80) return 'moderate';
        return 'simple';
    }

    async chat(message, options = {}) {
        const { systemPrompt = 'You are a helpful AI assistant. Answer in Russian.', temperature = 0.7, maxTokens = 2048, model = null } = options;

        const complexity = model || this.estimateComplexity(message);
        const candidates = this.models[complexity] || this.models.moderate;

        let lastError = null;

        for (const modelId of candidates) {
            try {
                const payload = {
                    model: modelId,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: message }
                    ],
                    temperature,
                    max_tokens: maxTokens,
                    top_p: 0.95
                };

                const response = await axios.post(this.baseUrl, payload, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'HTTP-Referer': 'https://t.me/smart_ai_bot',
                        'X-Title': 'Smart AI Bot'
                    },
                    timeout: 60000
                });

                this.stats.totalRequests++;
                this.stats.totalTokens += response.data?.usage?.total_tokens || 0;
                this.lastUsedModel = modelId;

                return response.data;
            } catch (error) {
                lastError = error;
                console.log(`⚠️ Модель ${modelId} недоступна: ${error.message}`);
                continue;
            }
        }

        throw lastError || new Error('Все модели недоступны');
    }

    getStats() {
        const uptime = Date.now() - this.stats.startTime;
        return {
            totalRequests: this.stats.totalRequests,
            totalTokens: this.stats.totalTokens,
            averageTokensPerRequest: this.stats.totalRequests > 0 ? Math.round(this.stats.totalTokens / this.stats.totalRequests) : 0,
            freeModelsUsed: 25,
            uptime: `${Math.floor(uptime / 1000)}s`
        };
    }
}
// ========== КОНЕЦ SmartRouter ==========

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const router = new SmartRouter(OPENROUTER_KEY);

// ========== РЕАЛЬНЫЙ ПОИСК В ИНТЕРНЕТЕ ==========
async function searchInternet(query) {
    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'nvidia/nemotron-3-nano-30b-a3b:free:online',
                messages: [
                    { role: 'system', content: 'Ты поисковый ассистент. Найди актуальную информацию по запросу. Всегда указывай источники в формате [текст](url). Отвечай на русском.' },
                    { role: 'user', content: `Найди актуальную информацию: ${query}. Дай подробный ответ с работающими ссылками.` }
                ],
                temperature: 0.5,
                max_tokens: 4000
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_KEY}`,
                    'HTTP-Referer': 'https://t.me/smart_ai_bot',
                    'X-Title': 'Smart AI Bot'
                },
                timeout: 60000
            }
        );

        const content = response.data.choices[0].message.content;
        if (!content || content.trim() === '' || content === 'null') {
            throw new Error('Пустой ответ от модели');
        }
        return content;
    } catch (error) {
        console.error('Search error:', error.message);
        return `❌ Ошибка поиска: ${error.message}`;
    }
}
// ========== КОНЕЦ ПОИСКА ==========

// ========== МЕНЮ ==========
const mainMenu = {
    reply_markup: {
        keyboard: [[{ text: "📋 Открыть меню" }]],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

const fullMenu = {
    reply_markup: {
        keyboard: [
            [{ text: "🤖 Что умеет бот" }, { text: "📊 Статистика" }],
            [{ text: "👤 Мой профиль" }, { text: "🔧 Tools" }],
            [{ text: "✨ Gemini" }, { text: "🎨 Создать изображение" }],
            [{ text: "🎵 Создать музыку" }, { text: "🎬 Создать видео" }],
            [{ text: "🔍 Интернет-поиск" }, { text: "⚙️ Настройки" }],
            [{ text: "🗑️ Удалить контекст" }, { text: "📜 Соглашение" }],
            [{ text: "📋 Закрыть меню" }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

app.get('/', (req, res) => {
    res.send('🤖 Smart AI Bot работает!');
});

// ========== КОМАНДА /start ==========
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!userSettings.has(userId)) {
        userSettings.set(userId, {
            language: 'ru',
            voiceEnabled: false,
            temperature: 0.7,
            maxTokens: 99948
        });
    }

    bot.sendMessage(chatId, 
        `🤖 *Добро пожаловать в Smart AI Bot!*\n\n👇 *Нажми на кнопку "Открыть меню" ниже!*`,
        { parse_mode: 'Markdown', reply_markup: mainMenu.reply_markup }
    );
});

// ========== КОМАНДА /stats ==========
bot.onText(/\/stats/, async (msg) => {
    const stats = router.getStats();
    const memory = getUserMemory(msg.from.id);
    bot.sendMessage(msg.chat.id, 
        `📊 *СТАТИСТИКА*\n━━━━━━━━━━━━━━━━━━━\n\n📨 Запросов: ${stats.totalRequests}\n🔤 Токенов: ${stats.totalTokens}\n🧠 Память: ${memory.length}/${MAX_MEMORY}`,
        { parse_mode: 'Markdown' }
    );
});

// ========== КОМАНДА /model ==========
bot.onText(/\/model/, async (msg) => {
    bot.sendMessage(msg.chat.id,
        `🤖 *ТЕКУЩАЯ МОДЕЛЬ*\n━━━━━━━━━━━━━━━━━━━\n\n🔹 *Используется:* умный выбор из 25+ бесплатных моделей\n✨ *Все модели бесплатны!*`,
        { parse_mode: 'Markdown' }
    );
});

// ========== КОМАНДА /search ==========
bot.onText(/\/search (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const query = match[1];
    await bot.sendChatAction(chatId, 'typing');
    bot.sendMessage(chatId, `🔍 Ищу: "${query}"...`);
    const result = await searchInternet(query);
    bot.sendMessage(chatId, result, { parse_mode: 'Markdown', disable_web_page_preview: false });
});

// ========== КОМАНДА /code ==========
bot.onText(/\/code (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const task = match[1];
    await bot.sendChatAction(chatId, 'typing');
    
    try {
        const prompt = `Напиши код на Python для: ${task}. Дай рабочий код с комментариями.`;
        const response = await router.chat(prompt);
        const answer = response.choices[0].message.content;
        await bot.sendMessage(chatId, answer, { parse_mode: 'Markdown' });
    } catch(error) {
        await bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
    }
});

// ========== КОМАНДА /memory ==========
bot.onText(/\/memory/, (msg) => {
    const memory = getUserMemory(msg.from.id);
    bot.sendMessage(msg.chat.id, `🧠 *ПАМЯТЬ*\n━━━━━━━━━━━━━━━━━━━\n\n• Сообщений: ${memory.length}/${MAX_MEMORY}`, { parse_mode: 'Markdown' });
});

// ========== КОМАНДА /tools ==========
bot.onText(/\/tools/, (msg) => {
    bot.sendMessage(msg.chat.id,
        `🔧 *ДОСТУПНЫЕ ИНСТРУМЕНТЫ*\n━━━━━━━━━━━━━━━━━━━\n\n🧮 /calc - Калькулятор\n📊 /analyze - Анализ текста\n✅ /validate - Проверка email\n🔐 /encode - Base64 кодирование\n🔓 /decode - Base64 декодирование\n🔗 /url - Проверка URL\n🎲 /random - Случайное число\n📅 /date - Текущая дата\n✨ /gemini вопрос - Google Gemini\n🎨 /image описание - Изображение\n\n✨ *Все команды бесплатны!*`,
        { parse_mode: 'Markdown' }
    );
});

// ========== КОМАНДА /calc ==========
bot.onText(/\/calc (.+)/, (msg, match) => {
    try {
        const result = eval(match[1]);
        bot.sendMessage(msg.chat.id, `🧮 *Результат:* ${result}`, { parse_mode: 'Markdown' });
    } catch(e) {
        bot.sendMessage(msg.chat.id, `❌ Ошибка: ${e.message}`);
    }
});

// ========== КОМАНДА /analyze ==========
bot.onText(/\/analyze (.+)/, (msg, match) => {
    const text = match[1];
    const words = text.split(/\s+/).length;
    const chars = text.length;
    bot.sendMessage(msg.chat.id, `📊 Слов: ${words}\n🔤 Символов: ${chars}`, { parse_mode: 'Markdown' });
});

// ========== КОМАНДА /validate ==========
bot.onText(/\/validate (.+)/, (msg, match) => {
    const email = match[1];
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    bot.sendMessage(msg.chat.id, isValid ? '✅ *Email корректен*' : '❌ *Неверный формат email*', { parse_mode: 'Markdown' });
});

// ========== КОМАНДА /encode ==========
bot.onText(/\/encode (.+)/, (msg, match) => {
    const encoded = Buffer.from(match[1]).toString('base64');
    bot.sendMessage(msg.chat.id, `🔐 *Base64:*\n\`${encoded}\``, { parse_mode: 'Markdown' });
});

// ========== КОМАНДА /decode ==========
bot.onText(/\/decode (.+)/, (msg, match) => {
    try {
        const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
        bot.sendMessage(msg.chat.id, `🔓 *Декодировано:*\n${decoded}`, { parse_mode: 'Markdown' });
    } catch(e) {
        bot.sendMessage(msg.chat.id, '❌ *Неверный Base64 код*', { parse_mode: 'Markdown' });
    }
});

// ========== КОМАНДА /url ==========
bot.onText(/\/url (.+)/, (msg, match) => {
    const url = match[1];
    const isValid = /^https?:\/\/.+/.test(url);
    bot.sendMessage(msg.chat.id, isValid ? '✅ *URL корректен*' : '❌ *Неверный формат URL*', { parse_mode: 'Markdown' });
});

// ========== КОМАНДА /random ==========
bot.onText(/\/random (\d+) (\d+)/, (msg, match) => {
    const min = parseInt(match[1]);
    const max = parseInt(match[2]);
    const random = Math.floor(Math.random() * (max - min + 1)) + min;
    bot.sendMessage(msg.chat.id, `🎲 *Случайное число:* ${random}`, { parse_mode: 'Markdown' });
});

// ========== КОМАНДА /date ==========
bot.onText(/\/date/, (msg) => {
    const now = new Date();
    bot.sendMessage(msg.chat.id, `📅 *Текущая дата:*\n${now.toLocaleString('ru-RU')}`, { parse_mode: 'Markdown' });
});

// ========== КОМАНДА /help ==========
bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id,
        `🆘 *ПОМОЩЬ*\n━━━━━━━━━━━━━━━━━━━\n\n📋 *Основные команды:*\n• /start - Запуск\n• /stats - Статистика\n• /model - Модель\n• /memory - Память\n• /search [текст] - Поиск\n• /code [задача] - Код\n• /tools - Инструменты\n• /help - Справка`,
        { parse_mode: 'Markdown' }
    );
});

// ========== КОМАНДА /gemini ==========
bot.onText(/\/gemini (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const prompt = match[1];
    await bot.sendChatAction(chatId, 'typing');
    
    try {
        const response = await router.chat(prompt, { model: 'google/gemini-2.0-flash-exp:free' });
        const answer = response.choices[0].message.content;
        await bot.sendMessage(chatId, answer, { parse_mode: 'Markdown' });
    } catch(error) {
        await bot.sendMessage(chatId, `❌ Ошибка Gemini: ${error.message}`);
    }
});

// ========== КОМАНДА /image ==========
bot.onText(/\/image (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const prompt = match[1];
    await bot.sendChatAction(chatId, 'upload_photo');
    bot.sendMessage(chatId, `🎨 Генерирую изображение: "${prompt}"...`);
    
    try {
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&model=flux&nologo=true`;
        await bot.sendPhoto(chatId, imageUrl, { caption: `✨ ${prompt}` });
    } catch(error) {
        await bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
    }
});

// ========== ОБРАБОТКА КНОПОК И СООБЩЕНИЙ ==========
bot.on('message', async (msg) => {
    if (!msg.text) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    // Обработка кнопок меню
    if (text === '📋 Открыть меню') {
        bot.sendMessage(chatId, '🔽 *Полное меню:*', { parse_mode: 'Markdown', reply_markup: fullMenu.reply_markup });
        return;
    }
    
    if (text === '📋 Закрыть меню') {
        bot.sendMessage(chatId, '🔼 *Меню закрыто*', { parse_mode: 'Markdown', reply_markup: mainMenu.reply_markup });
        return;
    }
    
    if (text === '🔧 Tools') {
        bot.sendMessage(chatId,
            `🔧 *ДОСТУПНЫЕ ИНСТРУМЕНТЫ*\n━━━━━━━━━━━━━━━━━━━\n\n🧮 /calc - Калькулятор\n📊 /analyze - Анализ текста\n✅ /validate - Проверка email\n🔐 /encode - Base64\n🔓 /decode - Base64\n🔗 /url - Проверка URL\n🎲 /random - Случайное число\n📅 /date - Текущая дата\n✨ /gemini - Google Gemini\n🎨 /image - Изображение`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    if (text === '✨ Gemini') {
        bot.sendMessage(chatId, `✨ *Google Gemini*\n\n/gemini [вопрос]`, { parse_mode: 'Markdown' });
        return;
    }
    
    if (text === '🗑️ Удалить контекст') {
        userMemory.set(userId, []);
        bot.sendMessage(chatId, '🗑️ *История очищена!*', { parse_mode: 'Markdown' });
        return;
    }
    
    if (text === '🎵 Создать музыку') {
        bot.sendMessage(chatId, '🎵 *Генерация музыки*\n\n/music [описание]', { parse_mode: 'Markdown' });
        return;
    }
    
    if (text === '🎬 Создать видео') {
        bot.sendMessage(chatId, '🎬 *Генерация видео*\n\n/video [описание]', { parse_mode: 'Markdown' });
        return;
    }
    
    if (text === '📊 Статистика') {
        const stats = router.getStats();
        const memory = getUserMemory(userId);
        bot.sendMessage(chatId, `📊 *СТАТИСТИКА*\n━━━━━━━━━━━━━━━━━━━\n📨 Запросов: ${stats.totalRequests}\n🔤 Токенов: ${stats.totalTokens}\n🧠 Память: ${memory.length}`, { parse_mode: 'Markdown' });
        return;
    }
    
    if (text === '👤 Мой профиль') {
        bot.sendMessage(chatId, `👤 *ПРОФИЛЬ*\n━━━━━━━━━━━━━━━━━━━\n🆔 ID: ${userId}\n📛 Имя: ${msg.from.first_name}\n🧠 Память: ${getUserMemory(userId).length}`, { parse_mode: 'Markdown' });
        return;
    }
    
    if (text === '🤖 Что умеет бот') {
        bot.sendMessage(chatId, `✨ *ВОЗМОЖНОСТИ*\n━━━━━━━━━━━━━━━━━━━\n🧠 Память\n💻 Код\n🔍 Поиск\n🎨 Изображения\n✨ Gemini\n📊 Статистика`, { parse_mode: 'Markdown' });
        return;
    }
    
    if (text === '🤖 Выбрать модель') {
        bot.sendMessage(chatId, `🤖 *ТЕКУЩАЯ МОДЕЛЬ*\n━━━━━━━━━━━━━━━━━━━\nАвтовыбор из 25+ моделей\nПодробнее: /model`, { parse_mode: 'Markdown' });
        return;
    }
    
    if (text === '⚙️ Настройки') {
        bot.sendMessage(chatId, `⚙️ *НАСТРОЙКИ*\n━━━━━━━━━━━━━━━━━━━\n/lang ru/en - Язык\n/voice - Голос`, { parse_mode: 'Markdown' });
        return;
    }
    
    if (text === '🎨 Создать изображение') {
        bot.sendMessage(chatId, `🎨 *ГЕНЕРАЦИЯ ИЗОБРАЖЕНИЙ*\n\n/image [описание]`, { parse_mode: 'Markdown' });
        return;
    }
    
    if (text === '🔍 Интернет-поиск') {
        bot.sendMessage(chatId, `🔍 *ПОИСК В ИНТЕРНЕТЕ*\n\n/search [запрос]`, { parse_mode: 'Markdown' });
        return;
    }
    
    if (text === '📜 Соглашение') {
        bot.sendMessage(chatId, `📜 *СОГЛАШЕНИЕ*\n━━━━━━━━━━━━━━━━━━━\n✅ Бесплатные модели\n❌ Не пишите личные данные`, { parse_mode: 'Markdown' });
        return;
    }
    
    // Пропускаем команды
    if (text.startsWith('/')) return;
    
    // Обычные сообщения
    try {
        const thinkingMsg = await bot.sendMessage(chatId, '🤔 *Думаю...*', { parse_mode: 'Markdown' });
        addToMemory(userId, 'user', text);
        const contextMessage = getDialogContext(userId, text);
        const response = await router.chat(contextMessage);
        const answer = response.choices[0].message.content;
        addToMemory(userId, 'assistant', answer);
        await bot.deleteMessage(chatId, thinkingMsg.message_id);
        await bot.sendMessage(chatId, answer);
        console.log(`✅ Ответ отправлен, модель: ${response.model || router.lastUsedModel}`);
    } catch(error) {
        console.log('❌ ОШИБКА:', error.message);
        await bot.sendMessage(chatId, '❌ Ошибка, попробуйте позже');
    }
});

// ========== ЗАПУСК СЕРВЕРА ==========
app.listen(PORT, () => {
    console.log(`🚀 Smart AI Bot запущен на порту ${PORT}!`);
    console.log(`✅ Память: ${MAX_MEMORY} сообщений на пользователя`);
    console.log(`🧠 AI: OpenRouter (25+ бесплатных моделей)`);
});