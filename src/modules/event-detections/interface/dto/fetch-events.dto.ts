export class FetchEventsQueryDto {
  endDate?: string;
  limit?: number;
  page?: number;
  eventFields?: string[];
  habitFields?: string[];
  saveToFile?: boolean;
  filename?: string;
  fetchAll?: boolean; // Set to true to fetch ALL records (ignore date range)
}
