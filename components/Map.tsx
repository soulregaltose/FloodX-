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

  const handleMapClick = useCallback((event: google.maps.MapMouseEvent) => {
    const lat = event.latLng?.lat();
    const lng = event.latLng?.lng();
    if (lat === undefined || lng === undefined) return;

    setClickInfo({ lat, lng, address: null });
    setLoading(true);

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

  return (
    <div className="flex w-full flex-col gap-4">
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`}
        strategy="afterInteractive"
        onLoad={initMap}
      />

      <div ref={mapRef} className="h-[500px] w-full rounded-lg border" />

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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
