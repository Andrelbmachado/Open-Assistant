// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { FileExplorerWidget } from './FileExplorerWidget';
import ReactGridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = ReactGridLayout.WidthProvider(ReactGridLayout.Responsive);

const DEFAULT_LAYOUT: any[] = [
  { i: 'diagnostics', x: 0, y: 0, w: 3, h: 4 },
  { i: 'core', x: 3, y: 0, w: 6, h: 6, isResizable: false },
  { i: 'clock-weather', x: 9, y: 0, w: 3, h: 2 },
  { i: 'events', x: 9, y: 2, w: 3, h: 3 },
  { i: 'media', x: 0, y: 4, w: 3, h: 2 },
  { i: 'status', x: 9, y: 5, w: 3, h: 2 },
  { i: 'files', x: 0, y: 6, w: 4, h: 2 },
  { i: 'news', x: 4, y: 6, w: 4, h: 2 },
  { i: 'launch', x: 8, y: 7, w: 4, h: 2 },
];

export function JarvisDashboard() {
  const [time, setTime] = useState(new Date());
  const [layouts, setLayouts] = useState<{ [key: string]: any[] }>({ lg: DEFAULT_LAYOUT });
  const [sysMetrics, setSysMetrics] = useState({ cpu_usage: 0, memory_usage: 0 });
  const [weather, setWeather] = useState({ temp: '--', condition: 'Fetching...' });

  useEffect(() => {
    // Fetch rough weather based on IP via Open-Meteo
    fetch('https://get.geojs.io/v1/ip/geo.json')
      .then(res => res.json())
      .then(geo => {
        return fetch(`https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&current_weather=true`);
      })
      .then(res => res.json())
      .then(data => {
        if(data.current_weather) {
           setWeather({ temp: `${Math.round(data.current_weather.temperature)}°C`, condition: 'ONLINE' });
        }
      })
      .catch(() => setWeather({ temp: '24°C', condition: 'CLEAR NIGHT' }));

    const timer = setInterval(async () => {
      setTime(new Date());
      try {
        const metrics: any = await invoke('get_system_metrics');
        setSysMetrics(metrics);
      } catch (err) {
        // Ignore errors if backend isn't ready
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const resetLayout = () => {
    setLayouts({ lg: DEFAULT_LAYOUT });
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
      
      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
        rowHeight={80}
        onLayoutChange={(currentLayout: any, allLayouts: any) => setLayouts(allLayouts)}
        isDraggable={true}
        isResizable={true}
        draggableHandle=".panel-title"
        margin={[16, 16]}
      >
        
        {/* 1. SYSTEM DIAGNOSTICS */}
        <div key="diagnostics" className="panel">
          <h2 className="panel-title" style={{ cursor: 'move' }}>System Diagnostics</h2>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <div className="hud-line"><span>CPU Usage</span><b>{sysMetrics.cpu_usage.toFixed(1)}%</b></div>
              <div style={{ height: '4px', background: 'rgba(33, 231, 255, 0.1)', marginTop: '4px' }}>
                <div style={{ height: '100%', width: `${Math.min(100, sysMetrics.cpu_usage)}%`, background: 'var(--cyan)', boxShadow: '0 0 8px var(--cyan)', transition: 'width 1s linear' }}></div>
              </div>
            </div>
            <div>
              <div className="hud-line"><span>RAM Allocation</span><b>{sysMetrics.memory_usage.toFixed(1)}%</b></div>
              <div style={{ height: '4px', background: 'rgba(33, 231, 255, 0.1)', marginTop: '4px' }}>
                <div style={{ height: '100%', width: `${Math.min(100, sysMetrics.memory_usage)}%`, background: 'var(--cyan)', boxShadow: '0 0 8px var(--cyan)', transition: 'width 1s linear' }}></div>
              </div>
            </div>
            <div style={{ marginTop: 'auto' }}>
              <h3 className="micro-text" style={{ marginBottom: '8px' }}>Network Traffic</h3>
              <div className="hud-line"><span>Data In</span><b>-- KB/s</b></div>
              <div className="hud-line"><span>Data Out</span><b>-- KB/s</b></div>
            </div>
          </div>
        </div>

        {/* 2. MEDIA PLAYER */}
        <div key="media" className="panel">
          <h2 className="panel-title" style={{ cursor: 'move' }}>Media Player</h2>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: 'var(--text)', fontSize: '14px', marginBottom: '4px' }}>Back in Black</div>
                <div className="micro-text">AC/DC</div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={{ background: 'none', border: '1px solid var(--cyan-soft)', color: 'var(--cyan)', width: '24px', height: '24px', cursor: 'pointer' }}>⏮</button>
                <button style={{ background: 'rgba(33,231,255,0.1)', border: '1px solid var(--cyan)', color: 'var(--cyan)', width: '24px', height: '24px', cursor: 'pointer' }}>▶</button>
                <button style={{ background: 'none', border: '1px solid var(--cyan-soft)', color: 'var(--cyan)', width: '24px', height: '24px', cursor: 'pointer' }}>⏭</button>
              </div>
            </div>
            <div className="equalizer">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="eq-bar" style={{ height: `${Math.random() * 100}%` }}></div>
              ))}
            </div>
          </div>
        </div>

        {/* 3. REACTOR CORE */}
        <div key="core" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h1 className="panel-title" style={{ cursor: 'move', position: 'absolute', top: 0, zIndex: 10, opacity: 0 }}>Drag Handle</h1>
          <h1 style={{ color: 'var(--cold-white)', textShadow: '0 0 10px var(--electric-blue), 0 0 20px var(--cyan)', fontSize: '36px', fontWeight: 600, letterSpacing: '0.45em', textIndent: '0.45em', zIndex: 5, marginBottom: '20px' }}>J.A.R.V.I.S.</h1>
          <div className="reactor" style={{ position: 'relative', width: 'min(45vh, 400px)', height: 'min(45vh, 400px)', display: 'grid', placeItems: 'center', borderRadius: '50%' }}>
            <div className="ring ring-a" style={{ position: 'absolute', borderRadius: '50%', inset: 0, border: '1px solid var(--cyan-faint)', background: 'radial-gradient(circle, transparent 65%, rgba(0, 81, 255, 0.05) 100%)', boxShadow: '0 0 40px rgba(33, 231, 255, 0.1)', animation: 'rotate 30s linear infinite' }}>
               <div style={{ position: 'absolute', top: -5, left: '50%', width: '2px', height: '10px', background: 'var(--cyan)' }}></div>
               <div style={{ position: 'absolute', bottom: -5, left: '50%', width: '2px', height: '10px', background: 'var(--cyan)' }}></div>
               <div style={{ position: 'absolute', left: -5, top: '50%', height: '2px', width: '10px', background: 'var(--cyan)' }}></div>
               <div style={{ position: 'absolute', right: -5, top: '50%', height: '2px', width: '10px', background: 'var(--cyan)' }}></div>
            </div>
            <div className="ring ring-b" style={{ position: 'absolute', borderRadius: '50%', inset: '20px', border: '24px dashed rgba(0, 81, 255, 0.35)', animation: 'rotate-reverse 18s linear infinite', filter: 'drop-shadow(0 0 15px var(--electric-blue))' }}></div>
            <div className="ring ring-c" style={{ position: 'absolute', borderRadius: '50%', inset: '56px', border: '2px dotted var(--cold-white)', opacity: 0.6, animation: 'rotate 12s linear infinite' }}></div>
            <div className="ring ring-d" style={{ position: 'absolute', borderRadius: '50%', inset: '72px', borderLeft: '12px solid var(--cyan)', borderRight: '12px solid var(--cyan-soft)', borderTop: '2px solid transparent', borderBottom: '2px solid transparent', animation: 'rotate 6s cubic-bezier(0.4, 0, 0.2, 1) infinite' }}></div>
            <div className="ring ring-e" style={{ position: 'absolute', borderRadius: '50%', inset: '88px', border: '1px solid rgba(33, 231, 255, 0.6)', background: 'conic-gradient(from 0deg, transparent 70%, rgba(33, 231, 255, 0.3) 100%)', animation: 'rotate 3s linear infinite' }}></div>
            <div className="inner-pulse" style={{ position: 'relative', width: '160px', height: '160px', display: 'grid', placeItems: 'center', textAlign: 'center', borderRadius: '50%', border: '2px solid var(--cyan-soft)', background: 'radial-gradient(circle, rgba(0, 81, 255, 0.2) 0%, #000 80%)', boxShadow: 'inset 0 0 30px #000, 0 0 30px rgba(0, 81, 255, 0.4)', zIndex: 4 }}>
              <span style={{ display: 'block', fontStyle: 'normal', color: 'var(--cold-white)', fontSize: '20px', textShadow: '0 0 10px var(--cold-white)', letterSpacing: '2px' }}>ONLINE</span>
              <small style={{ display: 'block', fontStyle: 'normal', color: 'var(--cyan)', fontSize: '9px', marginTop: '4px', letterSpacing: '1px' }}>SYS // 0x4A2B</small>
              <em style={{ display: 'block', fontStyle: 'normal', color: 'var(--good)', fontSize: '11px', marginTop: '6px' }}>CORE STABLE</em>
            </div>
          </div>
          <div style={{ marginTop: '30px', textAlign: 'center', zIndex: 5 }}>
            <p style={{ fontStyle: 'italic', color: 'rgba(230,255,255,0.6)', fontSize: '11px', letterSpacing: '1px' }}>"SOMETIMES YOU GOTTA RUN BEFORE YOU CAN WALK."</p>
            <p className="micro-text" style={{ marginTop: '8px', color: 'var(--cyan)' }}>— T. STARK</p>
          </div>
          <div className="core-lines" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(45deg, transparent 49.8%, rgba(33, 231, 255, 0.08) 50%, transparent 50.2%), linear-gradient(-45deg, transparent 49.8%, rgba(33, 231, 255, 0.08) 50%, transparent 50.2%)', maskImage: 'radial-gradient(circle at center, black 0 45%, transparent 60%)', zIndex: 1, pointerEvents: 'none' }}></div>
        </div>

        {/* 4. WORLD MAP & WEATHER */}
        <div key="clock-weather" className="panel">
          <h2 className="panel-title" style={{ cursor: 'move' }}>Global Telemetry</h2>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div 
              className="world-map" 
              onClick={() => {
                const mapWindow = new WebviewWindow('map', {
                  url: 'https://earthengine.google.com/iframes/timelapse_player_embed.html',
                  title: 'J.A.R.V.I.S. World Map',
                  width: 800,
                  height: 600,
                  center: true
                });
                mapWindow.once('tauri://error', (e) => console.log('Map window error', e));
              }}
              style={{ position: 'relative', height: '100px', cursor: 'pointer', background: 'radial-gradient(circle at 20% 35%, rgba(33, 231, 255, 0.3) 0 2px, transparent 3px), radial-gradient(circle at 45% 42%, rgba(33, 231, 255, 0.25) 0 2px, transparent 3px), radial-gradient(circle at 70% 36%, rgba(33, 231, 255, 0.22) 0 2px, transparent 3px), radial-gradient(circle at 58% 66%, rgba(33, 231, 255, 0.2) 0 2px, transparent 3px)', backgroundSize: '12px 12px, 11px 11px, 10px 10px, 13px 13px', border: '1px solid rgba(33, 231, 255, 0.1)' }}
              title="Click to open World Map Window"
            >
              <div className="map-line" style={{ position: 'absolute', inset: '10px', border: '1px solid rgba(33, 231, 255, 0.2)', borderTopColor: 'transparent', borderRightColor: 'transparent', borderRadius: '50%', animation: 'map-sweep 4s linear infinite' }}></div>
              <span style={{ position: 'absolute', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--cyan)', boxShadow: '0 0 10px var(--cyan)', animation: 'blink 1.8s infinite alternate', left: '18%', top: '34%' }}></span>
              <span style={{ position: 'absolute', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--cyan)', boxShadow: '0 0 10px var(--cyan)', animation: 'blink 1.8s infinite alternate', left: '42%', top: '50%', animationDelay: '.4s' }}></span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '28px', color: 'var(--text)' }}>{time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}</div>
                <div className="micro-text">LOCAL TIME</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '24px', color: 'var(--cyan)' }}>{weather.temp}</div>
                <div className="micro-text">{weather.condition}</div>
              </div>
            </div>
          </div>
        </div>

        {/* 5. UPCOMING EVENTS */}
        <div key="events" className="panel">
          <h2 className="panel-title" style={{ cursor: 'move' }}>Upcoming Events</h2>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {[
              { time: '09:00', title: 'Board Meeting', type: 'CORPORATE' },
              { time: '11:30', title: 'Armor Systems Review', type: 'ENGINEERING' },
              { time: '14:00', title: 'Press Conference', type: 'PR' },
              { time: '19:00', title: 'Charity Dinner', type: 'PERSONAL' }
            ].map((ev, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: '12px', padding: '10px 0', borderBottom: '1px solid rgba(33, 231, 255, 0.08)' }}>
                <div style={{ color: 'var(--cyan)', fontSize: '12px', marginTop: '2px' }}>{ev.time}</div>
                <div>
                  <div style={{ color: 'var(--text)', fontSize: '13px', marginBottom: '4px' }}>{ev.title}</div>
                  <div className="micro-text">{ev.type}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 6. SYSTEM STATUS */}
        <div key="status" className="panel">
          <h2 className="panel-title" style={{ cursor: 'move' }}>System Status</h2>
          <div className="status-ring-container" style={{ flex: 1, alignItems: 'center' }}>
            <div className="status-ring">
              <div className="status-ring-inner">
                <span style={{ fontSize: '14px', color: 'var(--text)' }}>98%</span>
                <span className="micro-text" style={{ fontSize: '8px' }}>POWER</span>
              </div>
            </div>
            <div className="status-ring">
              <div className="status-ring-inner">
                <span style={{ fontSize: '14px', color: 'var(--text)' }}>OK</span>
                <span className="micro-text" style={{ fontSize: '8px' }}>SUIT</span>
              </div>
            </div>
            <div className="status-ring">
              <div className="status-ring-inner">
                <span style={{ fontSize: '14px', color: 'var(--text)' }}>RDY</span>
                <span className="micro-text" style={{ fontSize: '8px' }}>WPN</span>
              </div>
            </div>
            <div className="status-ring">
              <div className="status-ring-inner">
                <span style={{ fontSize: '14px', color: 'var(--text)' }}>100%</span>
                <span className="micro-text" style={{ fontSize: '8px' }}>THRUST</span>
              </div>
            </div>
          </div>
        </div>

        {/* 7. FILES & DOCUMENTS */}
        <div key="files" className="panel">
          <h2 className="panel-title" style={{ cursor: 'move' }}>Files & Docs</h2>
          <FileExplorerWidget />
        </div>

        {/* 8. NEWS FEED */}
        <div key="news" className="panel">
          <h2 className="panel-title" style={{ cursor: 'move' }}>Stark Industries Feed</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', height: '100%' }}>
            <div style={{ width: '60px', height: '60px', background: 'rgba(33,231,255,0.1)', border: '1px solid var(--cyan-soft)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <span className="micro-text" style={{ fontSize: '18px', color: 'var(--cyan)' }}>SI</span>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ color: 'var(--text)', fontSize: '13px', marginBottom: '6px' }}>STARK EXPO 2026 ANNOUNCED</div>
              <div className="micro-text" style={{ lineHeight: '1.4' }}>New clean energy initiatives to be unveiled next month in New York. Arc Reactor technology integration worldwide reaches 45%.</div>
            </div>
          </div>
        </div>

        {/* 9. QUICK LAUNCH */}
        <div key="launch" className="panel">
          <h2 className="panel-title" style={{ cursor: 'move' }}>Quick Launch</h2>
          <div className="quick-launch-grid">
            <div className="hex-btn" title="Holo Projector"><span style={{ color: 'var(--cyan)' }}>✧</span></div>
            <div className="hex-btn" title="Arc Reactor Diagnostics"><span style={{ color: 'var(--cyan)' }}>⎈</span></div>
            <div className="hex-btn" title="3D Model Viewer"><span style={{ color: 'var(--cyan)' }}>⬡</span></div>
            <div className="hex-btn" title="Schematics"><span style={{ color: 'var(--cyan)' }}>▤</span></div>
            <div className="hex-btn" title="Videoconference"><span style={{ color: 'var(--cyan)' }}>◈</span></div>
            <div className="hex-btn" title="Notes"><span style={{ color: 'var(--cyan)' }}>≡</span></div>
          </div>
        </div>

      </ResponsiveGridLayout>

      <button onClick={resetLayout} style={{ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 99, background: 'rgba(0,0,0,0.5)', border: '1px solid var(--cyan)', color: 'var(--cyan)', padding: '6px 16px', cursor: 'pointer', borderRadius: '20px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
        Reset Layout
      </button>

    </div>
  );
}
