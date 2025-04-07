// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2024 Alexander Thoukydides

import { ApplianceId, ApplianceInfoDTO, ApplianceStatus, ConnectionState } from './aegapi-types.js';

// Task schedule
export type WeekdayLC =
    'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

// RX9.2 cleaning power mode (RX9.1 uses ecoMode instead)
export enum RX92PowerMode {
    Quiet                   = 1, // Lower energy consumption and quieter
    Smart                   = 2, // Cleans quietly on hard surfaces, uses full power on carpets
    Power                   = 3  // Optimal cleaning performance, higher energy consumption
}

// Battery charge level
export enum RX9BatteryStatus {
    Dead                    = 1,
    CriticalLow             = 2,
    Low                     = 3,
    Medium                  = 4,
    High                    = 5,
    FullyCharged            = 6
}

// Current activity
export enum RX9RobotStatus {
    Cleaning                = 1,
    PausedCleaning          = 2,
    SpotCleaning            = 3,
    PausedSpotCleaning      = 4,
    Return                  = 5,
    PausedReturn            = 6,
    ReturnForPitstop        = 7,
    PausedReturnForPitstop  = 8,
    Charging                = 9,
    Sleeping                = 10,
    Error                   = 11,
    Pitstop                 = 12,
    ManualSteering          = 13,
    FirmwareUpgrade         = 14
}

// Status of the dust collection bin
export enum RX9Dustbin {
    Unknown                 = 'notConnected',
    Present                 = 'connected',
    Missing                 = 'empty',
    Full                    = 'full'
}

// Functionality supported by the AEG RX9.1 and RX9.2
export type RX9Capabilities =
    'EcoMode'               // RX9.1 models (2 levels via ecoMode)
  | 'PowerLevels'           // RX9.2 models (3 levels via powerMode)
  | 'CustomPlay'
  | 'FreezeMapOnDemand'
  | 'InteractiveMap'
  | 'MultipleScheduledCleaningsPerDay'
  | 'PowerZones';

// CleaningCommand values supported by the AEG RX9.1 and RX9.2
export type RX9CleaningCommand =
    'play'
  | 'stop'
  | 'pause'
  | 'home';

// RX9.2 scheduled tasks (not supported by RX9.1)
export interface RX92Zone {
    powerMode:          RX92PowerMode;
}
export interface RX92Task {
    enabled:            boolean;
    start: {
        weekDays:       WeekdayLC[];
        time:           string;     // e.g. '09:00:13'
        properties: {
            zones:      RX92Zone[];
        }
    }
}
export interface RX92Tasks {
    [index: string]:    RX92Task;
}

// GET /api/v1/appliances/{applianceId}/info
export interface RX9NoTriggers { [index: string]: never };
export interface RX9ApplianceCapabilities {
    CleaningCommand: {
        access:         'readwrite';
        type:           'string';
        values: {
            // { [key in RX9CleaningCommand]: object; }
            play:           RX9NoTriggers;
            stop:           RX9NoTriggers;
            pause:          RX9NoTriggers;
            home:           RX9NoTriggers;
        }
    };
    robotStatus: {
        access:         'read';
        type:           string;
        values: {
            // { [key in `${RX9RobotStatus}`]: RX9Empty; }
            1:              RX9NoTriggers;  // Cleaning
            2:              RX9NoTriggers;  // PausedCleaning
            3:              RX9NoTriggers;  // SpotCleaning
            4:              RX9NoTriggers;  // PausedSpotCleaning
            5:              RX9NoTriggers;  // Return
            6:              RX9NoTriggers;  // PausedReturn
            7:              RX9NoTriggers;  // ReturnForPitstop
            8:              RX9NoTriggers;  // PausedReturnForPitstop
            9:              RX9NoTriggers;  // Charging
            10:             RX9NoTriggers;  // Sleeping
            11:             RX9NoTriggers;  // Error
            12:             RX9NoTriggers;  // Pitstop
            13:             RX9NoTriggers;  // ManualSteering
            14:             RX9NoTriggers;  // FirmwareUpgrade
        }
    };
    dustbinStatus?: {
        access:         'read';
        type:           'string';
        values: {
            // { [key in Capitalize<RX9Dustbin>]: RX9Empty; }
            NOTCONNECTED:   RX9NoTriggers;
            CONNECTED:      RX9NoTriggers;
            EMPTY:          RX9NoTriggers;
            FULL:           RX9NoTriggers;
        }
    },
    batteryStatus?: {
        access:         'read';
        type:           'int';
        max:            6;
        min:            1;
    },
    powerMode?: {
        access:         'read';
        type:           'int';
        min:            1;
        max:            3;
    }
}
export interface RX9ApplianceInfo {
    applianceInfo:      ApplianceInfoDTO;
    capabilities:       RX9ApplianceCapabilities;
}

// GET /api/v1/appliances/{applianceId}/state
export interface RX9Message {
    id:                 number;     // e.g. 1
    timestamp:          number;     // e.g. 1672820985
    type:               number;     // e.g. 0
    userErrorID?:       number;     // e.g. 15
    internalErrorID?:   number;     // e.g. 10005
    text:               string;     // e.g. 'Please help me get free'
}
export interface RX9CapabilitiesObject {
    [index: string]:    object;     // [key in RX9Capabilities]
}
export interface RX9ApplianceStateReportedBase {
    availableLanguages: string[];   // e.g. ['deu', 'eng', ...]
    capabilities:       RX9CapabilitiesObject;
    batteryStatus:      RX9BatteryStatus;
    robotStatus:        RX9RobotStatus;
    messageList: {
        messages:       RX9Message[];
    },
    dustbinStatus:      RX9Dustbin;
    platform:           string;     // e.g. '1.01'
    applianceName:      string;     // e.g. 'AEG RX9.2 Robot'
    firmwareVersion:    string;     // e.g. '43.23'
    language:           string;     // e.g. 'eng'
    mute:               boolean;
}
export interface RX91ApplianceStateReported extends RX9ApplianceStateReportedBase {
    ecoMode:            boolean;
}
export interface RX92ApplianceStateReported extends RX9ApplianceStateReportedBase {
    powerMode:          RX92PowerMode;
    tasks?:             RX92Tasks;
}
export type RX9ApplianceStateReported =
    RX91ApplianceStateReported | RX92ApplianceStateReported;
export interface RX9ApplianceStateProperties {
    reported:           RX9ApplianceStateReported;
}
export interface RX9ApplianceState {
    applianceId:        ApplianceId;
    connectionState:    ConnectionState;
    status:             ApplianceStatus;
    properties:         RX9ApplianceStateProperties;
}

// PUT /api/v1/appliances/{applianceId}/command
export interface RX9Command {
    CleaningCommand:    RX9CleaningCommand;
}