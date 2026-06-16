import React, { useState, useEffect } from 'react';
import { readDir } from '@tauri-apps/plugin-fs';

export function FileExplorerWidget() {
  const [currentPath, setCurrentPath] = useState('C:\\Users');
  const [history, setHistory] = useState<string[]>(['C:\\Users']);
  const [showHistory, setShowHistory] = useState(false);
  const [files, setFiles] = useState<{name: string, isDir: boolean}[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputPath, setInputPath] = useState(currentPath);

  useEffect(() => {
    loadFiles(currentPath);
  }, [currentPath]);

  const loadFiles = async (path: string) => {
    setLoading(true);
    try {
      const entries = await readDir(path);
      const sorted = entries.map(e => ({
        name: e.name || '',
        isDir: e.isDirectory
      })).sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });
      setFiles(sorted);
      setInputPath(path);
    } catch (e) {
      console.error(e);
      setFiles([{ name: 'Access Denied or Invalid Path', isDir: false }]);
    }
    setLoading(false);
  };

  const navigateTo = (path: string) => {
    setCurrentPath(path);
    if (!history.includes(path)) {
      setHistory(prev => [path, ...prev].slice(0, 10));
    }
  };

  const handleNavigate = (folderName: string) => {
    const sep = currentPath.endsWith('\\') ? '' : '\\';
    navigateTo(currentPath + sep + folderName);
  };

  const handleBack = () => {
    const parts = currentPath.split('\\').filter(Boolean);
    if (parts.length > 1) {
      parts.pop();
      navigateTo(parts.join('\\') + '\\');
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', position: 'relative' }}>
        <button onClick={handleBack} style={{ background: 'rgba(33, 231, 255, 0.1)', border: '1px solid var(--cyan-soft)', color: 'var(--cyan)', cursor: 'pointer', padding: '0 8px' }}>
          ↑
        </button>
        <div style={{ flex: 1, position: 'relative', display: 'flex' }}>
          <input 
            type="text" 
            value={inputPath}
            onChange={e => setInputPath(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && navigateTo(inputPath)}
            style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--cyan-soft)', color: 'var(--text)', padding: '4px 8px', outline: 'none', fontFamily: 'monospace' }}
          />
          <button onClick={() => setShowHistory(!showHistory)} style={{ background: 'transparent', border: '1px solid var(--cyan-soft)', borderLeft: 'none', color: 'var(--cyan)', padding: '0 8px', cursor: 'pointer' }}>▼</button>
          
          {showHistory && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1a1a', border: '1px solid var(--cyan)', zIndex: 100, maxHeight: '150px', overflowY: 'auto' }}>
              {history.map((h, i) => (
                <div key={i} onClick={() => { navigateTo(h); setShowHistory(false); }} style={{ padding: '6px 8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text)', borderBottom: '1px solid #333' }}>
                  {h}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid rgba(33, 231, 255, 0.05)', padding: '4px' }}>
        {loading ? (
          <div className="micro-text">Scanning...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: '8px' }}>
            {files.map((f, i) => (
              <div 
                key={i} 
                onClick={() => f.isDir && handleNavigate(f.name)}
                style={{ textAlign: 'center', cursor: f.isDir ? 'pointer' : 'default', padding: '4px', opacity: f.name === 'Access Denied or Invalid Path' ? 0.5 : 1 }}
                title={f.name}
              >
                <div style={{ color: f.isDir ? 'var(--cyan)' : 'var(--text)', fontSize: '24px', marginBottom: '4px' }}>
                  {f.isDir ? '📁' : '📄'}
                </div>
                <div className="micro-text" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '9px' }}>
                  {f.name}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
