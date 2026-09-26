import type { ReactNode } from "react";

/** Cabeçalho padrão das telas (Arquivos, Agentes, Painel, Marketplace…): mesmo tamanho e tipografia do chat. */
export function PageHeader({ eyebrow, title, icon, children }: { eyebrow: string; title: ReactNode; icon?: ReactNode; children?: ReactNode }) {
  return <header className="view-header page-header">
    <div className="page-title">
      {icon && <span className="page-icon">{icon}</span>}
      <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>
    </div>
    {children && <div className="view-header-actions page-actions">{children}</div>}
  </header>;
}
