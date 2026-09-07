"use client";

import Script from "next/script";
import { useCallback, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Rajasthan Technical University, Kota
const RTU_KOTA_CENTER = { lat: 25.1636, lng: 75.8378 };

type ClickInfo = {
  lat: number;
  lng: number;
  address: string | null;
};

type PointRisk = {
  ready: boolean;
  rainMm?: number;
  risk?: "low" | "medium" | "high";
  overview?: string;
  message?: string;
};

declare global {
  interface Window {
    google: typeof google;
  }
}

export default function Map() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObjRef = useRef<google.maps.Map | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const [clickInfo, setClickInfo] = useState<ClickInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [pointRisk, setPointRisk] = useState<PointRisk | null>(null);

  const handleMapClick = useCallback((event: google.maps.MapMouseEvent) => {
    const lat = event.latLng?.lat();
    const lng = event.latLng?.lng();
    if (lat === undefined || lng === undefined) return;

    setClickInfo({ lat, lng, address: null });
    setLoading(true);
    setPointRisk(null);

    geocoderRef.current?.geocode(
      { location: { lat, lng } },
      (results, status) => {
        setLoading(false);
        if (status === "OK" && results && results[0]) {
          setClickInfo({ lat, lng, address: results[0].formatted_address });
        } else {
          setClickInfo({ lat, lng, address: "No address found" });
        }
      }
    );

    fetch(`/api/point-risk?lat=${lat}&lng=${lng}`)
      .then((res) => res.json())
      .then((data: PointRisk) => setPointRisk(data))
      .catch(() => setPointRisk({ ready: false, message: "Lookup failed" }));
  }, []);

  const initMap = useCallback(() => {
    if (!mapRef.current || mapObjRef.current) return;

    mapObjRef.current = new window.google.maps.Map(mapRef.current, {
      center: RTU_KOTA_CENTER,
      zoom: 16,
    });
    geocoderRef.current = new window.google.maps.Geocoder();

    mapObjRef.current.addListener("click", handleMapClick);
  }, [handleMapClick]);

  const rainMm = pointRisk?.ready ? (pointRisk.rainMm ?? 0) : null;
  const rainMmPerSecond = rainMm == null ? null : rainMm / 3600;

  return (
    <div className="flex w-full flex-col gap-4">
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`}
        strategy="afterInteractive"
        onLoad={initMap}
      />

      <div className="isolate grid w-full gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,1fr)]">
      <div
        ref={mapRef}
        className="relative z-0 h-[min(70vh,44rem)] min-h-[24rem] w-full overflow-hidden rounded-lg border"
      />

      <div className="relative z-10 flex max-h-[min(70vh,44rem)] min-h-0 flex-col gap-4 overflow-y-auto">
        <Card>
          <CardHeader>
            <CardTitle>Clicked Location</CardTitle>
          </CardHeader>
          <CardContent>
            {!clickInfo && <p>Click anywhere on the map to see details.</p>}
            {clickInfo && (
              <div className="flex flex-col gap-1">
                <p>
                  <span className="font-medium">Latitude:</span>{" "}
                  {clickInfo.lat.toFixed(6)}
                </p>
                <p>
                  <span className="font-medium">Longitude:</span>{" "}
                  {clickInfo.lng.toFixed(6)}
                </p>
                <p>
                  <span className="font-medium">Road / Area:</span>{" "}
                  {loading ? "Looking up..." : clickInfo.address}
                </p>
                <p>
                  <span className="font-medium">Flood risk:</span>{" "}
                  {pointRisk?.ready ? pointRisk.risk : "—"}
                </p>
                {pointRisk?.overview && (
                  <p>
                    <span className="font-medium">OpenWeather AI summary:</span>{" "}
                    {pointRisk.overview}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rainfall</CardTitle>
          </CardHeader>
          <CardContent>
            {rainMm == null ? (
              <p>
                {!clickInfo
                  ? "Click the map to load rainfall."
                  : pointRisk && !pointRisk.ready
                    ? (pointRisk.message ?? "Not available yet")
                    : "Loading..."}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <PointRainfallGraph rainMm={rainMm} />
                <p>
                  <span className="font-medium">Rainfall:</span> {rainMm.toFixed(2)} mm/h
                </p>
                <p>
                  <span className="font-medium">Rainfall per second:</span>{" "}
                  <span className="font-mono">{rainMmPerSecond?.toFixed(6)} mm/s</span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}

function PointRainfallGraph({ rainMm }: { rainMm: number }) {
  const max = 40;
  const pct = Math.min(100, (rainMm / max) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div
        className="h-3 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`Rainfall ${rainMm.toFixed(2)} millimeters per hour`}
      >
        <div
          className="h-full rounded-full bg-blue-600"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-muted-foreground flex justify-between text-[10px]">
        <span>0 mm/h</span>
        <span>{max} mm/h</span>
      </div>
    </div>
  );
}
