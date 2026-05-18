/**
 * AgentTools - Инструменты для AI агента
 */

const crypto = require('crypto');

class AgentTools {
    static calculator(expression) {
        try {
            const safeEval = new Function('Math', `return ${expression}`);
            const result = safeEval(Math);
            return { success: true, result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    static statistics(numbers) {
        if (!numbers || !numbers.length) return { error: 'Empty array' };
        const sum = numbers.reduce((a, b) => a + b, 0);
        const mean = (sum / numbers.length).toFixed(2);
        const sorted = [...numbers].sort((a, b) => a - b);
        const median = numbers.length % 2 === 0 
            ? (sorted[numbers.length/2 - 1] + sorted[numbers.length/2]) / 2 
            : sorted[Math.floor(numbers.length/2)];
        
        const freq = {};
        numbers.forEach(n => freq[n] = (freq[n] || 0) + 1);
        let maxFreq = 0, modes = [];
        for (const [num, count] of Object.entries(freq)) {
            if (count > maxFreq) { maxFreq = count; modes = [num]; }
            else if (count === maxFreq) modes.push(num);
        }
        const mode = modes.length === Object.keys(freq).length ? null : modes.map(Number);
        
        return { mean, median, mode, sum, count: numbers.length };
    }

    static encrypt(text, key) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', crypto.createHash('sha256').update(key).digest(), iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return { encrypted, iv: iv.toString('hex') };
    }

    static decrypt(encrypted, key, ivHex) {
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', crypto.createHash('sha256').update(key).digest(), iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    static matrixOperations(operation, matrix) {
        if (operation === 'determinant' && matrix.length === 2 && matrix[0].length === 2) {
            return { result: matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0] };
        }
        return { error: 'Only 2x2 matrix supported for determinant' };
    }

    static estimateComplexity(text) {
        const words = text.split(/\s+/).length;
        const hasCode = /```|def |class |function |import |const |let |var |if |else |for |while/i.test(text);
        const hasReasoning = /explain|analyze|compare|why|think|reason|calculate|solve|derive|prove|step by step/i.test(text);
        const hasMultiStep = /step|then|after|finally|process|first|second|third|next/i.test(text);
        const hasTechnical = /quantum|algorithm|mathematical|theorem|neural|network|database|architecture/i.test(text);
        
        let score = 0;
        if (words < 20) score = 0;
        else if (words < 100) score = 1;
        else if (words < 500) score = 2;
        else score = 3;
        
        if (hasCode) score += 1;
        if (hasReasoning) score += 1;
        if (hasMultiStep) score += 1;
        if (hasTechnical) score += 1;
        
        score = Math.min(score, 3);
        const levels = ['SIMPLE', 'MODERATE', 'COMPLEX', 'VERY_COMPLEX'];
        return levels[score];
    }

    static encode(text) { return Buffer.from(text).toString('base64'); }
    static decode(text) { return Buffer.from(text, 'base64').toString('utf-8'); }
    static hash(text, algorithm = 'sha256') { return crypto.createHash(algorithm).update(text).digest('hex'); }

    static validate(text, type = 'email') {
        const patterns = {
            email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            url: /^https?:\/\/.+/,
            phone: /^\+?[\d\s-()]{10,}$/,
            ipv4: /^(\d{1,3}\.){3}\d{1,3}$/,
        };
        const pattern = patterns[type];
        if (!pattern) return { success: false, error: `Unknown type: ${type}` };
        return { success: pattern.test(text) };
    }

    static random(min = 0, max = 100) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    
    static formatDate(date = new Date(), format = 'YYYY-MM-DD HH:mm:ss') {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        return format.replace('YYYY', year).replace('MM', month).replace('DD', day).replace('HH', hours).replace('mm', minutes).replace('ss', seconds);
    }
}

module.exports = AgentTools;