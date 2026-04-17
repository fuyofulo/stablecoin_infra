import { Router } from 'express';
import { buildOpenApiSpec } from '../openapi.js';

export const openApiRouter = Router();

openApiRouter.get('/openapi.json', (_req, res) => {
  res.json(buildOpenApiSpec());
});
