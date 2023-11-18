// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { createCheckers } from 'ts-interface-checker';

import { AEGAuthoriseUserAgent } from './aegapi-ua-auth';
import { Appliance, ApplianceInfo, ApplianceNamePatch, AppliancePut,
         Capabilities, CleanedAreas, CleanedAreaSessionMap, CleaningCommand,
         DeleteTask, InteractiveMaps, InteractiveMapData, Lifetime,
         PowerMode, PutCommand, PutCommandZone, PutTask, PostNewTask, NewTask,
         Task, Tasks, PatchApplianceName, PutAppliance } from './aegapi-types';
import aegapiTI from './ti/aegapi-types-ti';

// Checkers for API responses
const checkers = createCheckers(aegapiTI);

// Access to the AEG RX 9 / Electrolux Pure i9 cloud API
export class AEGApplianceAPI {

    // Create a new appliance API
    constructor(
        readonly ua:          AEGAuthoriseUserAgent,
        readonly applianceId: string
    ) {}

    // API methods for this appliance
    getApplianceInfo(): Promise<ApplianceInfo> {
        const path = `/appliance/api/v2/appliances/${this.applianceId}/info`;
        return this.ua.getJSON(checkers.ApplianceInfo, path);
    }

    getApplianceTasks(): Promise<Tasks> {
        const path = `/appliance/api/v2/appliances/${this.applianceId}/tasks`;
        return this.ua.getJSON(checkers.Tasks, path);
    }

    createApplianceTask(task: NewTask): Promise<Task> {
        const path = `/appliance/api/v2/appliances/${this.applianceId}/tasks`;
        const postBody: PostNewTask = task;
        return this.ua.postJSON(checkers.Task, path, postBody);
    }

    replaceApplianceTask(task: Task): Promise<Task> {
        const id = task.id;
        const path = `/appliance/api/v2/appliances/${this.applianceId}/tasks/${id}`;
        const putBody: PutTask = {...{ pncId: this.applianceId }, ...task};
        return this.ua.putJSON(checkers.Task, path, putBody);
    }

    deleteApplianceTask(id: string): Promise<void> {
        const path = `/appliance/api/v2/appliances/${this.applianceId}/tasks/${id}`;
        const deleteBody: DeleteTask = {};
        return this.ua.delete(path, deleteBody);
    }

    setApplianceName(applianceName: string, timeZoneStandardName: string): Promise<ApplianceNamePatch> {
        const path = `/domain/api/v2/appliances/${this.applianceId}`;
        const patchBody: PatchApplianceName= { applianceName, timeZoneStandardName };
        return this.ua.patchJSON(checkers.ApplianceNamePatch, path, patchBody);
    }

    setPowerMode(powerMode: PowerMode): Promise<AppliancePut> {
        return this.setAppliance({ powerMode });
    }

    setMute(mute: boolean): Promise<AppliancePut> {
        return this.setAppliance({ mute });
    }

    setLanguage(language: string): Promise<AppliancePut> {
        return this.setAppliance({ language });
    }

    setAppliance(settable: PutAppliance): Promise<AppliancePut> {
        const path = `/appliance/api/v2/appliances/${this.applianceId}`;
        return this.ua.putJSON(checkers.AppliancePut, path, settable);
    }

    cleaningCommand(command: CleaningCommand): Promise<void> {
        return this.command({ CleaningCommand: command });
    }

    cleanZones(persistentMapId: string, zones: PutCommandZone[] ): Promise<void> {
        return this.command({ CustomPlay: { persistentMapId, zones } });
    }

    command(command: PutCommand): Promise<void> {
        const path = `/appliance/api/v2/appliances/${this.applianceId}/command`;
        return this.ua.put(path, command);
    }

    getApplianceInteractiveMaps(): Promise<InteractiveMaps> {
        const path = `/purei/api/v2/appliances/${this.applianceId}/interactive-maps`;
        return this.ua.getJSON(checkers.InteractiveMaps, path);
    }

    getApplianceLifetime(): Promise<Lifetime> {
        const path = `/purei/api/v2/appliances/${this.applianceId}/lifetime`;
        return this.ua.getJSON(checkers.Lifetime, path);
    }

    getApplianceCleanedAreas(limit = 50): Promise<CleanedAreas> {
        const path = `/purei/api/v2/appliances/${this.applianceId}/cleaned-areas`;
        return this.ua.getJSON(checkers.CleanedAreas, path, { query: { limit }});
    }

    getApplianceHistory(): Promise<CleanedAreas> {
        const path = `/purei/api/v2/appliances/${this.applianceId}/history`;
        return this.ua.getJSON(checkers.CleanedAreas, path);
    }

    getApplianceSessionMap(sessionId: number): Promise<CleanedAreaSessionMap> {
        const path = `/purei/api/v2/appliances/${this.applianceId}/cleaning-sessions/${sessionId}/maps`;
        const query = { mapFormat: 'rawgzip' };
        const headers = { Accept: '*/*' };
        return this.ua.getJSON(checkers.CleanedAreaSessionMap, path, { query, headers });
    }

    async getApplianceInteractiveMap(persistentMapId: string, sequenceNumber: number): Promise<InteractiveMapData> {
        const path = `/purei/api/v2/appliances/${this.applianceId}/interactive-maps/`
                     + `${persistentMapId}/sequences/${sequenceNumber}/maps`;
        const query = { mapFormat: 'rawgzip' };
        const headers = { Accept: '*/*' };
        return this.ua.getJSON(checkers.InteractiveMapData, path, { query, headers });
    }

    getApplianceCapabilities(): Promise<Capabilities> {
        const path = `/appliance/api/v2/appliances/${this.applianceId}/capabilities`;
        return this.ua.getJSON(checkers.Capabilities, path);
    }

    // Test whether an appliance is a robot vacuum
    static isRobot(appliance: Appliance): boolean {
        return appliance.applianceData.modelName === 'PUREi9';
    }
}