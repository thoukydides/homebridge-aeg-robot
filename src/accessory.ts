// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Characteristic, CharacteristicValue, HAPStatus, Logger, Nullable,
         Perms, PlatformAccessory, Service } from 'homebridge';

import { AEGPlatform } from './platform';
import { AEGAPIAuthorisationError } from './aegapi-error';
import { assertIsString, logError } from './utils';
import { getItem, setItem } from 'node-persist';

// Characteristic used to indicate a long-term error state
interface ErrorCharacteristic {
    characteristic: Characteristic;
    originalValue:  Nullable<CharacteristicValue>;
}

// A HAP Service constructor
type ServiceConstructor = typeof Service & {
    new (displayName?: string, subtype?: string): Service;
    UUID: string;
};

// A Homebridge platform accessory handler
export class AEGAccessory {
    readonly Service;
    readonly Characteristic;
    readonly HapStatusError;
    log: Logger;

    // Services restored from cache but not longer required
    private readonly obsoleteServices;

    // The primary service
    private primaryService?: Service;

    // Service names set via HomeKit
    customNames: Record<string, string> = {};
    persistPromise?: Promise<void>;

    // Characteristic used to indicate a long-term error state
    private errorCharacteristic?: ErrorCharacteristic;

    // Create a accessory handler
    constructor(
        readonly platform:  AEGPlatform,
        readonly accessory: PlatformAccessory,
        readonly name:      string
    ) {
        this.Service          = platform.hb.hap.Service;
        this.Characteristic   = platform.hb.hap.Characteristic;
        this.HapStatusError   = platform.hb.hap.HapStatusError;
        this.log              = platform.log;
        this.obsoleteServices = [...this.accessory.services];

        // Load any persistent data
        this.persistPromise = this.loadPersist();
    }

    // Get or add a service
    makeService(serviceConstructor: ServiceConstructor, suffix = '', subtype?: string): Service {
        // Use the accessory name as a prefix for the service name
        const displayName = `${this.accessory.displayName} ${suffix}`;

        // Check whether the service already exists
        let service = subtype
                      ? this.accessory.getServiceById(serviceConstructor, subtype)
                      : this.accessory.getService(serviceConstructor);
        if (service) {
            // Remove from the list of obsolete services
            const serviceIndex = this.obsoleteServices.indexOf(service);
            if (serviceIndex !== -1) this.obsoleteServices.splice(serviceIndex, 1);
        } else {
            // Create a new service
            this.log.debug(`Adding new service "${displayName}"`);
            service = this.accessory.addService(serviceConstructor, displayName, subtype);
        }

        // If this is the first service to be added then select it as the primary
        if (!this.primaryService
            && service.UUID !== this.Service.AccessoryInformation.UUID) {
            service.setPrimaryService(true);
            this.primaryService = service;
        }

        // Add a Configured Name characteristic if a custom name was supplied
        if (suffix.length) this.addServiceName(service, suffix, displayName);

        // Return the service
        return service;
    }

    // Add a read-only Configured Name characteristic
    addServiceName(service: Service, suffix: string, defaultName: string) {
        // Add the configured name characteristic
        if (!service.testCharacteristic(this.Characteristic.ConfiguredName)) {
            service.addOptionalCharacteristic(this.Characteristic.ConfiguredName);
        }
        const characteristic = service.getCharacteristic(this.Characteristic.ConfiguredName);
        characteristic.setProps({ perms: [Perms.NOTIFY, Perms.PAIRED_READ, Perms.PAIRED_WRITE] });
        let currentName = characteristic.value;
        assertIsString(currentName);

        // Set the initial value
        this.withPersist('read-only', async () => {
            if (currentName === this.customNames[suffix]) {
                // Name was set via HomeKit, so preserve it
                this.log.debug(`Preserving ${suffix} service name "${currentName}" set via HomeKit`);
            } else {
                // Probably not changed by the user via HomeKit, so set explicitly
                if (currentName !== defaultName) {
                    if (currentName === '') this.log.debug(`Naming ${suffix} service as "${defaultName}"`);
                    else this.log.info(`Renaming ${suffix} service to "${defaultName}" (was "${currentName}")`);
                }
                characteristic.updateValue(defaultName);
                currentName = defaultName;
            }
        });

        // Monitor changes to the name
        characteristic.onSet(async value => {
            assertIsString(value);
            this.withPersist('read-write', async () => {
                if (value !== currentName) {
                    currentName = value;
                    this.log.debug(`${suffix} Configured Name => "${value}"`);
                    if (value === defaultName) {
                        this.log.info(`Removing HomeKit override on ${suffix} service name`);
                        delete this.customNames[suffix];
                    } else {
                        if (this.customNames[suffix] === undefined)
                            this.log.info(`HomeKit override on ${suffix} service name ("${value}")`);
                        this.customNames[suffix] = value;
                    }
                }
            });
        });
    }

    // Perform an operation using persistent data
    async withPersist(type: 'read-only' | 'read-write', operation: () => Promise<void>): Promise<void> {
        while (this.persistPromise) await this.persistPromise;
        await operation();
        if (type === 'read-write') {
            this.persistPromise = this.savePersist();
            await this.persistPromise;
        }
    }

    // Restore any persistent data
    async loadPersist(): Promise<void> {
        try {
            const persist = await getItem(this.accessory.UUID);
            if (persist) this.customNames = persist.customNames ?? {};
        } catch (err) {
            logError(this.log, 'Load persistent data', err);
        } finally {
            this.persistPromise = undefined;
        }
    }

    // Save changes to the persistent data
    async savePersist(): Promise<void> {
        try {
            await setItem(this.accessory.UUID, { customNames: this.customNames });
        } catch (err) {
            logError(this.log, 'Save persistent data', err);
        } finally {
            this.persistPromise = undefined;
        }
    }

    // Check and tidy services after the accessory has been configured
    cleanupServices(): void {
        // Remove any services that were restored from cache but no longer required
        this.obsoleteServices.forEach(service => {
            this.log.info(`Removing obsolete service "${service.displayName}"`);
            this.accessory.removeService(service);
        });
    }

    // Set or clear a long-term error state
    setError(cause?: unknown): void {
        if (cause === undefined) {
            // Error has cleared, so restore any previous characteristic value
            if (this.errorCharacteristic) {
                const { characteristic, originalValue } = this.errorCharacteristic;
                if (characteristic.value instanceof this.HapStatusError)
                    characteristic.updateValue(originalValue);
            }
        } else {
            // Set the accessory state on the first error
            if (!this.errorCharacteristic) {
                this.errorCharacteristic =
                    AEGAccessory.setError(this.platform, this.accessory, cause);
            }
        }
    }

    // Place an accessory in a long-term error state
    static setError(platform: AEGPlatform, accessory: PlatformAccessory,
                    cause: unknown): ErrorCharacteristic | undefined {
        const { Service, Characteristic, HapStatusError } = platform.hb.hap;

        // Select a service (preferably the primary) to report the error
        const services = accessory.services;
        const service = services.find(service => service.isPrimaryService)
                     ?? services.find(service => service.UUID !== Service.AccessoryInformation.UUID)
                     ?? services[0];
        if (!service) return;

        // Pick a characteristic; ideally one with Perms.NOTIFY
        const characteristic = service.characteristics.find(characteristic =>
            characteristic.UUID !== Characteristic.Name.UUID);
        if (!characteristic) return;

        // Report the error to HomeKit
        const originalValue = characteristic.value;
        const hapStatus = cause instanceof AEGAPIAuthorisationError
                        ? HAPStatus.INSUFFICIENT_AUTHORIZATION
                        : HAPStatus.SERVICE_COMMUNICATION_FAILURE;
        characteristic.updateValue(new HapStatusError(hapStatus));
        return { characteristic, originalValue };
    }
}