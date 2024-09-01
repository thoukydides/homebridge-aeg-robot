// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { MapCoordinate } from './aeg-map-coord.js';

// Block and box drawing characters
const QUADRANT_CHARS    = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█';
const BOX_CHARS         = { single: '╭╮╰╯─│', double: '╔╗╚╝═║' };

// Character aspect ratio (width / height)
const ASPECT_RATIO = 0.7;

// Default canvas dimensions in characters
const MAX_WIDTH = 80;
const MAX_HEIGHT = MAX_WIDTH * ASPECT_RATIO;

// A text canvas
export class MapText {

    // The canvas
    readonly canvas:    string[];
    readonly cols:      number;
    readonly rows:      number;

    // Transform from source position to character coordinates
    readonly scaleX:    number;
    readonly scaleY:    number;
    readonly topLeft:   MapCoordinate;

    // Construct a text canvas
    constructor(boundMin: MapCoordinate, boundMax: MapCoordinate,
                maxWidth: number = MAX_WIDTH, maxHeight: number = MAX_HEIGHT) {
        // Scaling from source coordinates to characters
        const boundSize = boundMax.sub(boundMin);
        this.scaleX = Math.min((maxWidth  - 1) / boundSize.x,
                               (maxHeight - 1) / (boundSize.y * ASPECT_RATIO));
        this.scaleY = this.scaleX * ASPECT_RATIO;

        // Source coordinate corresponding to centre of top-left character
        this.topLeft = new MapCoordinate({ x: boundMin.x, y: boundMax.y });

        // Actual canvas dimensions in characters
        const [canvasSize] = boundSize.scale(this.scaleX, this.scaleY).quantize();
        this.cols = canvasSize.x + 1;
        this.rows = canvasSize.y + 1;

        // Create a blank canvas
        this.canvas = new Array<string>(this.rows).fill(' '.repeat(this.cols));
    }

    // Convert a coordinate to canvas coordinates
    transform(coord: MapCoordinate): MapCoordinate {
        return coord.sub(this.topLeft).scale(this.scaleX, -this.scaleY);
    }

    // Plot a string label
    plotLabel(centre: MapCoordinate, label: string): void {
        const coord = this.transform(centre)
            .sub(new MapCoordinate({ x: label.length / 2, y: 0 }));
        this.set(coord.quantize()[0], label);
    }

    // Plot a rectangular box
    plotRectangle(coords: MapCoordinate[], style: keyof typeof BOX_CHARS = 'single'): void {
        // Use the rounded bounding box of the provided coordinates
        const [coordMin, coordMax] = MapCoordinate.boundingBox(coords.map(coord => this.transform(coord).quantize()[0]));

        // Named access to the box drawing characters
        const [tl, tr, bl, br, h, v] = BOX_CHARS[style];

        // Plot the edges
        for (let x = coordMin.x + 1; x < coordMax.x; ++x) {
            this.set(new MapCoordinate({ x, y: coordMin.y }), h);
            this.set(new MapCoordinate({ x, y: coordMax.y }), h);
        }
        for (let y = coordMin.y + 1; y < coordMax.y; ++y) {
            this.set(new MapCoordinate({ x: coordMin.x, y }), v);
            this.set(new MapCoordinate({ x: coordMax.x, y }), v);
        }

        // Plot the corners
        this.set(coordMin, tl);
        this.set(coordMax, br);
        this.set(new MapCoordinate({ x: coordMin.x, y: coordMax.y }), bl);
        this.set(new MapCoordinate({ x: coordMax.x, y: coordMin.y }), tr);
    }

    // Plot a filled circle
    plotCircle(centre: MapCoordinate, diameter = 0, shade?: string): void {
        // Ellipse characteristics in character coordinates
        const coord = this.transform(centre);
        const radiusX = diameter * this.scaleX / 2;
        const radiusY = diameter * this.scaleY / 2;

        // Grid size for quadrant blocks or whole characters
        const step = shade === undefined ? 0.5 : 1;
        //console.log({centre, coord, shade, step});
        const ceil = (value: number): number =>
            (Math.ceil(value / step - step) + step) * step;

        // Plot the ellipse, row by row
        for (let y = ceil(coord.y - radiusY); y < coord.y + radiusY; y += step) {
            const r = Math.sqrt(1 - ((y - coord.y) / radiusY) ** 2) * radiusX;
            for (let x = ceil(coord.x - r); x <= coord.x + r; x += step) {
                if (shade) this.set(new MapCoordinate({ x, y }), shade);
                else this.setQuadrant(new MapCoordinate({ x, y }));
            }
        }
    }

    // Set a quadrant block
    setQuadrant(coord: MapCoordinate): void {
        const [int, frac] = coord.quantize();

        // Determine the currently set quadrants
        let quadBits = QUADRANT_CHARS.indexOf(this.get(int));
        if (quadBits === -1) quadBits = 0;

        // Set the required quadrant
        const quad = (frac.x < 0 ? 0 : 1) + (frac.y < 0 ? 0 : 2);
        //console.log({coord, int, frac, quad});
        this.set(int, QUADRANT_CHARS[quadBits | (1 << quad)]);
    }

    // Get a string (usually single character) from the canvas
    get(coord: MapCoordinate, length = 1): string {
        return this.canvas[coord.y].substring(coord.x, coord.x + length);
    }

    // Set a string (usually single character) in the canvas
    set(coord: MapCoordinate, value: string): void {
        // Apply range checks
        if (coord.y < 0 || this.rows <= coord.y) return;
        if (coord.x + value.length <= 0 || this.cols <= coord.x) return;

        // Move a partially visible string within the canvas
        let x = coord.x;
        if (this.cols < value.length) value = value.substring(0, this.cols);
        if (x < 0) x = 0;
        if (this.cols < x + value.length) x = this.cols - value.length;

        // Update the canvas
        this.canvas[coord.y] = this.canvas[coord.y].substring(0, x) + value
                             + this.canvas[coord.y].substring(x + value.length);
    }
}