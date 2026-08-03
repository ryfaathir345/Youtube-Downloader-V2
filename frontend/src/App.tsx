import { useState } from 'react';
import { AlertCircle, X, Smartphone, Monitor, Clock, Scissors, Settings, Sparkles, Cpu, Zap, Loader, Film, CheckCircle2, Video, UploadCloud, Link as LinkIcon } from 'lucide-react';
import { ClipCard } from './components/ClipCard';
import type { Clip } from './components/ClipCard';
import { Link } from 'react-router-dom';
import './index.css';

const extractYouTubeId = (url: string): string | null => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

function App() {
  const [url, setUrl] = useState('');
  const [numClips, setNumClips] = useState(3);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [clipDuration, setClipDuration] = useState(30);

  // Subtitle Settings State
  const [subFont, setSubFont] = useState('Arial');
  const [subColor, setSubColor] = useState('white_black');
  const [subSize, setSubSize] = useState('medium');
  const [subBold, setSubBold] = useState(true);
  const [subPosition, setSubPosition] = useState('top');
  const [typingAnimation, setTypingAnimation] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [previewClip, setPreviewClip] = useState<Clip | null>(null);

  const [progress, setProgress] = useState<{ stage: string, percent: number, detail: string } | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url) return;
    
    setLoading(true);
    setError(null);
    setClips([]);
    setMeta(null);
    setProgress({ stage: 'Downloading Media', percent: 0, detail: 'Memulai proses...' });

    try {
      const response = await fetch(`/api/v1/clipper/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          numClips,
          aspectRatio,
          clipDuration,
          subtitleStyle: {
            font: subFont,
            color: subColor,
            size: subSize,
            bold: subBold,
          },
          subtitlePosition: subPosition,
          typingAnimation,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Terjadi kesalahan pada server');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.type === 'progress') {
              setProgress({ stage: parsed.stage, percent: parsed.percent, detail: parsed.detail });
            } else if (parsed.type === 'result') {
              if (parsed.success) {
                setClips(parsed.clips || []);
                setMeta(parsed.meta || null);
              } else {
                throw new Error(parsed.error || 'Gagal terhubung ke server backend');
              }
            }
          } catch (e: any) {
             // throw only if it's the custom Error from parsed result
             if (e.message && e.message !== 'Unexpected end of JSON input') {
                 throw e;
             }
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Gagal terhubung ke server backend');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const renderProgressStage = (title: string, activeStage: string | undefined, percent: number, detail: string) => {
    const stages = ['Downloading Media', 'Transcribing Audio', 'Analyzing with AI Models', 'Cutting Viral Clips'];
    const activeIdx = stages.indexOf(activeStage || 'Downloading Media');
    const thisIdx = stages.indexOf(title);
    
    let isDone = thisIdx < activeIdx || (thisIdx === activeIdx && percent >= 100);
    let isActive = thisIdx === activeIdx && percent < 100;
    
    let bgClass = isActive ? "bg-primary/5 border border-primary/30 shadow-[0_0_20px_rgba(221,183,255,0.05)]" : (isDone ? "bg-surface-container-low/50 border-white/5" : "bg-surface-container-low/30 border-white/5 opacity-50");
    let iconClass = isDone ? "bg-green-500/10 text-green-400 border-green-500/20" : (isActive ? "bg-primary/20 text-primary border-primary/40 shadow-[0_0_15px_rgba(221,183,255,0.3)] animate-pulse" : "bg-surface-container-highest text-on-surface-variant border-outline-variant/30");
    let wFull = isDone ? '100%' : (isActive ? `${percent}%` : '0%');
    let colorClass = isDone ? 'bg-green-400' : 'bg-gradient-to-r from-primary to-secondary';

    return (
      <div key={title} className={`${bgClass} rounded-2xl p-5 border flex gap-4 items-center transition-all duration-500`}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all ${iconClass}`}>
           {isDone ? <CheckCircle2 className="w-6 h-6" /> : (title === 'Analyzing with AI Models' ? <Cpu className="w-6 h-6" /> : <Zap className="w-6 h-6" />)}
        </div>
        <div className="flex-1 overflow-hidden">
           <div className="flex justify-between items-end mb-1">
             <p className={`font-bold ${isActive ? 'text-primary' : (isDone ? 'text-white' : 'text-on-surface-variant')}`}>
               {title} {isActive && <span className="animate-pulse">...</span>}
             </p>
             {isActive && <span className="text-xs text-primary font-mono ml-2">{percent}%</span>}
           </div>
           <div className="h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
             <div className={`h-full ${colorClass} transition-all duration-500 relative`} style={{ width: wFull }}>
               {isActive && <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.3)_50%,transparent_75%,transparent_100%)] bg-[length:10px_10px] animate-[shimmer_1s_linear_infinite]"></div>}
             </div>
           </div>
           {(isActive || isDone) && detail && thisIdx === activeIdx && (
             <p className="text-xs text-on-surface-variant mt-2 italic truncate opacity-80">{detail}</p>
           )}
        </div>
      </div>
    );
  };

  const videoId = extractYouTubeId(url);

  return (
    <div className="bg-surface text-on-surface font-body-base min-h-screen flex flex-col relative overflow-x-hidden selection:bg-primary/30 selection:text-primary-fixed">
      {/* Ambient Background Lighting */}
      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/15 blur-[150px] rounded-full"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-secondary/15 blur-[150px] rounded-full"></div>
        <div className="absolute top-[40%] left-[40%] w-[30%] h-[30%] bg-tertiary/10 blur-[120px] rounded-full mix-blend-screen"></div>
      </div>

      {/* TopNavBar */}
      <nav className="fixed top-0 w-full z-50 bg-surface/60 backdrop-blur-2xl border-b border-white/5 shadow-2xl">
          <div className="flex justify-between items-center h-20 px-margin-desktop max-w-[1600px] mx-auto">
              <Link to="/" className="flex items-center gap-2 group">
                  <div className="bg-primary/10 p-2 rounded-xl group-hover:bg-primary/20 transition-colors">
                    <Video className="text-primary w-6 h-6" />
                  </div>
                  <span className="font-headline-md text-primary tracking-tight text-xl font-bold">ClipForge</span>
              </Link>
              <div className="hidden md:flex gap-8 items-center bg-surface-container-low/50 px-6 py-2 rounded-full border border-white/5">
                  <Link className="text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all duration-300 px-4 py-2 rounded-lg text-sm font-medium" to="/">Home</Link>
                  <Link className="text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all duration-300 px-4 py-2 rounded-lg text-sm font-medium" to="/download">Downloader</Link>
                  <Link className="text-primary font-bold bg-primary/10 px-4 py-2 rounded-lg active:scale-95 transition-all shadow-[0_0_15px_rgba(221,183,255,0.15)] text-sm" to="/app">AI Clipper</Link>
              </div>
              <div className="flex items-center gap-4 w-[100px]">
                  {/* Empty space for alignment */}
              </div>
          </div>
      </nav>

      {/* Main Content Area - Full Width Grid Layout */}
      <main className="flex-grow pt-32 pb-margin-desktop px-margin-mobile md:px-margin-desktop max-w-[1600px] mx-auto w-full z-10 relative">
        <div className="w-full flex flex-col gap-8">
          
          {error && (
            <div className="glass-card animate-fade-in p-4 rounded-xl shadow-lg border border-red-500/30 bg-red-500/10 backdrop-blur-md">
              <div className="flex items-center gap-4 text-red-400 font-medium">
                <AlertCircle size={24} />
                <span><strong>Error:</strong> {error}</span>
              </div>
            </div>
          )}

          {!loading && clips.length === 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left Column: Input and Preview */}
              <div className="lg:col-span-8 flex flex-col gap-8">
                <section className="animate-fade-in group relative">
                  {/* Decorative background for the main card */}
                  <div className="absolute -inset-1 bg-gradient-to-r from-primary via-tertiary to-secondary rounded-[2rem] blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
                  
                  <div className="relative glass-card rounded-3xl p-8 md:p-12 border border-white/10 shadow-2xl bg-surface/80 backdrop-blur-xl overflow-hidden">
                    {/* Subtle inner grid pattern */}
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] opacity-50"></div>
                    
                    <div className="relative z-10 flex flex-col items-center">
                      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(221,183,255,0.15)] border border-primary/20 relative">
                        <UploadCloud className="w-10 h-10 text-primary" />
                        <div className="absolute -top-2 -right-2 bg-tertiary w-6 h-6 rounded-full flex items-center justify-center animate-bounce">
                          <Sparkles className="w-3 h-3 text-black" />
                        </div>
                      </div>
                      
                      <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-primary-100 to-primary-200 mb-4 text-center tracking-tight">
                        Transform Long Videos into <br/> <span className="text-primary italic">Viral Short Clips</span>
                      </h1>
                      <p className="text-on-surface-variant mb-10 text-center max-w-lg text-lg">
                        Paste a YouTube link below and let our AI instantly find the most engaging highlights, edit them, and add viral hooks.
                      </p>
                      
                      {/* URL Input Area */}
                      <div className="w-full max-w-2xl relative mb-4 group/input">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                          <LinkIcon className="w-6 h-6 text-on-surface-variant group-focus-within/input:text-primary transition-colors" />
                        </div>
                        <input 
                          className="w-full bg-[#090E17] border-2 border-outline-variant/30 rounded-2xl py-5 pl-14 pr-[140px] text-on-surface text-lg focus:outline-none focus:border-primary/60 focus:ring-4 focus:ring-primary/10 transition-all shadow-inner" 
                          placeholder="Paste YouTube Video URL here..." 
                          type="text"
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                        />
                        <button 
                          onClick={() => handleSubmit()}
                          disabled={!url}
                          className="absolute right-2 top-2 bottom-2 bg-gradient-to-r from-primary to-secondary hover:from-primary-600 hover:to-secondary-600 text-on-primary px-8 rounded-xl font-bold transition-all disabled:opacity-50 disabled:grayscale flex items-center gap-2 shadow-[0_0_20px_rgba(221,183,255,0.3)] hover:shadow-[0_0_30px_rgba(221,183,255,0.5)] transform hover:scale-[1.02] active:scale-95"
                        >
                          <Sparkles className="w-4 h-4" />
                          Generate
                        </button>
                      </div>

                      {/* YouTube Preview */}
                      {videoId && (
                        <div className="w-full mt-8 rounded-2xl overflow-hidden border-2 border-primary/20 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative bg-black aspect-video group/preview">
                          <div className="absolute inset-0 bg-primary/5 pointer-events-none group-hover/preview:bg-transparent transition-colors z-10"></div>
                          <iframe 
                            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`}
                            title="YouTube Preview"
                            className="absolute inset-0 w-full h-full opacity-90 group-hover/preview:opacity-100 transition-opacity"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          ></iframe>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </div>

              {/* Right Column: Settings Sidebar */}
              <div className="lg:col-span-4 flex flex-col">
                <aside className="w-full glass-card rounded-3xl p-6 md:p-8 border border-white/10 shadow-2xl bg-surface/80 backdrop-blur-xl h-fit sticky top-28">
                  <div className="flex items-center gap-3 mb-8 border-b border-white/10 pb-4">
                    <Settings className="w-6 h-6 text-primary" />
                    <h3 className="text-on-surface font-semibold text-lg tracking-wider uppercase">Processing Settings</h3>
                  </div>
                  
                  <div className="flex flex-col gap-8">
                    {/* Format Toggles */}
                    <div className="flex flex-col gap-3">
                      <label className="text-sm text-on-surface-variant font-medium flex items-center gap-2">
                        <Film className="w-5 h-5" /> Format
                      </label>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setAspectRatio('9:16')}
                          className={`flex-1 flex flex-col items-center justify-center gap-2 py-4 rounded-xl border-2 transition-all ${aspectRatio === '9:16' ? 'bg-primary/10 border-primary text-primary shadow-[0_0_15px_rgba(221,183,255,0.2)]' : 'bg-surface border-outline-variant/30 text-on-surface-variant hover:bg-surface-bright hover:border-outline-variant/60'}`}
                        >
                          <Smartphone className="w-6 h-6" />
                          <span className="text-sm font-bold">9:16</span>
                        </button>
                        <button
                          onClick={() => setAspectRatio('16:9')}
                          className={`flex-1 flex flex-col items-center justify-center gap-2 py-4 rounded-xl border-2 transition-all ${aspectRatio === '16:9' ? 'bg-primary/10 border-primary text-primary shadow-[0_0_15px_rgba(221,183,255,0.2)]' : 'bg-surface border-outline-variant/30 text-on-surface-variant hover:bg-surface-bright hover:border-outline-variant/60'}`}
                        >
                          <Monitor className="w-6 h-6" />
                          <span className="text-sm font-bold">16:9</span>
                        </button>
                      </div>
                    </div>

                    {/* Duration Chips */}
                    <div className="flex flex-col gap-3">
                      <label className="text-sm text-on-surface-variant font-medium flex items-center gap-2">
                        <Clock className="w-5 h-5" /> Duration
                      </label>
                      <div className="flex flex-col gap-3">
                        {[
                          { val: 15, label: '15s (Shorts)' },
                          { val: 30, label: '30s (TikTok)' },
                          { val: 60, label: '60s (Reels)' }
                        ].map(opt => (
                          <button
                            key={opt.val}
                            onClick={() => setClipDuration(opt.val)}
                            className={`text-left px-5 py-3 rounded-xl border-2 text-sm transition-all ${clipDuration === opt.val ? 'bg-secondary/10 border-secondary text-secondary shadow-[0_0_10px_rgba(76,215,246,0.15)] font-bold' : 'bg-surface border-transparent text-on-surface-variant hover:bg-surface-bright border-outline-variant/30'}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Clips Chips */}
                    <div className="flex flex-col gap-3">
                      <label className="text-sm text-on-surface-variant font-medium flex items-center gap-2">
                        <Scissors className="w-5 h-5" /> Max Clips
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {[1, 3, 5, 10].map(val => (
                          <button
                            key={val}
                            onClick={() => setNumClips(val)}
                            className={`py-3 rounded-xl border-2 text-sm font-bold transition-all ${numClips === val ? 'bg-tertiary/10 border-tertiary text-tertiary shadow-[0_0_10px_rgba(255,180,166,0.15)]' : 'bg-surface border-transparent text-on-surface-variant hover:bg-surface-bright border-outline-variant/30'}`}
                          >
                            {val} Clips
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Subtitle Style & Position Settings */}
                    <div className="flex flex-col gap-4 border-t border-white/10 pt-6">
                      <label className="text-sm text-on-surface font-semibold flex items-center gap-2 uppercase tracking-wider text-primary">
                        <Sparkles className="w-4 h-4" /> Subtitle Customization
                      </label>

                      {/* Font Preset */}
                      <div className="flex flex-col gap-2">
                        <span className="text-xs text-on-surface-variant font-medium">Font Family</span>
                        <div className="grid grid-cols-2 gap-2">
                          {['Arial', 'Poppins', 'Montserrat', 'Roboto'].map(f => (
                            <button
                              key={f}
                              onClick={() => setSubFont(f)}
                              className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${subFont === f ? 'bg-primary/20 border-primary text-primary' : 'bg-surface border-outline-variant/20 text-on-surface-variant'}`}
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Color Preset Chips */}
                      <div className="flex flex-col gap-2">
                        <span className="text-xs text-on-surface-variant font-medium">Warna Teks &amp; Outline</span>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { key: 'white_black', label: 'Putih + Hitam', bg: 'bg-white text-black' },
                            { key: 'yellow_black', label: 'Kuning + Hitam', bg: 'bg-yellow-400 text-black' },
                            { key: 'cyan_black', label: 'Cyan + Hitam', bg: 'bg-cyan-400 text-black' },
                            { key: 'green_black', label: 'Hijau + Hitam', bg: 'bg-green-400 text-black' }
                          ].map(c => (
                            <button
                              key={c.key}
                              onClick={() => setSubColor(c.key)}
                              className={`py-2 px-2 rounded-lg border text-xs font-medium flex items-center justify-start gap-2 transition-all ${subColor === c.key ? 'border-primary ring-1 ring-primary' : 'border-outline-variant/20'}`}
                            >
                              <span className={`w-3 h-3 rounded-full border border-black/50 ${c.bg}`}></span>
                              <span className="truncate">{c.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Size & Bold */}
                      <div className="flex gap-3 items-center">
                        <div className="flex-1 flex flex-col gap-1">
                          <span className="text-xs text-on-surface-variant font-medium">Ukuran Font</span>
                          <div className="flex gap-1">
                            {[
                              { key: 'small', label: 'Kecil' },
                              { key: 'medium', label: 'Sedang' },
                              { key: 'large', label: 'Besar' }
                            ].map(s => (
                              <button
                                key={s.key}
                                onClick={() => setSubSize(s.key)}
                                className={`flex-1 py-1.5 rounded-lg border text-[11px] font-bold transition-all ${subSize === s.key ? 'bg-secondary/20 border-secondary text-secondary' : 'bg-surface border-outline-variant/20 text-on-surface-variant'}`}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={() => setSubBold(!subBold)}
                          className={`mt-4 px-3 py-2 rounded-lg border text-xs font-bold transition-all ${subBold ? 'bg-primary/20 border-primary text-primary' : 'bg-surface border-outline-variant/20 text-on-surface-variant'}`}
                        >
                          Bold
                        </button>
                      </div>

                      {/* Position Choice */}
                      <div className="flex flex-col gap-2">
                        <span className="text-xs text-on-surface-variant font-medium">Posisi Subtitle</span>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { key: 'top', label: 'Atas' },
                            { key: 'middle', label: 'Tengah' },
                            { key: 'bottom', label: 'Bawah' }
                          ].map(p => (
                            <button
                              key={p.key}
                              onClick={() => setSubPosition(p.key)}
                              className={`py-2 rounded-lg border text-xs font-semibold transition-all ${subPosition === p.key ? 'bg-tertiary/20 border-tertiary text-tertiary' : 'bg-surface border-outline-variant/20 text-on-surface-variant'}`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Typewriter Effect Toggle */}
                      <div className="flex items-center justify-between bg-surface-container-low p-3 rounded-xl border border-white/5 mt-2">
                        <div>
                          <div className="text-xs font-bold text-on-surface">Animasi Mengetik</div>
                          <div className="text-[10px] text-on-surface-variant">Efek kata demi kata (Typewriter)</div>
                        </div>
                        <button
                          onClick={() => setTypingAnimation(!typingAnimation)}
                          className={`w-12 h-6 rounded-full transition-colors relative p-1 ${typingAnimation ? 'bg-primary' : 'bg-surface-bright border border-white/10'}`}
                        >
                          <div className={`w-4 h-4 rounded-full bg-white transition-transform ${typingAnimation ? 'translate-x-6' : 'translate-x-0'}`}></div>
                        </button>
                      </div>
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          )}

          {loading && (
            <section className="glass-card rounded-3xl p-8 md:p-12 border border-primary/30 relative overflow-hidden shadow-[0_0_50px_rgba(221,183,255,0.1)]">
              {/* Animated scanning background */}
              <div className="absolute inset-0 opacity-20 bg-[linear-gradient(transparent_50%,rgba(221,183,255,0.1)_50%)] bg-[length:100%_4px] animate-[scan_10s_linear_infinite]"></div>
              
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-secondary to-tertiary bg-[length:200%_100%] animate-[bg-pan_3s_linear_infinite]"></div>
              
              <div className="relative z-10">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-10 gap-4">
                  <div>
                    <h3 className="font-headline-md text-3xl text-white flex items-center gap-3 font-bold mb-2">
                      <Loader className="text-primary animate-spin w-8 h-8" />
                      Forging Viral Clips
                    </h3>
                    <p className="text-on-surface-variant text-sm font-mono truncate max-w-md opacity-70">
                      Target: {url}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 bg-surface-container/50 border border-white/10 px-4 py-2 rounded-xl backdrop-blur-md">
                    <Clock className="w-4 h-4 text-secondary animate-pulse" />
                    <span className="font-mono text-sm text-secondary font-bold tracking-widest">EST: 3-5 MIN</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Progress Items */}
                  {renderProgressStage('Downloading Media', progress?.stage, progress?.stage === 'Downloading Media' ? progress.percent : 0, progress?.detail || '')}
                  {renderProgressStage('Transcribing Audio', progress?.stage, progress?.stage === 'Transcribing Audio' ? progress.percent : 0, progress?.detail || '')}
                  {renderProgressStage('Analyzing with AI Models', progress?.stage, progress?.stage === 'Analyzing with AI Models' ? progress.percent : 0, progress?.detail || '')}
                  {renderProgressStage('Cutting Viral Clips', progress?.stage, progress?.stage === 'Cutting Viral Clips' ? progress.percent : 0, progress?.detail || '')}
                </div>
              </div>
            </section>
          )}

          {!loading && clips.length > 0 && (
            <section className="animate-fade-in w-full">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-white/10 pb-6">
                <div>
                  <h2 className="font-headline-md text-3xl font-extrabold flex items-center gap-3">
                    <Sparkles className="text-secondary w-8 h-8" />
                    Generated Viral Clips
                  </h2>
                  <p className="text-on-surface-variant mt-2">Successfully forged {clips.length} high-potential clips.</p>
                </div>
                
                {meta && (
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-xs text-on-surface-variant font-mono uppercase tracking-widest">AI Sources</span>
                    <div className="flex gap-2">
                      <div className="px-3 py-1 bg-surface-container rounded-lg border border-white/10 text-sm font-semibold flex items-center gap-2 shadow-inner">
                        <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                        Groq: {meta.groq_clip_count}
                      </div>
                      <div className="px-3 py-1 bg-surface-container rounded-lg border border-white/10 text-sm font-semibold flex items-center gap-2 shadow-inner">
                        <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                        Gemini: {meta.gemini_clip_count}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
                {clips.map((clip, index) => (
                  <ClipCard 
                    key={index} 
                    clip={clip} 
                    index={index} 
                    onPreview={(c) => setPreviewClip(c)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-8 border-t border-white/5 bg-surface-container-lowest z-10 mt-auto backdrop-blur-md">
        <div className="flex flex-col md:flex-row justify-between items-center px-margin-desktop max-w-[1600px] mx-auto gap-4 w-full">
            <div className="flex items-center gap-2 opacity-50">
              <Video className="w-5 h-5 text-primary" />
              <div className="font-bold text-lg tracking-tight">ClipForge AI</div>
            </div>
            <div className="text-sm text-on-surface-variant opacity-60">© 2026 ClipForge AI. All rights reserved.</div>
        </div>
      </footer>

      {/* Video Preview Modal */}
      {previewClip && (
        <div className="modal-overlay backdrop-blur-xl bg-black/60" onClick={() => setPreviewClip(null)}>
          <div className="modal-content border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden rounded-2xl max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-5 bg-surface-container-low border-b border-white/5">
              <div>
                <h3 className="text-xl font-extrabold text-white">{previewClip.title}</h3>
                <div className="flex items-center gap-3 mt-2 text-sm">
                  <span className="bg-primary/20 text-primary px-2 py-0.5 rounded font-bold border border-primary/30 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> {previewClip.viral_potential || 'High Viral Potential'}
                  </span>
                  <span className="text-on-surface-variant">•</span>
                  <span className="text-on-surface-variant">Viral Score: <strong className="text-tertiary">{previewClip.virality_score ?? 90}/100</strong></span>
                </div>
              </div>
              <button 
                onClick={() => setPreviewClip(null)}
                className="bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-white transition-colors p-2 rounded-full"
              >
                <X size={20} />
              </button>
            </div>

            <div className="video-container bg-black border-y border-white/5 shadow-inner">
              {previewClip.clip_url ? (
                <video
                  key={previewClip.clip_url}
                  src={previewClip.clip_url}
                  controls
                  autoPlay
                  className="absolute inset-0 w-full h-full outline-none"
                />
              ) : videoId ? (
                <iframe 
                  src={`https://www.youtube.com/embed/${videoId}?start=${Math.floor(previewClip.start_time)}&end=${Math.ceil(previewClip.end_time)}&autoplay=1`}
                  title={previewClip.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full border-none"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center text-on-surface-variant absolute inset-0">
                  <AlertCircle size={40} className="mb-4 text-red-400" />
                  <p>Clip video is not available yet. Make sure the backend successfully cut the video.</p>
                </div>
              )}
            </div>

            <div className="px-8 py-6 bg-surface-container-lowest">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 shadow-inner">
                <div className="flex items-start gap-3">
                  <QuoteIcon className="w-6 h-6 text-primary mt-1 shrink-0 opacity-50" />
                  <div>
                    <h4 className="text-xs font-bold text-primary uppercase tracking-widest mb-1">Viral Hook</h4>
                    <p className="text-lg text-white font-medium italic">
                      "{previewClip.hook}"
                    </p>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm text-on-surface-variant leading-relaxed px-2 border-l-2 border-white/10">
                <strong className="text-white">Why it works:</strong> {previewClip.reason}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper icon component for the modal
function QuoteIcon(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path>
      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25-.25 4-2.75 4v3c0 1 0 1 1 1z"></path>
    </svg>
  );
}

export default App;
