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
            <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
              IDCS QPG  
              <span
              className="ml-2 text-red-600 bg-red-100 px-2 py-0.5 rounded shadow-md font-extrabold"
              style={{ boxShadow: "0 0 8px 2px rgba(220,38,38,0.25)" }}
              >
                2.0
              </span>
            </h1>
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
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {[
            {
              icon: <FileUp className="w-8 h-8 text-primary mb-2" />,
              title: "Upload Question Bank",
              desc: "Import questions from CSV, Excel, PDF, or TXT files with automatic parsing.",
            },
            {
              icon: <Shield className="w-8 h-8 text-accent mb-2" />,
              title: "Verify Questions",
              desc: "Review and validate each question with easy verification tools.",
            },
            {
              icon: <FileText className="w-8 h-8 text-secondary mb-2" />,
              title: "Manage Templates",
              desc: "Create custom exam templates with sections, marks, and difficulty distribution.",
            },
            {
              icon: <Wand2 className="w-8 h-8 text-warning mb-2" />,
              title: "Auto Generate",
              desc: "Generate randomized question papers with answer keys instantly.",
            },
          ].map((item, i) => (
            <div
              key={item.title}
              className="bg-card p-4 rounded-lg border shadow-md hover:shadow-lg transition-shadow
          animate-fade-in-up"
              style={{
          animationDelay: `${i * 0.15 + 0.1}s`,
          animationDuration: "0.7s",
          animationFillMode: "both",
              }}
            >
              {item.icon}
              <h3 className="text-lg font-semibold mb-1">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
        <style>
          {`
            @keyframes fade-in-up {
              0% {
          opacity: 0;
          transform: translateY(20px) scale(0.95);
              }
              100% {
          opacity: 1;
          transform: translateY(0) scale(1);
              }
            }
            .animate-fade-in-up {
              animation-name: fade-in-up;
            }
          `}
        </style>
      </main>
    </div>
  );
};

export default Index;
