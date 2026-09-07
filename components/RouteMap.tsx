"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const RTU_KOTA_CENTER = { lat: 25.1636, lng: 75.8378 };
// Bias autocomplete suggestions toward the Kota area (not a hard restriction).
const KOTA_BOUNDS = { north: 25.24, south: 25.09, east: 75.92, west: 75.76 };

const RISK_COLOR: Record<string, string> = {
  low: "#22c55e",
  medium: "#eab308",
  high: "#ef4444",
};

type RiskPoint = { lat: number; lng: number; rainMm: number; risk: string };

type RankedRoute = {
  summary: string;
  distanceMeters: number;
  durationSeconds: number;
  risk: "low" | "medium" | "high";
  points: RiskPoint[];
};

type RouteRiskResponse = {
  routes: RankedRoute[];
  recommendedIndex: number;
};

declare global {
  interface Window {
    google: typeof google;
  }
}

export default function RouteMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObjRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Partial<Record<"A" | "B", google.maps.Marker>>>(
    {}
  );
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const originInputRef = useRef<HTMLInputElement>(null);
  const destinationInputRef = useRef<HTMLInputElement>(null);

  const [origin, setOrigin] = useState<google.maps.LatLngLiteral | null>(null);
  const [destination, setDestination] =
    useState<google.maps.LatLngLiteral | null>(null);
  const [result, setResult] = useState<RouteRiskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearRoutes = useCallback(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
  }, []);

  const placeMarker = useCallback(
    (label: "A" | "B", point: google.maps.LatLngLiteral) => {
      if (!mapObjRef.current) return;
      const existing = markersRef.current[label];
      if (existing) {
        existing.setPosition(point);
      } else {
        markersRef.current[label] = new window.google.maps.Marker({
          position: point,
          map: mapObjRef.current,
          label,
        });
      }
    },
    []
  );

  const drawRoutes = useCallback((routes: RankedRoute[]) => {
    if (!mapObjRef.current) return;
    routes.forEach((route) => {
      const polyline = new window.google.maps.Polyline({
        path: route.points.map((p) => ({ lat: p.lat, lng: p.lng })),
        strokeColor: RISK_COLOR[route.risk],
        strokeWeight: 5,
        strokeOpacity: 0.8,
      });
      polyline.setMap(mapObjRef.current);
      polylinesRef.current.push(polyline);
    });
  }, []);

  const fetchRoutes = useCallback(
    async (o: google.maps.LatLngLiteral, d: google.maps.LatLngLiteral) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/route-risk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin: o, destination: d }),
        });
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const data: RouteRiskResponse = await res.json();
        setResult(data);
        clearRoutes();
        drawRoutes(data.routes);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch routes");
      } finally {
        setLoading(false);
      }
    },
    [drawRoutes, clearRoutes]
  );

  const applyOrigin = useCallback(
    (point: google.maps.LatLngLiteral) => {
      placeMarker("A", point);
      setOrigin(point);
      setResult(null);
      clearRoutes();
    },
    [placeMarker, clearRoutes]
  );

  const applyDestination = useCallback(
    (point: google.maps.LatLngLiteral, currentOrigin: google.maps.LatLngLiteral | null) => {
      placeMarker("B", point);
      setDestination(point);
      if (currentOrigin) void fetchRoutes(currentOrigin, point);
    },
    [placeMarker, fetchRoutes]
  );

  const handleMapClick = useCallback(
    (event: google.maps.MapMouseEvent) => {
      const lat = event.latLng?.lat();
      const lng = event.latLng?.lng();
      if (lat === undefined || lng === undefined) return;
      const point = { lat, lng };

      if (!origin) {
        if (originInputRef.current) {
          originInputRef.current.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        }
        applyOrigin(point);
        return;
      }

      if (!destination) {
        if (destinationInputRef.current) {
          destinationInputRef.current.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        }
        applyDestination(point, origin);
        return;
      }

      if (originInputRef.current) {
        originInputRef.current.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }
      if (destinationInputRef.current) destinationInputRef.current.value = "";
      setDestination(null);
      applyOrigin(point);
    },
    [origin, destination, applyOrigin, applyDestination]
  );

  const handleMapClickRef = useRef(handleMapClick);
  useEffect(() => {
    handleMapClickRef.current = handleMapClick;
  }, [handleMapClick]);

  const originRef = useRef(origin);
  useEffect(() => {
    originRef.current = origin;
  }, [origin]);

  const initMap = useCallback(() => {
    if (!mapRef.current || mapObjRef.current) return;

    mapObjRef.current = new window.google.maps.Map(mapRef.current, {
      center: RTU_KOTA_CENTER,
      zoom: 14,
    });

    mapObjRef.current.addListener("click", (e: google.maps.MapMouseEvent) =>
      handleMapClickRef.current(e)
    );

    const bounds = new window.google.maps.LatLngBounds(
      { lat: KOTA_BOUNDS.south, lng: KOTA_BOUNDS.west },
      { lat: KOTA_BOUNDS.north, lng: KOTA_BOUNDS.east }
    );

    if (originInputRef.current) {
      const originAutocomplete = new window.google.maps.places.Autocomplete(
        originInputRef.current,
        { bounds, fields: ["geometry"] }
      );
      originAutocomplete.addListener("place_changed", () => {
        const place = originAutocomplete.getPlace();
        const location = place.geometry?.location;
        if (!location) return;
        applyOrigin({ lat: location.lat(), lng: location.lng() });
      });
    }

    if (destinationInputRef.current) {
      const destinationAutocomplete = new window.google.maps.places.Autocomplete(
        destinationInputRef.current,
        { bounds, fields: ["geometry"] }
      );
      destinationAutocomplete.addListener("place_changed", () => {
        const place = destinationAutocomplete.getPlace();
        const location = place.geometry?.location;
        if (!location) return;
        applyDestination(
          { lat: location.lat(), lng: location.lng() },
          originRef.current
        );
      });
    }
  }, [applyOrigin, applyDestination]);

  const reset = useCallback(() => {
    Object.values(markersRef.current).forEach((m) => m?.setMap(null));
    markersRef.current = {};
    clearRoutes();
    setOrigin(null);
    setDestination(null);
    setResult(null);
    setError(null);
    if (originInputRef.current) originInputRef.current.value = "";
    if (destinationInputRef.current) destinationInputRef.current.value = "";
  }, [clearRoutes]);

  useEffect(() => {
    const resizeMap = () => {
      const map = mapObjRef.current;
      if (!map || !window.google) return;
      window.google.maps.event.trigger(map, "resize");
    };
    resizeMap();
    window.addEventListener("resize", resizeMap);
    return () => window.removeEventListener("resize", resizeMap);
  }, [result]);

  const recommended = result?.routes[result.recommendedIndex] ?? null;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
        strategy="afterInteractive"
        onLoad={initMap}
      />

      <div className="grid shrink-0 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="origin-input">Point A</Label>
          <Input
            id="origin-input"
            ref={originInputRef}
            placeholder="Type an address, or click the map"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="destination-input">Point B</Label>
          <Input
            id="destination-input"
            ref={destinationInputRef}
            placeholder="Type an address, or click the map"
          />
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          Reset
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 isolate grid-rows-[minmax(16rem,45vh)_minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <div
          ref={mapRef}
          className="relative z-0 min-h-0 w-full overflow-hidden rounded-lg border"
        />

        <aside className="relative z-10 flex min-h-0 flex-col overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-3 pr-4">
            <div className="flex flex-col gap-4 pb-6">
          <Card>
            <CardHeader>
              <CardTitle>Recommended route</CardTitle>
            </CardHeader>
            <CardContent>
              {loading && <p>Calculating routes...</p>}
              {error && <p className="text-destructive">{error}</p>}
              {!loading && !error && !result && (
                <p>Enter or click two points to compare routes.</p>
              )}
              {result && recommended && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between rounded-md border border-green-600/40 bg-green-50 p-2 text-sm dark:bg-green-950/30">
                    <div>
                      <p className="font-medium">
                        {recommended.summary || "Recommended"}
                        <span className="ml-2 text-green-600">Recommended</span>
                      </p>
                      <p className="text-muted-foreground">
                        {(recommended.distanceMeters / 1000).toFixed(1)} km,{" "}
                        {Math.round(recommended.durationSeconds / 60)} min
                      </p>
                    </div>
                    <span
                      className="rounded-full px-2 py-1 text-xs font-medium text-white"
                      style={{ backgroundColor: RISK_COLOR[recommended.risk] }}
                    >
                      {recommended.risk}
                    </span>
                  </div>
                  {result.routes.map((route, i) =>
                    i === result.recommendedIndex ? null : (
                      <div
                        key={route.summary + i}
                        className="flex items-center justify-between rounded-md border p-2 text-sm"
                      >
                        <div>
                          <p className="font-medium">
                            {route.summary || `Route ${i + 1}`}
                          </p>
                          <p className="text-muted-foreground">
                            {(route.distanceMeters / 1000).toFixed(1)} km,{" "}
                            {Math.round(route.durationSeconds / 60)} min
                          </p>
                        </div>
                        <span
                          className="rounded-full px-2 py-1 text-xs font-medium text-white"
                          style={{ backgroundColor: RISK_COLOR[route.risk] }}
                        >
                          {route.risk}
                        </span>
                      </div>
                    )
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rainfall along recommended route</CardTitle>
            </CardHeader>
            <CardContent>
              {recommended ? (
                <RainfallGraph points={recommended.points} />
              ) : (
                <p>Rainfall graph appears after a route is calculated.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rainfall per second</CardTitle>
            </CardHeader>
            <CardContent>
              {recommended ? (
                <RainfallPerSecondTable points={recommended.points} />
              ) : (
                <p>Per-second rainfall samples appear after a route is calculated.</p>
              )}
            </CardContent>
          </Card>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function rainMmPerSecond(rainMmPerHour: number) {
  return rainMmPerHour / 3600;
}

function RainfallGraph({ points }: { points: RiskPoint[] }) {
  const width = 440;
  const height = 260;
  const pad = { top: 18, right: 14, bottom: 40, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const peak = Math.max(0, ...points.map((p) => p.rainMm));
  const yMax = Math.max(40, peak * 1.25);
  const xAt = (i: number) =>
    pad.left +
    (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yAt = (rain: number) => pad.top + innerH - (rain / yMax) * innerH;
  const ticks = [0, 10, 20, 30, 40].filter((t) => t <= yMax);
  if (yMax > 40) ticks.push(Math.round(yMax));

  const lineD = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p.rainMm).toFixed(1)}`
    )
    .join(" ");
  const lastX = xAt(Math.max(0, points.length - 1));
  const firstX = xAt(0);
  const baseline = pad.top + innerH;
  const areaD = points.length
    ? `${lineD} L ${lastX.toFixed(1)} ${baseline} L ${firstX.toFixed(1)} ${baseline} Z`
    : "";

  const bands = [
    { from: 0, to: Math.min(10, yMax), color: "#22c55e" },
    { from: 10, to: Math.min(30, yMax), color: "#eab308" },
    { from: 30, to: yMax, color: "#ef4444" },
  ].filter((b) => b.to > b.from);

  const fillId = "rainfall-area-fill";

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="h-[260px] w-full overflow-visible rounded-md bg-white ring-1 ring-foreground/10 dark:bg-zinc-950">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height="260"
          preserveAspectRatio="xMidYMid meet"
          overflow="visible"
          role="img"
          aria-label="Rainfall in millimeters per hour along the recommended route"
        >
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.08" />
            </linearGradient>
          </defs>
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={pad.left}
                y1={yAt(tick)}
                x2={pad.left + innerW}
                y2={yAt(tick)}
                stroke="#d4d4d8"
                strokeWidth="1"
              />
              <text
                x={pad.left - 8}
                y={yAt(tick) + 4}
                textAnchor="end"
                fill="#52525b"
                fontSize="11"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {tick}
              </text>
            </g>
          ))}
          {bands
            .filter((band) => band.from > 0)
            .map((band) => (
              <line
                key={`threshold-${band.from}`}
                x1={pad.left}
                y1={yAt(band.from)}
                x2={pad.left + innerW}
                y2={yAt(band.from)}
                stroke={band.color}
                strokeWidth="1.5"
                strokeDasharray="5 4"
                strokeOpacity="0.9"
              />
            ))}
          {areaD && <path d={areaD} fill={`url(#${fillId})`} />}
          {lineD && (
            <path
              d={lineD}
              fill="none"
              stroke="#1d4ed8"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {points.map((p, i) => (
            <circle
              key={`${p.lat}-${p.lng}-${i}`}
              cx={xAt(i)}
              cy={yAt(p.rainMm)}
              r="4"
              fill="#fff"
              stroke="#1d4ed8"
              strokeWidth="2"
            />
          ))}
          <text
            x={pad.left + innerW / 2}
            y={height - 10}
            textAnchor="middle"
            fill="#52525b"
            fontSize="11"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            Distance along route
          </text>
          <text
            x={14}
            y={pad.top + innerH / 2}
            textAnchor="middle"
            fill="#52525b"
            fontSize="11"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            transform={`rotate(-90 14 ${pad.top + innerH / 2})`}
          >
            mm/h
          </text>
        </svg>
      </div>
      <p className="text-muted-foreground text-xs">
        Blue line is rainfall along the route. Dashed yellow / red lines mark
        medium (10 mm/h) and high (30 mm/h) risk. Peak {peak.toFixed(2)} mm/h.
      </p>
    </div>
  );
}

function RainfallPerSecondTable({ points }: { points: RiskPoint[] }) {
  return (
    <table className="w-full text-left text-xs">
      <thead>
        <tr className="border-b">
          <th className="py-1.5 pr-2 font-medium">#</th>
          <th className="py-1.5 pr-2 font-medium">mm/h</th>
          <th className="py-1.5 font-medium">mm/s</th>
        </tr>
      </thead>
      <tbody>
        {points.map((p, i) => (
          <tr key={`${p.lat}-${p.lng}-${i}`} className="border-b last:border-0">
            <td className="py-1 pr-2">{i + 1}</td>
            <td className="py-1 pr-2">{p.rainMm.toFixed(2)}</td>
            <td className="py-1 font-mono">
              {rainMmPerSecond(p.rainMm).toFixed(6)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
