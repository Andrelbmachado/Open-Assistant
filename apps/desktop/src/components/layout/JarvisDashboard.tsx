// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { Command } from '@tauri-apps/plugin-shell';
import { FileExplorerWidget } from './FileExplorerWidget';
import { Responsive as ResponsiveGridLayout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const DEFAULT_LAYOUT: any[] = [
  { i: 'diagnostics', x: 0, y: 0, w: 3, h: 4 },
  { i: 'core', x: 3, y: 0, w: 6, h: 6, isResizable: false },
  { i: 'weather', x: 9, y: 0, w: 3, h: 2 },
  { i: 'events', x: 9, y: 2, w: 3, h: 3 },
  { i: 'media', x: 0, y: 4, w: 3, h: 2 },
  { i: 'status', x: 9, y: 5, w: 3, h: 2 },
  { i: 'files', x: 0, y: 6, w: 4, h: 2 },
  { i: 'news', x: 4, y: 6, w: 4, h: 2 },
  { i: 'map', x: 8, y: 7, w: 4, h: 2 },
];

export function JarvisDashboard() {
  const [time, setTime] = useState(new Date());
  const [layouts, setLayouts] = useState<{ [key: string]: any[] }>({ lg: DEFAULT_LAYOUT });
  const [sysMetrics, setSysMetrics] = useState({ cpu_usage: 0, memory_usage: 0 });
  const [metricsHistory, setMetricsHistory] = useState<{cpu: number, ram: number}[]>(Array(20).fill({cpu: 0, ram: 0}));
  const [weather, setWeather] = useState({ temp: '--', humidity: '--', location: 'Localizando...' });
  const [spotify, setSpotify] = useState({ artist: 'No Media', track: 'Spotify Offline', playing: false });
  const [news, setNews] = useState<{title: string, desc: string}[]>([{title: 'STARK EXPO 2026 ANNOUNCED', desc: 'New clean energy initiatives to be unveiled next month in New York.'}]);
  const [newsIdx, setNewsIdx] = useState(0);
  const [width, setWidth] = useState(1200);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      const observer = new ResizeObserver(entries => {
        setWidth(entries[0].contentRect.width);
      });
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }
  }, []);

  useEffect(() => {
    // Use geolocation and open-meteo
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => fetchWeatherByIp()
      );
    } else {
      fetchWeatherByIp();
    }

    function fetchWeatherByIp() {
      fetch('https://get.geojs.io/v1/ip/geo.json')
        .then(res => res.json())
        .then(geo => fetchWeather(geo.latitude, geo.longitude))
        .catch(console.error);
    }

    async function fetchWeather(lat: number, lon: number) {
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weathercode&daily=temperature_2m_max,temperature_2m_min&timezone=auto`);
        const data = await res.json();
        
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&format=json`);
        const geoData = await geoRes.json();
        const city = geoData.results?.[0]?.name || 'Unknown';
        const state = geoData.results?.[0]?.admin1 || '';
        const locName = state ? `${city}, ${state}` : city;
        
        const getWeatherCondition = (code: number) => {
          if (code === 0) return 'FAIR';
          if (code <= 3) return 'PARTLY CLOUDY';
          if (code <= 48) return 'FOG';
          if (code <= 55) return 'DRIZZLE';
          if (code <= 65) return 'RAIN';
          if (code <= 75) return 'SNOW';
          if (code <= 82) return 'SHOWERS';
          if (code >= 95) return 'THUNDERSTORM';
          return 'FAIR';
        };

        if (data.current) {
          setWeather({ 
            temp: `${Math.round(data.current.temperature_2m)}°`, 
            humidity: `${Math.round(data.current.relative_humidity_2m)}%`,
            location: locName,
            condition: getWeatherCondition(data.current.weathercode),
            high: data.daily?.temperature_2m_max ? `${Math.round(data.daily.temperature_2m_max[0])}°` : '--',
            low: data.daily?.temperature_2m_min ? `${Math.round(data.daily.temperature_2m_min[0])}°` : '--'
          });
        }
      } catch (err) {
        console.error(err);
      }
    }

    const timer = setInterval(async () => {
      setTime(new Date());
      try {
        const metrics: any = await invoke('get_system_metrics');
        setSysMetrics(metrics);
        setMetricsHistory(prev => {
          const newHist = [...prev.slice(1), { cpu: metrics.cpu_usage, ram: metrics.memory_usage }];
          return newHist;
        });
      } catch (err) {
        // Ignore errors if backend isn't ready
      }
    }, 1000);

    const spotifyTimer = setInterval(async () => {
      try {
        const output = await Command.create('powershell', ['-Command', "Get-Process | Where-Object { $_.ProcessName -like '*Spotify*' -and $_.MainWindowTitle -ne '' } | Select-Object -ExpandProperty MainWindowTitle -First 1"]).execute();
        const title = output.stdout.trim();
        if (title && title.toLowerCase() !== 'spotify premium' && title.toLowerCase() !== 'spotify free' && title.toLowerCase() !== 'spotify') {
          const parts = title.split(' - ');
          if (parts.length >= 2) {
            setSpotify({ artist: parts[0].trim(), track: parts[1].trim(), playing: true });
          } else {
            setSpotify({ artist: 'Playing', track: title, playing: true });
          }
        } else {
          setSpotify({ artist: 'Idle', track: 'Spotify Ready', playing: false });
        }
      } catch (e) {
        console.error("Spotify fetch error:", e);
      }
    }, 3000);

    // Fetch News
    fetch('https://api.rss2json.com/v1/api.json?rss_url=http://feeds.bbci.co.uk/news/technology/rss.xml')
      .then(res => res.json())
      .then(data => {
        if (data && data.items && data.items.length > 0) {
           const formattedNews = data.items.slice(0, 10).map((item: any) => ({
             title: item.title.toUpperCase(),
             desc: item.description.replace(/<[^>]+>/g, '')
           }));
           setNews(formattedNews);
        }
      }).catch(console.error);

    const newsTimer = setInterval(() => {
       setNewsIdx(prev => prev + 1);
    }, 10000);

    return () => {
      clearInterval(timer);
      clearInterval(spotifyTimer);
      clearInterval(newsTimer);
    };
  }, []);

  const getMoonImage = (date: Date) => {
    let year = date.getFullYear();
    let month = date.getMonth() + 1;
    let day = date.getDate();
    if (month < 3) { year--; month += 12; }
    month++;
    const c = 365.25 * year;
    const e = 30.6 * month;
    let jd = c + e + day - 694039.09;
    jd /= 29.5305882;
    let b = Math.floor(jd);
    jd -= b;
    b = Math.round(jd * 8);
    if (b >= 8) b = 0;
    
    // Array de imagens da NASA/Wikimedia (Alta Resolução)
    const images = [
      'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/New_Moon.jpg/600px-New_Moon.jpg', // New Moon
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Waxing_crescent_moon_2011-06-05.jpg/600px-Waxing_crescent_moon_2011-06-05.jpg', // Waxing Crescent
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Half_moon_over_the_Black_Forest.jpg/600px-Half_moon_over_the_Black_Forest.jpg', // First Quarter
      'https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Waxing_gibbous_moon_2011-06-11.jpg/600px-Waxing_gibbous_moon_2011-06-11.jpg', // Waxing Gibbous
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Supermoon_14_Nov_2016_-_Flickr_-_The_Aperture_Club.jpg/600px-Supermoon_14_Nov_2016_-_Flickr_-_The_Aperture_Club.jpg', // Full
      'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Waning_gibbous_moon_2011-06-19.jpg/600px-Waning_gibbous_moon_2011-06-19.jpg', // Waning Gibbous
      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Last_Quarter_Moon.jpg/600px-Last_Quarter_Moon.jpg', // Last Quarter
      'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Waning_crescent_moon_2011-06-25.jpg/600px-Waning_crescent_moon_2011-06-25.jpg' // Waning Crescent
    ];
    return images[b];
  };

  const resetLayout = () => {
    setLayouts({ lg: DEFAULT_LAYOUT });
  };

  return (
    <div ref={containerRef} style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
      
      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
        rowHeight={80}
        width={width}
        onLayoutChange={(currentLayout: any, allLayouts: any) => setLayouts(allLayouts)}
        isDraggable={true}
        isResizable={true}
        resizeHandles={['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne']}
        draggableHandle=".panel-title"
        margin={[16, 16]}
      >
        
        {/* 1. SYSTEM DIAGNOSTICS */}
        <div key="diagnostics" className="panel">
          <h2 className="panel-title" style={{ cursor: 'move' }}>System Diagnostics</h2>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <div className="hud-line"><span>CPU Usage</span><b>{sysMetrics.cpu_usage.toFixed(1)}%</b></div>
              <div style={{ height: '40px', background: 'rgba(33, 231, 255, 0.02)', marginTop: '4px', position: 'relative' }}>
                <svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="gradCyan" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="var(--cyan)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polygon points={`0,40 ${metricsHistory.map((m, i) => `${(i / 19) * 100},${40 - (m.cpu / 100) * 40}`).join(' ')} 100,40`} fill="url(#gradCyan)" />
                  <polyline points={metricsHistory.map((m, i) => `${(i / 19) * 100},${40 - (m.cpu / 100) * 40}`).join(' ')} fill="none" stroke="var(--cyan)" strokeWidth="1" />
                </svg>
              </div>
            </div>
            <div>
              <div className="hud-line"><span>RAM Allocation</span><b>{sysMetrics.memory_usage.toFixed(1)}%</b></div>
              <div style={{ height: '40px', background: 'rgba(33, 231, 255, 0.02)', marginTop: '4px', position: 'relative' }}>
                <svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none">
                  <polygon points={`0,40 ${metricsHistory.map((m, i) => `${(i / 19) * 100},${40 - (m.ram / 100) * 40}`).join(' ')} 100,40`} fill="url(#gradCyan)" />
                  <polyline points={metricsHistory.map((m, i) => `${(i / 19) * 100},${40 - (m.ram / 100) * 40}`).join(' ')} fill="none" stroke="var(--cyan)" strokeWidth="1" />
                </svg>
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
                <div style={{ color: 'var(--text)', fontSize: '14px', marginBottom: '4px' }}>{spotify.track}</div>
                <div className="micro-text">{spotify.artist}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={{ background: 'none', border: '1px solid var(--cyan-soft)', color: 'var(--cyan)', width: '24px', height: '24px', cursor: 'pointer' }} onClick={() => Command.create('powershell', ['-Command', '(New-Object -ComObject WScript.Shell).SendKeys([char]177)']).execute()}>⏮</button>
                <button style={{ background: 'rgba(33,231,255,0.1)', border: '1px solid var(--cyan)', color: 'var(--cyan)', width: '24px', height: '24px', cursor: 'pointer' }} onClick={() => Command.create('powershell', ['-Command', '(New-Object -ComObject WScript.Shell).SendKeys([char]179)']).execute()}>▶</button>
                <button style={{ background: 'none', border: '1px solid var(--cyan-soft)', color: 'var(--cyan)', width: '24px', height: '24px', cursor: 'pointer' }} onClick={() => Command.create('powershell', ['-Command', '(New-Object -ComObject WScript.Shell).SendKeys([char]176)']).execute()}>⏭</button>
              </div>
            </div>
            <div className="equalizer">
              {Array.from({ length: 48 }).map((_, i) => (
                <div key={i} className="eq-bar" style={{ height: spotify.playing ? `${Math.random() * 100}%` : '5%', width: '3px', background: 'var(--cyan)' }}></div>
              ))}
            </div>
          </div>
        </div>

        {/* 3. REACTOR CORE */}
        <div key="core" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h1 className="panel-title" style={{ cursor: 'move', position: 'absolute', top: 0, zIndex: 10, opacity: 0 }}>Drag Handle</h1>
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
            </div>
          </div>
          <div className="core-lines" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(45deg, transparent 49.8%, rgba(33, 231, 255, 0.08) 50%, transparent 50.2%), linear-gradient(-45deg, transparent 49.8%, rgba(33, 231, 255, 0.08) 50%, transparent 50.2%)', maskImage: 'radial-gradient(circle at center, black 0 45%, transparent 60%)', zIndex: 1, pointerEvents: 'none' }}></div>
        </div>

        {/* 4. WEATHER & TIME */}
        <div key="weather" className="panel" style={{ overflow: 'hidden', padding: '16px 20px', cursor: 'move' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '100%', position: 'relative' }}>
            <div style={{ display: 'flex', flexDirection: 'column', zIndex: 2, justifyContent: 'center' }}>
              <div style={{ color: '#4a7ea8', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 'bold' }}>{'>'} WEATHER</div>
              <div style={{ color: '#6a7e8a', fontSize: '11px', marginBottom: '12px' }}>{weather.location}</div>
              <div style={{ fontSize: '56px', color: '#b9d2e8', fontWeight: '300', lineHeight: '1', display: 'flex', alignItems: 'flex-start', fontFamily: 'Inter, sans-serif' }}>
                {weather.temp}
              </div>
              <div style={{ color: '#5b8a9e', fontSize: '13px', letterSpacing: '1px', marginTop: '14px', fontWeight: '500' }}>{weather.condition}</div>
              <div style={{ color: '#d0d0d0', fontSize: '13px', marginTop: '4px', fontWeight: '500', opacity: 0.8 }}>H {weather.high} L {weather.low}</div>
            </div>
            <div style={{ position: 'absolute', right: '-30px', top: '50%', transform: 'translateY(-50%)', width: '180px', height: '180px', pointerEvents: 'none' }}>
              {time.getHours() >= 18 || time.getHours() <= 5 ? (
                <img src={getMoonImage(time)} className="moon-image" style={{ width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: 'screen', filter: 'drop-shadow(0 0 10px rgba(255,255,255,0.05))' }} alt="Moon Phase" />
              ) : (
                <div style={{ fontSize: '120px', filter: 'drop-shadow(0 0 30px #ffbd2e)', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>☀️</div>
              )}
            </div>
          </div>
        </div>

        {/* 9. MAP MUNDI */}
        <div key="map" className="panel">
          <h2 className="panel-title" style={{ cursor: 'move' }}>Global Telemetry</h2>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}>
            {/* Simple SVG World Map projection shape representation for sci-fi look */}
            <svg viewBox="0 0 1000 500" width="100%" height="100%" style={{ filter: 'drop-shadow(0 0 4px var(--cyan))' }}>
              <path fill="var(--cyan-soft)" stroke="var(--cyan)" strokeWidth="1" d="M120,80 Q150,60 200,90 T250,150 T200,280 T260,350 T280,480 T240,460 T200,380 T150,300 T120,250 T100,180 Z" />
              <path fill="var(--cyan-soft)" stroke="var(--cyan)" strokeWidth="1" d="M300,100 Q400,80 480,120 T550,200 T500,320 T400,380 T420,480 T380,450 T320,300 T280,200 Z" />
              <path fill="var(--cyan-soft)" stroke="var(--cyan)" strokeWidth="1" d="M600,80 Q700,50 850,90 T900,150 T800,250 T850,380 T750,450 T700,350 T650,300 T580,200 Z" />
              <circle cx="280" cy="150" r="4" fill="white" className="blink" />
              <circle cx="500" cy="220" r="4" fill="white" className="blink" style={{ animationDelay: '0.5s' }} />
              <circle cx="750" cy="180" r="4" fill="white" className="blink" style={{ animationDelay: '1s' }} />
              <line x1="280" y1="150" x2="500" y2="220" stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeDasharray="4 4" />
              <line x1="500" y1="220" x2="750" y2="180" stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeDasharray="4 4" />
            </svg>
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
          <h2 className="panel-title" style={{ cursor: 'move' }}>Notícias</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', height: '100%' }}>
            <div style={{ width: '60px', height: '60px', background: 'rgba(33,231,255,0.1)', border: '1px solid var(--cyan-soft)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <span className="micro-text" style={{ fontSize: '18px', color: 'var(--cyan)' }}>WW</span>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ color: 'var(--text)', fontSize: '13px', marginBottom: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {news[newsIdx % news.length]?.title || '...'}
              </div>
              <div className="micro-text" style={{ lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {news[newsIdx % news.length]?.desc || '...'}
              </div>
            </div>
          </div>
        </div>



      </ResponsiveGridLayout>

      <button onClick={resetLayout} style={{ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 99, background: 'rgba(0,0,0,0.5)', border: '1px solid var(--cyan)', color: 'var(--cyan)', padding: '6px 16px', cursor: 'pointer', borderRadius: '20px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
        Reset Layout
      </button>

    </div>
  );
}
