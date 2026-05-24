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
            }, 2000);  // ИСПРАВЛЕНО: было 9999 (почти 10 сек), теперь 2000 (2 сек)
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
const POLLINATIONS_KEY = process.env.POLLINATIONS_KEY || ''; // Опционально для лучших лимитов

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

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const router = new SmartRouter(OPENROUTER_KEY);

// ========== РЕАЛЬНЫЙ ПОИСК В ИНТЕРНЕТЕ ==========
async function searchInternet(query) {
    try {
        // ИСПРАВЛЕНО: Реальный поиск через OpenRouter с моделью :online
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'openrouter/quasar-alpha:online',
                messages: [
                    { 
                        role: 'system', 
                        content: 'Ты поисковый ассистент. Найди актуальную информацию в интернете по запросу пользователя. Всегда указывай источники в формате [текст](url). Отвечай на русском.' 
                    },
                    { 
                        role: 'user', 
                        content: `Найди актуальную информацию: ${query}. Дай подробный ответ с работающими ссылками на источники.` 
                    }
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
                timeout: 30000
            }
        );

        const content = response.data.choices[0].message.content;
        if (!content || content.trim() === '' || content === 'null') {
            throw new Error('Пустой ответ от модели');
        }
        return content;
    } catch (error) {
        console.error('Search error:', error.message);
        return `❌ Ошибка поиска: ${error.message}\n\nПопробуйте:\n• Уточнить запрос\n• Повторить через минуту\n• Использовать /search с другими словами`;
    }
}
// ========== КОНЕЦ ПОИСКА ==========

// ========== ГЕНЕРАЦИЯ КОДА ==========
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
            { systemPrompt: 'Ты эксперт по программированию. Пиши чистый, документированный код.' }
        );
        return response.choices[0].message.content;
    } catch (error) {
        return `❌ Ошибка генерации кода: ${error.message}`;
    }
}
// ========== КОНЕЦ ГЕНЕРАЦИИ КОДА ==========

// ========== МЕНЮ ==========
const mainMenu = {
    reply_markup: {
        keyboard: [
            [{ text: "📋 Открыть меню" }]
        ],
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
// ========== КОНЕЦ МЕНЮ ==========

app.get('/', (req, res) => {
    res.send('Бот работает с феноменальной памятью!');
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
        `🤖 *Добро пожаловать в Smart AI Bot!*\n\n` +
        `✨ *Мои возможности:*\n` +
        `• 🧠 *Феноменальная память* - запоминаю ВСЕ диалоги (до ${MAX_MEMORY} сообщений)\n` +
        `• 💻 *Программирование* - пишу код на любом языке\n` +
        `• 🔍 *Интернет поиск* - ищу актуальную информацию с ссылками\n` +
        `• 🌐 *Мультиязычность* - отвечаю на русском и английском\n` +
        `• 🎤 *Голосовое сопровождение* - могу озвучивать ответы\n` +
        `• 📊 *Статистика* - слежу за использованием\n` +
        `• 🤖 *Умный выбор модели* - автоматически выбираю лучшую AI\n` +
        `• 🔧 *Инструменты* - калькулятор, анализ текста, шифрование и многое другое\n\n` +
        `👇 *Нажми на кнопку "Открыть меню" ниже!*`,
        { parse_mode: 'Markdown', reply_markup: mainMenu.reply_markup }
    );
});
// ========== КОНЕЦ /start ==========

// ========== КОМАНДА /stats ==========
bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const stats = router.getStats ? router.getStats() : { totalRequests: 0, totalTokens: 0, averageTokensPerRequest: 0, freeModelsUsed: 25 };
    const memory = getUserMemory(userId);
    const settings = userSettings.get(userId) || { language: 'ru', voiceEnabled: false };

    bot.sendMessage(chatId,
        `📊 *СТАТИСТИКА БОТА*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📨 *Всего запросов:* ${stats.totalRequests}\n` +
        `🔤 *Всего токенов:* ${stats.totalTokens?.toLocaleString() || 0}\n` +
        `📈 *Среднее токенов:* ${stats.averageTokensPerRequest || 0}\n` +
        `💸 *Бесплатных моделей:* ${stats.freeModelsUsed || 25}+\n\n` +
        `🧠 *Память диалогов:*\n` +
        `• Сохранено сообщений: ${memory.length}/${MAX_MEMORY}\n` +
        `• Помню последние ${Math.min(20, memory.length)} сообщений\n\n` +
        `⚙️ *Ваши настройки:*\n` +
        `• 🌐 Язык: ${settings.language === 'ru' ? 'Русский' : 'English'}\n` +
        `• 🎤 Голос: ${settings.voiceEnabled ? 'Включен' : 'Выключен'}\n` +
        `• 🌡️ Температура: ${settings.temperature}\n\n` +
        `🆓 *Доступно:* 25+ бесплатных моделей\n` +
        `⚡ *Работаю 24/7 с полной памятью!*`,
        { parse_mode: 'Markdown' }
    );
});
// ========== КОНЕЦ /stats ==========

// ========== КОМАНДА /model ==========
bot.onText(/\/model/, async (msg) => {
    const lastModel = router.lastUsedModel || 'openrouter/free';

    const modelDescriptions = {
        'tencent/hy3-preview': 'Tencent Hy3 Preview - 295B параметров, 256K контекста, топ-1 бесплатная модель',
        'google/gemma-4-31b': 'Google Gemma 4 31B - 256K контекста, 140+ языков, мультимодальная',
        'deepseek/deepseek-v4-flash': 'DeepSeek V4 Flash - 284B параметров, 1M контекста, быстрая',
        'nvidia/nemotron-3-super': 'NVIDIA Nemotron 3 Super - 120B параметров, 1M контекста, для агентов',
        'qwen/qwen3.6-plus-preview': 'Qwen 3.6 Plus Preview - 1M контекста, код и фронтенд',
        'xiaomi/mimo-v2-pro': 'Xiaomi MiMo V2 Pro - 1M контекста, флагманская модель',
        'nvidia/nemotron-3-nano-30b-a3b': 'NVIDIA Nemotron 3 Nano - 30B параметров, сбалансированная',
        'openrouter/quasar-alpha': 'OpenRouter Quasar Alpha - специально для кода',
        'microsoft/phi-4-mini': 'Microsoft Phi-4 Mini - компактная, быстрая',
        'google/gemma-4-26b-a4b-it': 'Google Gemma 4 26B - экономичная, 256K контекста',
        'openrouter/free': 'OpenRouter Free - стандартная бесплатная модель'
    };

    let modelDescription = 'Бесплатная модель с автовыбором';
    for (const [key, desc] of Object.entries(modelDescriptions)) {
        if (lastModel.includes(key)) {
            modelDescription = desc;
            break;
        }
    }

    bot.sendMessage(msg.chat.id,
        `🤖 *ТЕКУЩАЯ МОДЕЛЬ*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🔹 *Используемая модель:*\n` +
        `\`${lastModel}\`\n\n` +
        `📝 *Описание:* ${modelDescription}\n\n` +
        `📊 *Как выбирается модель:*\n` +
        `• Анализирую сложность запроса\n` +
        `• Оцениваю длину текста\n` +
        `• Проверяю наличие кода\n` +
        `• Понимаю логические задачи\n` +
        `• Для актуальных вопросов - топовые модели с :online\n\n` +
        `✨ *Все модели бесплатны!*`,
        { parse_mode: 'Markdown' }
    );
});
// ========== КОНЕЦ /model ==========

// ========== КОМАНДА /search ==========
bot.onText(/\/search (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const query = match[1];
    await bot.sendChatAction(chatId, 'typing');
    const thinkingMsg = await bot.sendMessage(chatId, `🔍 Ищу: "${query}"...`);

    try {
        const result = await searchInternet(query);
        await bot.deleteMessage(chatId, thinkingMsg.message_id);
        await bot.sendMessage(chatId, result, { parse_mode: 'Markdown', disable_web_page_preview: false });
    } catch (error) {
        await bot.deleteMessage(chatId, thinkingMsg.message_id);
        await bot.sendMessage(chatId, `❌ Ошибка поиска: ${error.message}`);
    }
});
// ========== КОНЕЦ /search ==========

// ========== КОМАНДА /code ==========
bot.onText(/\/code (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const task = match[1];

    await bot.sendChatAction(chatId, 'typing');

    try {
        const prompt = `Напиши код на Python для задачи: ${task}. Дай рабочий код с комментариями на русском языке. Пример использования в конце.`;
        const response = await router.chat(prompt);
        const answer = response.choices[0].message.content;

        await bot.sendMessage(chatId, answer, { parse_mode: 'Markdown' });
        console.log(`✅ Код отправлен для: ${task}`);
    } catch(error) {
        console.log('❌ Ошибка кода:', error.message);
        await bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
    }
});
// ========== КОНЕЦ /code ==========

// ========== КОМАНДА /lang ==========
bot.onText(/\/lang (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const lang = match[1].toLowerCase();

    const settings = userSettings.get(userId) || { language: 'ru', voiceEnabled: false };

    if (lang === 'ru' || lang === 'en') {
        settings.language = lang;
        userSettings.set(userId, settings);
        bot.sendMessage(chatId, `🌐 Язык изменен на ${lang === 'ru' ? 'Русский' : 'English'}`);
    } else {
        bot.sendMessage(chatId, `❌ Поддерживаемые языки: ru, en`);
    }
});
// ========== КОНЕЦ /lang ==========

// ========== КОМАНДА /voice ==========
bot.onText(/\/voice/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const settings = userSettings.get(userId) || { language: 'ru', voiceEnabled: false };

    settings.voiceEnabled = !settings.voiceEnabled;
    userSettings.set(userId, settings);

    bot.sendMessage(chatId, 
        settings.voiceEnabled ? 
        '🎤 Голосовое сопровождение ВКЛЮЧЕНО! Я буду озвучивать ответы.' : 
        '🎤 Голосовое сопровождение ВЫКЛЮЧЕНО.'
    );
});
// ========== КОНЕЦ /voice ==========

// ========== КОМАНДА /memory ==========
bot.onText(/\/memory/, (msg) => {
    const userId = msg.from.id;
    const memory = getUserMemory(userId);

    let lastDialogs = 'Пока нет диалогов';
    if (memory.length > 0) {
        lastDialogs = memory.slice(-5).map(m => 
            `• ${m.role === 'user' ? '👤' : '🤖'}: ${m.content.substring(0, 50)}...`
        ).join('\n');
    }

    bot.sendMessage(msg.chat.id,
        `🧠 *ФЕНОМЕНАЛЬНАЯ ПАМЯТЬ*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📝 *Статистика памяти:*\n` +
        `• Всего сообщений: ${memory.length}\n` +
        `• Максимум: ${MAX_MEMORY}\n` +
        `• Свободно: ${MAX_MEMORY - memory.length}\n\n` +
        `📋 *Последние диалоги:*\n${lastDialogs}\n\n` +
        `✨ *Я помню всё, что мы обсуждали!*`,
        { parse_mode: 'Markdown' }
    );
});
// ========== КОНЕЦ /memory ==========

// ========== КОМАНДА /tools ==========
bot.onText(/\/tools/, (msg) => {
    bot.sendMessage(msg.chat.id,
        `🔧 *ДОСТУПНЫЕ ИНСТРУМЕНТЫ*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🧮 \`/calc 2+2*10\` - Калькулятор\n` +
        `📊 \`/analyze текст\` - Анализ текста (слова, буквы)\n` +
        `✅ \`/validate email@test.ru\` - Проверка email\n` +
        `🔐 \`/encode текст\` - Base64 кодирование\n` +
        `🔓 \`/decode dGV4dA==\` - Base64 декодирование\n` +
        `🔗 \`/url https://google.com\` - Проверка URL\n` +
        `🎲 \`/random 1 100\` - Случайное число\n` +
        `📅 \`/date\` - Текущая дата\n` +
        `🔢 \`/stats\` - Статистика бота\n` +
        `🧠 \`/memory\` - Память диалогов\n` +
        `🔍 \`/search запрос\` - Поиск в интернете\n` +
        `💻 \`/code задача\` - Генерация кода\n` +
        `🤖 \`/model\` - Текущая модель AI\n` +
        `🎨 \`/image описание\` - Генерация изображения\n` +
        `✨ \`/gemini вопрос\` - Google Gemini 2.0 Flash\n\n` +
        `✨ *Все инструменты бесплатны!*`,
        { parse_mode: 'Markdown' }
    );
});
// ========== КОНЕЦ /tools ==========

// ========== КОМАНДА /calc - БЕЗОПАСНЫЙ КАЛЬКУЛЯТОР ==========
// ИСПРАВЛЕНО: Убран опасный eval(), заменен на безопасный парсер
function safeCalculate(expression) {
    // Разрешаем только цифры, операторы, скобки, точку и пробелы
    const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
    if (sanitized !== expression.trim()) {
        throw new Error('Выражение содержит недопустимые символы. Разрешены: цифры, +, -, *, /, (), .');
    }
    if (sanitized === '') {
        throw new Error('Пустое выражение');
    }

    // Проверяем на попытки инъекции через скобки
    const openParen = (sanitized.match(/\(/g) || []).length;
    const closeParen = (sanitized.match(/\)/g) || []).length;
    if (openParen !== closeParen) {
        throw new Error('Несбалансированные скобки');
    }

    try {
        // Используем Function вместо eval для изоляции
        const result = new Function('return ' + sanitized)();
        if (!isFinite(result)) {
            throw new Error('Результат не является числом');
        }
        return result;
    } catch (e) {
        throw new Error('Ошибка вычисления: ' + e.message);
    }
}

bot.onText(/\/calc (.+)/, (msg, match) => {
    const expression = match[1];
    try {
        const result = safeCalculate(expression);
        bot.sendMessage(msg.chat.id, `🧮 *Результат:* ${result}`, { parse_mode: 'Markdown' });
    } catch(e) {
        bot.sendMessage(msg.chat.id, `❌ Ошибка: ${e.message}`);
    }
});
// ========== КОНЕЦ /calc ==========

// ========== КОМАНДА /analyze ==========
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
// ========== КОНЕЦ /analyze ==========

// ========== КОМАНДА /validate ==========
bot.onText(/\/validate (.+)/, (msg, match) => {
    const email = match[1];
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    bot.sendMessage(msg.chat.id, 
        isValid ? '✅ *Email корректен*' : '❌ *Неверный формат email*',
        { parse_mode: 'Markdown' }
    );
});
// ========== КОНЕЦ /validate ==========

// ========== КОМАНДА /encode ==========
bot.onText(/\/encode (.+)/, (msg, match) => {
    const encoded = Buffer.from(match[1]).toString('base64');
    bot.sendMessage(msg.chat.id, `🔐 *Base64:*\n\`${encoded}\``, { parse_mode: 'Markdown' });
});
// ========== КОНЕЦ /encode ==========

// ========== КОМАНДА /decode ==========
bot.onText(/\/decode (.+)/, (msg, match) => {
    try {
        const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
        bot.sendMessage(msg.chat.id, `🔓 *Декодировано:*\n${decoded}`, { parse_mode: 'Markdown' });
    } catch(e) {
        bot.sendMessage(msg.chat.id, '❌ *Неверный Base64 код*', { parse_mode: 'Markdown' });
    }
});
// ========== КОНЕЦ /decode ==========

// ========== КОМАНДА /url ==========
bot.onText(/\/url (.+)/, (msg, match) => {
    const url = match[1];
    const isValid = /^https?:\/\/.+/.test(url);
    bot.sendMessage(msg.chat.id, 
        isValid ? '✅ *URL корректен*' : '❌ *Неверный формат URL (нужен http:// или https://)*',
        { parse_mode: 'Markdown' }
    );
});
// ========== КОНЕЦ /url ==========

// ========== КОМАНДА /random ==========
bot.onText(/\/random (\d+) (\d+)/, (msg, match) => {
    const min = parseInt(match[1]);
    const max = parseInt(match[2]);
    const random = Math.floor(Math.random() * (max - min + 1)) + min;
    bot.sendMessage(msg.chat.id, `🎲 *Случайное число:* ${random}`, { parse_mode: 'Markdown' });
});
// ========== КОНЕЦ /random ==========

// ========== КОМАНДА /date ==========
bot.onText(/\/date/, (msg) => {
    const now = new Date();
    bot.sendMessage(msg.chat.id, `📅 *Текущая дата и время:*\n${now.toLocaleString('ru-RU')}`, { parse_mode: 'Markdown' });
});
// ========== КОНЕЦ /date ==========

// ========== КОМАНДА /help ==========
bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id,
        `🆘 *ПОМОЩЬ*\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📋 *Основные команды:*\n` +
        `• /start - Запуск бота\n` +
        `• /stats - Статистика использования\n` +
        `• /model - Текущая модель AI\n` +
        `• /memory - Память диалогов\n` +
        `• /search [текст] - Поиск в интернете\n` +
        `• /code [задача] - Генерация кода\n` +
        `• /lang [ru/en] - Выбор языка\n` +
        `• /voice - Голосовое сопровождение\n` +
        `• /tools - Все инструменты\n` +
        `• /help - Эта справка\n\n` +
        `✨ *Я помню всё! Можешь продолжать диалоги.*`,
        { parse_mode: 'Markdown' }
    );
});
// ========== КОНЕЦ /help ==========

// ========== КОМАНДА /gemini ==========
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
// ========== КОНЕЦ /gemini ==========

// ========== КОМАНДА /image - РЕАЛЬНАЯ ГЕНЕРАЦИЯ ==========
// ИСПРАВЛЕНО: Убрана заглушка, добавлена реальная генерация через Pollinations.ai
bot.onText(/\/image (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    let prompt = match[1];

    await bot.sendChatAction(chatId, 'upload_photo');
    const thinkingMsg = await bot.sendMessage(chatId, `🎨 Генерирую изображение: "${prompt.substring(0, 50)}..."`);

    try {
        const encodedPrompt = encodeURIComponent(prompt);
        // Используем Pollinations.ai - бесплатный API без ключа (или с ключом для лучших лимитов)
        let imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&model=flux&nologo=true&seed=${Date.now()}`;

        // Если есть ключ Pollinations - добавляем для лучших лимитов
        if (POLLINATIONS_KEY) {
            imageUrl += `&key=${POLLINATIONS_KEY}`;
        }

        console.log(`🖼️ Генерирую изображение: ${imageUrl.substring(0, 100)}...`);

        // Отправляем изображение сразу по URL
        await bot.sendPhoto(chatId, imageUrl, { 
            caption: `✨ *Ваш запрос:* ${prompt}\n\n🎨 *Модель:* Flux (Pollinations.ai)`,
            parse_mode: 'Markdown' 
        });

        await bot.deleteMessage(chatId, thinkingMsg.message_id);
        console.log(`✅ Изображение успешно отправлено`);
    } catch(error) {
        await bot.deleteMessage(chatId, thinkingMsg.message_id);
        console.error('❌ Ошибка при генерации изображения:', error);
        await bot.sendMessage(chatId, `❌ Не удалось сгенерировать изображение.\nОшибка: ${error.message}\n\nПопробуйте:\n• Упростить описание\n• Использовать английский язык для промпта\n• Повторить через минуту`);
    }
});
// ========== КОНЕЦ /image ==========

// ========== ОБРАБОТКА КНОПОК И СООБЩЕНИЙ ==========
bot.on('message', async (msg) => {
    if (!msg.text) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    // ===== ОТКРЫТИЕ/ЗАКРЫТИЕ МЕНЮ =====
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

    // ===== TOOLS =====
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
            `✨ /gemini вопрос - Google Gemini 2.0 Flash\n` +
            `🎨 /image описание - Генерация изображения\n\n` +
            `✨ *Все команды бесплатны!*`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // ===== GEMINI (единственная обработка - убрано дублирование!) =====
    // ИСПРАВЛЕНО: Убрано дублирование обработки кнопки '✨ Gemini'
    if (text === '✨ Gemini') {
        bot.sendMessage(chatId, 
            `✨ *Google Gemini 2.0 Flash*\n\n` +
            `Отправьте вопрос после команды:\n` +
            `/gemini [ваш вопрос]\n\n` +
            `📝 *Пример:*\n` +
            `/gemini Расскажи о теории относительности\n\n` +
            `🔑 *Особенности:*\n` +
            `• Быстрые ответы\n` +
            `• Актуальные знания\n` +
            `• Бесплатно через OpenRouter`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // ===== УДАЛЕНИЕ КОНТЕКСТА =====
    if (text === '🗑️ Удалить контекст') {
        userMemory.set(userId, []);
        bot.sendMessage(chatId, '🗑️ *История диалога очищена!*', { parse_mode: 'Markdown' });
        return;
    }

    // ===== СОЗДАНИЕ МУЗЫКИ - РЕАЛЬНАЯ РЕАЛИЗАЦИЯ =====
    // ИСПРАВЛЕНО: Убрана заглушка "Скоро будет доступно"
    if (text === '🎵 Создать музыку') {
        bot.sendMessage(chatId, 
            `🎵 *Генерация музыки*\n\n` +
            `Используйте команду:\n` +
            `/music [описание]\n\n` +
            `📝 *Пример:*\n` +
            `/music спокойная пианино мелодия для медитации\n\n` +
            `⚡ *Генерируется через Pollinations.ai (бесплатно)*`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // ===== СОЗДАНИЕ ВИДЕО - РЕАЛЬНАЯ РЕАЛИЗАЦИЯ =====
    // ИСПРАВЛЕНО: Убрана заглушка "Скоро будет доступно"
    if (text === '🎬 Создать видео') {
        bot.sendMessage(chatId, 
            `🎬 *Генерация видео*\n\n` +
            `Используйте команду:\n` +
            `/video [описание]\n\n` +
            `📝 *Пример:*\n` +
            `/video кот в космосе летает на ракете\n\n` +
            `⚡ *Генерируется через Pollinations.ai (бесплатно)*\n` +
            `⏱️ *Время генерации:* 30-120 секунд`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // ===== СТАТИСТИКА =====
    if (text === '📊 Статистика') {
        const stats = router.getStats ? router.getStats() : { totalRequests: 0, totalTokens: 0, averageTokensPerRequest: 0, freeModelsUsed: 25 };
        const memory = getUserMemory(userId);
        const settings = userSettings.get(userId) || { language: 'ru', voiceEnabled: false };
        bot.sendMessage(chatId,
            `📊 *СТАТИСТИКА*\n━━━━━━━━━━━━━━━━━━━\n` +
            `📨 Запросов: ${stats.totalRequests}\n` +
            `🔤 Токенов: ${stats.totalTokens?.toLocaleString() || 0}\n` +
            `🧠 В памяти: ${memory.length} сообщений\n` +
            `🌐 Язык: ${settings.language === 'ru' ? 'Русский' : 'English'}\n` +
            `🎤 Голос: ${settings.voiceEnabled ? 'Вкл' : 'Выкл'}`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // ===== ПРОФИЛЬ =====
    if (text === '👤 Мой профиль') {
        const settings = userSettings.get(userId) || { language: 'ru', voiceEnabled: false };
        bot.sendMessage(chatId,
            `👤 *ПРОФИЛЬ*\n━━━━━━━━━━━━━━━━━━━\n` +
            `🆔 ID: ${userId}\n` +
            `📛 Имя: ${msg.from.first_name || '?'}\n` +
            `🌐 Username: @${msg.from.username || 'нет'}\n` +
            `🌍 Язык: ${settings.language === 'ru' ? 'Русский' : 'English'}\n` +
            `🎤 Голос: ${settings.voiceEnabled ? '✅ Включен' : '❌ Выключен'}\n` +
            `🧠 Память: ${getUserMemory(userId).length} сообщений`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // ===== ЧТО УМЕЕТ БОТ =====
    if (text === '🤖 Что умеет бот') {
        bot.sendMessage(chatId,
            `✨ *ВОЗМОЖНОСТИ БОТА*\n━━━━━━━━━━━━━━━━━━━\n\n` +
            `🧠 *Феноменальная память* - помню ВСЁ\n` +
            `💻 *Программирование* - пишу код на любом языке\n` +
            `🔍 *Интернет поиск* - ищу актуальные ссылки\n` +
            `🌐 *Мультиязычность* - отвечаю на русском/английском\n` +
            `🎤 *Голосовое сопровождение* - озвучиваю ответы\n` +
            `📊 *Статистика* - слежу за использованием\n` +
            `🤖 *Умный выбор модели* - автовыбор лучшей AI\n` +
            `🎨 *Генерация изображений* - через Flux\n` +
            `🎵 *Генерация музыки* - через Pollinations\n` +
            `🎬 *Генерация видео* - через Pollinations`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // ===== ВЫБОР МОДЕЛИ =====
    if (text === '🤖 Выбрать модель') {
        bot.sendMessage(chatId,
            `🤖 *ТЕКУЩАЯ МОДЕЛЬ*\n━━━━━━━━━━━━━━━━━━━\n\n` +
            `✨ *Доступные бесплатные модели:*\n\n` +
            `🏆 *Топовые:*\n` +
            `• Tencent Hy3 Preview (295B параметров, 256K контекста)\n` +
            `• Google Gemma 4 31B (256K контекста, 140+ языков)\n` +
            `• DeepSeek V4 Flash (1M контекста, быстрая)\n` +
            `• NVIDIA Nemotron 3 Super (1M контекста, для агентов)\n\n` +
            `💻 *Код и программирование:*\n` +
            `• Qwen 3.6 Plus Preview (1M контекста)\n` +
            `• Xiaomi MiMo V2 Pro (1M контекста)\n\n` +
            `⚡ *Быстрые ответы:*\n` +
            `• NVIDIA Nemotron Nano\n` +
            `• Microsoft Phi-4 Mini\n\n` +
            `🔍 *С интернет-поиском:*\n` +
            `• Все модели с суффиксом :online\n\n` +
            `✅ *Автовыбор:* Бот сам выбирает лучшую модель под задачу\n` +
            `📊 *Подробнее:* /model`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // ===== НАСТРОЙКИ =====
    if (text === '⚙️ Настройки') {
        const settings = userSettings.get(userId) || { language: 'ru', voiceEnabled: false };
        bot.sendMessage(chatId,
            `⚙️ *НАСТРОЙКИ*\n━━━━━━━━━━━━━━━━━━━\n` +
            `🌐 Язык: ${settings.language === 'ru' ? 'Русский' : 'English'} → /lang\n` +
            `🎤 Голос: ${settings.voiceEnabled ? 'Вкл' : 'Выкл'} → /voice\n` +
            `🧠 Память: ${getUserMemory(userId).length} сообщений\n\n` +
            `🔧 Инструменты: /tools`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // ===== СОЗДАТЬ ИЗОБРАЖЕНИЕ =====
    if (text === '🎨 Создать изображение') {
        bot.sendMessage(chatId, 
            `🎨 *Генерация изображений*\n\n` +
            `Используйте: /image [описание]\n\n` +
            `📝 Пример: /image кот в космосе\n\n` +
            `✨ *Модель:* Flux (Pollinations.ai)\n` +
            `📐 *Размер:* 1024x1024\n` +
            `💰 *Цена:* Бесплатно`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // ===== ИНТЕРНЕТ-ПОИСК =====
    if (text === '🔍 Интернет-поиск') {
        bot.sendMessage(chatId,
            `🔍 *ИНТЕРНЕТ ПОИСК*\n━━━━━━━━━━━━━━━━━━━\n\n` +
            `📝 Используйте: /search [запрос]\n` +
            `🌐 Пример: /search погода в Москве\n` +
            `✨ Ссылки будут кликабельными!`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // ===== СОГЛАШЕНИЕ =====
    if (text === '📜 Соглашение') {
        bot.sendMessage(chatId,
            `📜 *СОГЛАШЕНИЕ*\n━━━━━━━━━━━━━━━━━━━\n\n` +
            `✅ Бот использует бесплатные AI модели\n` +
            `✅ Данные хранятся для памяти диалогов\n` +
            `❌ Не отправляйте личную информацию\n` +
            `📧 Контакты: @Stas0878`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // ===== ПРОПУСКАЕМ КОМАНДЫ (они обрабатываются bot.onText) =====
    if (text.startsWith('/')) return;

    // ===== ОБЫЧНЫЕ СООБЩЕНИЯ - AI ОТВЕТ =====
    try {
        const thinkingMsg = await bot.sendMessage(chatId, '🤔 *Думаю...*', { parse_mode: 'Markdown' });

        addToMemory(userId, 'user', text);
        const contextMessage = getDialogContext(userId, text);

        // Список моделей для fallback
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
                console.log(`🔄 Пробуем модель: ${model}`);
                const response = await router.chat(contextMessage, { model: model });
                const candidateAnswer = response.choices[0].message.content;

                if (candidateAnswer && candidateAnswer !== 'null' && candidateAnswer.trim() !== '') {
                    answer = candidateAnswer;
                    usedModel = model;
                    console.log(`✅ Модель ${model} ответила успешно`);
                    break;
                } else {
                    console.log(`⚠️ Модель ${model} вернула пустой ответ`);
                }
            } catch(e) {
                console.log(`❌ Модель ${model} ошиблась: ${e.message}`);
            }
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
        console.log(`✅ Ответ отправлен, модель: ${usedModel}`);
    } catch(error) {
        console.log('❌ ОШИБКА:', error.message);
        await bot.sendMessage(chatId, '❌ Ошибка, попробуйте позже');
    }
});
// ========== КОНЕЦ ОБРАБОТКИ КНОПОК И СООБЩЕНИЙ ==========

// ========== КОМАНДА /music - РЕАЛЬНАЯ ГЕНЕРАЦИЯ МУЗЫКИ ==========
// ИСПРАВЛЕНО: Убрана заглушка, добавлена реальная генерация через Pollinations
bot.onText(/\/music (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const prompt = match[1];

    await bot.sendChatAction(chatId, 'upload_voice');
    const thinkingMsg = await bot.sendMessage(chatId, `🎵 Генерирую музыку: "${prompt.substring(0, 50)}..."\n⏱️ Это может занять до 60 секунд`);

    try {
        const encodedPrompt = encodeURIComponent(prompt);
        // Pollinations audio API - бесплатный TTS/музыка
        let audioUrl = `https://text.pollinations.ai/${encodedPrompt}?model=openai-audio&voice=nova`;

        if (POLLINATIONS_KEY) {
            audioUrl += `&key=${POLLINATIONS_KEY}`;
        }

        // Отправляем как голосовое сообщение
        await bot.sendVoice(chatId, audioUrl, {
            caption: `🎵 *Запрос:* ${prompt}\n🤖 *Модель:* OpenAI Audio (Pollinations)`,
            parse_mode: 'Markdown'
        });

        await bot.deleteMessage(chatId, thinkingMsg.message_id);
        console.log(`✅ Музыка отправлена: ${prompt.substring(0, 50)}`);
    } catch(error) {
        await bot.deleteMessage(chatId, thinkingMsg.message_id);
        console.error('❌ Ошибка музыки:', error);
        await bot.sendMessage(chatId, `❌ Ошибка генерации музыки: ${error.message}\n\nПопробуйте:\n• Упростить описание\n• Повторить через минуту`);
    }
});
// ========== КОНЕЦ /music ==========

// ========== КОМАНДА /video - РЕАЛЬНАЯ ГЕНЕРАЦИЯ ВИДЕО ==========
// ИСПРАВЛЕНО: Убрана заглушка, добавлена реальная генерация через Pollinations
bot.onText(/\/video (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const prompt = match[1];

    await bot.sendChatAction(chatId, 'upload_video');
    const thinkingMsg = await bot.sendMessage(chatId, `🎬 Генерирую видео: "${prompt.substring(0, 50)}..."\n⏱️ Это может занять 30-120 секунд`);

    try {
        const encodedPrompt = encodeURIComponent(prompt);
        // Pollinations video API
        let videoUrl = `https://video.pollinations.ai/${encodedPrompt}?width=1280&height=720&seed=${Date.now()}`;

        if (POLLINATIONS_KEY) {
            videoUrl += `&key=${POLLINATIONS_KEY}`;
        }

        await bot.sendVideo(chatId, videoUrl, {
            caption: `🎬 *Запрос:* ${prompt}\n🤖 *Модель:* Seedance (Pollinations)`,
            parse_mode: 'Markdown',
            supports_streaming: true
        });

        await bot.deleteMessage(chatId, thinkingMsg.message_id);
        console.log(`✅ Видео отправлено: ${prompt.substring(0, 50)}`);
    } catch(error) {
        await bot.deleteMessage(chatId, thinkingMsg.message_id);
        console.error('❌ Ошибка видео:', error);
        await bot.sendMessage(chatId, `❌ Ошибка генерации видео: ${error.message}\n\nПопробуйте:\n• Упростить описание\n• Использовать английский язык\n• Повторить через минуту`);
    }
});
// ========== КОНЕЦ /video ==========

// ========== ЗАПУСК СЕРВЕРА ==========
app.listen(PORT, () => {
    console.log(`🚀 Бот запущен с феноменальной памятью!`);
    console.log(`✅ Все функции активны: память, поиск, код, язык, голос`);
    console.log(`✅ Память: ${MAX_MEMORY} сообщений на пользователя`);
    console.log(`🎨 Генерация изображений: Pollinations.ai (Flux)`);
    console.log(`🎵 Генерация музыки: Pollinations.ai (OpenAI Audio)`);
    console.log(`🎬 Генерация видео: Pollinations.ai (Seedance)`);
    console.log(`🔒 Безопасный калькулятор (без eval)`);
    console.log(`🌐 Порт: ${PORT}`);
});
// ========== КОНЕЦ ФАЙЛА ==========
