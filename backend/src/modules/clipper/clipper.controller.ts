import { Request, Response } from 'express';
import { execFile, spawn } from 'child_process';
import path from 'path';

export const processClipping = (req: Request, res: Response): void => {
  const {
    url,
    numClips = 2,
    clipDuration = 30,
    aspectRatio = '9:16',
    subtitleStyle,
    subtitlePosition = 'top',
    typingAnimation = false
  } = req.body;

  if (!url) {
    res.status(400).json({ success: false, error: 'YouTube URL is required' });
    return;
  }

  const subtitleConfig = {
    style: subtitleStyle || { font: 'Arial', color: 'white_black', size: 'medium', bold: true },
    position: subtitlePosition,
    typingAnimation: typingAnimation === true || typingAnimation === 'true',
  };

  const scriptPath = path.resolve(__dirname, 'test_youtube.py');
  
  const args = [
    scriptPath,
    url,
    String(numClips),
    String(clipDuration),
    String(aspectRatio),
    JSON.stringify(subtitleConfig)
  ];

  const execOptions = {
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
    }
  };

  console.log(`[Clipper] Executing: python ${args.join(' ')}`);

  // Use spawn instead of execFile to avoid maxBuffer limits and allow keep-alive
  const child = spawn('python', args, execOptions);

  let stdoutBuf = '';
  let fullStdout = '';
  let stderrBuf = '';

  // Use NDJSON over HTTP Stream
  res.setHeader('Content-Type', 'application/x-ndjson');
  // Keep connection alive with newlines instead of spaces
  const keepAliveInterval = setInterval(() => {
    res.write('\n');
  }, 15000);

  child.stdout.on('data', (data) => {
    const chunk = data.toString();
    stdoutBuf += chunk;
    fullStdout += chunk;
    
    // Process full lines for progress events
    const lines = stdoutBuf.split('\n');
    // The last element might be an incomplete line
    stdoutBuf = lines.pop() || '';
    
    for (const line of lines) {
      if (line.includes('=== PROGRESS ===')) {
        try {
          const jsonStr = line.split('=== PROGRESS ===')[1].trim();
          // Validate and forward to frontend
          JSON.parse(jsonStr);
          res.write(jsonStr + '\n');
        } catch (e) {
          // ignore parsing error for progress line
        }
      }
    }
  });

  child.stderr.on('data', (data) => {
    stderrBuf += data.toString();
  });

  child.on('close', (code) => {
    clearInterval(keepAliveInterval);
    
    if (code !== 0) {
      console.error(`[Clipper Error]: Process exited with code ${code}`);
      console.error(`[Clipper Stderr]: ${stderrBuf}`);
      res.write(JSON.stringify({ type: 'result', success: false, error: 'Failed to process video', details: `Exit code ${code}`, stderr: stderrBuf }) + '\n');
      res.end();
      return;
    }

    try {
      // Python output includes non-JSON logs. We split by "=== HASIL KLIP ==="
      const splitToken = "=== HASIL KLIP ===";
      const splitIndex = fullStdout.indexOf(splitToken);
      
      if (splitIndex !== -1) {
        const jsonStr = fullStdout.substring(splitIndex + splitToken.length).trim();
        // Validate JSON
        const parsed = JSON.parse(jsonStr);
        parsed.type = 'result';
        res.write(JSON.stringify(parsed) + '\n');
        res.end();
      } else {
        // Fallback: try to extract JSON from anywhere
        const match = fullStdout.match(/\{[\s\S]*\}/);
        if (match) {
           const parsed = JSON.parse(match[0]);
           parsed.type = 'result';
           res.write(JSON.stringify(parsed) + '\n');
           res.end();
        } else {
           throw new Error("No JSON found in output");
        }
      }
    } catch (parseError: any) {
      console.error(`[Clipper Parse Error]: ${parseError.message}`);
      res.write(JSON.stringify({ type: 'result', success: false, error: 'Failed to parse AI output' }) + '\n');
      res.end();
    }
  });
};
