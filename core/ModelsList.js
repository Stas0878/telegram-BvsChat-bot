/**
 * UNLIMITED_FREE_MODELS - Список бесплатных моделей
 */

const UNLIMITED_FREE_MODELS = {
    SIMPLE: [
        'openrouter/free',
        'meta-llama/llama-2-7b:free',
        'google/gemma-2b-free'
    ],
    MODERATE: [
        'meta-llama/llama-3-8b:free',
        'mistralai/mistral-7b-instruct:free',
        'qwen/qwen1.5-4b-chat-free'
    ],
    COMPLEX: [
        'meta-llama/llama-3-70b:free',
        'deepseek/deepseek-coder:free',
        'nvidia/nemotron-3-8b:free'
    ],
    VERY_COMPLEX: [
        'meta-llama/llama-3.1-405b:free',
        'deepseek/deepseek-v3:free',
        'qwen/qwen3-next-80b:free'
    ]
};

module.exports = { UNLIMITED_FREE_MODELS };