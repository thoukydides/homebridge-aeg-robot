// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { AnyMapCoordinate, MapCoordinate } from './aeg-map-coord';
import { MapText } from './aeg-map-text';
import { CleanedAreaSessionMap, InteractiveMap, InteractiveMapData, MapPoint,
         MapPointAngle, MapTransform } from './aegapi-types';
import { assertIsDefined } from './utils';

// Special point items
type MapCrumb = 'interactive' | 'cleaned';
type MapItem = 'charger' | 'robot';

// Robot diameter
const ROBOT_DIAMETER = 0.325; // metres

// Rendering of cleaned-area maps
export class AEGRobotMap {

    // Map of transformation identifier to transformations
    transforms: Record<number, MapTransform> = {};

    // Transformed points
    crumbs: Record<MapCrumb, MapCoordinate[]> = { interactive: [], cleaned: [] };
    items:  Record<MapItem,  MapCoordinate[]> = { charger:     [], robot:   [] };
    zones:  Record<string,   MapCoordinate[]> = {};

    // Construct a map renderer
    constructor(map: CleanedAreaSessionMap, interactive?: InteractiveMap,
                interactiveMap?: InteractiveMapData) {
        // Information from the cleaned area session
        this.storeTransforms(map.transforms);
        assertIsDefined(map.crumbs);
        this.addCrumbs('cleaned', map.crumbs);
        map.chargerPoses.forEach(charger => this.addItem('charger', charger));
        this.addItem('robot', map.robotPose);

        // Extra details if an interactive map has also been provided
        if (interactive?.zones?.length) {
            interactive.zones.forEach(zone => this.addZone(zone.name, zone.vertices));
        }
        if (interactiveMap) {
            this.storeTransforms(interactiveMap.transforms);
            this.addCrumbs('interactive', interactiveMap.crumbs);
        }
    }

    // Store the transformations associated with a map
    storeTransforms(transforms: MapTransform[]): void {
        this.transforms = Object.fromEntries(transforms.map(t => [t.t, t]));
    }

    // Apply a transformation to a point
    applyTransform(orig: AnyMapCoordinate): MapCoordinate {
        let coord = new MapCoordinate(orig);
        if ('t' in orig && orig.t !== undefined) {
            coord = coord.transform(this.transforms[orig.t]);
        }
        return coord.rotate(-Math.PI / 2);
    }

    // Add crumbs to the map
    addCrumbs(type: MapCrumb, coords: MapPoint[]): void {
        this.crumbs[type] = coords.map(coord => this.applyTransform(coord));
    }

    // Add a special item to the map
    addItem(type: MapItem, coord: MapPointAngle): void {
        this.items[type].push(this.applyTransform(coord));
    }

    // Add a zone to the map
    addZone(name: string, coords: AnyMapCoordinate[]): void {
        this.zones[name] = coords.map(coord => this.applyTransform(coord));
    }

    // Render the map as text
    renderText(): string[] {
        // Create a canvas of the appropriate size
        const all = [this.crumbs, this.items, this.zones]
            .flatMap(data => Object.values(data).flat());
        const [srcMin, srcMax] = MapCoordinate.boundingBox(all);
        const margin = new MapCoordinate({ x: ROBOT_DIAMETER / 2, y: ROBOT_DIAMETER / 2 });
        const canvas = new MapText(srcMin.sub(margin), srcMax.add(margin));

        // Plot the interactive map breadcrumbs
        this.crumbs['interactive'].forEach(crumb => canvas.plotCircle(crumb, ROBOT_DIAMETER, '▒'));

        // Plot the zones
        Object.values(this.zones).forEach(coords => canvas.plotRectangle(coords));

        // Plot the cleaned area breadcrumbs
        this.crumbs['cleaned'].forEach(crumb => canvas.plotCircle(crumb, ROBOT_DIAMETER));

        // Label the zones
        Object.keys(this.zones).forEach(name => {
            const coord = MapCoordinate.mean(MapCoordinate.boundingBox(this.zones[name]));
            canvas.plotLabel(coord, name);
        });

        // Plot other items
        this.items['charger'].forEach(coord => canvas.plotLabel(coord, '[C]'));
        this.items['robot']  .forEach(coord => canvas.plotLabel(coord, '[R]'));

        // Convert the canvas to row strings
        return canvas.canvas;
    }
}