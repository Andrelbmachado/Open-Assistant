import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Command } from "@tauri-apps/plugin-shell";
import "xterm/css/xterm.css";
import "./TerminalPane.css";
export function TerminalPane({ onOpenAiTerminal, isAiTerminalOpen }) {
    const [sessions, setSessions] = useState([
        { id: `term-${Date.now()}`, name: "PowerShell", shell: "powershell" }
    ]);
    const [activeSessionId, setActiveSessionId] = useState(sessions[0]?.id || "");
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const addNewSession = (shell) => {
        const id = `term-${Date.now()}`;
        const name = shell === "powershell" ? "PowerShell" : shell === "cmd" ? "CMD" : "Ubuntu WSL";
        setSessions(prev => [...prev, { id, name, shell }]);
        setActiveSessionId(id);
        setIsDropdownOpen(false);
    };
    const removeSession = (id, e) => {
        e.stopPropagation();
        if (sessions.length === 1)
            return;
        setSessions(prev => {
            const newSessions = prev.filter(s => s.id !== id);
            if (activeSessionId === id && newSessions.length > 0) {
                setActiveSessionId(newSessions[newSessions.length - 1]?.id || "");
            }
            return newSessions;
        });
    };
    return (_jsxs("div", { className: "terminal-container", style: { display: 'flex', flexDirection: 'column', height: '100%', background: 'transparent' }, children: [_jsxs("div", { className: "terminal-tabs-header", style: { display: 'flex', background: 'rgba(33, 231, 255, 0.05)', borderBottom: '1px solid rgba(33, 231, 255, 0.2)', overflowX: 'auto', position: 'relative' }, children: [sessions.map(s => (_jsxs("div", { onClick: () => setActiveSessionId(s.id), style: {
                            padding: '10px 16px',
                            background: activeSessionId === s.id ? 'rgba(33, 231, 255, 0.1)' : 'transparent',
                            color: activeSessionId === s.id ? '#ffffff' : 'rgba(203, 247, 255, 0.6)',
                            borderRight: '1px solid rgba(33, 231, 255, 0.2)',
                            borderTop: activeSessionId === s.id ? '2px solid var(--cyan)' : '2px solid transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            fontSize: '13px'
                        }, children: [_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("polyline", { points: "4 17 10 11 4 5" }), _jsx("line", { x1: "12", y1: "19", x2: "20", y2: "19" })] }), s.name, sessions.length > 1 && (_jsx("span", { onClick: (e) => removeSession(s.id, e), style: { marginLeft: '4px', opacity: 0.6, cursor: 'pointer', padding: '2px' }, children: "\u2715" }))] }, s.id))), _jsxs("div", { style: { position: 'relative' }, children: [_jsx("div", { onClick: () => setIsDropdownOpen(!isDropdownOpen), style: { padding: '10px 16px', color: '#969696', cursor: 'pointer', display: 'flex', alignItems: 'center' }, children: _jsx("span", { style: { fontSize: '18px', fontWeight: 'bold' }, children: "+" }) }), isDropdownOpen && (_jsxs("div", { style: {
                                    position: 'absolute', top: '100%', left: 0,
                                    background: '#252526', border: '1px solid #333',
                                    borderRadius: '4px', zIndex: 10, padding: '4px 0',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)', width: '150px'
                                }, children: [_jsx("div", { onClick: () => addNewSession('powershell'), style: { padding: '8px 16px', color: '#fff', fontSize: '12px', cursor: 'pointer' }, children: "PowerShell" }), _jsx("div", { onClick: () => addNewSession('cmd'), style: { padding: '8px 16px', color: '#fff', fontSize: '12px', cursor: 'pointer' }, children: "Command Prompt" }), _jsx("div", { onClick: () => addNewSession('wsl'), style: { padding: '8px 16px', color: '#fff', fontSize: '12px', cursor: 'pointer' }, children: "Ubuntu (WSL)" })] }))] }), !isAiTerminalOpen && onOpenAiTerminal && (_jsxs("button", { onClick: onOpenAiTerminal, style: { position: 'absolute', right: '16px', top: '8px', background: 'var(--cyan-soft)', border: '1px solid var(--cyan)', color: 'var(--text)', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }, children: [_jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M12 2a10 10 0 1 0 10 10H12V2z" }) }), "Abrir Terminal AI"] }))] }), _jsx("div", { style: { flex: 1, position: 'relative' }, children: sessions.map(s => (_jsx(TerminalInstance, { isActive: s.id === activeSessionId, shellType: s.shell }, s.id))) })] }));
}
function TerminalInstance({ isActive, shellType }) {
    const containerRef = useRef(null);
    const xtermRef = useRef(null);
    const childRef = useRef(null);
    const inputBufferRef = useRef("");
    useEffect(() => {
        if (!containerRef.current)
            return;
        const term = new Terminal({
            theme: { background: 'transparent', foreground: '#cbf7ff', cursor: '#21e7ff' },
            fontFamily: '"Fira Code", "Courier New", monospace',
            fontSize: 14,
            cursorBlink: true,
            allowTransparency: true,
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(containerRef.current);
        if (isActive) {
            setTimeout(() => { try {
                fitAddon.fit();
            }
            catch (e) { } }, 50);
        }
        xtermRef.current = term;
        let isMounted = true;
        let isExecuting = false;
        // REPL Loop
        term.writeln(`\x1b[36mOpen Assistant Terminal - ${shellType} Mode\x1b[0m`);
        term.writeln('Type a command and press Enter.\r\n');
        const prompt = () => term.write('\r\n\x1b[32mPS >\x1b[0m ');
        prompt();
        term.onData(async (data) => {
            if (isExecuting)
                return;
            if (data === '\r') {
                const cmdString = inputBufferRef.current.trim();
                inputBufferRef.current = "";
                term.write('\r\n');
                if (cmdString) {
                    isExecuting = true;
                    try {
                        const shellName = shellType === 'powershell' ? 'powershell' : shellType === 'cmd' ? 'cmd' : 'wsl';
                        // Fix utf-8 issues in powershell by explicitly forcing the console to output UTF8 bytes instead of localized legacy encodings.
                        let fullCommand = cmdString;
                        if (shellType === 'powershell') {
                            fullCommand = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${cmdString}`;
                        }
                        const args = shellType === 'powershell' ? ['-Command', fullCommand] : ['/C', cmdString];
                        const process = await Command.create(shellName, args).execute();
                        if (process.stdout) {
                            term.write(process.stdout.replace(/\n/g, '\r\n'));
                        }
                        if (process.stderr) {
                            term.write(`\x1b[31m${process.stderr.replace(/\n/g, '\r\n')}\x1b[0m`);
                        }
                    }
                    catch (e) {
                        term.write(`\x1b[31mCommand execution failed: ${e}\x1b[0m\r\n`);
                    }
                    finally {
                        isExecuting = false;
                        prompt();
                    }
                }
                else {
                    prompt();
                }
            }
            else if (data === '\x7F') {
                if (inputBufferRef.current.length > 0) {
                    inputBufferRef.current = inputBufferRef.current.slice(0, -1);
                    term.write('\b \b');
                }
            }
            else {
                inputBufferRef.current += data;
                term.write(data);
            }
        });
        const handleAICommand = async (e) => {
            if (isActive && e.detail && e.detail.command) {
                const cmdString = e.detail.command;
                term.write(cmdString + '\r\n');
                if (isExecuting)
                    return;
                isExecuting = true;
                try {
                    const shellName = shellType === 'powershell' ? 'powershell' : shellType === 'cmd' ? 'cmd' : 'wsl';
                    let fullCommand = cmdString;
                    if (shellType === 'powershell') {
                        fullCommand = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${cmdString}`;
                    }
                    const args = shellType === 'powershell' ? ['-Command', fullCommand] : ['/C', cmdString];
                    const process = await Command.create(shellName, args).execute();
                    if (process.stdout)
                        term.write(process.stdout.replace(/\n/g, '\r\n'));
                    if (process.stderr)
                        term.write(`\x1b[31m${process.stderr.replace(/\n/g, '\r\n')}\x1b[0m`);
                }
                catch (err) {
                    term.write(`\x1b[31mError: ${err}\x1b[0m\r\n`);
                }
                finally {
                    isExecuting = false;
                    prompt();
                }
            }
        };
        window.addEventListener('terminal-execute', handleAICommand);
        const resizeObserver = new ResizeObserver(() => {
            if (isActive) {
                try {
                    fitAddon.fit();
                }
                catch (e) { }
            }
        });
        resizeObserver.observe(containerRef.current);
        return () => {
            isMounted = false;
            resizeObserver.disconnect();
            window.removeEventListener('terminal-execute', handleAICommand);
            term.dispose();
        };
    }, [isActive, shellType]);
    return (_jsx("div", { style: {
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            display: isActive ? 'block' : 'none',
            padding: '10px'
        }, ref: containerRef }));
}
