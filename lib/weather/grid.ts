import {
  AREA_CENTER,
  AREA_HALF_WIDTH_KM,
  WEATHER_GRID_CELL_KM,
} from "./config";

const KM_PER_DEG_LAT = 111.32;

function kmPerDegLng(atLat: number): number {
  return KM_PER_DEG_LAT * Math.cos((atLat * Math.PI) / 180);
}

export type GridCell = {
  id: string;
  row: number;
  col: number;
  center: { lat: number; lng: number };
};

const latHalfSpan = AREA_HALF_WIDTH_KM / KM_PER_DEG_LAT;
const lngHalfSpan = AREA_HALF_WIDTH_KM / kmPerDegLng(AREA_CENTER.lat);

export const BOUNDING_BOX = {
  minLat: AREA_CENTER.lat - latHalfSpan,
  maxLat: AREA_CENTER.lat + latHalfSpan,
  minLng: AREA_CENTER.lng - lngHalfSpan,
  maxLng: AREA_CENTER.lng + lngHalfSpan,
};

const cellLatSpan = WEATHER_GRID_CELL_KM / KM_PER_DEG_LAT;
const cellLngSpan = WEATHER_GRID_CELL_KM / kmPerDegLng(AREA_CENTER.lat);

// Subtract a tiny epsilon before ceil() so floating-point error (e.g. a
// span that's mathematically exactly 3 cells but computes as 3.0000000004)
// doesn't overshoot to an extra row/column.
const EPSILON = 1e-9;

const rows = Math.max(
  1,
  Math.ceil((BOUNDING_BOX.maxLat - BOUNDING_BOX.minLat) / cellLatSpan - EPSILON)
);
const cols = Math.max(
  1,
  Math.ceil((BOUNDING_BOX.maxLng - BOUNDING_BOX.minLng) / cellLngSpan - EPSILON)
);

export function cellId(row: number, col: number): string {
  return `r${row}_c${col}`;
}

export function latLngToCell(lat: number, lng: number): { row: number; col: number } {
  const row = Math.min(
    rows - 1,
    Math.max(0, Math.floor((lat - BOUNDING_BOX.minLat) / cellLatSpan))
  );
  const col = Math.min(
    cols - 1,
    Math.max(0, Math.floor((lng - BOUNDING_BOX.minLng) / cellLngSpan))
  );
  return { row, col };
}

export function latLngToCellId(lat: number, lng: number): string {
  const { row, col } = latLngToCell(lat, lng);
  return cellId(row, col);
}

export function listGridCells(): GridCell[] {
  const cells: GridCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({
        id: cellId(row, col),
        row,
        col,
        center: {
          lat: BOUNDING_BOX.minLat + (row + 0.5) * cellLatSpan,
          lng: BOUNDING_BOX.minLng + (col + 0.5) * cellLngSpan,
        },
      });
    }
  }
  return cells;
}

export const GRID_DIMENSIONS = { rows, cols, count: rows * cols };
