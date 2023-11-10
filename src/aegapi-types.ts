// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { PutCommandZone } from './ti/aegapi-types-ti';

// Task schedule
export type WeekdaysUC = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday'
                       | 'Friday' | 'Saturday' | 'Sunday';
export type WeekdaysLC = 'monday' | 'tuesday' | 'wednesday' | 'thursday'
                       | 'friday' | 'saturday' | 'sunday';

// Is the appliance enabled in the user account
export enum Status {
    Enabled                     = 'enabled',
    Disabled                    = 'disabled'
}

// Is the appliance connected to the cloud servers
export enum Connection {
    Connected                   = 'Connected',
    Disconnected                = 'Disconnected'
}

// Cleaning power mode
export enum PowerMode {
    Quiet                       = 1, // Lower energy consumption and quieter
    Smart                       = 2, // Cleans quietly on hard surfaces, uses full power on carpets
    Power                       = 3  // Optimal cleaning performance, higher energy consumption
}

// Battery charge level
export enum Battery {
    Dead                        = 1,
    CriticalLow                 = 2,
    Low                         = 3,
    Medium                      = 4,
    High                        = 5,
    FullyCharged                = 6
}

// Current activity
export enum Activity {
    Cleaning                    = 1,
    PausedCleaning              = 2,
    SpotCleaning                = 3,
    PausedSpotCleaning          = 4,
    Return                      = 5,
    PausedReturn                = 6,
    ReturnForPitstop            = 7,
    PausedReturnForPitstop      = 8,
    Charging                    = 9,
    Sleeping                    = 10,
    Error                       = 11,
    Pitstop                     = 12,
    ManualSteering              = 13,
    FirmwareUpgrade             = 14
}

// Cleaning result
export type Completion = 'abortedByUser'
                       | 'cleaningFinishedSuccessful'
                       | 'cleaningFinishedSuccessfulInCharger'
                       | 'cleaningFinishedSuccessfulInStartPose'
                       | 'endedNotFindingCharger'
                       | 'error';

// Zone status
export type ZoneStatusStatus = 'finished' | 'terminated' | 'aborted';

// Capabilities supported by an appliance
export type Capability = 'CustomPlay' | 'InteractiveMap' | 'InteractiveMaps'
                         | 'FreezeMapOnDemand' | 'PowerLevels' | 'PowerZones'
                         | 'MultipleScheduledCleaningsPerDay' | string;

// Map zone room types
export enum RoomCategory {
    Kitchen                     = 0,
    DiningRoom                  = 1,
    Hallway                     = 2,
    LivingRoom                  = 3,
    Bedroom                     = 4,
    TVRoom                      = 5,
    Bathroom                    = 6,
    ChildrensRoom               = 7,
    Office                      = 8,
    Storage                     = 9,
    Other                       = 10
}

// Map zone types
export enum CleanedZoneType {
    Clean                       = 'cleanZone',
    Avoid                       = 'avoidZone'
}
export enum MapZoneType {
    Clean                       = 'clean',
    Avoid                       = 'avoid'
}

// Status of the dust collection bin
export enum Dustbin {
    Unknown                     = 'notConnected',
    Present                     = 'connected',
    Missing                     = 'empty',
    Full                        = 'full'
}

// Commands that can be issued to control cleaning
export enum CleaningCommand {
    Play                        = 'play',   // Clean if Sleeping, otherwise toggles Pause
    Pause                       = 'pause',  // (Same as Play)
    Spot                        = 'spot',   // Spot clean if Sleeping and off-dock
    Home                        = 'home',   // Return to starting position or dock
    Stop                        = 'stop'    // Stop any Clean/Spot/Return and Sleep
}

// Types of phone number
export enum PhoneType {
    Phone                       = 'Phone',
    Mobile                      = 'Mobile'
}

// Measurement units
export enum DistanceUnit {
    KM                          = 'KiloMeter',
    Mile                        = 'Miles'
}
export enum TemperatureUnit {
    Celsius                     = 'Celsius',
    Fahrenheit                  = 'Fahrenheit'
}
export enum AreaUnit {
    SquareMeter                 = 'SquareMeter',
    SquareFeet                  = 'SquareFeet'
}
export enum WeightUnit {
    KiloGram                    = 'KiloGram',
    Pound                       = 'Pound'
}
export enum VolumeUnit {
    CentiLiter                  = 'CentiLiter',
    FluidOunce                  = 'FluidOunce'
}

// GET /one-account-user/api/v1/users/current
export interface PhoneNumber {
    type:                       PhoneType;
    number:                     string | null;
}
export interface MeasurementUnits {
    distanceMeasurementUnit:    DistanceUnit;
    tempMeasurementUnit:        TemperatureUnit;
    surfaceMeasurementUnit:     AreaUnit;
    weightMeasurementUnit?:     WeightUnit;
    volumeMeasurementUnit?:     VolumeUnit;
}
export interface Address {
    zipCode:                    string;     // e.g. 'SE1 8NW'
    state:                      string;
    city:                       string;     // e.g. 'London'
    street:                     string;     // e.g. '240 Blackfriars Road'
    apartmentNumber:            string;
    contactCareOf:              string;
}
export interface User {
    firstName:                  string;
    lastName:                   string;
    phoneNumbers?:              PhoneNumber[];
    address?:                   Address;
    countryCode:                string;     // e.g. 'GB'
    locale:                     string;     // e.g. 'en'
    measurementUnits:           MeasurementUnits | null;
    enabledMarketingChannels:   string[];   // e.g. ['EMAIL']
}

// PATCH /one-account-user/api/v1/users/current
export interface PatchUser {
    firstName?:                 string;
    lastName?:                  string;
    countryCode?:               string;     // e.g. 'GB'
    measurementUnits?:          MeasurementUnits;
}

// PUT /one-account-user/api/v1/users/current/change-password
export interface PutChangePassword {
    password:                   string;
    newPassword:                string;
}

// GET /country/api/v1/countries
export interface Country {
    id:                         number;     // e.g. 43               or 16
    countryCodeShort:           string;     // e.g. 'GB'             or 'DE'
    name:                       string;     // e.g. 'United Kingdom' or 'Germany'
    nativeName:                 string;     // e.g. 'United Kingdom' or 'Deutschland'
}
export type Countries = Country[];

// GET /health-check/api/v1/health-checks
export interface HealthCheck {
    message:                    string;     // e.g. 'I am alive!'
    environment:                string;     // e.g. 'prod'
    app:                        string;     // e.g. 'ApplianceCloudGateway' or 'Osiris.DeltaApi'
    url:                        string;     // e.g. 'https://hcsda-appliancecloudgateway-linux.azurewebsites.net/healthcheck'
    release:                    string;     // e.g. 'Release-1238' or 'OsirisCore_1.46.1'
    version:                    string | null; // e.g. '1.0.0' or '22.11.30.3'
    statusCode:                 number;     // e.g. 200
}
export type HealthChecks = HealthCheck[];

// GET /appliance/api/v2/appliances
export interface ApplianceData {
    applianceName:              string;     // e.g. 'Marvin'
    created:                    string;     // e.g. '2022-12-27T18:00:21.8349154Z'
    modelName:                  string;     // e.g. 'PUREi9'
}
export interface ApplianceTaskZone {
    powerMode:                  PowerMode;
    goZonesId?:                 string;     // e.g.  '8dc4b1f2-74cc-46a9-a68e-a0ddcb937cbf'
}
export interface ApplianceTask {
    enabled:                    boolean;
    start: {
        weekDays:               WeekdaysLC[];
        time:                   string;     // e.g. '08:00:13'
        properties: {
            persistentMapId?:   string;     // e.g 'b3c9558f-5326-40dc-b8d8-a5ad334d62f2'
            zones:              ApplianceTaskZone[];
        };
    };
}
export interface ApplianceTasks {
    [index: string]:            ApplianceTask;
}
interface CapabilitySupported {
    [index: string]:            never;
}
export interface Capabilities {
    [index: Capability]:        CapabilitySupported;
}
export interface SettableProperties {
    applianceName?:             string;     // e.g. 'Marvin'
    firmwareVersion?:           string;     // e.g. '43.23'
    mute?:                      boolean;
    language?:                  string;     // e.g. 'eng'
    powerMode?:                 PowerMode;
    tasks?:                     ApplianceTasks;
}
export interface Message {
    id:                         number;     // e.g. 1
    timestamp:                  number;     // e.g. 1672820985
    type:                       number;     // e.g. 0
    userErrorID?:               number;     // e.g. 15
    internalErrorID?:           number;     // e.g. 10005
    text:                       string;     // e.g. 'Please help me get free'
}
export interface ReportedProperties extends SettableProperties {
    availableLanguages?:        string[];   // e.g. ['deu', 'eng', ...]
    capabilities?:              Capabilities;
    batteryStatus?:             Battery;
    robotStatus?:               Activity;
    messageList?: {
        messages:               Message[];
    };
    dustbinStatus?:             Dustbin;
    platform?:                  string;     // e.g. '1.01'
}
export interface ApplianceProperties {
    desired:                    SettableProperties;
    reported:                   ReportedProperties;
    metadata?:                  null;
}
export interface Appliance {
    applianceId:                string;     // e.g. '900277479937001234567890'
    applianceData:              ApplianceData;
    properties:                 ApplianceProperties;
    status:                     Status;
    connectionState:            Connection;
}
export type Appliances = Appliance[];

// GET /appliance/api/v2/appliances/${applianceId}/info
export interface ApplianceInfo {
    manufacturingDateCode:      string;     // e.g. '937'
    serialNumber:               string;     // e.g. '93701234'
    pnc:                        string;     // e.g. '900277479'
    brand:                      string;     // e.g. 'AEG'
    market:                     string;     // e.g. 'EUROPE'
    productArea?:               string;     // e.g. `WELLBEING`
    deviceType:                 string;     // e.g. 'ROBOTIC_VACUUM_CLEANER'
    project:                    string;     // e.g. 'CYCLOPS'
    model:                      string;     // e.g. 'rx92'
    variant:                    string;     // e.g. 'M2'
    colour:                     string;     // e.g. 'SHALEGREY'
}

// GET /appliance/api/v2/appliances/${applianceId}/tasks
export interface TaskZone {
    PowerMode:                  PowerMode;
    GoZonesId?:                 string;     // e.g.  '8dc4b1f2-74cc-46a9-a68e-a0ddcb937cbf'
}
export interface NewTask {
    name:                       string;     // e.g. 'Full Monty'
    enabled:                    boolean;
    start: {
        weekDays:               WeekdaysUC[];
        time:                   string;     // e.g. '08:00:13'
        properties: {
            PersistentMapId?:   string;     // e.g 'b3c9558f-5326-40dc-b8d8-a5ad334d62f2'
            Zones:              TaskZone[];
        };
    };
}
export interface Task extends NewTask {
    id:                         string;     // e.g. '0'
}
export type Tasks = Task[];

// POST /appliance/api/v2/appliances/${applianceId}/tasks
export type PostNewTask = NewTask;

// PUT /appliance/api/v2/appliances/${applianceId}/tasks/${id}
export interface PutTask extends Task {
    pncId?:                     string;     // e.g. '900277479937001234567890'
}

// DELETE /appliance/api/v2/appliances/${applianceId}/tasks/${id}
export interface DeleteTask {
    [index: string]:            never;
}

// PATCH /domain/api/v2/appliances/${applianceId}
export interface PatchApplianceName {
    applianceName:              string;     // e.g. 'Marvin'
    timeZoneStandardName:       string;     // e.g. 'Europe/London'
}
export interface ApplianceNamePatch extends ApplianceData {
    timeZoneStandardName:       string;     // e.g. 'Europe/London'
    applianceId:                string;     // e.g. '900277479937001234567890'
    domainId:                   number;     // e.g. 815573
}
export interface PutAppliance {
    powerMode?:                 PowerMode;
    mute?:                      boolean;
    language?:                  string;     // e.g. 'eng'
}
export interface ApplianceDataWithPNC extends ApplianceData {
    pncId:                      string;     // e.g. '900277479937001234567890'
}
export interface AppliancePut {
    pncId:                      string;     // e.g. '900277479937001234567890'
    applianceData:              ApplianceDataWithPNC;
    twin: {
        deviceId:               string;     // e.g. '900277479937001234567890'
        properties:             ApplianceProperties;
        status:                 Status;
        connectionState:        Connection;
    };
    telemetry:                  object;     // ???
}

// PUT /appliance/api/v2/appliances/${applianceId}/command
export interface PutCommandSimple {
    CleaningCommand:            CleaningCommand;
}
export interface PutCommandZone {
    powerMode:                  PowerMode;
    zoneId:                     string;     // e.g.  '8dc4b1f2-74cc-46a9-a68e-a0ddcb937cbf'
}
export interface PutCommandZones {
    CustomPlay: {
        persistentMapId:        string;     // e.g. 'b3c9558f-5326-40dc-b8d8-a5ad334d62f2'
        zones:                  PutCommandZone[];
    };
}
export type PutCommand = PutCommandSimple | PutCommandZones;

// GET /purei/api/v2/appliances/${applianceId}/interactive-maps
export interface Vertex {
    x:                          number;     // e.g. 3.8988085
    y:                          number;     // e.g. -2.4282222
}
export interface MapZone {
    name:                       string;     // e.g. 'Kitchen'
    id:                         string;     // e.g. '8dc4b1f2-74cc-46a9-a68e-a0ddcb937cbf'
    zoneType:                   MapZoneType;
    vertices:                   [Vertex, Vertex, Vertex, Vertex];
    roomCategory:               RoomCategory;
    powerMode?:                 PowerMode;
}
export interface InteractiveMap {
    rotation:                   number;     // e.g. 0
    id:                         string;     // e.g. 'b3c9558f-5326-40dc-b8d8-a5ad334d62f2'
    status:                     number;     // e.g. 0 ???
    sequenceNumber:             number;     // e.g. 2
    timestamp:                  string;     // e.g. '2022-12-29T15:00:40+00:00'
    keep:                       boolean;
    freeze:                     boolean;
    name?:                      string;     // e.g. 'Map 1'
    interactiveMapMessageUuid?: string;     // e.g. '2bc4f03b-8e59-4ca1-9e79-827a53eea200'
    zones?:                     MapZone[];
}
export type InteractiveMaps = InteractiveMap[];

// GET /purei/api/v2/appliances/${applianceId}/lifetime
export interface Lifetime {
    cleaningDuration:           number;     // e.g. 9750000000 (0.1µs ticks?)
    cleanedArea:                number;     // e.g. 102.28999996185294 (m^2)
    sessionCount:               number;     // e.g. 8 (cleanings)
}

// GET /purei/api/v2/appliances/${applianceId}/cleaned-areas?limit=${limit}
// GET /purei/api/v2/appliances/${applianceId}/history?
export interface ZoneStatus {
    id:                         string;     // e.g. '8dc4b1f2-74cc-46a9-a68e-a0ddcb937cbf'
    status:                     ZoneStatusStatus;
    powerMode:                  PowerMode;
}
export interface Zone {
    id:                         string;     // e.g. '8dc4b1f2-74cc-46a9-a68e-a0ddcb937cbf'
    type:                       CleanedZoneType;
    vertices:                   [Vertex, Vertex, Vertex, Vertex];
}
export interface CleanedAreaSessionBase {
    id:                         string;     // e.g. 'si_17'
    sessionId:                  number;     // e.g. 17
    action:                     'update';
    lastUpdate:                 string;     // e.g. '2022-12-29T15:01:19.123
    startTime:                  string;     // e.g. '2022-12-29T14:13:56'
    eventTime:                  string;     // e.g. '2022-12-29T15:00:41'
    pitstopDuration:            number;     // e.g. 7620000000 (0.1µs ticks?)
    cleaningDuration:           number;     // e.g. 9750000000 (0.1µs ticks?)
    areaCovered:                number;     // e.g. 9.64 (m^2)
    isTimeReliable:             boolean;
    messageType:                'normal';
    completion?:                Completion;
    pitstopCount:               number;     // e.g. 1
    persistentMapId?:           string;     // e.g. 'b3c9558f-5326-40dc-b8d8-a5ad334d62f2'
    persistentMapSN:            number;     // e.g. 0
    zoneStatus?:                ZoneStatus[];
    zones?:                     Zone[];
}
export interface CleanedAreaSessionError extends CleanedAreaSessionBase {
    completion:                 'error';
    robotUserError:             number;     // e.g. 15
    robotInternalError:         number;     // e.g. 10005
}
export type CleanedAreaSession = CleanedAreaSessionBase | CleanedAreaSessionError;
export interface CleanedArea {
    id:                         string;     // e.g. '2517304033553327441-OWlIdQ=='
    sessionId:                  number;     // e.g. 12
    timeStamp:                  string;     // e.g. '2022-12-24T15:56:30'
    cleanedArea:                number;     // e.g. 9.90999984741211 (m^2)
    totalLifetimeCleanedArea:   number;     // e.g. 104.049999952316 (m^2)
    cleaningSession?:           CleanedAreaSession;
}
export type CleanedAreas = CleanedArea[];

// GET /domain/api/v2/domains
export interface DomainAppliance extends ApplianceDataWithPNC {

    id:                         number;     // e.g. 1308100
    domainId:                   number;     // e.g. 815573
    timeZoneStandardName:       string | null; // e.g. 'Europe/London'
}
export interface DomainUser {
    email:                      string;     // e.g. 'rx@gmail.com'
    userId?:                    string;     // e.g. '123456789abcdef0123456789abcdef0'
    name?:                      string | null;
}
export interface Domains {
    id:                         number;     // e.g. 815573
    changed:                    string;     // e.g. '2022-12-22T13:51:49.2257025'
    created:                    string;     // e.g. '2022-12-22T13:51:49.2257025'
    appliances:                 DomainAppliance[];
    users:                      DomainUser[];
}

// GET /faq/api/v2/faqs/oneApp/?countryCode=${countryCode}&languageCode=${locale}
export interface FAQQuestion {
    id:                         number;     // e.g. 125
    questionText:               string;     // e.g. 'How many maps can my robot vacuum make?'
    currentAnswerText:          string;     // e.g. 'Your robot vacuum can store up to 3 maps...'
    createdAt:                  string;     // e.g. '2021-05-14T09:00:40.1206622'
}
export interface FAQCategory {
    id:                         number;     // e.g. 30
    name:                       string;     // e.g. 'Map and zone cleaning'
    questionDTOs:               FAQQuestion[];
}
export interface FAQType {
    id:                         number;     // e.g. 6
    name:                       string;     // e.g. 'Robot vacuum'
    type:                       string;     // e.g. 'Robot vacuum'
    categoryDTOs:               FAQCategory[];
}
export interface FAQ {
    tenantName:                 string;     // e.g. 'OneApp'
    typeDTOs:                   FAQType[];
}

// GET /legaldocument/api/v1/legaldocuments/${countryCode}/${locale}/
export interface LegalDocument {
    languageCode:               string;     // e.g. 'en'
    url:                        string;     // e.g. 'https://documents.delta.electrolux.com/Terms...html'
    selectableTermsStatement?:  boolean;
    selectablePrivacyStatement?: boolean;
    changingCountryRequireAcceptance?: boolean;
    externalDocumentRef?:       string;     // e.g. '4248b08a-c471-4bba-ba5c-16472639723b'
}
export interface LegalDocuments {
    [index: string]:            LegalDocument;
}

// GET /feed/api/v3.1/feeds?countryCode=${countryCode}&languageCode=${locale}
export interface FeedItemBase {
    id:                         string;     // e.g. '815573-900277479937001234567890-RVCSurfaceFilterMaintenance'
    createdAtUTC:               string;     // e.g. '2022-12-24T15:57:24.8144471Z'
    feedDataType:               string;     // e.g. 'RVCLastWeekCleanedArea'
}
export interface FeedItemLastWeekCleanedArea extends FeedItemBase {
    feedDataType:               'RVCLastWeekCleanedArea';
    data: {
        pncId:                  string;     // e.g. '900277479937001234567890'
        pitstopCount:           number;     // e.g. 3 (times recharged during cleaning)
        cleanedAreaSquareMeter: number;     // e.g. 40 (m^2)
        sessionCount:           number;     // e.g. 5 (cleanings)
        cleaningDurationTicks:  number;     // e.g. 99920000000 (0.1µs ticks?)
    };
}
export interface FeedItemBusierWeekJobDone extends FeedItemBase {
    feedDataType:               'OsirisBusierWeekJobDone';
    data: {
        pncId:                  string;     // e.g. '900277479937001234567890'
        relativeDifference:     number;     // e.g. 2.4116516 (current/previous-1)
        previous:               number;     // e.g. 0.4338888888888889 (hours)
        current:                number;     // e.g. 1.4802777777777778 (hours)
    };
}
export interface FeedItemMonthlyJobDoneGlobalComparison extends FeedItemBase {
    feedDataType:               'OsirisMonthlyJobDoneGlobalComparison';
    data: {
        pncId:                  string;     // e.g. '900277479937001234567890'
        startDate:              string;     // e.g. '2023-01-01'
        endDate:                string;     // e.g. '2023-01-31'
        sessionCount:           number;     // e.g. 52
        minCountry: {
            country:            string;     // e.g. 'CN'
            sessionCount:       number;     // e.g. 7.442623
        };
        maxCountry: {
            country:            string;     // e.g. SG
            sessionCount:       number;     // e.g. 19.711956
        };
    };
}
export interface FeedItemMaintenance extends FeedItemBase {
    feedDataType:               'RVCSurfaceFilterMaintenance' | 'RVCBrushRollMaintenance' | 'RVCSideBrushMaintenance';
    data: {
        pncId?:                 string;     // e.g. '900277479937001234567890'
        cardTitle:              string;     // e.g. 'Time to clean the filter'
        cardDescription:        string;     // e.g. 'Clean your filter and get optimal performance...'
        iconUrl:                string;     // e.g. 'https://cdn.sanity.io/images/...-48x48.png'
        imageUrls:              string[];   // e.g. ['https://cdn.sanity.io/images/...-696x726.png']
        extendedViewTitle:      string;     // e.g. 'How to clean the filter'
        extendedViewDescription: string;    // e.g. '{{BULLET:1}}Open the lid and remove ...'
        hasWebShop:             boolean;
        webShopDescription:     string;     // e.g. 'Confirm new password'
    };
}
export type FeedItem = FeedItemLastWeekCleanedArea | FeedItemBusierWeekJobDone
                     | FeedItemMonthlyJobDoneGlobalComparison | FeedItemMaintenance;
export interface Feed {
    feedItemResponseDetailDTOs: FeedItem[];
}

// POST /webshop/api/v2.1/webshop-urls/${countryCode}
export interface PostWebShopDevice {
    applianceId:                string;     // e.g. '900277479937001234567890'
}
export interface PostWebShop {
    WebShopDeviceQueryDTOs:     PostWebShopDevice[];
}
export interface WebShopURLs {
    [index: string]:            string;
}
export interface WebShopDevice {
    modelName:                  string;     // e.g. 'rx92'
    applianceId:                string;     // e.g. '900277479937001234567890'
    urls:                       WebShopURLs;
}
export interface WebShop {
    urls:                       WebShopURLs;
    webShopDeviceSyncDTOs:      WebShopDevice[];
}