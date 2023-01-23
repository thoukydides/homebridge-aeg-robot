// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { PlatformAccessory, Service } from 'homebridge';

import { AEGAccessory } from './accessory';
import { AEGPlatform } from './platform';
import { AEGRobot, DynamicStatus, StatusEvent,
         SimpleActivity } from './aeg-robot';
import { Battery, PowerMode, CleaningCommand } from './aegapi-types';
import { HideService } from './config-types';
import { assertIsBoolean, assertIsNumber, assertIsString, gcd } from './utils';
import { PLUGIN_VERSION } from './settings';

// A Homebridge AEG RX 9 / Electrolux Pure i9 accessory handler
export class AEGRobotAccessory extends AEGAccessory {

    // Plugin configuration
    readonly config = this.platform.config;

    // Create a new AEG RX 9 / Electrolux Pure i9 accessory
    constructor(
        platform: AEGPlatform, accessory: PlatformAccessory,
        readonly robot: AEGRobot
    ) {
        super(platform, accessory, robot.status.name);
        this.log = robot.log;

        // Add all of the required services (first to be added is the primary)
        const support = (service: HideService): boolean =>
            !this.config.hideServices.includes(service);
        this.addAccessoryInformation();
        if (support('Switch Clean'))        this.addSwitchClean();
        if (support('Switch Home'))         this.addSwitchHome();
        if (support('Fan'))                 this.addFan();
        if (support('Contact Sensor'))      this.addContactSensor();
        if (support('Occupancy Sensor'))    this.addOccupancySensor();
        if (support('Battery'))             this.addBattery();
        if (support('Filter Maintenance'))  this.addFilterMaintenance();

        // Set or clear long term error state
        this.onRobot('isError', (err?: unknown) => this.setError(err));

        // Check and tidy services after the accessory has been configured
        this.cleanupServices();
    }

    // Prepare the Accessory Information service (no need to add it)
    addAccessoryInformation(): void {
        // Set static values
        const service = this.makeService(this.Service.AccessoryInformation)
            .updateCharacteristic(this.Characteristic.Manufacturer,        this.robot.brand)
            .updateCharacteristic(this.Characteristic.Model,               this.robot.model)
            .updateCharacteristic(this.Characteristic.SerialNumber,        this.robot.sn)
            .updateCharacteristic(this.Characteristic.FirmwareRevision,    PLUGIN_VERSION)
            .updateCharacteristic(this.Characteristic.HardwareRevision,    this.robot.hardware);

        // Update other characteristics when there is an update
        this.onRobot('firmware', (firmware: string) => {
            this.log.debug(`Software Revision <= ${firmware}`);
            service.updateCharacteristic(this.Characteristic.SoftwareRevision, firmware);
        }).onRobot('name', (name: string) => {
            this.log.debug(`Name <= "${name}"`);
            service.updateCharacteristic(this.Characteristic.Name, name);
            service.updateCharacteristic(this.Characteristic.ConfiguredName, name);
        });

        // Rename the robot
        service.getCharacteristic(this.Characteristic.ConfiguredName).onSet((value) => {
            assertIsString(value);
            this.log.debug(`Configured Name => "${value}"`);
            this.robot.setName(value);
        });
    }

    // Add a Battery service
    addBattery(): void {
        const service = this.makeService(this.Service.Battery);

        // Update characteristics when there is an update
        this.onRobot('battery', (battery?: Battery) => {
            const percent = Math.round(100 * ((battery ?? Battery.Dead) - Battery.Dead)
                                       / (Battery.FullyCharged - Battery.Dead));
            this.log.debug(`Battery Level <= ${percent}%`);
            service.updateCharacteristic(this.Characteristic.BatteryLevel, percent);
        }).onRobot('isBatteryLow', (isBatteryLow?: boolean) => {
            const state = isBatteryLow !== false ? 'BATTERY_LEVEL_LOW' : 'BATTERY_LEVEL_NORMAL';
            this.log.debug(`Status Low Battery <= ${state}`);
            service.updateCharacteristic(this.Characteristic.StatusLowBattery,
                                         this.Characteristic.StatusLowBattery[state]);
        }).onRobot('isCharging', (isCharging?: boolean) => {
            const state = isCharging === undefined ? 'NOT_CHARGEABLE'
                          : (isCharging ? 'CHARGING' : 'NOT_CHARGING');
            this.log.debug(`Charging State <= ${state}`);
            service.updateCharacteristic(this.Characteristic.ChargingState,
                                         this.Characteristic.ChargingState[state]);
        });
    }

    // Add a Filter Maintenance service to indicate when the dustbin is full
    addFilterMaintenance(): void {
        const service = this.makeService(this.Service.FilterMaintenance, 'Dustbin');

        // Update characteristics when there is an update
        this.onRobot('isDustbinEmpty', (isDustbinEmpty?: boolean) => {
            const state = isDustbinEmpty === false ? 'CHANGE_FILTER' : 'FILTER_OK';
            this.log.debug(`Filter Change Indication <= ${state}`);
            service.updateCharacteristic(this.Characteristic.FilterChangeIndication,
                                         this.Characteristic.FilterChangeIndication[state]);
        });
    }

    // Add an Contact Sensor service to indicate being on the charging dock
    addContactSensor(): void {
        const service = this.makeService(this.Service.ContactSensor, 'Docked');

        // Update values when they change
        this.onRobot('isDocked', (isDocked?: boolean) => {
            const state = isDocked === true ? 'CONTACT_DETECTED' : 'CONTACT_NOT_DETECTED';
            this.log.debug(`Contact Sensor State <= ${state}`);
            service.updateCharacteristic(this.Characteristic.ContactSensorState,
                                         this.Characteristic.ContactSensorState[state]);
        });
        this.addContactOccupancySensorCharacteristics(service, 'Contact Sensor');
    }

    // Add an Occupancy Sensor service to indicate being on the charging dock
    addOccupancySensor(): void {
        const service = this.makeService(this.Service.OccupancySensor, 'Dock Occupied');

        // Update values when they change
        this.onRobot('isDocked', (isDocked?: boolean) => {
            const state = isDocked === true ? 'OCCUPANCY_DETECTED' : 'OCCUPANCY_NOT_DETECTED';
            this.log.debug(`Occupancy Detected <= ${state}`);
            service.updateCharacteristic(this.Characteristic.OccupancyDetected,
                                         this.Characteristic.OccupancyDetected[state]);
        });
        this.addContactOccupancySensorCharacteristics(service, 'Occupancy Sensor');
    }

    // Update common Contact or Occupancy Sensor characteristics
    addContactOccupancySensorCharacteristics(service: Service, type: string): void {
        this.onRobot('isBatteryLow', (isBatteryLow?: boolean) => {
            const state = isBatteryLow !== false ? 'BATTERY_LEVEL_LOW' : 'BATTERY_LEVEL_NORMAL';
            this.log.debug(`Status Low Battery (${type}) <= ${state}`);
            service.updateCharacteristic(this.Characteristic.StatusLowBattery,
                                         this.Characteristic.StatusLowBattery[state]);
        }).onRobot('isActive', (isActive?: boolean) => {
            const state = isActive === true;
            this.log.debug(`Status Active (${type}) <= ${state}`);
            service.updateCharacteristic(this.Characteristic.StatusActive, state);
        }).onRobot('isFault', (isFault?: boolean) => {
            const state = isFault !== false ? 'GENERAL_FAULT' : 'NO_FAULT';
            this.log.debug(`Status Fault (${type}) <= ${state}`);
            service.updateCharacteristic(this.Characteristic.StatusFault,
                                         this.Characteristic.StatusFault[state]);
        });
    }

    // Add a Fan service to control cleaning and power mode
    addFan(): void {
        const service = this.makeService(this.Service.Fanv2, 'Power Mode');

        // Mapping from power mode to fan rotation speed
        const powerPercent: Record<PowerMode, number> = {
            [PowerMode.Quiet]:  25,
            [PowerMode.Smart]:  50,
            [PowerMode.Power]: 100
        };
        const percentToPower = (percent: number): PowerMode => {
            const powers = [PowerMode.Quiet, PowerMode.Smart, PowerMode.Power];
            const diffs = powers.map(power => Math.abs(powerPercent[power] - percent));
            return powers[diffs.indexOf(Math.min(...diffs))];
        };

        // Restrict the supported Rotation Speed values
        const powerPercentValues = Object.values(powerPercent);
        service.getCharacteristic(this.Characteristic.RotationSpeed)
            .setProps({
                minValue:       0,
                maxValue:       Math.max(...powerPercentValues),
                minStep:        gcd(...powerPercentValues),
                validValues:    [0, ...powerPercentValues]
            });

        // Update characteristics when there is an update
        this.onRobot('isBusy', (isBusy?: boolean) => {
            const state = isBusy ? 'ACTIVE' : 'INACTIVE';
            this.log.debug(`Active (Fan) <= ${state}`);
            service.updateCharacteristic(this.Characteristic.Active,
                                         this.Characteristic.Active[state]);
        }).onRobot('simpleActivity', (activity?: SimpleActivity) => {
            const state = activity === SimpleActivity.Clean ? 'BLOWING_AIR'
                          : (activity === SimpleActivity.Pitstop ? 'IDLE' : 'INACTIVE');
            this.log.debug(`Current Fan State <= ${state}`);
            service.updateCharacteristic(this.Characteristic.CurrentFanState,
                                         this.Characteristic.CurrentFanState[state]);
        }).onRobot('power', (power?: PowerMode) => {
            const percent = power === undefined ? 0 : powerPercent[power];
            this.log.debug(`Rotation Speed <= ${percent}%`);
            service.updateCharacteristic(this.Characteristic.RotationSpeed, percent);
        });

        // Start or pause/resume cleaning
        service.getCharacteristic(this.Characteristic.Active).onSet((value) => {
            assertIsNumber(value);
            const command = value === this.Characteristic.Active.ACTIVE ? 'Play' : 'Pause';
            this.log.debug(`Active => ${value} => ${command}`);
            this.robot.setActivity(CleaningCommand[command]);
        });

        // Change cleaning power mode
        service.getCharacteristic(this.Characteristic.RotationSpeed).onSet((value) => {
            assertIsNumber(value);
            if (value === 0) {
                this.log.debug(`Rotation Speed => ${value} => Pause`);
                this.robot.setActivity(CleaningCommand.Pause);
            } else {
                const power = percentToPower(value);
                this.log.debug(`Rotation Speed => ${value} => Clean ${power}`);
                this.robot.setPower(power);
                this.robot.setActivity(CleaningCommand.Play);
            }
        });
    }

    // Add a Switch service to start or pause/resume cleaning
    addSwitchClean(): void {
        const service = this.makeService(this.Service.Switch, 'Cleaning');

        // Update characteristics when there is an update
        this.onRobot('isBusy', (isBusy?: boolean) => {
            const state = isBusy === true;
            this.log.debug(`On (Clean) <= ${state}`);
            service.updateCharacteristic(this.Characteristic.On, state);
        });

        // Start or pause/resume cleaning
        service.getCharacteristic(this.Characteristic.On).onSet((value) => {
            assertIsBoolean(value);
            const command = value ? 'Play' : 'Pause';
            this.log.debug(`On (Clean) => ${value} => ${command}`);
            this.robot.setActivity(CleaningCommand[command]);
        });
    }

    // Add a Switch service to initiate a return to Home
    addSwitchHome(): void {
        const service = this.makeService(this.Service.Switch, 'Return Home', 'home');

        // Update characteristics when there is an update
        this.onRobot('simpleActivity', (activity?: SimpleActivity) => {
            const state = activity === SimpleActivity.Return;
            this.log.debug(`On (Home) <= ${state}`);
            service.updateCharacteristic(this.Characteristic.On, state);
        });

        // Return to the charging dock or pause returning
        service.getCharacteristic(this.Characteristic.On).onSet((value) => {
            assertIsBoolean(value);
            const command = value ? 'Home' : 'Pause';
            this.log.debug(`On (Home) => ${value} => ${command}`);
            this.robot.setActivity(CleaningCommand[command]);
        });
    }

    // Install a handler for a robot event and call it immediately with the current status
    onRobot<Event extends StatusEvent>(event: Event, listener: (newValue: DynamicStatus[Event]) => void): this {
        this.robot.on(event, listener);
        listener(this.robot.status[event]);
        return this;
    }
}