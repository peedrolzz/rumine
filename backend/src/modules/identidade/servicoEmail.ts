// Envio de e-mail atrás de uma interface (ADR-008). Hoje só existe a versão de desenvolvimento,
// que escreve a mensagem no log (é por lá que se pega o link de confirmação). A versão com o
// Resend entra com a configuração de deploy, sem mudar quem usa esta interface.
export type MensagemEmail = { para: string; assunto: string; texto: string };

export interface ServicoEmail {
  enviar(mensagem: MensagemEmail): Promise<void>;
}

export function criarServicoEmailConsole(escrever: (texto: string) => void): ServicoEmail {
  return {
    async enviar({ para, assunto, texto }) {
      escrever(`[E-MAIL SIMULADO] Para: ${para} | Assunto: ${assunto}\n${texto}`);
    },
  };
}
