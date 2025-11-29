import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FileUp, FileText, Wand2, Shield } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  const [effectActive, setEffectActive] = useState(true);
  const [fadeIn, setFadeIn] = useState(false);
  useEffect(() => {
    // Start fade-in on mount
    const fadeInTimeout = setTimeout(() => setFadeIn(true), 50); // slight delay to trigger transition
    // Fade out after 3s
    const fadeOutTimeout = setTimeout(() => {
      setEffectActive(false);
    }, 1000);
    return () => {
      clearTimeout(fadeInTimeout);
      clearTimeout(fadeOutTimeout);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary">KR Question Generator</h1>
          <Button onClick={() => navigate("/login")}>Login</Button>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-16">
        <div className="text-center max-w-3xl mx-auto mb-16">
          {/* SVG filter for electric border effect */}
          <svg className="svg-container" style={{ position: 'absolute', width: 0, height: 0 }}>
            <defs>
              <filter id="turbulent-displace" colorInterpolationFilters="sRGB" x="-20%" y="-20%" width="140%" height="140%">
                <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="10" result="noise1" seed="1" />
                <feOffset in="noise1" dx="0" dy="0" result="offsetNoise1">
                  <animate id="anim1" attributeName="dy" values="700; 0" dur="6s" repeatCount="indefinite" calcMode="linear" />
                </feOffset>
                <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="10" result="noise2" seed="1" />
                <feOffset in="noise2" dx="0" dy="0" result="offsetNoise2">
                  <animate id="anim2" attributeName="dy" values="0; -700" dur="6s" repeatCount="indefinite" calcMode="linear" />
                </feOffset>
                <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="10" result="noise1" seed="2" />
                <feOffset in="noise1" dx="0" dy="0" result="offsetNoise3">
                  <animate id="anim3" attributeName="dx" values="490; 0" dur="6s" repeatCount="indefinite" calcMode="linear" />
                </feOffset>
                <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="10" result="noise2" seed="2" />
                <feOffset in="noise2" dx="0" dy="0" result="offsetNoise4">
                  <animate id="anim4" attributeName="dx" values="0; -490" dur="6s" repeatCount="indefinite" calcMode="linear" />
                </feOffset>
                <feComposite in="offsetNoise1" in2="offsetNoise2" result="part1" />
                <feComposite in="offsetNoise3" in2="offsetNoise4" result="part2" />
                <feBlend in="part1" in2="part2" mode="color-dodge" result="combinedNoise" />
                <feDisplacementMap in="SourceGraphic" in2="combinedNoise" scale="30" xChannelSelector="R" yChannelSelector="B" />
              </filter>
            </defs>
          </svg>
          <div className="main-container" style={{ position: 'relative', marginBottom: '2.5rem' }}>
            <div className={`card-container${fadeIn ? ' fade-in-effect' : ''}${!effectActive ? ' fade-out-effect' : ''}`} style={{ padding: 0, background: 'none' }}>
              <div className="inner-container">
                <div className={`border-outer${fadeIn ? ' fade-in-effect' : ''}${!effectActive ? ' fade-out-effect' : ''}`}> 
                  <img
                    src="/banner.jpg"
                    alt="Banner"
                    className="banner-image main-card"
                    style={effectActive ? { filter: 'url(#turbulent-displace)' } : {}}
                  />
                </div>
                <div className={`glow-layer-1${fadeIn ? ' fade-in-effect' : ''}${!effectActive ? ' fade-out-effect' : ''}`}></div>
                <div className={`glow-layer-2${fadeIn ? ' fade-in-effect' : ''}${!effectActive ? ' fade-out-effect' : ''}`}></div>
              </div>
              <div className={`overlay-1${fadeIn ? ' fade-in-effect' : ''}${!effectActive ? ' fade-out-effect' : ''}`}></div>
              <div className={`overlay-2${fadeIn ? ' fade-in-effect' : ''}${!effectActive ? ' fade-out-effect' : ''}`}></div>
              <div className={`background-glow${fadeIn ? ' fade-in-effect' : ''}${!effectActive ? ' fade-out-effect' : ''}`}></div>
            </div>
          </div>
          <h2 className="text-5xl font-bold mb-6 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Question Paper Generator
          </h2>
          <p className="text-xl text-muted-foreground mb-8">
            Upload your question bank, select a template, and generate complete exam papers with answer keys in seconds.
          </p>
          <Button size="lg" onClick={() => navigate("/login") } className="text-lg px-8">
            Get Started
          </Button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          <div className="bg-card p-6 rounded-xl border shadow-md hover:shadow-lg transition-shadow">
            <FileUp className="w-12 h-12 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">Upload Question Bank</h3>
            <p className="text-muted-foreground">Import questions from CSV, Excel, PDF, or TXT files with automatic parsing.</p>
          </div>

          <div className="bg-card p-6 rounded-xl border shadow-md hover:shadow-lg transition-shadow">
            <Shield className="w-12 h-12 text-accent mb-4" />
            <h3 className="text-xl font-semibold mb-2">Verify Questions</h3>
            <p className="text-muted-foreground">Review and validate each question with easy verification tools.</p>
          </div>

          <div className="bg-card p-6 rounded-xl border shadow-md hover:shadow-lg transition-shadow">
            <FileText className="w-12 h-12 text-secondary mb-4" />
            <h3 className="text-xl font-semibold mb-2">Manage Templates</h3>
            <p className="text-muted-foreground">Create custom exam templates with sections, marks, and difficulty distribution.</p>
          </div>

          <div className="bg-card p-6 rounded-xl border shadow-md hover:shadow-lg transition-shadow">
            <Wand2 className="w-12 h-12 text-warning mb-4" />
            <h3 className="text-xl font-semibold mb-2">Auto Generate</h3>
            <p className="text-muted-foreground">Generate randomized question papers with answer keys instantly.</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
