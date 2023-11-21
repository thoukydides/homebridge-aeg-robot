// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { MapPoint, MapPointAngle, MapTransform, Vertex } from './aegapi-types';

// Any type that can represent a coordinate
export type AnyMapCoordinate = Vertex | MapPoint | MapPointAngle;

// A transformable coordinate
export class MapCoordinate implements Vertex {

    readonly x: number;
    readonly y: number;

    // Constructor a coordinate
    constructor(coord: AnyMapCoordinate) {
        [this.x, this.y] = 'x' in coord ? [coord.x, coord.y]
                           : ('xy' in coord ? coord.xy : coord.xya);
    }

    // Scale the coordinate around the origin
    scale(scaleX: number, scaleY?: number): MapCoordinate {
        if (scaleY === undefined) scaleY = scaleX;
        return new MapCoordinate({ x: this.x * scaleX, y: this.y * scaleY });
    }

    // Translate the coordinate
    add(addend: Vertex): MapCoordinate {
        return new MapCoordinate({
            x:  this.x + addend.x,
            y:  this.y + addend.y
        });
    }

    // Difference between two coordinates
    sub(subtrahend: Vertex): MapCoordinate {
        return new MapCoordinate({
            x:  this.x - subtrahend.x,
            y:  this.y - subtrahend.y
        });
    }

    // Rotate the coordinate anti-clockwise around the origin
    rotate(radians: number): MapCoordinate {
        return new MapCoordinate({
            x:  this.x * Math.cos(radians) - this.y * Math.sin(radians),
            y:  this.x * Math.sin(radians) + this.y * Math.cos(radians)
        });
    }

    // Map transformation
    transform(transform: MapTransform): MapCoordinate {
        const [x, y, radians] = transform.xya;
        return this.sub({ x, y }).rotate(-radians);
    }

    // Split a coordinate into integral and signed fraction parts
    quantize(): [MapCoordinate, MapCoordinate] {
        const int = new MapCoordinate({ x: Math.round(this.x), y: Math.round(this.y) });
        const frac = this.sub(int);
        return [int, frac];
    }

    // Bounding box for a collection of coordinates
    static boundingBox(coords: Vertex[]): [MapCoordinate, MapCoordinate] {
        const allX = coords.map(coord => coord.x);
        const allY = coords.map(coord => coord.y);
        return [
            new MapCoordinate({ x: Math.min(...allX), y: Math.min(...allY) }),
            new MapCoordinate({ x: Math.max(...allX), y: Math.max(...allY) })
        ];
    }

    // Mean of a collection of coordinate
    static mean(coords: Vertex[]): MapCoordinate {
        const mean = (values: number[]): number =>
            values.reduce((prev, current) => prev + current, 0) / values.length;
        return new MapCoordinate({
            x:  mean(coords.map(coord => coord.x)),
            y:  mean(coords.map(coord => coord.y))
        });
    }
}