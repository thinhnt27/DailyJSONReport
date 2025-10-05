export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T> {
  pagination: PaginationMeta;
}

/**
 * Create a standardized success response
 */
export function createSuccessResponse<T>(
  data: T,
  message = 'Operation successful',
): ApiResponse<T> {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a standardized paginated response
 */
export function createPaginatedResponse<T>(
  data: T,
  pagination: PaginationMeta,
  message = 'Data retrieved successfully',
): PaginatedResponse<T> {
  return {
    success: true,
    message,
    data,
    pagination,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(message: string): ApiResponse<null> {
  return {
    success: false,
    message,
    data: null,
    timestamp: new Date().toISOString(),
  };
}
