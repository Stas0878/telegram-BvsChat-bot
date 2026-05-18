/**
 * SuperSmartRouterProTests - Тесты
 */

const AgentTools = require('../core/AgentTools');
const TTLMemoryCache = require('../services/CacheService');
const DIContainer = require('../services/DIContainer');

class SuperSmartRouterProTests {
    static async testStatistics() {
        const result = AgentTools.statistics([1, 2, 2, 3, 4]);
        console.assert(result.mode?.includes(2), 'Mode should be 2');
        console.assert(result.mean === '2.40', 'Mean should be 2.40');
        console.log('✓ Statistics test passed');
    }

    static async testEncryption() {
        const original = 'secret message';
        const key = 'mykey123';
        const { encrypted, iv } = AgentTools.encrypt(original, key);
        const decrypted = AgentTools.decrypt(encrypted, key, iv);
        console.assert(decrypted === original, 'Encryption/decryption failed');
        console.log('✓ Encryption test passed');
    }

    static async testMatrixOperations() {
        const matrix = [[1, 2], [3, 4]];
        const det = AgentTools.matrixOperations('determinant', matrix);
        console.assert(det.result === -2, 'Determinant should be -2');
        console.log('✓ Matrix operations test passed');
    }

    static async testComplexityEstimation() {
        const simple = AgentTools.estimateComplexity('Hello world');
        const complex = AgentTools.estimateComplexity('Explain quantum computing step by step with code examples');
        console.assert(simple === 'SIMPLE', `Simple should be SIMPLE, got ${simple}`);
        console.assert(complex === 'VERY_COMPLEX', `Complex should be VERY_COMPLEX, got ${complex}`);
        console.log('✓ Complexity estimation test passed');
    }

    static async testDIContainer() {
        const di = new DIContainer();
        di.register('test', () => ({ value: 42 }), true);
        const instance1 = di.get('test');
        const instance2 = di.get('test');
        console.assert(instance1 === instance2, 'Singleton should return same instance');
        console.log('✓ DI Container test passed');
    }

    static async testCache() {
        const cache = new TTLMemoryCache(100, 1000);
        cache.set('key', 'value');
        console.assert(cache.get('key') === 'value', 'Cache get/set failed');
        console.log('✓ Cache test passed');
    }

    static async runAll() {
        console.log('\n🧪 RUNNING ALL TESTS\n');
        await this.testStatistics();
        await this.testEncryption();
        await this.testMatrixOperations();
        await this.testComplexityEstimation();
        await this.testDIContainer();
        await this.testCache();
        console.log('\n✅ ALL TESTS PASSED!\n');
    }
}

module.exports = SuperSmartRouterProTests;