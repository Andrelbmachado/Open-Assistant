import React, { useState, useEffect } from 'react';
import { readDir } from '@tauri-apps/plugin-fs';

export function FileExplorerWidget() {
  const [currentPath, setCurrentPath] = useState('C:\\Users');
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

  const handleNavigate = (folderName: string) => {
    const sep = currentPath.endsWith('\\') ? '' : '\\';
    setCurrentPath(currentPath + sep + folderName);
  };

  const handleUpDir = () => {
    const parts = currentPath.split('\\').filter(Boolean);
    if (parts.length > 1) {
      parts.pop();
      setCurrentPath(parts.join('\\') + '\\');
    }
  };

  const handleInputSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setCurrentPath(inputPath);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <button onClick={handleUpDir} style={{ background: 'rgba(33, 231, 255, 0.1)', border: '1px solid var(--cyan-soft)', color: 'var(--cyan)', cursor: 'pointer', padding: '0 8px' }}>
          ↑
        </button>
        <input 
          type="text" 
          value={inputPath}
          onChange={e => setInputPath(e.target.value)}
          onKeyDown={handleInputSubmit}
          style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--cyan-soft)', color: 'var(--text)', padding: '4px 8px', outline: 'none', fontFamily: 'monospace' }}
        />
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
