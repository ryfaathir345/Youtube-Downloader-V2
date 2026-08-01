import { Request, Response } from 'express';
import { exec } from 'child_process';
import path from 'path';

export const processClipping = (req: Request, res: Response): void => {
  const { url, numClips = 2 } = req.body;

  if (!url) {
    res.status(400).json({ success: false, error: 'YouTube URL is required' });
    return;
  }

  const scriptPath = path.resolve(__dirname, 'test_youtube.py');
  
  // Menjalankan script test_youtube.py
  const command = `python "${scriptPath}" "${url}" ${numClips}`;

  const execOptions = {
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
    }
  };

  console.log(`[Clipper] Executing: ${command}`);

  exec(command, execOptions, (error, stdout, stderr) => {
    if (error) {
      console.error(`[Clipper Error]: ${error.message}`);
      console.error(`[Clipper Stderr]: ${stderr}`);
      res.status(500).json({ success: false, error: 'Failed to process video', details: error.message, stderr });
      return;
    }

    try {
      // Python output includes non-JSON logs. We split by "=== HASIL KLIP ==="
      const splitToken = "=== HASIL KLIP ===";
      const splitIndex = stdout.indexOf(splitToken);
      
      if (splitIndex !== -1) {
        const jsonStr = stdout.substring(splitIndex + splitToken.length).trim();
        const result = JSON.parse(jsonStr);
        res.json(result);
      } else {
        // Fallback: try to extract JSON from anywhere
        const match = stdout.match(/\{[\s\S]*\}/);
        if (match) {
           const result = JSON.parse(match[0]);
           res.json(result);
        } else {
           throw new Error("No JSON found in output");
        }
      }
    } catch (parseError: any) {
      console.error(`[Clipper Parse Error]: ${parseError.message}`);
      console.log(`Raw output: ${stdout}`);
      res.status(500).json({ success: false, error: 'Failed to parse AI output', raw: stdout });
    }
  });
};
