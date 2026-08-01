import { Router } from 'express';
import { getInfo, downloadVideo } from './downloader.controller';

const router = Router();

router.get('/info', getInfo);
router.get('/', downloadVideo);

export default router;
