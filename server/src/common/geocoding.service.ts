/**
 * Geocoding Service — converts addresses to lat/lng coordinates.
 *
 * Uses the free Nominatim (OpenStreetMap) geocoding API.
 * Falls back gracefully if geocoding fails or is unavailable.
 *
 * Usage:
 *   const coords = await geocodingService.geocode('123 Main St, Singapore');
 *   // → { lat: 1.2839, lng: 103.8607 } or null
 */
import { logger } from './logger';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'NirvasoftPMS/1.0';

interface GeoResult {
  lat: number;
  lng: number;
  displayName: string;
}

class GeocodingService {
  /**
   * Geocode a full address string to lat/lng.
   * Returns null if geocoding fails or no results found.
   */
  async geocode(address: string): Promise<GeoResult | null> {
    if (!address || address.trim().length < 3) return null;

    try {
      const params = new URLSearchParams({
        q: address,
        format: 'json',
        limit: '1',
        addressdetails: '0',
      });

      const response = await fetch(`${NOMINATIM_BASE}?${params}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        logger.warn(`Geocoding API returned ${response.status} for: ${address}`);
        return null;
      }

      const data = await response.json() as Array<{
        lat: string; lon: string; display_name: string;
      }>;

      if (data.length === 0) {
        logger.debug(`No geocoding results for: ${address}`);
        return null;
      }

      const result = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        displayName: data[0].display_name,
      };

      logger.debug(`Geocoded "${address}" → ${result.lat}, ${result.lng}`);
      return result;
    } catch (err: any) {
      logger.warn(`Geocoding failed for "${address}": ${err.message}`);
      return null;
    }
  }

  /**
   * Build a geocodable address string from separate fields.
   */
  buildAddress(parts: {
    addressLine1?: string | null; addressLine2?: string | null;
    city?: string | null; state?: string | null;
    postalCode?: string | null; country?: string | null;
  }): string {
    return [
      parts.addressLine1,
      parts.addressLine2,
      parts.city,
      parts.state,
      parts.postalCode,
      parts.country,
    ].filter(Boolean).join(', ');
  }

  /**
   * Geocode from separate address fields. Convenience wrapper.
   */
  async geocodeFromFields(fields: {
    addressLine1?: string | null; addressLine2?: string | null;
    city?: string | null; state?: string | null;
    postalCode?: string | null; country?: string | null;
  }): Promise<GeoResult | null> {
    const address = this.buildAddress(fields);
    if (address.length < 5) return null;
    return this.geocode(address);
  }
}

export const geocodingService = new GeocodingService();
