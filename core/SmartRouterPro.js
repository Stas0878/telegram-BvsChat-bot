/**
 * SuperSmartRouterPro - Главный класс роутера
 */

const axios = require('axios');
const EventEmitter = require('events');
const crypto = require('crypto');
const AgentTools = require('./AgentTools');
const TTLMemoryCache = require('../services/CacheService');
const FileLogger = require('../services/LoggerService');
const RateLimiter = require('../services/RateLimiter');
const ModelLibrary = require('./ModelLibrary');

class SuperSmartRouterPro extends EventEmitter {
    constructor(apiKey, options = {}) {
        super();
        if (!apiKey) throw new Error('OpenRouter API key required');
        
        this.apiKey = apiKey;
        this.baseUrl = options.baseUrl || 'https://openrouter.ai/api/v1/chat/completions';
        this.modelsUrl = options.modelsUrl || 'https://openrouter.ai/api/v1/models';
        this.availableModels = new Set();
        this.logger = new FileLogger(options.logDir || './logs');
        this.cache = new TTLMemoryCache(100, 3600000);
        this.rateLimiter = new RateLimiter(options.rateLimitMax || 60, options.rateLimitWindow || 60000);
        this.stats = { totalRequests: 0, totalTokens: 0, cacheHits: 0, cacheMisses: 0, errors: 0, retries: 0, startTime: Date.now() };
        
        this.logger.info('SuperSmartRouterPro initialized', { apiKey: apiKey.slice(0, 10) + '...' });
        this._fetchAvailableModels();
    }

    async _fetchAvailableModels() {
        try {
            const response = await axios.get(this.modelsUrl, {
                headers: { 'Authorization': `Bearer ${this.apiKey}` }
            });
            if (response.data?.data) {
                this.availableModels = new Set(
                    response.data.data
                        .filter(m => m.id.includes(':free') || m.id.endsWith('-free') || m.name?.toLowerCase().includes('free'))
                        .map(m => m.id)
                );
                this.logger.info('Models loaded', { count: this.availableModels.size });
            }
        } catch (error) {
            this.logger.warn('Failed to fetch models, using fallback', { error: error.message });
            const allModels = Object.values(ModelLibrary.TEXT_MODELS).flat();
            this.availableModels = new Set(allModels);
        }
    }

    async selectModel(prompt, forceComplexity = null) {
        let waited = 0;
        while (this.availableModels.size === 0 && waited < 20) {
            await new Promise(resolve => setTimeout(resolve, 500));
            waited++;
        }
        
        // === ПРОВЕРКА НА АКТУАЛЬНОСТЬ ===
        const needsCurrentInfo = /обновл|актуальн|последн|сейчас|сегодня|202[5-9]|202[6-9]|текущ|новост|погод|курс|свеж/i.test(prompt);
        
        if (needsCurrentInfo) {
            // Все топовые бесплатные модели с поддержкой интернета
            const currentModels = [
                'tencent/hy3-preview:free:online',
                'google/gemma-4-31b-it:free:online',
                'deepseek/deepseek-v4-flash:free:online',
                'nvidia/nemotron-3-super:free:online',
                'qwen/qwen3.6-plus-preview:free:online',
                'xiaomi/mimo-v2-pro:free:online',
                'nvidia/nemotron-3-nano-30b-a3b:free:online',
                'openrouter/quasar-alpha:online',
                'microsoft/phi-4-mini:free:online',
                'google/gemma-4-26b-a4b-it:free:online'
            ];
            for (const model of currentModels) {
                if (this.availableModels.has(model)) {
                    this.logger.info('Model selected for current info', { model });
                    return model;
                }
            }
        }
        // === КОНЕЦ ПРОВЕРКИ ===
        
        // Определяем сложность через AgentTools
        const complexity = forceComplexity || AgentTools.estimateComplexity(prompt);
        
        // Получаем модели из ModelLibrary по сложности
        let candidates = [];
        if (ModelLibrary.TEXT_MODELS && ModelLibrary.TEXT_MODELS[complexity]) {
            candidates = ModelLibrary.TEXT_MODELS[complexity];
        } else {
            candidates = ModelLibrary.TEXT_MODELS?.MODERATE || ['openrouter/free'];
        }
        
        for (const model of candidates) {
            if (this.availableModels.has(model)) return model;
        }
        if (this.availableModels.has('openrouter/free')) return 'openrouter/free';
        const firstAvailable = Array.from(this.availableModels)[0];
        if (firstAvailable) return firstAvailable;
        throw new Error('No suitable free models available');
    }

    async _sendRequestWithRetry(payload, attempt = 0) {
        try {
            const limiterCheck = this.rateLimiter.canMakeRequest();
            if (!limiterCheck.allowed) {
                this.logger.warn('Rate limit exceeded', { waitTime: limiterCheck.waitTime });
                await new Promise(resolve => setTimeout(resolve, limiterCheck.waitTime));
            }
            const response = await axios.post(this.baseUrl, payload, {
                headers: { 'Authorization': `Bearer ${this.apiKey}` },
                timeout: 30000
            });
            return response.data;
        } catch (error) {
            if (attempt < 3 && (error.response?.status >= 500 || error.code === 'ECONNABORTED')) {
                this.stats.retries++;
                const delay = 1000 * (attempt + 1);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this._sendRequestWithRetry(payload, attempt + 1);
            }
            this.stats.errors++;
            throw error;
        }
    }

    async chat(message, options = {}) {
        const { systemPrompt = 'You are a helpful AI assistant.', temperature = 0.7, maxTokens = 2048, forceComplexity = null, useCache = true } = options;
        
        if (useCache) {
            const cacheKey = crypto.createHash('md5').update(message + systemPrompt).digest('hex');
            const cached = this.cache.get(cacheKey);
            if (cached) {
                this.stats.cacheHits++;
                return cached;
            }
            this.stats.cacheMisses++;
        }

        const model = await this.selectModel(message, forceComplexity);
        const payload = {
            model,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }],
            temperature,
            max_tokens: maxTokens,
            top_p: 0.95
        };

        try {
            const response = await this._sendRequestWithRetry(payload);
            this.stats.totalRequests++;
            this.stats.totalTokens += response?.usage?.total_tokens || 0;
            
            if (useCache) {
                const cacheKey = crypto.createHash('md5').update(message + systemPrompt).digest('hex');
                this.cache.set(cacheKey, response);
            }
            return response;
        } catch (error) {
            this.logger.error('Chat failed', { error: error.message });
            throw error;
        }
    }

    getStats() {
        const uptime = Date.now() - this.stats.startTime;
        return {
            totalRequests: this.stats.totalRequests,
            totalTokens: this.stats.totalTokens,
            cacheHits: this.stats.cacheHits,
            cacheMisses: this.stats.cacheMisses,
            cacheSize: this.cache.size(),
            modelsAvailable: this.availableModels.size,
            errors: this.stats.errors,
            retries: this.stats.retries,
            uptime: `${Math.floor(uptime / 1000)}s`
        };
    }
}

module.exports = SuperSmartRouterPro;