export abstract class CityCoordinatesPort {
  public abstract findCoordinates(cityId: string): Promise<{ lat: number; lng: number } | null>;
}
