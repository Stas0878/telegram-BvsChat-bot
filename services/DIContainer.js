/**
 * DIContainer - Внедрение зависимостей
 */

class DIContainer {
    constructor() {
        this.services = new Map();
        this.instances = new Map();
    }

    register(name, factory, singleton = false) {
        this.services.set(name, { factory, singleton });
    }

    get(name) {
        const service = this.services.get(name);
        if (!service) throw new Error(`Service ${name} not found`);
        if (service.singleton) {
            if (!this.instances.has(name)) {
                this.instances.set(name, service.factory());
            }
            return this.instances.get(name);
        }
        return service.factory();
    }
}

module.exports = DIContainer;