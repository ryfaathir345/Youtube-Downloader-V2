import { Router } from 'express';
import { processClipping } from './clipper.controller';

const router = Router();

router.post('/process', processClipping);

export default router;
