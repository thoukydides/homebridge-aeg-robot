// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2024 Alexander Thoukydides

import { ApplianceId, ApplianceInfoDTO, ApplianceStatus,
         CapabilityValues, ConnectionState } from './aegapi-types.js';

// Task schedule
export type WeekdayLC =
    'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

// Cleaning power mode
export enum RX92PowerMode {
    Quiet                   = 1, // Lower energy consumption and quieter
    Smart                   = 2, // Cleans quietly on hard surfaces, uses full power on carpets
    Power                   = 3  // Optimal cleaning performance, higher energy consumption
}

// Battery charge level
export enum RX92BatteryStatus {
    Dead                    = 1,
    CriticalLow             = 2,
    Low                     = 3,
    Medium                  = 4,
    High                    = 5,
    FullyCharged            = 6
}

// Current activity
export enum RX92RobotStatus {
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
export enum RX92Dustbin {
    Unknown                 = 'notConnected',
    Present                 = 'connected',
    Missing                 = 'empty',
    Full                    = 'full'
}

// Functionality supported by the AEG RX9.2
export type RX92Capabilities =
    'PowerLevels'
  | 'CustomPlay'
  | 'FreezeMapOnDemand'
  | 'InteractiveMap'
  | 'MultipleScheduledCleaningsPerDay'
  | 'PowerZones';

// CleaningCommand values supported by the AEG RX9.2
export type RX92CleaningCommand =
    'play'
  | 'stop'
  | 'pause'
  | 'home';

// GET /api/v1/appliances/{applianceId}/info
export interface RX92ApplianceCapabilities {
    CleaningCommand: {
        access:         'readwrite';
        type:           'string';
        values:         CapabilityValues; // [key in RX92CleaningCommand]
    };
    robotStatus: {
        access:         'read';
        type:           string;
        values:         CapabilityValues; // [key in `${RX92RobotStatus}`]
    };
}
export interface RX92ApplianceInfo {
    applianceInfo:      ApplianceInfoDTO;
    capabilities:       RX92ApplianceCapabilities;
}

// GET /api/v1/appliances/{applianceId}/state
export interface RX92Message {
    id:                 number;     // e.g. 1
    timestamp:          number;     // e.g. 1672820985
    type:               number;     // e.g. 0
    userErrorID?:       number;     // e.g. 15
    internalErrorID?:   number;     // e.g. 10005
    text:               string;     // e.g. 'Please help me get free'
}
export interface RX92CapabilitiesObject {
    [index: string]:    object;     // [key in RX92Capabilities]
}
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
export interface RX92ApplianceStateReported {
    availableLanguages: string[];   // e.g. ['deu', 'eng', ...]
    capabilities:       RX92CapabilitiesObject;
    batteryStatus:      RX92BatteryStatus;
    robotStatus:        RX92RobotStatus;
    messageList: {
        messages:       RX92Message[];
    },
    dustbinStatus:      RX92Dustbin;
    platform:           string;     // e.g. '1.01'
    applianceName:      string;     // e.g. 'AEG RX9.2 Robot'
    firmwareVersion:    string;     // e.g. '43.23'
    language:           string;     // e.g. 'eng'
    mute:               boolean;
    powerMode:          RX92PowerMode;
    tasks:              RX92Tasks;
}
export interface RX92ApplianceStateProperties {
    reported:           RX92ApplianceStateReported;
}
export interface RX92ApplianceState {
    applianceId:        ApplianceId;
    connectionState:    ConnectionState;
    status:             ApplianceStatus;
    properties:         RX92ApplianceStateProperties;
}

// GET /api/v1/appliances/{applianceId}/state
export interface RX92Command {
    CleaningCommand:    RX92CleaningCommand;
}