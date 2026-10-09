'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import createGlobe, { type COBEOptions, type Marker } from 'cobe';
import { COUNTRY_LOCATIONS } from './country-locations';

export type CountryCount = { country: string; users: number; sellers: number };

export const GLOBE_COLORS = { shoppers: '#f97316', sellers: '#10b981' };

type Rgb = [number, number, number];
const SHOPPER_RGB: Rgb = [0.976, 0.451, 0.086];
const SELLER_RGB: Rgb = [0.063, 0.725, 0.506];

/** Opens facing Africa, tilted slightly so the northern hemisphere shows. */
const START_PHI = Math.PI - ((20 * Math.PI) / 180 - Math.PI / 2);
const THETA = 0.25;
const SPIN_PER_FRAME = 0.003;
const DRAG_SENSITIVITY = 0.005;
/** Sellers sit just east of shoppers so both dots show in the same country. */
const SELLER_OFFSET_DEGREES = 1.6;

export function globeMarkers(countries: CountryCount[]): Marker[] {
  const max = Math.max(1, ...countries.flatMap((c) => [c.users, c.sellers]));
  const size = (count: number) => 0.025 + 0.06 * Math.sqrt(count / max);
  return countries.flatMap(({ country, users, sellers }) => {
    const location = COUNTRY_LOCATIONS[country.toUpperCase()];
    if (!location) return [];
    const [lat, lng] = location;
    const markers: Marker[] = [];
    if (users > 0) {
      markers.push({
        location: [lat, lng],
        size: size(users),
        color: SHOPPER_RGB,
      });
    }
    if (sellers > 0) {
      markers.push({
        location: [lat, lng + (users > 0 ? SELLER_OFFSET_DEGREES : 0)],
        size: size(sellers),
        color: SELLER_RGB,
      });
    }
    return markers;
  });
}

/**
 * A slowly spinning dotted globe with a dot per country for shoppers and one
 * for sellers, sized by how many there are. Drag sideways to turn it.
 * Draws nothing where WebGL is unavailable; the country list beside it carries the numbers.
 */
export function WorldGlobe({ countries }: { countries: CountryCount[] }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const markers = useMemo(() => globeMarkers(countries), [countries]);
  const pendingMarkers = useRef<Marker[] | null>(markers);
  const pointer = useRef<{ id: number; x: number } | null>(null);
  const phi = useRef(START_PHI);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    pendingMarkers.current = markers;
  }, [markers]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas || typeof WebGLRenderingContext === 'undefined') {
      return;
    }

    const reduceMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let width = wrapper.offsetWidth;
    let resized = false;
    const options: COBEOptions = {
      devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      width,
      height: width,
      phi: phi.current,
      theta: THETA,
      dark: 1,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 6,
      baseColor: [0.3, 0.3, 0.3],
      markerColor: SHOPPER_RGB,
      glowColor: [0.85, 0.85, 0.85],
      markers: pendingMarkers.current ?? [],
    };
    pendingMarkers.current = null;
    const globe = createGlobe(canvas, options);

    let frame = 0;
    let running = false;
    const render = () => {
      if (!pointer.current && !reduceMotion) phi.current += SPIN_PER_FRAME;
      const next: Partial<COBEOptions> = { phi: phi.current };
      if (resized) {
        Object.assign(next, { width, height: width });
        resized = false;
      }
      if (pendingMarkers.current) {
        next.markers = pendingMarkers.current;
        pendingMarkers.current = null;
      }
      globe.update(next);
      frame = requestAnimationFrame(render);
    };
    const start = () => {
      if (running) return;
      running = true;
      frame = requestAnimationFrame(render);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
    };

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            if (wrapper.offsetWidth !== width) {
              width = wrapper.offsetWidth;
              resized = true;
            }
          });
    resizeObserver?.observe(wrapper);

    // Only animate while the globe is on screen.
    const visibility =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) =>
            entry?.isIntersecting ? start() : stop(),
          );
    if (visibility) visibility.observe(wrapper);
    else start();

    const fadeIn = window.setTimeout(() => setReady(true), 50);

    return () => {
      stop();
      window.clearTimeout(fadeIn);
      resizeObserver?.disconnect();
      visibility?.disconnect();
      globe.destroy();
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="relative mx-auto aspect-square w-full max-w-[440px]"
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="h-full w-full cursor-grab touch-pan-y transition-opacity duration-700 active:cursor-grabbing"
        style={{ opacity: ready ? 1 : 0 }}
        onPointerDown={(event) => {
          pointer.current = { id: event.pointerId, x: event.clientX };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = pointer.current;
          if (!drag || drag.id !== event.pointerId) return;
          phi.current += (event.clientX - drag.x) * DRAG_SENSITIVITY;
          drag.x = event.clientX;
        }}
        onPointerUp={() => {
          pointer.current = null;
        }}
        onPointerCancel={() => {
          pointer.current = null;
        }}
      />
    </div>
  );
}
