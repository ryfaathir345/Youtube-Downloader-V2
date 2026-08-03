import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

const HomePage: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        // Intersection Observer for scroll animations
        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.15
        };

        const observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target); // Only animate once
                }
            });
        }, observerOptions);

        document.querySelectorAll('.animate-on-scroll').forEach((el) => {
            observer.observe(el);
        });

        // Simple scroll effect for TopNav
        const handleScroll = () => {
            const nav = document.getElementById('mainNav');
            if (nav) {
                if (window.scrollY > 20) {
                    nav.classList.add('bg-surface/80', 'shadow-2xl');
                    nav.classList.remove('bg-surface/50');
                } else {
                    nav.classList.add('bg-surface/50');
                    nav.classList.remove('bg-surface/80', 'shadow-2xl');
                }
            }
        };

        window.addEventListener('scroll', handleScroll);

        return () => {
            observer.disconnect();
            window.removeEventListener('scroll', handleScroll);
        };
    }, []);

    useEffect(() => {
        // WebGL Canvas Animation
        const canvas = canvasRef.current;
        if (!canvas) return;

        function syncSize() {
            if(!canvas) return;
            const w = canvas.clientWidth || 1280;
            const h = canvas.clientHeight || 720;
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }
        }
        
        const resizeObserver = new ResizeObserver(syncSize);
        resizeObserver.observe(canvas);
        syncSize();

        const gl = canvas.getContext('webgl') || (canvas as any).getContext('experimental-webgl');
        if (!gl) return;

        const vs = `attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;
        const fs = `precision highp float;
varying vec2 v_texCoord;
uniform float u_time;
uniform vec2 u_resolution;

void main() {
    vec2 uv = v_texCoord;
    
    // Create moving gradient mesh effect
    float noise1 = sin(uv.x * 3.0 + u_time * 0.5) * 0.5 + 0.5;
    float noise2 = cos(uv.y * 2.5 - u_time * 0.3) * 0.5 + 0.5;
    
    vec3 color1 = vec3(0.66, 0.33, 0.97); // Purple
    vec3 color2 = vec3(0.02, 0.71, 0.83); // Cyan
    vec3 bgColor = vec3(0.05, 0.05, 0.07); // Dark background
    
    float mixFactor = smoothstep(0.3, 0.7, noise1 * noise2);
    vec3 finalColor = mix(bgColor, mix(color1, color2, uv.x), mixFactor * 0.4);
    
    // Add some "floating" light spots
    float pulse = sin(u_time * 0.2) * 0.1 + 0.9;
    float spot = distance(uv, vec2(0.5 + sin(u_time * 0.4) * 0.2, 0.5 + cos(u_time * 0.3) * 0.2));
    finalColor += color2 * (0.1 / (spot + 0.5)) * pulse;
    
    gl_FragColor = vec4(finalColor, 1.0);
}`;

        function cs(type: number, src: string) {
            const s = gl.createShader(type)!;
            gl.shaderSource(s, src);
            gl.compileShader(s);
            return s;
        }

        const prog = gl.createProgram()!;
        gl.attachShader(prog, cs(gl.VERTEX_SHADER, vs));
        gl.attachShader(prog, cs(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(prog);
        gl.useProgram(prog);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

        const pos = gl.getAttribLocation(prog, 'a_position');
        gl.enableVertexAttribArray(pos);
        gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

        const uTime = gl.getUniformLocation(prog, 'u_time');
        const uRes = gl.getUniformLocation(prog, 'u_resolution');
        
        let animationFrameId: number;

        function render(t: number) {
            if(!canvas) return;
            gl.viewport(0, 0, canvas.width, canvas.height);
            if (uTime) gl.uniform1f(uTime, t * 0.001);
            if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            animationFrameId = requestAnimationFrame(render);
        }
        
        animationFrameId = requestAnimationFrame(render);

        return () => {
            cancelAnimationFrame(animationFrameId);
            resizeObserver.disconnect();
        };
    }, []);

    return (
        <div className="bg-background text-on-surface font-body-base overflow-x-hidden selection:bg-primary-container selection:text-on-primary-container min-h-screen">
            {/* Animated Background Blobs */}
            <div className="blob-bg blob-1"></div>
            <div className="blob-bg blob-2"></div>
            
            {/* TopNavBar */}
            <nav className="fixed top-0 w-full z-50 bg-surface/50 backdrop-blur-xl border-b border-white/10 shadow-2xl transition-all duration-300" id="mainNav">
                <div className="flex justify-between items-center h-20 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto">
                    <Link className="text-headline-md font-display-lg text-primary flex items-center gap-2 group" to="/">
                        <span className="material-symbols-outlined text-secondary group-hover:rotate-12 transition-transform duration-300">video_library</span>
                        ClipForge
                    </Link>
                    <div className="hidden md:flex items-center gap-8">
                        <Link className="font-body-base text-body-base text-on-surface-variant hover:text-on-surface transition-colors hover:bg-white/5 px-3 py-2 rounded-lg" to="/download">Video Downloader</Link>
                        <Link className="font-body-base text-body-base text-on-surface-variant hover:text-on-surface transition-colors hover:bg-white/5 px-3 py-2 rounded-lg" to="/app">AI Clip</Link>
                        <div className="w-px h-6 bg-white/20 mx-2"></div>
                        <a className="font-body-base text-body-base text-on-surface-variant hover:text-on-surface transition-colors hover:bg-white/5 px-3 py-2 rounded-lg" href="#features">Features</a>
                        <a className="font-body-base text-body-base text-on-surface-variant hover:text-on-surface transition-colors hover:bg-white/5 px-3 py-2 rounded-lg" href="#how-it-works">How it Works</a>
                        <a className="font-body-base text-body-base text-on-surface-variant hover:text-on-surface transition-colors hover:bg-white/5 px-3 py-2 rounded-lg" href="#showcase">Showcase</a>
                    </div>
                    <Link to="/app" className="btn-primary px-6 py-2.5 rounded-lg active:scale-95 transition-transform hover:shadow-[0_0_15px_rgba(221,183,255,0.5)] font-body-base text-body-base hidden md:block">
                        Get Started
                    </Link>
                    <button className="md:hidden text-on-surface">
                        <span className="material-symbols-outlined">menu</span>
                    </button>
                </div>
            </nav>

            {/* Hero Section */}
            <header className="relative min-h-[921px] flex items-center justify-center pt-20 overflow-hidden">
                <div className="absolute inset-0 w-full h-full z-0 opacity-40" style={{ display: 'block' }}>
                    <canvas ref={canvasRef} id="shader-canvas-ANIMATION_1" style={{ display: 'block', width: '100%', height: '100%' }}></canvas>
                </div>
                <div className="relative z-10 text-center px-margin-mobile md:px-margin-desktop max-w-4xl mx-auto flex flex-col items-center gap-stack-lg">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 mb-4 backdrop-blur-md">
                        <span className="material-symbols-outlined text-primary text-sm">auto_awesome</span>
                        <span className="font-label-mono text-label-mono text-primary">ClipForge AI v2.0 is Live</span>
                    </div>
                    <h1 className="font-display-lg-mobile text-display-lg-mobile md:font-display-lg md:text-display-lg">
                        Master Your Media in <br className="hidden md:block" />
                        <span className="text-gradient">One Click</span>
                    </h1>
                    <p className="font-body-base text-body-base md:text-lg text-on-surface-variant max-w-2xl mx-auto">
                        The ultimate tool for creators. Download high-quality videos from any platform or instantly turn long-form content into viral, highly-engaging clips powered by advanced AI processing.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 mt-8 w-full sm:w-auto">
                        <Link to="/app" className="btn-primary px-8 py-4 rounded-xl text-lg active:scale-95 transition-all hover:shadow-[0_0_30px_rgba(221,183,255,0.4)] flex items-center justify-center gap-2 w-full sm:w-auto">
                            Start Creating
                            <span className="material-symbols-outlined">arrow_forward</span>
                        </Link>
                        <button className="px-8 py-4 rounded-xl text-lg font-body-base text-body-base border border-outline-variant bg-surface/30 backdrop-blur-md hover:bg-white/5 transition-all flex items-center justify-center gap-2 text-on-surface w-full sm:w-auto group">
                            <span className="material-symbols-outlined text-secondary group-hover:scale-110 transition-transform">play_circle</span>
                            Watch Demo
                        </button>
                    </div>
                    {/* Floating UI Elements for depth */}
                    <div className="hidden lg:block absolute -left-32 top-1/4 glass-panel p-4 rounded-xl rotate-[-12deg] opacity-80 animate-[float_6s_ease-in-out_infinite]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-secondary/20 flex items-center justify-center">
                                <span className="material-symbols-outlined text-secondary">content_cut</span>
                            </div>
                            <div>
                                <div className="text-sm font-bold text-on-surface">Auto-Clip Found</div>
                                <div className="text-xs text-on-surface-variant">00:45 - 01:15</div>
                            </div>
                        </div>
                    </div>
                    <div className="hidden lg:block absolute -right-24 bottom-1/4 glass-panel p-4 rounded-xl rotate-[8deg] opacity-80 animate-[float_8s_ease-in-out_infinite_reverse]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                                <span className="material-symbols-outlined text-primary">download</span>
                            </div>
                            <div>
                                <div className="text-sm font-bold text-on-surface">1080p Downloaded</div>
                                <div className="text-xs text-on-surface-variant">TikTok • 12MB</div>
                            </div>
                        </div>
                    </div>
                </div>
                {/* Bottom gradient fade */}
                <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-background to-transparent z-10"></div>
            </header>

            {/* Features Section */}
            <section className="py-24 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto relative z-20" id="features">
                <div className="text-center mb-16 animate-on-scroll">
                    <h2 className="font-headline-md text-headline-md md:text-4xl text-on-surface mb-4">Powerful Creative Tools</h2>
                    <p className="font-body-base text-body-base text-on-surface-variant max-w-xl mx-auto">Everything you need to source, edit, and publish engaging content at scale.</p>
                </div>
                <div className="grid md:grid-cols-2 gap-gutter">
                    {/* Card 1 */}
                    <div className="glass-panel rounded-2xl p-8 relative overflow-hidden group hover:border-secondary/50 transition-colors duration-500 animate-on-scroll">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-secondary/10 blur-[80px] rounded-full group-hover:bg-secondary/20 transition-all duration-500"></div>
                        <div className="relative z-10 flex flex-col h-full">
                            <div className="w-16 h-16 rounded-2xl bg-surface-container-highest border border-white/5 flex items-center justify-center mb-8 shadow-lg">
                                <span className="material-symbols-outlined text-4xl text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>download</span>
                            </div>
                            <h3 className="font-headline-md text-headline-md mb-2">Universal Video Downloader</h3>
                            <p className="font-body-base text-body-base text-on-surface-variant mb-8 flex-grow">
                                Download high-quality, watermark-free videos instantly from TikTok, Instagram Reels, YouTube Shorts, and 50+ other platforms.
                            </p>
                            <div className="flex items-center gap-4 text-sm text-on-surface-variant mb-8 opacity-70">
                                <div className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">check_circle</span> 4K Support</div>
                                <div className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">check_circle</span> No Watermarks</div>
                            </div>
                            <Link to="/download" className="mt-auto px-6 py-3 rounded-lg border border-secondary/30 text-secondary font-bold hover:bg-secondary/10 transition-colors flex items-center justify-center gap-2 w-full sm:w-max">
                                Download Now
                                <span className="material-symbols-outlined">arrow_forward</span>
                            </Link>
                        </div>
                    </div>
                    {/* Card 2 */}
                    <div className="glass-panel rounded-2xl p-8 relative overflow-hidden group hover:border-primary/50 transition-colors duration-500 animate-on-scroll" style={{ border: '1px solid rgba(221,183,255,0.3)', transitionDelay: '150ms' }}>
                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[80px] rounded-full group-hover:bg-primary/20 transition-all duration-500"></div>
                        <div className="absolute top-4 right-4">
                            <span className="px-3 py-1 rounded-full bg-primary/20 text-primary font-label-mono text-label-mono border border-primary/30">FEATURED</span>
                        </div>
                        <div className="relative z-10 flex flex-col h-full">
                            <div className="w-16 h-16 rounded-2xl bg-surface-container-highest border border-white/5 flex items-center justify-center mb-8 shadow-lg relative">
                                <span className="material-symbols-outlined text-4xl text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>movie_edit</span>
                                <span className="material-symbols-outlined absolute -top-2 -right-2 text-primary animate-pulse">auto_awesome</span>
                            </div>
                            <h3 className="font-headline-md text-headline-md mb-2">AI Viral Clipper</h3>
                            <p className="font-body-base text-body-base text-on-surface-variant mb-8 flex-grow">
                                Transform hours of long-form podcasts or streams into dozens of highly engaging, perfectly framed short clips optimized for virality.
                            </p>
                            <div className="flex items-center gap-4 text-sm text-on-surface-variant mb-8 opacity-70">
                                <div className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">check_circle</span> Auto-Captions</div>
                                <div className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">check_circle</span> Face Tracking</div>
                            </div>
                            <Link to="/app" className="btn-primary mt-auto px-6 py-3 rounded-lg text-on-primary font-bold active:scale-95 transition-transform flex items-center justify-center gap-2 w-full sm:w-max">
                                Clip Now
                                <span className="material-symbols-outlined">arrow_forward</span>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* How It Works Section */}
            <section className="py-24 bg-surface-container-lowest/50 relative animate-on-scroll" id="how-it-works">
                <div className="px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto">
                    <div className="text-center mb-20">
                        <h2 className="font-headline-md text-headline-md md:text-4xl text-on-surface mb-4">From Link to Viral in Seconds</h2>
                        <p className="font-body-base text-body-base text-on-surface-variant max-w-xl mx-auto">A seamless workflow designed to eliminate friction and maximize output.</p>
                    </div>
                    <div className="grid md:grid-cols-3 gap-12 relative">
                        {/* Connecting Line (Desktop) */}
                        <div className="hidden md:block absolute top-12 left-[16.66%] right-[16.66%] h-[2px] bg-white/10 z-0"></div>
                        <div className="hidden md:block absolute top-12 left-[16.66%] h-[2px] bg-gradient-to-r from-secondary to-primary z-0 animate-line-flow shadow-[0_0_10px_rgba(76,215,246,0.8)]"></div>
                        {/* Step 1 */}
                        <div className="relative flex flex-col items-center text-center z-10 group animate-on-scroll">
                            <div className="w-24 h-24 rounded-full bg-surface border border-white/20 flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(0,0,0,0.8)] group-hover:scale-110 group-hover:border-secondary/50 transition-all duration-300 relative z-20">
                                <span className="material-symbols-outlined text-4xl text-secondary">link</span>
                            </div>
                            <h4 className="font-headline-md text-headline-md text-lg mb-2">Paste Link</h4>
                            <p className="font-body-sm text-body-sm text-on-surface-variant">Drop a YouTube, Twitch, or podcast link into the dashboard.</p>
                        </div>
                        {/* Step 2 */}
                        <div className="relative flex flex-col items-center text-center z-10 group animate-on-scroll" style={{ transitionDelay: '150ms' }}>
                            <div className="w-24 h-24 rounded-full bg-surface border border-white/20 flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(0,0,0,0.8)] group-hover:scale-110 group-hover:border-primary/50 transition-all duration-300 relative z-20">
                                <span className="material-symbols-outlined text-4xl text-primary animate-pulse">memory</span>
                            </div>
                            <h4 className="font-headline-md text-headline-md text-lg mb-2">AI Processes</h4>
                            <p className="font-body-sm text-body-sm text-on-surface-variant">Our engines analyze context, highlight key moments, and frame subjects.</p>
                        </div>
                        {/* Step 3 */}
                        <div className="relative flex flex-col items-center text-center z-10 group animate-on-scroll" style={{ transitionDelay: '300ms' }}>
                            <div className="w-24 h-24 rounded-full bg-surface border border-white/20 flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(0,0,0,0.8)] group-hover:scale-110 group-hover:border-white/50 transition-all duration-300 relative z-20">
                                <span className="material-symbols-outlined text-4xl text-on-surface">rocket_launch</span>
                            </div>
                            <h4 className="font-headline-md text-headline-md text-lg mb-2">Export &amp; Go</h4>
                            <p className="font-body-sm text-body-sm text-on-surface-variant">Download your clips with baked-in captions, ready for TikTok or Reels.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Showcase Section */}
            <section className="py-24 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto" id="showcase">
                <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6 animate-on-scroll">
                    <div>
                        <h2 className="font-headline-md text-headline-md md:text-4xl text-on-surface mb-4">Created with ClipForge</h2>
                        <p className="font-body-base text-body-base text-on-surface-variant max-w-xl">See how top creators are dominating the algorithms using our AI tools.</p>
                    </div>
                    <button className="px-6 py-2 rounded-lg border border-outline-variant bg-surface-container text-on-surface hover:bg-white/5 transition-colors font-body-base text-body-base whitespace-nowrap">
                        View Gallery
                    </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Showcase Item 1 */}
                    <div className="group relative rounded-xl overflow-hidden aspect-[9/16] max-h-[500px] cursor-pointer animate-on-scroll">
                        <div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105" data-alt="Podcast" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1598550874175-4d0ef43ee90d?q=80&w=640')" }}></div>
                        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent"></div>
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 text-white">
                                <span className="material-symbols-outlined text-4xl ml-1">play_arrow</span>
                            </div>
                        </div>
                        <div className="absolute bottom-0 left-0 w-full p-6 glass-panel border-x-0 border-b-0 rounded-none transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/20 text-primary uppercase">Tech Podcast</span>
                                <span className="text-xs text-on-surface-variant">1.2M Views</span>
                            </div>
                            <h4 className="font-bold text-on-surface text-sm line-clamp-2">"The future of AI is smaller models..."</h4>
                        </div>
                    </div>
                    {/* Showcase Item 2 */}
                    <div className="group relative rounded-xl overflow-hidden aspect-[9/16] max-h-[500px] cursor-pointer animate-on-scroll" style={{ transitionDelay: '100ms' }}>
                        <div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105" data-alt="Gaming" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=640')" }}></div>
                        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent"></div>
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 text-white">
                                <span className="material-symbols-outlined text-4xl ml-1">play_arrow</span>
                            </div>
                        </div>
                        <div className="absolute bottom-0 left-0 w-full p-6 glass-panel border-x-0 border-b-0 rounded-none transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-secondary/20 text-secondary uppercase">Gaming Stream</span>
                                <span className="text-xs text-on-surface-variant">850K Views</span>
                            </div>
                            <h4 className="font-bold text-on-surface text-sm line-clamp-2">Insane clutch moment in final round</h4>
                        </div>
                    </div>
                    {/* Showcase Item 3 */}
                    <div className="group relative rounded-xl overflow-hidden aspect-[9/16] max-h-[500px] cursor-pointer animate-on-scroll" style={{ transitionDelay: '200ms' }}>
                        <div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105" data-alt="Fitness" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=640')" }}></div>
                        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent"></div>
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 text-white">
                                <span className="material-symbols-outlined text-4xl ml-1">play_arrow</span>
                            </div>
                        </div>
                        <div className="absolute bottom-0 left-0 w-full p-6 glass-panel border-x-0 border-b-0 rounded-none transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-tertiary/20 text-tertiary uppercase">Fitness</span>
                                <span className="text-xs text-on-surface-variant">2.4M Views</span>
                            </div>
                            <h4 className="font-bold text-on-surface text-sm line-clamp-2">5 mistakes you are making on leg day</h4>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-surface-container-lowest w-full py-stack-lg border-t border-white/5">
                <div className="flex flex-col md:flex-row justify-between items-center px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto gap-8">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-secondary">video_library</span>
                        <span className="text-headline-md font-display-lg text-primary">ClipForge</span>
                    </div>
                    <div className="flex flex-wrap justify-center gap-6">
                        <a className="font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-colors opacity-80 hover:opacity-100" href="#">Privacy Policy</a>
                        <a className="font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-colors opacity-80 hover:opacity-100" href="#">Terms of Service</a>
                        <a className="font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-colors opacity-80 hover:opacity-100" href="#">Twitter</a>
                        <a className="font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-colors opacity-80 hover:opacity-100" href="#">Discord</a>
                        <a className="font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-colors opacity-80 hover:opacity-100" href="#">GitHub</a>
                    </div>
                    <div className="font-body-sm text-body-sm text-on-surface-variant opacity-60 text-center md:text-right">
                        © 2024 ClipForge AI. All rights reserved.
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default HomePage;
