export type LatLng = { lat: number; lng: number };

// Google's encoded polyline algorithm: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Polyline vertices aren't evenly spaced, so resample the path at a fixed
 * distance interval. Cheap to do densely — this is local computation, not
 * an API call.
 */
export function sampleAlongPath(
  path: LatLng[],
  intervalMeters: number
): LatLng[] {
  if (path.length === 0) return [];
  const samples: LatLng[] = [path[0]];
  let carry = 0;

  for (let i = 1; i < path.length; i++) {
    const start = path[i - 1];
    const end = path[i];
    const segmentLength = haversineMeters(start, end);
    if (segmentLength === 0) continue;

    let distanceIntoSegment = intervalMeters - carry;
    while (distanceIntoSegment < segmentLength) {
      const t = distanceIntoSegment / segmentLength;
      samples.push({
        lat: start.lat + (end.lat - start.lat) * t,
        lng: start.lng + (end.lng - start.lng) * t,
      });
      distanceIntoSegment += intervalMeters;
    }
    carry = segmentLength - (distanceIntoSegment - intervalMeters);
  }

  samples.push(path[path.length - 1]);
  return samples;
}
