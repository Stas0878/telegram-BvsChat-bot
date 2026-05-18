/**
 * RateLimiter - Контроль лимитов запросов
 */

class RateLimiter {
    constructor(maxRequests = 60, windowMs = 60000) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.requests = [];
    }

    canMakeRequest() {
        const now = Date.now();
        this.requests = this.requests.filter(time => now - time < this.windowMs);
        if (this.requests.length >= this.maxRequests) {
            return { allowed: false, waitTime: this.windowMs - (now - this.requests[0]) };
        }
        this.requests.push(now);
        return { allowed: true };
    }

    getStats() {
        const now = Date.now();
        const activeRequests = this.requests.filter(time => now - time < this.windowMs);
        return {
            currentRequests: activeRequests.length,
            maxRequests: this.maxRequests,
            percentageUsed: Math.round((activeRequests.length / this.maxRequests) * 100)
        };
    }
}

module.exports = RateLimiter;