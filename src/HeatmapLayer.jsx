import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';

// Sample points along polygon boundaries and interior to create dense heatmap coverage
function samplePoints(geometry) {
  const points = [];
  let rings = [];

  if (geometry.type === 'Polygon') {
    rings = geometry.coordinates;
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      rings = rings.concat(poly);
    }
  }

  for (const ring of rings) {
    // Sample every few vertices along the boundary
    const step = Math.max(1, Math.floor(ring.length / 30));
    for (let i = 0; i < ring.length; i += step) {
      const [lng, lat] = ring[i];
      points.push([lat, lng]);
    }
  }

  // Add centroid
  if (points.length > 0) {
    let latSum = 0, lngSum = 0;
    for (const [lat, lng] of points) {
      latSum += lat;
      lngSum += lng;
    }
    const cLat = latSum / points.length;
    const cLng = lngSum / points.length;
    // Add centroid and midpoints between centroid and boundary for interior fill
    points.push([cLat, cLng]);
    for (let i = 0; i < points.length - 1; i += 3) {
      points.push([
        (cLat + points[i][0]) / 2,
        (cLng + points[i][1]) / 2,
      ]);
    }
  }

  return points;
}

export default function HeatmapLayer({ geoData, electionData, heatMetric }) {
  const map = useMap();
  const heatLayerRef = useRef(null);

  useEffect(() => {
    if (!geoData || !electionData) return;

    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    const maxVotes = Math.max(...Object.values(electionData).map((r) => r.totalVotes));
    const maxMargin = Math.max(...Object.values(electionData).map((r) => r.winningMargin));
    const maxCompetition = Math.max(...Object.values(electionData).map((r) => r.competitionIndex));

    const allPoints = [];
    for (const feat of geoData.features) {
      const rid = feat.properties.region_id;
      const region = electionData[rid];
      if (!region) continue;

      let intensity;
      switch (heatMetric) {
        case 'winning_margin':
          intensity = region.winningMargin / (maxMargin || 1);
          break;
        case 'competition':
          intensity = region.competitionIndex / (maxCompetition || 1);
          break;
        case 'total_votes':
        default:
          intensity = region.totalVotes / (maxVotes || 1);
          break;
      }

      const sampled = samplePoints(feat.geometry);
      for (const [lat, lng] of sampled) {
        allPoints.push([lat, lng, intensity]);
      }
    }

    const heat = L.heatLayer(allPoints, {
      radius: 40,
      blur: 30,
      maxZoom: 10,
      max: 1.0,
      minOpacity: 0.3,
      gradient: {
        0.0: '#0d1b2a',
        0.2: '#1b3a5c',
        0.4: '#1d6fa5',
        0.5: '#38bdf8',
        0.6: '#fbbf24',
        0.8: '#f97316',
        1.0: '#ef4444',
      },
    });

    heat.addTo(map);
    heatLayerRef.current = heat;

    return () => {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
    };
  }, [geoData, electionData, heatMetric, map]);

  return null;
}
