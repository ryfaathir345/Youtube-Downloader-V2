import { Request, Response } from 'express';
import ytDlp from 'yt-dlp-exec';
import { spawn } from 'child_process';

// Ensure ytDlp downloads the binary
export const getInfo = async (req: Request, res: Response): Promise<void> => {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'URL is required' });
    return;
  }

  try {
    const info: any = await ytDlp(url, {
      dumpJson: true,
      noWarnings: true,
    });

    const formats = info.formats
      .filter((f: any) => f.vcodec !== 'none' || f.acodec !== 'none')
      .map((f: any) => ({
        format_id: f.format_id,
        ext: f.ext,
        resolution: f.resolution || (f.width ? `${f.width}x${f.height}` : 'audio only'),
        quality: f.format_note || f.resolution,
        filesize: f.filesize || f.filesize_approx,
        vcodec: f.vcodec,
        acodec: f.acodec,
      }));

    res.json({
      title: info.title,
      duration_seconds: info.duration,
      thumbnail_url: info.thumbnail,
      platform: info.extractor,
      formats,
    });
  } catch (error: any) {
    console.error('Error fetching info:', error);
    res.status(500).json({ error: 'Failed to fetch video info', details: error.message });
  }
};

export const downloadVideo = (req: Request, res: Response): void => {
  const { url, quality } = req.query;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'URL is required' });
    return;
  }

  const format = quality ? String(quality) : 'best';

  try {
    // We use spawn directly to pipe stdout to res
    // yt-dlp-exec might not expose the stream properly in all versions
    const ytDlpProcess = ytDlp.exec(url, {
      f: format,
      o: '-', // output to stdout
    });

    res.setHeader('Content-Disposition', `attachment; filename="download.mp4"`);
    res.setHeader('Content-Type', 'video/mp4');

    if (ytDlpProcess.stdout) {
        ytDlpProcess.stdout.pipe(res);
    }

    ytDlpProcess.on('error', (err) => {
        console.error('Stream error:', err);
        if (!res.headersSent) {
            res.status(500).send('Download stream failed');
        }
    });

  } catch (error: any) {
    console.error('Error starting download:', error);
    res.status(500).json({ error: 'Failed to start download', details: error.message });
  }
};
