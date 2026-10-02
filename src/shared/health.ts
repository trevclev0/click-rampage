/** Response body of `GET /api/health`, shared by the worker and the app. */
export interface HealthResponse {
  status: "ok";
  environment: string;
  timestamp: string;
}
