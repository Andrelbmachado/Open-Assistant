/**
 * Pedido claro de ação no computador ("abre o chrome e entra no youtube"): o chat passa direto para o
 * agente que controla o PC, sem gastar uma resposta do modelo para decidir isso.
 */

const normalize = (text: string) => text.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const QUESTION = /^(como|qual|quais|o que|oque|por que|porque|quando|onde|quem|quanto|quantos|sera|explica|explique|me explica|me fala|fala sobre|o que e|what|how|why|voce sabe|sabe)\b/;
const POLITE = /^(por favor |pf |pfv |voce pode |vc pode |pode |consegue |conseguiria |quero que voce |preciso que voce |da pra |me ajuda a )+/;
/** Verbos no começo da frase que pedem uma ação no PC. */
const ACTION = /^(abre|abrir|abra|inicia|iniciar|inicie|executa|executar|execute|roda|rodar|rode|fecha|fechar|feche|clica|clique|clicar|digita|digite|digitar|minimiza|minimize|maximiza|maximize|instala|instalar|instale|desinstala|desinstale|desliga|desligue|reinicia|reinicie|bloqueia|bloqueie|aumenta|aumente|diminui|diminua|abaixa|abaixe|muta|muda o volume|tira (um )?print|printa|captura a tela|mostra a tela|olha a tela|entra no|entra na|entre no|entre na|acessa|acesse|pesquisa no|pesquise no|procura no|procure no|cria uma pasta|crie uma pasta|apaga|apague|move|mova|copia o arquivo|copie o arquivo|renomeia|renomeie|organiza|organize|toca|toque|pausa|pause|liga o|ligue o|conecta|conecte|manda|mande|envia|envie)\b/;

/** true para "abre o powershell", "pode fechar o chrome?"; false para perguntas como "como abro o powershell?". */
export function looksLikePcAction(text: string): boolean {
  const firstLine = text.split("\n").find((line) => line.trim() && !line.startsWith("[Anexos:")) ?? "";
  const plain = normalize(firstLine).replace(POLITE, "");
  if (!plain || plain.split(" ").length > 30) return false;
  if (QUESTION.test(plain)) return false;
  return ACTION.test(plain);
}
