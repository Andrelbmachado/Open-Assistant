import React from "react";
import { Database, Cpu, Activity, TrendingUp } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";

const data = [
  { name: "09:00", tokens: 1200 },
  { name: "11:00", tokens: 3400 },
  { name: "13:00", tokens: 2800 },
  { name: "15:00", tokens: 5900 },
  { name: "17:00", tokens: 8200 },
  { name: "19:00", tokens: 4100 },
  { name: "21:00", tokens: 7300 },
];

interface DashboardPanelProps {
  accentColor: string;
}

export default function DashboardPanel({ accentColor }: DashboardPanelProps) {
  const stats = [
    { id: "tokens", title: "Tokens Consumidos", value: "32,840", unit: "tokens", icon: Database, color: "text-cyan-400" },
    { id: "requests", title: "Chamadas de IA", value: "142", unit: "requests", icon: Activity, color: "text-indigo-400" },
    { id: "sandboxes", title: "Sandboxes Ativos", value: "3", unit: "containers", icon: Cpu, color: "text-emerald-400" },
    { id: "ram", title: "Uso de Memória", value: "248", unit: "MB", icon: TrendingUp, color: "text-amber-400" }
  ];

  return (
    <div className="flex h-full flex-col bg-[#1e2025] text-zinc-100 overflow-hidden">
      {/* Metrics list */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.id} className="rounded-2xl border border-white/10 bg-gradient-to-b from-[#25272e] to-[#1f2026] p-4 space-y-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{stat.title}</span>
                  <Icon size={14} className="text-zinc-300" />
                </div>
                <div>
                  <span className="text-2xl font-bold tracking-tight text-white">{stat.value}</span>
                  <span className="text-[10px] text-zinc-400 ml-1 font-mono">{stat.unit}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Charts area */}
        <div className="rounded-2xl border border-white/10 bg-[#23252b] p-5 shadow-lg">
          <h3 className="text-xs font-semibold text-white mb-4 flex items-center gap-2 font-mono">
            ⚡ Consumo de Tokens por Intervalo de Hora
          </h3>
          <div className="h-[240px] w-full font-mono text-[10px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a1a1aa" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#a1a1aa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.2)" />
                <YAxis stroke="rgba(255,255,255,0.2)" />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#1c1d22", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "12px" }}
                  labelClassName="text-white font-bold"
                />
                <Area 
                  type="monotone" 
                  dataKey="tokens" 
                  stroke="#d4d4d8" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorTokens)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
