/**
 * TTLMemoryCache - Кэш с временем жизни
 */

class TTLMemoryCache {
    constructor(maxSize = 100, ttlMs = 3600000) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
    }

    set(key, value) {
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, { value, expires: Date.now() + this.ttlMs });
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        if (Date.now() > item.expires) {
            this.cache.delete(key);
            return null;
        }
        return item.value;
    }

    clear() { this.cache.clear(); }
    size() { return this.cache.size; }
}

module.exports = TTLMemoryCache;