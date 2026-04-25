export interface ApiErrorShape {
  success: false;
  error: string;
  code: string;
}

export interface ApiSuccessShape<T> {
  success: true;
  data: T;
}

export const formatSuccess = <T>(data: T): ApiSuccessShape<T> => ({
  success: true,
  data
});

export const formatError = (error: string, code: string): ApiErrorShape => ({
  success: false,
  error,
  code
});
