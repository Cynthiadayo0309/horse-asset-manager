export interface ApiSuccess<T> {
  data: T;
  message: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedSuccess<T> extends ApiSuccess<T[]> {
  meta: PaginationMeta;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details: Array<{ path?: string; message: string }>;
  };
}
