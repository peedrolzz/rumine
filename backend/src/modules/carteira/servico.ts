import type { CarteiraRepositorio } from "./repositorio.js";

export type Saldo = { saldoCentavos: number; atualizadoEm: string | null };

export function criarServicoCarteira(repo: CarteiraRepositorio) {
  return {
    /** Saldo do próprio usuário. Conta ativa sem carteira (dado incompleto) vale R$ 0,00, não é erro. */
    async saldo(usuarioId: string): Promise<Saldo> {
      const carteira = await repo.buscarSaldo(usuarioId);
      if (!carteira) return { saldoCentavos: 0, atualizadoEm: null };
      // Campos escolhidos um a um: nada além disto sai pela API.
      return { saldoCentavos: carteira.saldoCentavos, atualizadoEm: carteira.atualizadoEm.toISOString() };
    },
  };
}

export type ServicoCarteira = ReturnType<typeof criarServicoCarteira>;
