import { HttpStatus } from '@nestjs/common';

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T | null;
  error?: any;
  statusCode: number;
}

export const successResponse = <T>(
  message: string,
  data: T,
  statusCode: number = HttpStatus.OK,
): ApiResponse<T> => ({
  success: true,
  message,
  data,
  statusCode,
});

export const errorResponse = (
  message: string,
  error: any = null,
  statusCode: number = HttpStatus.BAD_REQUEST,
): ApiResponse => ({
  success: false,
  message,
  error,
  data: null,
  statusCode,
});
