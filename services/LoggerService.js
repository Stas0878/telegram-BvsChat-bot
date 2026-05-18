/**
 * FileLogger - Логирование в файлы
 */

const fs = require('fs').promises;
const path = require('path');

class FileLogger {
    constructor(logDir = './logs') {
        this.logDir = logDir;
        this._ensureDir();
    }

    async _ensureDir() {
        try { await fs.mkdir(this.logDir, { recursive: true }); } catch(e) {}
    }

    async log(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = { timestamp, level, message, data };
        console.log(`[${level.toUpperCase()}] ${timestamp} - ${message}`);
        try {
            const date = timestamp.split('T')[0];
            const filename = path.join(this.logDir, `${date}.log`);
            await fs.appendFile(filename, JSON.stringify(logEntry) + '\n');
        } catch(e) {}
    }

    error(message, data) { return this.log('error', message, data); }
    warn(message, data) { return this.log('warn', message, data); }
    info(message, data) { return this.log('info', message, data); }
    debug(message, data) { return this.log('debug', message, data); }
}

module.exports = FileLogger;