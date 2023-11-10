// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Characteristic, CharacteristicValue, HAPStatus, Logger, Nullable,
         Perms, PlatformAccessory, Service } from 'homebridge';

import { AEGPlatform } from './platform';
import { AEGAPIAuthorisationError } from './aegapi-error';

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
    }

    // Get or add a service
    makeService(serviceConstructor: ServiceConstructor, displayName = '', subtype?: string): Service {
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
        if (displayName.length) this.addServiceName(service, displayName);

        // Return the service
        return service;
    }

    // Add a read-only Configured Name characteristic
    addServiceName(service: Service, displayName: string) {
        if (!service.testCharacteristic(this.Characteristic.ConfiguredName)) {
            service.addOptionalCharacteristic(this.Characteristic.ConfiguredName);
        }
        service.getCharacteristic(this.Characteristic.ConfiguredName)
            .updateValue(displayName)
            .setProps({ perms: [Perms.NOTIFY, Perms.PAIRED_READ] });
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
                     || services.find(service => service.UUID !== Service.AccessoryInformation.UUID)
                     || services[0];
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