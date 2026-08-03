import React, { useState } from 'react';
import { Link } from 'react-router-dom';

interface Format {
    format_id: string;
    ext: string;
    resolution: string;
    vcodec: string;
    acodec: string;
    filesize?: number;
    filesize_approx?: number;
    displayExt?: string;
}

interface VideoInfo {
    title: string;
    thumbnail: string;
    duration: string;
    formats: Format[];
}

const DownloadPage: React.FC = () => {
    const [url, setUrl] = useState('');
    const [isFetching, setIsFetching] = useState(false);
    const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
    const [selectedFormat, setSelectedFormat] = useState<{ id: string, ext: string } | null>(null);
    const [error, setError] = useState('');
    const [isPreviewing, setIsPreviewing] = useState(false);

    const getEmbedUrl = (videoUrl: string) => {
        try {
            const urlObj = new URL(videoUrl);
            if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
                let videoId = urlObj.searchParams.get('v');
                if (!videoId && urlObj.hostname.includes('youtu.be')) {
                    videoId = urlObj.pathname.slice(1);
                }
                if (videoId) return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
            }
        } catch (e) {}
        return null;
    };

    const formatBytes = (bytes?: number) => {
        if (!bytes || bytes === 0) return '';
        const mb = (bytes / (1024 * 1024)).toFixed(1);
        return `${mb}MB`;
    };

    const handleFetch = async () => {
        if (!url.trim()) {
            setError('Please enter a valid URL');
            return;
        }

        setIsFetching(true);
        setError('');
        setVideoInfo(null);
        setSelectedFormat(null);
        setIsPreviewing(false);

        try {
            const res = await fetch(`/api/v1/download/info?url=${encodeURIComponent(url.trim())}`);
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || 'Failed to fetch');

            let processedFormats: Format[] = [];
            
            if (data.formats && data.formats.length > 0) {
                const videoFormats: Format[] = [];
                const seenResolutions = new Set();
                
                // Parse formats from best to worst
                const sortedFormats = [...data.formats].reverse();
                
                for (const f of sortedFormats) {
                    if (f.ext === 'mp4' && f.vcodec !== 'none' && f.resolution && f.resolution !== 'audio only') {
                        if (!seenResolutions.has(f.resolution)) {
                            seenResolutions.add(f.resolution);
                            videoFormats.push(f);
                        }
                    }
                    // Keep max 3 video resolutions
                    if (videoFormats.length >= 3) break;
                }
                    
                const audioFormats = data.formats
                    .filter((f: any) => f.vcodec === 'none' && f.acodec !== 'none')
                    .slice(-1);
                
                if (audioFormats.length > 0) {
                    audioFormats[0].displayExt = 'MP3';
                    audioFormats[0].ext = 'mp3';
                    audioFormats[0].resolution = 'Audio';
                }

                processedFormats = [...videoFormats, ...audioFormats];
            }

            setVideoInfo({
                title: data.title || 'Unknown Title',
                thumbnail: data.thumbnail_url || data.thumbnail || '',
                duration: data.duration_string || data.duration_seconds || '00:00',
                formats: processedFormats
            });

            if (processedFormats.length > 0) {
                setSelectedFormat({ id: processedFormats[0].format_id, ext: processedFormats[0].ext });
            }

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsFetching(false);
        }
    };

    const handleDownload = () => {
        if (!url.trim() || !selectedFormat || !videoInfo) return;
        
        const downloadUrl = `/api/v1/download?url=${encodeURIComponent(url.trim())}&format_id=${encodeURIComponent(selectedFormat.id)}&ext=${encodeURIComponent(selectedFormat.ext)}&title=${encodeURIComponent(videoInfo.title)}`;
        window.location.href = downloadUrl;
    };

    return (
        <div className="bg-background text-on-surface min-h-screen flex flex-col font-body-base overflow-x-hidden relative">
            {/* Decorative Background Elements */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary opacity-10 rounded-full blur-[100px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary opacity-10 rounded-full blur-[100px]"></div>
            </div>

            {/* TopNavBar */}
            <nav className="fixed top-0 w-full z-50 bg-surface/50 backdrop-blur-xl border-b border-white/10 shadow-2xl">
                <div className="flex justify-between items-center h-20 px-margin-desktop max-w-container-max mx-auto">
                    <Link to="/" className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-3xl">video_library</span>
                        <span className="font-headline-md text-primary tracking-tight">ClipForge</span>
                    </Link>
                    <div className="hidden md:flex gap-8 items-center">
                        <Link className="text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all duration-300 px-3 py-2 rounded-lg" to="/">Home</Link>
                        <Link className="text-primary font-bold border-b-2 border-primary pb-1 active:scale-95 transition-transform" to="/download">Video Downloader</Link>
                        <Link className="text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all duration-300 px-3 py-2 rounded-lg" to="/app">AI Clip</Link>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link to="/app" className="hidden md:block btn-primary px-6 py-2 rounded-lg font-bold text-sm">Start Clipping</Link>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="flex-grow pt-32 pb-20 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto w-full z-10 relative">
                {/* Hero Section */}
                <section className="flex flex-col items-center justify-center text-center mb-stack-lg space-y-6">
                    <h1 className="font-display-lg-mobile md:font-display-lg text-gradient max-w-3xl">
                        Universal Video Downloader
                    </h1>
                    <p className="text-on-surface-variant max-w-2xl text-lg">
                        Extract high-fidelity video and audio from any platform in seconds. No quality loss.
                    </p>

                    {/* Input Area */}
                    <div className="w-full max-w-4xl mt-8">
                        {/* Platform Tabs */}
                        <div className="flex justify-center gap-2 mb-4">
                            <button className="glass-panel px-4 py-2 rounded-full flex items-center gap-2 text-sm text-on-surface hover:border-primary transition-colors">
                                <span className="material-symbols-outlined text-red-500" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span> YouTube
                            </button>
                            <button className="glass-panel px-4 py-2 rounded-full flex items-center gap-2 text-sm text-on-surface hover:border-primary transition-colors">
                                <span className="material-symbols-outlined text-black bg-white rounded-full text-[16px] w-4 h-4 flex items-center justify-center">music_note</span> TikTok
                            </button>
                            <button className="glass-panel px-4 py-2 rounded-full flex items-center gap-2 text-sm text-on-surface hover:border-primary transition-colors">
                                <span className="material-symbols-outlined text-pink-500">photo_camera</span> Instagram
                            </button>
                        </div>

                        {/* Input Field */}
                        <div className="glass-panel-elevated rounded-xl p-2 flex flex-col md:flex-row gap-2 relative group focus-within:border-secondary focus-within:shadow-[0_0_15px_rgba(76,215,246,0.3)] transition-all">
                            <div className="flex-grow flex items-center px-4 py-3">
                                <span className="material-symbols-outlined text-on-surface-variant mr-3">link</span>
                                <input 
                                    className="w-full bg-transparent border-none text-on-surface focus:ring-0 focus:outline-none placeholder:text-on-surface-variant/50 text-lg" 
                                    placeholder="Paste video URL here..." 
                                    type="text"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
                                />
                            </div>
                            <button 
                                onClick={handleFetch}
                                disabled={isFetching}
                                className="btn-primary px-8 py-4 rounded-lg font-bold flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
                            >
                                {isFetching ? (
                                    <><span className="material-symbols-outlined animate-spin text-white">autorenew</span> Fetching...</>
                                ) : (
                                    <><span className="material-symbols-outlined text-white">download</span> Paste &amp; Fetch</>
                                )}
                            </button>
                        </div>
                        {error && <div className="text-red-400 mt-4 font-label-mono text-sm">{error}</div>}
                    </div>
                </section>

                {/* Preview State */}
                {videoInfo && (
                    <section className="w-full max-w-4xl mx-auto mb-stack-lg">
                        <div className="glass-panel rounded-xl p-4 md:p-6 flex flex-col md:flex-row gap-6 items-start border-l-4 border-l-secondary relative overflow-hidden">
                            {/* Thumbnail */}
                            <div 
                                className="w-full md:w-64 aspect-video rounded-lg overflow-hidden relative shrink-0 border border-white/10 group cursor-pointer bg-black"
                                onClick={() => {
                                    if (getEmbedUrl(url)) setIsPreviewing(true);
                                }}
                            >
                                {isPreviewing && getEmbedUrl(url) ? (
                                    <iframe 
                                        src={getEmbedUrl(url)!} 
                                        className="w-full h-full border-none" 
                                        allow="autoplay; encrypted-media" 
                                        allowFullScreen 
                                    />
                                ) : (
                                    <>
                                        <div className="bg-cover bg-center w-full h-full transition-transform duration-500 group-hover:scale-105" style={{ backgroundImage: `url('${videoInfo.thumbnail}')` }}></div>
                                        <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded text-xs font-label-mono text-white backdrop-blur-sm">{videoInfo.duration}</div>
                                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="material-symbols-outlined text-white text-4xl drop-shadow-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
                                                {getEmbedUrl(url) ? 'play_arrow' : 'image'}
                                            </span>
                                            {!getEmbedUrl(url) && <span className="absolute bottom-2 text-xs text-white/50">Preview unavailable</span>}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Details & Actions */}
                            <div className="flex-grow flex flex-col justify-between w-full h-full">
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-xs font-label-mono uppercase tracking-wider flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[14px]">play_circle</span> Found
                                        </span>
                                        <span className="text-on-surface-variant text-sm font-label-mono">Ready to download</span>
                                    </div>
                                    <h3 className="font-headline-md text-on-surface mb-4 line-clamp-2">{videoInfo.title}</h3>
                                </div>

                                {/* Quality Selection Chips */}
                                <div className="flex flex-wrap gap-2 mb-6 mt-4">
                                    {videoInfo.formats.length > 0 ? (
                                        videoInfo.formats.map((fmt) => {
                                            const isAudio = fmt.resolution === 'audio only' || fmt.resolution === 'Audio' || fmt.vcodec === 'none';
                                            const icon = isAudio ? 'audio_file' : (fmt.resolution && fmt.resolution.includes('1080') ? 'hd' : 'sd');
                                            const label = isAudio ? 'Audio' : (fmt.resolution || 'Video');
                                            const sizeStr = formatBytes(fmt.filesize || fmt.filesize_approx);
                                            const displayExt = fmt.displayExt || fmt.ext.toUpperCase();
                                            const isActive = selectedFormat?.id === fmt.format_id;

                                            return (
                                                <button
                                                    key={fmt.format_id}
                                                    onClick={() => setSelectedFormat({ id: fmt.format_id, ext: fmt.ext })}
                                                    className={`px-3 py-1.5 rounded-full font-label-mono text-xs flex items-center gap-1 transition-colors ${
                                                        isActive 
                                                        ? "bg-primary/20 text-primary border border-primary/50" 
                                                        : "glass-panel text-on-surface-variant hover:text-on-surface border border-white/10"
                                                    }`}
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">{icon}</span> 
                                                    {displayExt} {label} <span className={isActive ? "text-primary/70 ml-1" : "opacity-50 ml-1"}>{sizeStr}</span>
                                                </button>
                                            );
                                        })
                                    ) : (
                                        <span className="text-red-400 font-label-mono text-sm">No formats found</span>
                                    )}
                                </div>

                                <div className="flex items-center gap-4 mt-auto">
                                    <button 
                                        onClick={handleDownload}
                                        disabled={!selectedFormat}
                                        className="btn-primary flex-grow md:flex-none px-8 py-3 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span className="material-symbols-outlined">download</span> Download Now
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>
                )}
            </main>

            {/* Footer */}
            <footer className="w-full py-stack-lg border-t border-white/5 bg-surface-container-lowest z-10 mt-auto">
                <div className="flex flex-col md:flex-row justify-between items-center px-margin-desktop max-w-container-max mx-auto gap-4">
                    <div className="text-headline-md font-display-lg text-primary">ClipForge</div>
                    <div className="text-sm text-on-surface-variant opacity-60">© 2024 ClipForge AI. All rights reserved.</div>
                </div>
            </footer>
        </div>
    );
};

export default DownloadPage;
