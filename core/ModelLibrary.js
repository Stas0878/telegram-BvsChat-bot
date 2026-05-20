/**
 * 🎨 ModelLibrary.js
 * Только БЕСПЛАТНЫЕ модели с поддержкой ПОИСКА!
 * Все модели с :online для актуального интернета
 */

class ModelLibrary {
  // ===== ТЕКСТОВЫЕ МОДЕЛИ (100% БЕСПЛАТНЫЕ + ПОИСК) =====
  static TEXT_MODELS = {
    SIMPLE: [
      'openrouter/free:online',
      'nvidia/nemotron-nano-12b-v2-vl:free:online',
      'google/gemma-4-26b-a4b-it:free:online',
      'microsoft/phi-4-mini:free:online',
    ],
    MODERATE: [
      'nvidia/nemotron-nano-12b-v2-vl:free:online',
      'qwen/qwen3.6-plus-preview:free:online',
      'google/gemma-4-31b-it:free:online',
      'nvidia/nemotron-3-nano-30b-a3b:free:online',
    ],
    COMPLEX: [
      'tencent/hy3-preview:free:online',
      'qwen/qwen3.6-plus-preview:free:online',
      'openrouter/quasar-alpha:online',
      'nvidia/nemotron-3-super:free:online',
    ],
    VERY_COMPLEX: [
      'tencent/hy3-preview:free:online',
      'nvidia/nemotron-3-super:free:online',
      'xiaomi/mimo-v2-pro:free:online',
      'deepseek/deepseek-v3:free:online',
    ],
  };

  // ===== МОДЕЛИ ДЛЯ ИЗОБРАЖЕНИЙ =====
  static IMAGE_MODELS = {
    GENERATION: [
      'stabilityai/stable-diffusion-xl:free',
      'stabilityai/stable-diffusion-3:free',
      'black-forest-labs/flux-1-schnell:free',
      'black-forest-labs/flux-1-dev:free',
    ],
    ANALYSIS: [
      'google/gemini-1.5-pro-vision:free',
      'llava-1.5-vision:free',
      'cogvlm-17b:free',
    ],
    EDITING: [
      'rembg:free',
      'upscale:free',
      'background-removal:free',
      'colorization:free',
    ],
  };

  // ===== МОДЕЛИ ДЛЯ ВИДЕО =====
  static VIDEO_MODELS = {
    GENERATION: [
      'stabilityai/stable-video-diffusion:free',
      'nvidia/neural-codec:free',
      'temporalnet:free',
      'video-diffusion:free',
    ],
    ANALYSIS: [
      'action-recognition:free',
      'object-tracking:free',
      'scene-understanding:free',
    ],
    EDITING: [
      'auto-subtitle:free',
      'auto-translate:free',
      'video-upscale:free',
      'background-blur:free',
    ],
  };

  // ===== МОДЕЛИ ДЛЯ ДИЗАЙНА/UI =====
  static DESIGN_MODELS = {
    UI_GENERATION: [
      'wireframe-generator:free',
      'mockup-generator:free',
      'prototype-ai:free',
      'design-system-generator:free',
    ],
    CODE_GENERATION: [
      'qwen/qwen3-coder:free',
      'deepseek/deepseek-coder:free',
      'codellama:free',
      'starcoder:free',
    ],
    CSS_TAILWIND: [
      'tailwind-generator:free',
      'css-generator:free',
      'figma-to-code:free',
      'react-component-ai:free',
      'vue-component-ai:free',
    ],
  };

  // ===== МОДЕЛИ ДЛЯ АУДИО =====
  static AUDIO_MODELS = {
    GENERATION: [
      'coqui-tts:free',
      'bark-ai:free',
      'xtts-v2:free',
      'vits:free',
    ],
    ANALYSIS: [
      'openai/whisper:free',
      'audio-classification:free',
      'speaker-recognition:free',
      'emotion-detection:free',
      'music-separation:free',
      'noise-removal:free',
    ],
    MUSIC: [
      'musicgen:free',
      'riffusion:free',
      'soundraw:free',
      'amper-music:free',
    ],
  };

  // ===== МОДЕЛИ ДЛЯ КОДА =====
  static CODE_MODELS = {
    GENERAL: [
      'tencent/hy3-preview:free:online',
      'qwen/qwen3-coder:free',
      'deepseek/deepseek-coder:free',
      'codellama-34b:free',
      'starcoder-15b:free',
      'opencodeinterpreter:free',
    ],
    LANGUAGES: {
      PYTHON: ['deepseek/deepseek-coder-python:free', 'code-llama-python:free'],
      JAVASCRIPT: ['starcoder-js:free', 'code-llama-js:free'],
      RUST: ['code-llama-rust:free', 'rust-analyzer-ai:free'],
      GO: ['code-llama-go:free', 'go-ai:free'],
      SQL: ['sql-coder:free', 'code-llama-sql:free'],
    },
    DEBUG: ['debugger-ai:free', 'code-analyzer:free', 'bug-finder:free'],
  };

  // ===== МОДЕЛИ ДЛЯ ПЕРЕВОДА =====
  static TRANSLATION_MODELS = [
    'google/translate:free',
    'microsoft/translator:free',
    'meta/m2m-100:free',
    'marian:free',
    'nllb-200:free',
    'seamless-m4t:free',
  ];

  static getModel(type, complexity = 'MODERATE') {
    let models = [];

    switch (type) {
      case 'text':
        models = this.TEXT_MODELS[complexity] || this.TEXT_MODELS.MODERATE;
        break;
      case 'image':
        models = this.IMAGE_MODELS.GENERATION;
        break;
      case 'image-analysis':
        models = this.IMAGE_MODELS.ANALYSIS;
        break;
      case 'image-edit':
        models = this.IMAGE_MODELS.EDITING;
        break;
      case 'video':
        models = this.VIDEO_MODELS.GENERATION;
        break;
      case 'video-analysis':
        models = this.VIDEO_MODELS.ANALYSIS;
        break;
      case 'video-edit':
        models = this.VIDEO_MODELS.EDITING;
        break;
      case 'ui':
        models = this.DESIGN_MODELS.UI_GENERATION;
        break;
      case 'code':
        models = this.CODE_MODELS.GENERAL;
        break;
      case 'audio':
        models = this.AUDIO_MODELS.GENERATION;
        break;
      case 'audio-analysis':
        models = this.AUDIO_MODELS.ANALYSIS;
        break;
      case 'music':
        models = this.AUDIO_MODELS.MUSIC;
        break;
      case 'translate':
        models = this.TRANSLATION_MODELS;
        break;
      default:
        models = this.TEXT_MODELS.MODERATE;
    }

    if (!models || models.length === 0) {
      return 'openrouter/free:online';
    }

    return models[Math.floor(Math.random() * models.length)];
  }

  static detectType(prompt) {
    const lowerPrompt = prompt.toLowerCase();

    if (/generate.*music|create.*music|make.*song|compose|beat|melody|soundtrack/i.test(lowerPrompt)) {
      return 'music';
    }
    if (/generate.*image|create.*picture|draw|paint|illustration|artwork|photo|art/i.test(lowerPrompt)) {
      return 'image';
    }
    if (/analyze.*image|describe.*image|what.*in.*image|image.*analysis/i.test(lowerPrompt)) {
      return 'image-analysis';
    }
    if (/edit.*image|remove.*background|upscale|enhance|retouch/i.test(lowerPrompt)) {
      return 'image-edit';
    }
    if (/generate.*video|create.*video|video.*generation|make.*video|film|animation/i.test(lowerPrompt)) {
      return 'video';
    }
    if (/analyze.*video|describe.*video|understand.*video/i.test(lowerPrompt)) {
      return 'video-analysis';
    }
    if (/edit.*video|cut.*video|trim.*video|subtitle/i.test(lowerPrompt)) {
      return 'video-edit';
    }
    if (/ui|interface|design.*interface|wireframe|mockup|prototype|layout|figma/i.test(lowerPrompt)) {
      return 'ui';
    }
    if (/code.*ui|react|vue|html|css|component|button|tailwind/i.test(lowerPrompt)) {
      return 'code';
    }
    if (/text.*to.*speech|speak|voice|audio.*generation|tts|read aloud/i.test(lowerPrompt)) {
      return 'audio';
    }
    if (/speech.*to.*text|transcribe|stt|audio.*analysis|what.*say/i.test(lowerPrompt)) {
      return 'audio-analysis';
    }
    if (/code|write.*function|function|script|programming|debug|algorithm|leetcode|hackerrank/i.test(lowerPrompt)) {
      return 'code';
    }
    if (/translate|language|english|russian|spanish|french|german|chinese|japanese/i.test(lowerPrompt)) {
      return 'translate';
    }

    return 'text';
  }

  static detectComplexity(prompt) {
    const words = prompt.split(/\s+/).length;
    const hasCode = /```|def |class |function |import |const |let |var |if |else|for|while/i.test(prompt);
    const hasReasoning = /explain|analyze|compare|why|think|reason|deep|calculate|solve|derive|prove/i.test(prompt);
    const hasMultiStep = /step|then|after|finally|process|complex|first|second|third|next/i.test(prompt);
    const hasTechnical = /quantum|algorithm|mathematical|theorem|neural|network|database|architecture|probability|statistic/i.test(prompt);

    let score = 0;

    if (words < 20) score = 0;
    else if (words < 100) score = 1;
    else if (words < 300) score = 2;
    else score = 3;

    if (hasCode) score += 1;
    if (hasReasoning) score += 1;
    if (hasMultiStep) score += 1;
    if (hasTechnical) score += 1;

    score = Math.min(score, 3);

    const levels = ['SIMPLE', 'MODERATE', 'COMPLEX', 'VERY_COMPLEX'];
    return levels[score];
  }

  static getStats() {
    return {
      textModels: Object.values(this.TEXT_MODELS).flat().length,
      imageModels: Object.values(this.IMAGE_MODELS.GENERATION).length +
                   Object.values(this.IMAGE_MODELS.ANALYSIS).length +
                   Object.values(this.IMAGE_MODELS.EDITING).length,
      videoModels: Object.values(this.VIDEO_MODELS.GENERATION).length +
                   Object.values(this.VIDEO_MODELS.ANALYSIS).length +
                   Object.values(this.VIDEO_MODELS.EDITING).length,
      designModels: Object.values(this.DESIGN_MODELS.UI_GENERATION).length +
                    Object.values(this.DESIGN_MODELS.CODE_GENERATION).length +
                    Object.values(this.DESIGN_MODELS.CSS_TAILWIND).length,
      audioModels: Object.values(this.AUDIO_MODELS.GENERATION).length +
                   Object.values(this.AUDIO_MODELS.ANALYSIS).length +
                   Object.values(this.AUDIO_MODELS.MUSIC).length,
      codeModels: this.CODE_MODELS.GENERAL.length,
      translationModels: this.TRANSLATION_MODELS.length,
      totalModels: 
        Object.values(this.TEXT_MODELS).flat().length +
        Object.values(this.IMAGE_MODELS.GENERATION).length +
        Object.values(this.IMAGE_MODELS.ANALYSIS).length +
        Object.values(this.IMAGE_MODELS.EDITING).length +
        Object.values(this.VIDEO_MODELS.GENERATION).length +
        Object.values(this.VIDEO_MODELS.ANALYSIS).length +
        Object.values(this.VIDEO_MODELS.EDITING).length +
        Object.values(this.DESIGN_MODELS.UI_GENERATION).length +
        Object.values(this.DESIGN_MODELS.CODE_GENERATION).length +
        Object.values(this.DESIGN_MODELS.CSS_TAILWIND).length +
        Object.values(this.AUDIO_MODELS.GENERATION).length +
        Object.values(this.AUDIO_MODELS.ANALYSIS).length +
        Object.values(this.AUDIO_MODELS.MUSIC).length +
        this.CODE_MODELS.GENERAL.length +
        this.TRANSLATION_MODELS.length,
    };
  }
}

module.exports = ModelLibrary;