// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2024 Alexander Thoukydides

// An appliance identifier
export type ApplianceId = string;

// Is the appliance enabled in the user account
export type ApplianceStatus = 'enabled' | 'disabled';

// Is the appliance connected to the cloud servers
export type ConnectionState = 'Connected' | 'Disconnected';

// GET /api/v1/appliances
export interface Appliance {
    applianceId:        ApplianceId;// e.g. '900277479937001234567890'
    applianceName:      string;     // e.g. 'AEG RX9.2 Robot'
    applianceType:      string;     // e.g. 'PUREi9'
    created:            string;     // e.g. '2022-12-27T18:00:21.834+00:00'
}
export type Appliances = Appliance[];

// GET /api/v1/appliances/{applianceId}/info
export interface ApplianceInfoDTO {
    serialNumber:       string;     // e.g. '93701234'
    pnc:                string;     // e.g. '900277479'
    brand:              string;     // e.g. 'AEG'
    deviceType:         string;     // e.g. 'ROBOTIC_VACUUM_CLEANER'
    model:              string;     // e.g. 'rx92'
    variant:            string;     // e.g. 'M2'
    colour:             string;     // e.g. 'SHALEGREY'
}
export type CapabilityAccess = 'read' | 'readwrite' | 'write' | 'constant';
export type CapabilityType =  'string' | 'number' | 'int' | 'boolean' | 'complex' | 'temperature' | 'alert';
export type CapabilityValue = string | number | boolean;
export interface CapabilityValues {
    [index: string]:    object;
}
// Should be TriggerCondition instead of object, but circular definitions not supported
export type ConditionOperand = string | CapabilityValue | object; // 'value' for self
export type ConditionOperator = 'eq' | 'gt' | 'ne' | 'lt' | 'ge' | 'le' | 'and' | 'or';
export interface TriggerCondition {
    operand_1:          ConditionOperand;
    operand_2:          ConditionOperand;
    operator:           ConditionOperator;
}
export interface TriggerAction {
    // Should be ApplianceCapabilityProperties, but circular definitions not supported
    [index: string]:    object; // index='self' to reference own property
}
export interface CapabilityTrigger {
    condition:          TriggerCondition;
    action:             TriggerAction;
}
export interface ApplianceCapabilityPropertiesBase {
    access:             CapabilityAccess;
    type:               CapabilityType;
    default?:           CapabilityValue;
    disabled?:          boolean;
    schedulable?:       boolean;
    triggers?:          CapabilityTrigger[];
}
export interface ApplianceCapabilityPropertiesNumber {
    access:             CapabilityAccess;
    type:               'number' | 'int' | 'temperature';
    default?:           number;
    disabled?:          boolean;
    min?:               number;
    max?:               number;
    step?:              number;
}
export interface ApplianceCapabilityPropertiesString {
    access:             CapabilityAccess;
    type:               'string' | 'alert';
    default?:           string;
    disabled?:          boolean;
    values?:            CapabilityValues;
}
export type ApplianceCapabilityProperties =
    ApplianceCapabilityPropertiesBase
  | ApplianceCapabilityPropertiesNumber
  | ApplianceCapabilityPropertiesString;
export interface ApplianceCapabilities {
    [index: string]:    ApplianceCapabilities | ApplianceCapabilityProperties;
}
export interface ApplianceInfo {
    applianceInfo:      ApplianceInfoDTO;
    capabilities:       ApplianceCapabilities;
}

// GET /api/v1/appliances/{applianceId}/state
export interface ApplianceStateProperties {
    reported:           object;
}
export interface ApplianceState {
    applianceId:        ApplianceId;
    connectionState:    ConnectionState;
    status:             ApplianceStatus;
    properties:         ApplianceStateProperties;
}

// POST /api/v1/appliances/{applianceId}/command
export type Command = object;

// Error response
export interface ErrorResponse {
    error:              string;
    message:            string;
    detail?:            string;
}