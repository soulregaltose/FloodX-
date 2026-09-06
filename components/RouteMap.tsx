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

  return (
    <div className="flex w-full flex-col gap-4">
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
        strategy="afterInteractive"
        onLoad={initMap}
      />

      <div className="grid gap-3 sm:grid-cols-2">
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
      </div>

      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={reset}>
          Reset
        </Button>
      </div>

      <div ref={mapRef} className="h-[500px] w-full rounded-lg border" />

      <Card>
        <CardHeader>
          <CardTitle>Route risk</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <p>Calculating routes...</p>}
          {error && <p className="text-destructive">{error}</p>}
          {!loading && !error && !result && (
            <p>Enter or click two points to compare routes.</p>
          )}
          {result && (
            <div className="flex flex-col gap-3">
              {result.routes.map((route, i) => (
                <div
                  key={route.summary + i}
                  className="flex items-center justify-between rounded-md border p-2 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {route.summary || `Route ${i + 1}`}
                      {i === result.recommendedIndex && (
                        <span className="ml-2 text-green-600">
                          (Recommended)
                        </span>
                      )}
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
