// Limite de tentativas de login (RNF-01): freia adivinhação de senha.
// Guarda as falhas em memória, por chave (IP + e-mail). Serve para uma instância só (MVP);
// com várias instâncias, o contador precisaria ir para um armazenamento compartilhado.
export type Limitador = {
  bloqueado(chave: string): boolean;
  registrarFalha(chave: string): void;
  limpar(chave: string): void;
};

type Opcoes = { max?: number; janelaMs?: number; agora?: () => number };

export function criarLimitador({ max = 5, janelaMs = 15 * 60_000, agora = Date.now }: Opcoes = {}): Limitador {
  const falhas = new Map<string, number[]>();

  // Falhas ainda dentro da janela; limpa a chave quando não sobra nenhuma.
  const recentes = (chave: string) => {
    const lista = (falhas.get(chave) ?? []).filter((t) => agora() - t < janelaMs);
    if (lista.length > 0) falhas.set(chave, lista);
    else falhas.delete(chave);
    return lista;
  };

  return {
    bloqueado: (chave) => recentes(chave).length >= max,
    registrarFalha(chave) {
      const lista = recentes(chave);
      lista.push(agora());
      falhas.set(chave, lista);
      // Faxina: evita crescer sem limite sob ataque com muitas chaves diferentes.
      if (falhas.size > 10_000) for (const k of [...falhas.keys()]) recentes(k);
    },
    limpar: (chave) => void falhas.delete(chave),
  };
}
